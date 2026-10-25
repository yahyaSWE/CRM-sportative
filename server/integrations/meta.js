// Facebook & Instagram via Meta Graph API.
// - Lead Ads (Facebook + Instagram) levereras som "leadgen"-webhooks på Facebook-sidan.
// - Messenger-meddelanden (object=page) och Instagram Direct (object=instagram) kan också skapa leads.
// - Polling av formulär fungerar som reserv om en webhook missas.
import crypto from 'node:crypto';
import { all, run } from '../db.js';
import { decrypt } from '../security.js';
import { ingestLead } from '../services/leads.js';

const GRAPH = 'https://graph.facebook.com/' + (process.env.META_GRAPH_VERSION || 'v23.0');

export function metaIntegrations() {
  return all("SELECT * FROM integrations WHERE type IN ('facebook','instagram') AND enabled = 1")
    .map((i) => ({ ...i, cfg: decrypt(i.config) }));
}

async function graph(path, token, params = {}) {
  const url = new URL(GRAPH + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, typeof v === 'string' ? v : JSON.stringify(v));
  url.searchParams.set('access_token', token);
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) throw new Error(body.error?.message || `Graph API-fel ${res.status}`);
  return body;
}

export function verifySubscription(query) {
  const token = query['hub.verify_token'];
  if (query['hub.mode'] !== 'subscribe' || !token) return null;
  return metaIntegrations().some((i) => i.cfg.verifyToken && i.cfg.verifyToken === token) ? query['hub.challenge'] : null;
}

export function verifySignature(rawBody, header) {
  const secrets = [...new Set(metaIntegrations().map((i) => i.cfg.appSecret).filter(Boolean))];
  if (!secrets.length) return false;
  if (!header?.startsWith('sha256=')) return false;
  const sig = Buffer.from(header.slice(7), 'hex');
  return secrets.some((s) => {
    const expected = crypto.createHmac('sha256', s).update(rawBody || '').digest();
    return expected.length === sig.length && crypto.timingSafeEqual(expected, sig);
  });
}

const fieldDataToRaw = (fieldData = []) =>
  Object.fromEntries(fieldData.map((f) => [f.name, (f.values || []).join(', ')]));

// Välj vilken integration (Facebook eller Instagram) en lead från en viss sida ska bokföras på.
function resolveTarget(pageId, platform) {
  const list = metaIntegrations().filter((i) => String(i.cfg.pageId) === String(pageId));
  const ig = list.find((i) => i.type === 'instagram');
  const fb = list.find((i) => i.type === 'facebook');
  if (platform === 'ig') return ig ? { integ: ig, source: 'instagram' } : fb ? { integ: fb, source: 'instagram' } : null;
  return fb ? { integ: fb, source: 'facebook' } : ig ? { integ: ig, source: 'facebook' } : null;
}

const LEAD_FIELDS = 'created_time,field_data,ad_name,campaign_name,form_id,platform,is_organic';

async function importLeadgen(leadgenId, pageId, formName) {
  const anyInteg = metaIntegrations().find((i) => String(i.cfg.pageId) === String(pageId) && i.cfg.pageAccessToken);
  if (!anyInteg) throw new Error(`Ingen Facebook/Instagram-integration för sida ${pageId}`);
  const lead = await graph(`/${leadgenId}`, anyInteg.cfg.pageAccessToken, { fields: LEAD_FIELDS });
  const target = resolveTarget(pageId, lead.platform) || { integ: anyInteg, source: anyInteg.type };
  if (target.integ.cfg.captureLeadAds === false) return null;
  const detail = [formName || lead.form_id && `Formulär ${lead.form_id}`, lead.campaign_name].filter(Boolean).join(' · ');
  return ingestLead({
    source: target.source,
    sourceDetail: detail || 'Lead Ads',
    externalId: String(leadgenId),
    integrationId: target.integ.id,
    raw: { ...fieldDataToRaw(lead.field_data), ...(lead.ad_name ? { annons: lead.ad_name } : {}) },
    payload: lead,
  });
}

async function importMessage({ kind, accountId, senderId, text }) {
  const list = metaIntegrations();
  const integ = kind === 'instagram'
    ? list.find((i) => i.type === 'instagram' && String(i.cfg.instagramAccountId) === String(accountId))
    : list.find((i) => i.type === 'facebook' && String(i.cfg.pageId) === String(accountId));
  if (!integ || !integ.cfg.captureMessages || senderId === accountId) return null;
  let raw = {};
  try {
    const p = await graph(`/${senderId}`, integ.cfg.pageAccessToken,
      { fields: kind === 'instagram' ? 'name,username' : 'first_name,last_name' });
    raw = kind === 'instagram'
      ? { name: p.name || p.username, instagram: p.username ? `@${p.username}` : undefined }
      : { first_name: p.first_name, last_name: p.last_name };
  } catch { /* profilen kan vara skyddad – leadet skapas ändå */ }
  return ingestLead({
    source: kind === 'instagram' ? 'instagram' : 'facebook',
    sourceDetail: kind === 'instagram' ? 'Direktmeddelande' : 'Messenger',
    externalId: `${kind}-dm:${senderId}`,
    integrationId: integ.id,
    raw: { ...raw, message: text },
    note: text,
  });
}

/** Hör webhooken till en sida (eller ett Instagram-konto) som är kopplad i den aktuella arbetsytan? */
export function ownsWebhook(body) {
  const ids = new Set();
  for (const entry of body?.entry || []) {
    ids.add(String(entry.id));
    for (const change of entry.changes || []) if (change.value?.page_id) ids.add(String(change.value.page_id));
  }
  return metaIntegrations().some((i) => ids.has(String(i.cfg.pageId)) || ids.has(String(i.cfg.instagramAccountId)));
}

export async function handleWebhook(body) {
  const results = [];
  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field === 'leadgen' && change.value?.leadgen_id) {
        results.push(await importLeadgen(change.value.leadgen_id, change.value.page_id || entry.id).catch((e) => logError(e)));
      }
    }
    for (const m of entry.messaging || []) {
      if (!m.message || m.message.is_echo) continue;
      results.push(await importMessage({
        kind: body.object === 'instagram' ? 'instagram' : 'page',
        accountId: entry.id, senderId: m.sender?.id, text: m.message.text || '[bilaga]',
      }).catch((e) => logError(e)));
    }
  }
  return results;
}

function logError(e) {
  run("INSERT INTO ingest_log (source, result, summary) VALUES ('meta', 'error', ?)", String(e.message || e));
  return null;
}

// Reserv: hämta nya leads direkt från sidans formulär.
export async function pollIntegration(integ) {
  const { cfg } = integ;
  if (!cfg.pageId || !cfg.pageAccessToken) throw new Error('Sid-ID och sidtoken krävs');
  const since = integ.last_sync_at ? Math.floor(new Date(integ.last_sync_at + 'Z').getTime() / 1000) - 300
    : Math.floor(Date.now() / 1000) - 7 * 86400;
  const forms = await graph(`/${cfg.pageId}/leadgen_forms`, cfg.pageAccessToken, { fields: 'id,name,status', limit: '100' });
  let imported = 0;
  for (const form of forms.data || []) {
    let page = await graph(`/${form.id}/leads`, cfg.pageAccessToken, {
      fields: LEAD_FIELDS, limit: '100',
      filtering: [{ field: 'time_created', operator: 'GREATER_THAN', value: since }],
    });
    for (;;) {
      for (const lead of page.data || []) {
        const isIg = lead.platform === 'ig';
        // Om både en Facebook- och en Instagram-integration delar sida tar var och en sina egna leads.
        const target = resolveTarget(cfg.pageId, lead.platform);
        if (target && target.integ.id !== integ.id) continue;
        const r = ingestLead({
          source: isIg ? 'instagram' : 'facebook',
          sourceDetail: [form.name, lead.campaign_name].filter(Boolean).join(' · '),
          externalId: String(lead.id), integrationId: integ.id,
          raw: { ...fieldDataToRaw(lead.field_data), ...(lead.ad_name ? { annons: lead.ad_name } : {}) },
          payload: lead,
        });
        if (r.result === 'created') imported++;
      }
      if (!page.paging?.next) break;
      const res = await fetch(page.paging.next, { signal: AbortSignal.timeout(15000) });
      page = await res.json();
    }
  }
  return { imported, forms: forms.data?.length || 0 };
}

export async function testConnection(type, cfg) {
  if (!cfg.pageAccessToken) throw new Error('Sidans åtkomsttoken saknas');
  const me = await graph('/me', cfg.pageAccessToken, { fields: 'id,name' });
  const info = { page: me.name, pageId: me.id };
  if (type === 'instagram' && cfg.instagramAccountId) {
    const ig = await graph(`/${cfg.instagramAccountId}`, cfg.pageAccessToken, { fields: 'username' });
    info.instagram = '@' + ig.username;
  }
  return info;
}
