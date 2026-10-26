// Berikning av företag: fakta från Bolagsverket och företagets hemsida sammanfattas av en AI-modell via OpenRouter.
// Körs bara när någon klickar "Berika" (eller när Claude sparar en sammanfattning via MCP). Resultatet sparas på
// företaget och syns för alla kontakter där.
import { get, run, all, audit, parseJSON } from '../db.js';
import { encrypt, decrypt } from '../security.js';
import { broadcast } from '../events.js';
import { getConfig as prospectingConfig, hasBolagsverket } from '../prospecting/service.js';
import { lookupOrganisation, validOrgNr, formatOrgNr } from '../prospecting/bolagsverket.js';
import { readWebsiteText } from '../prospecting/website.js';
import { getProfile } from './quotes.js';
import { linkLeadToCompany, domainFromEmail } from './companies.js';

const CONFIG_KEY = 'ai:openrouter';
export const DEFAULT_MODEL = 'anthropic/claude-haiku-5.5';
export const SUGGESTED_MODELS = [
  { id: 'anthropic/claude-haiku-5.5', label: 'Claude Haiku 5.5 – rekommenderad, billig och bra på svenska' },
  { id: 'google/gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite – billig' },
  { id: 'openai/gpt-5-mini', label: 'GPT-5 mini' },
  { id: 'anthropic/claude-sonnet-5.5', label: 'Claude Sonnet 5.5 – bäst, ca 20 gånger dyrare' },
];

export const getAiConfig = () => decrypt(get('SELECT value FROM settings WHERE key = ?', CONFIG_KEY)?.value);
export function saveAiConfig({ apiKey, model }) {
  const cfg = { ...getAiConfig() };
  if (apiKey !== undefined && apiKey !== '••••••••') cfg.apiKey = String(apiKey).trim();
  if (model !== undefined) cfg.model = String(model).trim() || DEFAULT_MODEL;
  run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', CONFIG_KEY, encrypt(cfg));
  return cfg;
}
const env = () => ({ apiKey: process.env.OPENROUTER_API_KEY || '', model: process.env.OPENROUTER_MODEL || '' });
export function aiSettings() {
  const cfg = getAiConfig();
  return { apiKey: cfg.apiKey || env().apiKey, model: cfg.model || env().model || DEFAULT_MODEL, fromEnv: !cfg.apiKey && !!env().apiKey };
}
export const aiConfigured = () => !!aiSettings().apiKey;

export const presentEnrichment = (c) => (c?.enrichment ? parseJSON(c.enrichment, null) : null);

const FREE_MAIL = /^(gmail|hotmail|outlook|live|yahoo|icloud|me|telia|bredband|spray|msn|aol|proton|protonmail|gmx|mail)\./i;
const ORG_IN_TEXT = /(\d{6})\s?-?\s?(\d{4})/g;

/** Företaget för ett lead – kopplar eller skapar det vid behov. */
export function companyForLead(lead) {
  const companyId = lead.company_id || linkLeadToCompany(lead.id);
  return companyId ? get('SELECT * FROM companies WHERE id = ?', companyId) : null;
}

// Org.nr och hemsida letas fram från företaget och dess kontakter (fält, meddelanden, e-postdomän).
function findOrgNr(company) {
  if (company.org_nr && validOrgNr(company.org_nr)) return formatOrgNr(company.org_nr);
  for (const l of all('SELECT fields, message FROM leads WHERE company_id = ?', company.id)) {
    const fromField = parseJSON(l.fields, {}).org_nr;
    if (fromField && validOrgNr(fromField)) return formatOrgNr(fromField);
    for (const m of String(l.message || '').matchAll(ORG_IN_TEXT)) if (validOrgNr(m[1] + m[2])) return formatOrgNr(m[1] + m[2]);
  }
  return null;
}
function findWebsite(company) {
  if (company.website) return company.website;
  if (company.domain && !FREE_MAIL.test(company.domain)) return `https://${company.domain}`;
  for (const l of all('SELECT email FROM leads WHERE company_id = ? AND email IS NOT NULL', company.id)) {
    const d = domainFromEmail(l.email);
    if (d && !FREE_MAIL.test(d)) return `https://${d}`;
  }
  return null;
}

// Svaret ska följa det här schemat. Med "structured outputs" tvingas modellen ge giltig JSON i exakt den formen.
const nullableText = { type: ['string', 'null'] };
const SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['summary', 'industry', 'offering', 'customers', 'size', 'news', 'sales_angle', 'opening_line'],
  properties: { summary: { type: 'string' }, industry: nullableText, offering: nullableText, customers: nullableText, size: nullableText, news: nullableText, sales_angle: nullableText, opening_line: nullableText },
};

// Svarstexten kan komma som sträng eller som en lista av delar, ibland inom ```json-staket.
function contentText(message) {
  const c = message?.content;
  const text = Array.isArray(c) ? c.map((p) => (typeof p === 'string' ? p : p?.text || '')).join('') : String(c || '');
  return text.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
}
function parseJson(text) {
  const candidates = [text, text.match(/\{[\s\S]*\}/)?.[0]].filter(Boolean);
  for (const c of candidates) {
    try { return JSON.parse(c); } catch { /* prova nästa */ }
    // Vanliga småfel: kommatecken före } och radbrytningar inuti strängar.
    try { return JSON.parse(c.replace(/,\s*([}\]])/g, '$1').replace(/"(?:[^"\\]|\\.)*"/g, (s) => s.replace(/\r?\n/g, '\\n'))); } catch { /* prova nästa */ }
  }
  return null;
}

async function requestOpenRouter({ apiKey, model }, messages, format) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json',
      'HTTP-Referer': process.env.PUBLIC_URL || 'https://leadflow.local', 'X-Title': 'LeadFlow CRM',
    },
    body: JSON.stringify({
      model, messages, max_tokens: 4000,
      // Modeller som "tänker" innan de svarar ska göra det kort – annars kan tänkandet äta upp hela svaret.
      reasoning: { effort: 'low', exclude: true },
      ...(format === 'schema' ? { response_format: { type: 'json_schema', json_schema: { name: 'company_summary', strict: true, schema: SCHEMA } } }
        : format === 'json' ? { response_format: { type: 'json_object' } } : {}),
    }),
    signal: AbortSignal.timeout(90000),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) throw Object.assign(new Error('OpenRouter godkände inte API-nyckeln. Kontrollera den under Inställningar → AI-berikning.'), { status: 400 });
  if (res.status === 402) throw Object.assign(new Error('OpenRouter-kontot saknar krediter. Fyll på på openrouter.ai.'), { status: 400 });
  if (!res.ok) throw Object.assign(new Error(`OpenRouter svarade: ${data.error?.message || res.status}`), { status: res.status === 400 ? 400 : 502, retryable: res.status === 400 });
  if (data.error) throw Object.assign(new Error(`OpenRouter svarade: ${data.error.message || 'okänt fel'}`), { status: 502, retryable: true });
  const choice = data.choices?.[0];
  return { text: contentText(choice?.message), finish: choice?.finish_reason || choice?.native_finish_reason, usage: data.usage, model: data.model || model };
}

/** Frågar modellen; först med strikt schema, sedan (om svaret inte går att läsa) med enklare JSON-läge. */
async function callOpenRouter(ai, messages) {
  let last = null;
  for (const format of ['schema', 'json']) {
    let r;
    try { r = await requestOpenRouter(ai, messages, format); }
    catch (e) {
      // Vissa modeller/leverantörer stöder inte schemaläget – prova enklare format innan vi ger upp.
      if (e.retryable && format === 'schema') { last = { error: e }; continue; }
      throw e;
    }
    const result = parseJson(r.text);
    if (result && typeof result === 'object') return { result, usage: r.usage, model: r.model };
    last = r;
    console.error(`[berika] kunde inte tolka svaret (${ai.model}, ${format}, slut: ${r.finish || '?'}): ${JSON.stringify(r.text.slice(0, 400))}`);
  }
  if (last?.error) throw last.error;
  const why = last?.finish === 'length' ? 'svaret blev avklippt' : !last?.text ? 'svaret var tomt' : 'svaret var inte i rätt format';
  throw Object.assign(new Error(`AI-svaret gick inte att tolka (${why}). Försök igen eller välj en annan modell under Inställningar → AI-berikning.`), { status: 502 });
}

const SYSTEM = `Du är en researchassistent åt en svensk säljare. Du får fakta från Bolagsverket och text från ett företags hemsida.
Svara ENDAST med ett JSON-objekt på svenska med fälten:
{"summary": "2–4 meningar: vad företaget gör och för vem",
 "industry": "bransch i några ord",
 "offering": "deras viktigaste produkter/tjänster, kort",
 "customers": "vilka deras kunder/marknad är, om det framgår",
 "size": "storlek (anställda, omsättning, orter) om det framgår, annars null",
 "news": "något aktuellt (nyhet, expansion, rekrytering) om det framgår, annars null",
 "sales_angle": "2–3 meningar: varför de kan vara intresserade av säljarens erbjudande och vad säljaren kan fråga om",
 "opening_line": "en naturlig första mening i ett samtal eller mejl"}
Hitta inte på något. Står något inte i underlaget: skriv null. Var konkret och kortfattad.`;

/** Berikar företaget och sparar resultatet. Returnerar berikningen. */
export async function enrichCompany(company, user) {
  const ai = aiSettings();
  if (!ai.apiKey) throw Object.assign(new Error('AI-berikning är inte uppsatt. En administratör lägger in en OpenRouter-nyckel under Inställningar → AI-berikning.'), { status: 400 });
  const sources = [];
  const facts = {};
  const orgNr = findOrgNr(company);
  if (orgNr) facts.org_nr = orgNr;

  // Bolagsverket (om nycklar finns under Prospektering → Datakällor).
  const pcfg = prospectingConfig();
  if (orgNr && hasBolagsverket(pcfg)) {
    try {
      const org = await lookupOrganisation(pcfg, orgNr);
      if (org) {
        Object.assign(facts, { legal_name: org.name, form: org.form, registered: org.registered, address: org.address, city: org.city, sni: org.sni?.map((s) => s.text).filter(Boolean), deregistered: org.deregistered || undefined, registry_description: org.description });
        sources.push({ type: 'bolagsverket', label: 'Bolagsverket', ref: orgNr });
      }
    } catch (e) { sources.push({ type: 'bolagsverket', label: 'Bolagsverket', error: e.message }); }
  }

  // Hemsidan.
  const website = findWebsite(company);
  let site = null;
  if (website) {
    site = await readWebsiteText(website).catch(() => ({ note: 'Hemsidan svarade inte' }));
    if (site.pages?.length) sources.push(...site.pages.map((p) => ({ type: 'website', label: new URL(p.url).hostname, url: p.url })));
    else sources.push({ type: 'website', label: website, error: site.note });
  }

  const known = [company.name, company.city && `Ort: ${company.city}`, company.industry && `Bransch enligt CRM: ${company.industry}`].filter(Boolean).join('\n');
  const notes = all('SELECT message FROM leads WHERE company_id = ? AND message IS NOT NULL LIMIT 3', company.id).map((l) => l.message).join('\n');
  if (!sources.some((s) => !s.error) && !notes) {
    throw Object.assign(new Error('Hittade inget att sammanfatta. Lägg till företagets hemsida eller organisationsnummer och försök igen.'), { status: 400 });
  }
  const profile = getProfile();
  const products = all('SELECT name FROM products WHERE active = 1 ORDER BY name LIMIT 15').map((p) => p.name);
  const seller = `Säljarens företag: ${profile.name || 'okänt'}${products.length ? `. Erbjudande: ${products.join(', ')}` : ''}.`;
  const material = [
    `FÖRETAG I CRM:\n${known}`,
    Object.keys(facts).length ? `${sources.some((s) => s.type === 'bolagsverket' && !s.error) ? 'BOLAGSVERKET' : 'FAKTA'}:\n${JSON.stringify(facts)}` : null,
    site?.pages?.length ? `HEMSIDA (${site.url})\nTitel: ${site.title || '-'}\nBeskrivning: ${site.description || '-'}\n${site.pages.map((p) => `--- ${p.url}\n${p.text}`).join('\n')}` : null,
    notes ? `ANTECKNINGAR FRÅN LEADS:\n${notes}` : null,
  ].filter(Boolean).join('\n\n');

  const { result, usage, model } = await callOpenRouter(ai, [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `${seller}\n\n${material}` },
  ]);
  return saveEnrichment(company, user, { ...pick(result), facts, sources, model, usage: usage && { prompt: usage.prompt_tokens, completion: usage.completion_tokens, cost: usage.cost }, via: 'app' }, { website: site?.url, orgNr });
}

const FIELDS = ['summary', 'industry', 'offering', 'customers', 'size', 'news', 'sales_angle', 'opening_line'];
const pick = (r) => Object.fromEntries(FIELDS.map((k) => [k, typeof r?.[k] === 'string' && r[k].trim() && r[k].trim() !== 'null' ? r[k].trim().slice(0, 1500) : null]));

/** Sparar en berikning på företaget (används även av Claude via MCP). Tomma fält på företaget fylls i. */
export function saveEnrichment(company, user, data, { website, orgNr } = {}) {
  const enrichment = { ...data, ...pick(data), enriched_at: new Date().toISOString(), enriched_by: user?.name || null };
  run(`UPDATE companies SET enrichment = ?, industry = coalesce(industry, ?), website = coalesce(website, ?), org_nr = coalesce(org_nr, ?),
      city = coalesce(city, ?), updated_at = datetime('now') WHERE id = ?`,
    JSON.stringify(enrichment), enrichment.industry || null, website || null,
    orgNr && !get('SELECT 1 FROM companies WHERE org_nr = ? AND id != ?', orgNr, company.id) ? orgNr : null, data.facts?.city || null, company.id);
  run("INSERT INTO activities (company_id, user_id, type, content) VALUES (?, ?, 'system', ?)", company.id, user?.id ?? null, `Företagsinfo hämtad: ${enrichment.summary?.slice(0, 140) || company.name}`);
  audit(user?.id, 'company.enrich', 'company', company.id, { model: data.model, via: data.via });
  broadcast('refresh', { entity: 'companies' });
  return enrichment;
}
