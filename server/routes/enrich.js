// Berikning av företag (knappen "Berika") och inställningar för AI-tjänsten (OpenRouter), per arbetsyta.
import { Router } from 'express';
import { get, audit } from '../db.js';
import { can } from '../security.js';
import { requirePerm } from '../middleware.js';
import { getLead, canSeeLead, canEditLead } from '../services/leads.js';
import { companyVisibilitySql } from '../services/companies.js';
import { enrichCompany, companyForLead, presentEnrichment, aiSettings, aiConfigured, saveAiConfig, saveEnrichment, SUGGESTED_MODELS, getOffer, saveOffer, draftOfferFromWebsite, draftFirstEmail } from '../services/enrich.js';
import { getProfile } from '../services/quotes.js';

const r = Router();
const busy = new Set(); // ett företag berikas i taget
const wrap = (fn) => (req, res, next) => fn(req, res).catch((e) => (e.status ? res.status(e.status).json({ error: e.message }) : next(e)));

const companyInfo = (c) => c && {
  id: c.id, name: c.name, org_nr: c.org_nr, website: c.website, city: c.city, industry: c.industry, address: c.address, phone: c.phone,
  enrichment: presentEnrichment(c),
};
const canEditCompany = (user, c) => can(user, 'leads.edit_all') || (can(user, 'leads.edit_own') && (!c.owner_id || c.owner_id === user.id));

async function run(company, user, res) {
  if (busy.has(company.id)) return res.status(409).json({ error: 'Berikning pågår redan' });
  busy.add(company.id);
  try {
    await enrichCompany(company, user);
    res.json({ company: companyInfo(get('SELECT * FROM companies WHERE id = ?', company.id)) });
  } finally { busy.delete(company.id); }
}

r.get('/ai/status', (req, res) => res.json({ configured: aiConfigured() }));

// Företagsinfo för ett lead (den som ser leadet ser dess företagsinfo).
r.get('/leads/:id/company-info', (req, res) => {
  const lead = getLead(Number(req.params.id));
  if (!lead || !canSeeLead(req.user, lead)) return res.status(404).json({ error: 'Lead hittades inte' });
  const c = lead.company_id ? get('SELECT * FROM companies WHERE id = ?', lead.company_id) : null;
  res.json({ company: companyInfo(c), configured: aiConfigured(), canEnrich: canEditLead(req.user, lead) && (!!c || !!lead.company) });
});

r.post('/leads/:id/enrich', wrap(async (req, res) => {
  const lead = getLead(Number(req.params.id));
  if (!lead || !canSeeLead(req.user, lead)) return res.status(404).json({ error: 'Lead hittades inte' });
  if (!canEditLead(req.user, lead)) return res.status(403).json({ error: 'Du kan inte redigera detta lead' });
  const company = companyForLead(lead);
  if (!company) return res.status(400).json({ error: 'Leadet saknar företag. Lägg till företagsnamn först.' });
  await run(company, req.user, res);
}));

r.post('/companies/:id/enrich', wrap(async (req, res) => {
  const vis = companyVisibilitySql(req.user);
  const company = get(`SELECT * FROM companies c WHERE c.id = ? AND ${vis.sql}`, Number(req.params.id), ...vis.params);
  if (!company) return res.status(404).json({ error: 'Företaget hittades inte' });
  if (!canEditCompany(req.user, company)) return res.status(403).json({ error: 'Du kan inte redigera företaget' });
  await run(company, req.user, res);
}));

// En färdig sammanfattning (t.ex. från Claude via MCP) sparas utan att appen anropar någon AI.
function saveProvided(company, req, res) {
  const b = req.body || {};
  if (!String(b.summary || '').trim()) return res.status(400).json({ error: 'Ange en sammanfattning' });
  const sources = (Array.isArray(b.sources) ? b.sources : []).slice(0, 10).map((s) => {
    try { const u = new URL(String(s)); return { type: 'web', label: u.hostname, url: u.href }; } catch { return { type: 'note', label: String(s).slice(0, 120) }; }
  });
  saveEnrichment(company, req.user, { ...b, sources, model: req.via === 'claude' ? 'Claude (via koppling)' : null, via: req.via || 'manual' });
  res.json({ company: companyInfo(get('SELECT * FROM companies WHERE id = ?', company.id)) });
}

r.post('/leads/:id/enrichment', (req, res) => {
  const lead = getLead(Number(req.params.id));
  if (!lead || !canSeeLead(req.user, lead)) return res.status(404).json({ error: 'Lead hittades inte' });
  if (!canEditLead(req.user, lead)) return res.status(403).json({ error: 'Du kan inte redigera detta lead' });
  const company = companyForLead(lead);
  if (!company) return res.status(400).json({ error: 'Leadet saknar företag. Lägg till företagsnamn först.' });
  saveProvided(company, req, res);
});

r.post('/companies/:id/enrichment', (req, res) => {
  const vis = companyVisibilitySql(req.user);
  const company = get(`SELECT * FROM companies c WHERE c.id = ? AND ${vis.sql}`, Number(req.params.id), ...vis.params);
  if (!company) return res.status(404).json({ error: 'Företaget hittades inte' });
  if (!canEditCompany(req.user, company)) return res.status(403).json({ error: 'Du kan inte redigera företaget' });
  saveProvided(company, req, res);
});

// ---------- Vårt erbjudande ----------
// Alla kan läsa (används av Claude och i mejlutkast); den som hanterar produkter och offerter redigerar.
r.get('/ai/offer', (req, res) => res.json({
  offer: getOffer(), company: getProfile().name || null, website: getProfile().website || null,
  canEdit: can(req.user, 'products.manage'), configured: aiConfigured(),
}));

r.put('/ai/offer', requirePerm('products.manage'), (req, res) => {
  const offer = saveOffer(req.body || {});
  audit(req.user.id, 'offer.update', 'settings', null);
  res.json({ offer });
});

// Förslag från den egna hemsidan – sparas först när användaren klickar Spara.
r.post('/ai/offer/draft', requirePerm('products.manage'), wrap(async (req, res) => {
  const website = String(req.body?.website || getProfile().website || '').trim();
  if (!website) return res.status(400).json({ error: 'Ange er hemsida' });
  res.json({ offer: await draftOfferFromWebsite(website) });
}));

// Utkast till ett första mejl till kontakten (sparas inte – öppnas i skriv-rutan).
r.post('/leads/:id/draft-email', wrap(async (req, res) => {
  const lead = getLead(Number(req.params.id));
  if (!lead || !canSeeLead(req.user, lead)) return res.status(404).json({ error: 'Lead hittades inte' });
  if (!canEditLead(req.user, lead)) return res.status(403).json({ error: 'Du kan inte redigera detta lead' });
  const company = lead.company_id ? get('SELECT * FROM companies WHERE id = ?', lead.company_id) : null;
  const draft = await draftFirstEmail(lead, company, req.user);
  audit(req.user.id, 'email.draft', 'lead', lead.id);
  res.json(draft);
}));

// ---------- Inställningar (administratörer) ----------
r.get('/ai/config', requirePerm('integrations.manage'), (req, res) => {
  const s = aiSettings();
  res.json({ apiKey: s.apiKey && !s.fromEnv ? '••••••••' : '', fromEnv: s.fromEnv, model: s.model, configured: !!s.apiKey, models: SUGGESTED_MODELS });
});

r.patch('/ai/config', requirePerm('integrations.manage'), (req, res) => {
  const { apiKey, model } = req.body || {};
  if (model !== undefined && !/^[\w.-]+\/[\w.:-]+$/.test(String(model).trim())) return res.status(400).json({ error: 'Ogiltigt modellnamn. Använd formatet leverantör/modell, t.ex. anthropic/claude-haiku-5.5' });
  saveAiConfig({ apiKey, model });
  audit(req.user.id, 'ai.config', 'settings', null, { model });
  res.json({ ok: true, configured: aiConfigured() });
});

export default r;
