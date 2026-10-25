import { Router } from 'express';
import { all, get, run, audit, findWorkspace, withWorkspace, listWorkspaces } from '../db.js';
import { encrypt, decrypt, randomToken } from '../security.js';
import { requirePerm } from '../middleware.js';
import { ingestLead } from '../services/leads.js';
import { syncIntegration, isPollable } from '../integrations/scheduler.js';
import { testImap, ingestInboundEmail } from '../integrations/email.js';
import * as meta from '../integrations/meta.js';

export const TYPES = ['email', 'facebook', 'instagram', 'webform'];
const SECRET_FIELDS = ['password', 'appSecret', 'pageAccessToken'];

function present(row) {
  const cfg = decrypt(row.config);
  const safe = { ...cfg };
  for (const f of SECRET_FIELDS) if (safe[f]) safe[f] = '••••••••';
  return { ...row, config: safe, enabled: !!row.enabled, pollable: isPollable(row, cfg) };
}

function mergeConfig(oldCfg, incoming = {}) {
  const cfg = { ...oldCfg };
  for (const [k, v] of Object.entries(incoming)) {
    if (SECRET_FIELDS.includes(k) && (v === '••••••••' || v === '')) continue;
    cfg[k] = v;
  }
  return cfg;
}

// ---------- Hantering (kräver behörighet) ----------
export const manage = Router();
manage.use(requirePerm('integrations.manage'));

manage.get('/integrations', (req, res) => {
  res.json({ items: all('SELECT * FROM integrations ORDER BY id').map(present), publicUrl: process.env.PUBLIC_URL || null });
});

manage.post('/integrations', (req, res) => {
  const { type, name, config = {} } = req.body || {};
  if (!TYPES.includes(type)) return res.status(400).json({ error: 'Okänd integrationstyp' });
  const defaults = {
    email: { mode: 'imap', port: 993, secure: true, mailbox: 'INBOX', markSeen: false, intervalMinutes: 2, backfillDays: 3 },
    facebook: { captureLeadAds: true, captureMessages: false, pollEnabled: true, intervalMinutes: 15, verifyToken: randomToken(12) },
    instagram: { captureLeadAds: true, captureMessages: true, pollEnabled: true, intervalMinutes: 15, verifyToken: randomToken(12) },
    webform: { redirectUrl: '' },
  }[type];
  const label = name?.trim() || { email: 'E-post', facebook: 'Facebook', instagram: 'Instagram', webform: 'Webbformulär' }[type];
  const ins = run('INSERT INTO integrations (type, name, token, config) VALUES (?,?,?,?)', type, label, randomToken(), encrypt({ ...defaults, ...config }));
  audit(req.user.id, 'integration.create', 'integration', Number(ins.lastInsertRowid), { type });
  res.status(201).json(present(get('SELECT * FROM integrations WHERE id = ?', ins.lastInsertRowid)));
});

manage.patch('/integrations/:id', (req, res) => {
  const row = get('SELECT * FROM integrations WHERE id = ?', req.params.id);
  if (!row) return res.status(404).json({ error: 'Hittades inte' });
  const { name, enabled, config } = req.body || {};
  const cfg = config ? mergeConfig(decrypt(row.config), config) : decrypt(row.config);
  run('UPDATE integrations SET name = coalesce(?, name), enabled = coalesce(?, enabled), config = ?, status = ? WHERE id = ?',
    name?.trim() || null, enabled == null ? null : enabled ? 1 : 0, encrypt(cfg), config ? 'idle' : row.status, row.id);
  audit(req.user.id, 'integration.update', 'integration', row.id, { enabled });
  res.json(present(get('SELECT * FROM integrations WHERE id = ?', row.id)));
});

manage.delete('/integrations/:id', (req, res) => {
  run('DELETE FROM integrations WHERE id = ?', req.params.id);
  run('DELETE FROM settings WHERE key = ?', `imap:${req.params.id}`);
  audit(req.user.id, 'integration.delete', 'integration', Number(req.params.id));
  res.json({ ok: true });
});

manage.post('/integrations/:id/test', async (req, res) => {
  const row = get('SELECT * FROM integrations WHERE id = ?', req.params.id);
  if (!row) return res.status(404).json({ error: 'Hittades inte' });
  const cfg = decrypt(row.config);
  try {
    let info;
    if (row.type === 'email') {
      if (cfg.mode !== 'imap') return res.json({ ok: true, info: { message: 'Vidarebefordran kräver ingen anslutning – skicka ett testmejl till webhook-adressen.' } });
      info = await testImap(cfg);
    } else if (row.type === 'facebook' || row.type === 'instagram') info = await meta.testConnection(row.type, cfg);
    else info = { message: 'Formuläret är redo att ta emot leads.' };
    run("UPDATE integrations SET status = 'ok', last_error = NULL WHERE id = ?", row.id);
    res.json({ ok: true, info });
  } catch (e) {
    run("UPDATE integrations SET status = 'error', last_error = ? WHERE id = ?", String(e.message), row.id);
    res.status(400).json({ error: `Anslutningen misslyckades: ${e.message}` });
  }
});

manage.post('/integrations/:id/sync', async (req, res) => {
  try { res.json(await syncIntegration(Number(req.params.id))); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

const SAMPLE = {
  first: ['Anna', 'Erik', 'Maja', 'Johan', 'Sara', 'Oskar', 'Elin', 'Karl', 'Linnea', 'Viktor', 'Ida', 'Albin'],
  last: ['Lindqvist', 'Berg', 'Nyström', 'Holm', 'Sjöberg', 'Ek', 'Forsberg', 'Wallin', 'Engström', 'Lund'],
  company: ['Nordlys AB', 'Solberga Bygg', 'Kvarnen Media', 'Tallhöjden Fastigheter', 'Ljusa Tandvård', 'Fjällstugan Resor', 'Brunnsviken Konsult'],
  city: ['Stockholm', 'Göteborg', 'Malmö', 'Uppsala', 'Västerås', 'Örebro', 'Umeå'],
};
const pick = (a) => a[Math.floor(Math.random() * a.length)];

manage.post('/integrations/:id/simulate', (req, res) => {
  const row = get('SELECT * FROM integrations WHERE id = ?', req.params.id);
  if (!row) return res.status(404).json({ error: 'Hittades inte' });
  const first = pick(SAMPLE.first), last = pick(SAMPLE.last), company = pick(SAMPLE.company);
  const email = `${first}.${last}`.toLowerCase().replace(/[åä]/g, 'a').replace(/ö/g, 'o') + Math.floor(Math.random() * 900 + 100) + '@exempel.se';
  const phone = '+4670' + Math.floor(1000000 + Math.random() * 8999999);
  const source = row.type === 'webform' ? 'webform' : row.type;
  const detail = { email: 'Förfrågan: Offert önskas', facebook: 'Vårkampanj – Lead Ads', instagram: 'Instagram Lead Ads · Story', webform: 'Kontaktformulär' }[row.type];
  const raw = row.type === 'facebook' || row.type === 'instagram'
    ? { full_name: `${first} ${last}`, email, phone_number: phone, company_name: company, city: pick(SAMPLE.city), 'vad_behöver_du_hjälp_med?': 'Vill ha en offert' }
    : { namn: `${first} ${last}`, epost: email, telefon: phone, foretag: company, meddelande: 'Hej! Vi är intresserade av era tjänster och vill gärna bli kontaktade.' };
  const result = ingestLead({ source, sourceDetail: `${detail} (test)`, externalId: `test-${randomToken(6)}`, integrationId: row.id, raw });
  res.json(result);
});

manage.get('/ingest-log', (req, res) => {
  res.json(all(`SELECT g.id, g.integration_id, g.source, g.result, g.lead_id, g.summary, g.created_at, i.name AS integration_name
    FROM ingest_log g LEFT JOIN integrations i ON i.id = g.integration_id ORDER BY g.id DESC LIMIT ?`, Math.min(300, Number(req.query.limit || 100))));
});

manage.get('/ingest-log/:id', (req, res) => {
  res.json(get('SELECT * FROM ingest_log WHERE id = ?', req.params.id) || {});
});

// ---------- Publika webhooks (ingen inloggning, skyddas av token/signatur) ----------
export const webhooks = Router();

// Webhooks har ingen inloggning; arbetsytan avgörs av vilken arbetsyta som äger verifieringstoken, sidan eller adressen.
webhooks.get('/meta', (req, res) => {
  let challenge = null;
  findWorkspace(() => (challenge = meta.verifySubscription(req.query)));
  return challenge ? res.status(200).send(challenge) : res.sendStatus(403);
});

webhooks.post('/meta', (req, res) => {
  if (!findWorkspace(() => meta.verifySignature(req.rawBody, req.get('x-hub-signature-256')))) return res.sendStatus(401);
  res.sendStatus(200); // Meta kräver snabbt svar – bearbeta asynkront
  const owners = listWorkspaces().filter((ws) => withWorkspace(ws.id, () => meta.ownsWebhook(req.body)));
  if (!owners.length) console.warn('[meta] webhook för en sida som inte är kopplad i någon arbetsyta');
  for (const ws of owners) withWorkspace(ws.id, () => meta.handleWebhook(req.body)).catch((e) => console.error('[meta]', e));
});

// Formulär- och e-postadresser innehåller integrationens token; förfrågan körs i arbetsytan som äger den.
const workspaceOfToken = (type) => (req, res, next) => {
  const ws = findWorkspace(() => !!get('SELECT 1 FROM integrations WHERE token = ? AND type = ?', req.params.token, type));
  if (!ws) return res.sendStatus(404);
  withWorkspace(ws, next);
};

const byToken = (type, token) => {
  const row = get('SELECT * FROM integrations WHERE token = ? AND type = ? AND enabled = 1', token, type);
  return row ? { ...row, cfg: decrypt(row.config) } : null;
};

webhooks.post('/email/:token', workspaceOfToken('email'), (req, res) => {
  const integ = byToken('email', req.params.token);
  if (!integ) return res.sendStatus(404);
  const r = ingestInboundEmail(integ, req.body || {});
  run("UPDATE integrations SET status = 'ok', last_sync_at = datetime('now') WHERE id = ?", integ.id);
  res.json({ ok: true, result: r.result });
});

webhooks.options('/form/:token', (req, res) => {
  res.set({ 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type' }).sendStatus(204);
});

webhooks.post('/form/:token', (req, res, next) => { res.set('Access-Control-Allow-Origin', '*'); next(); }, workspaceOfToken('webform'), (req, res) => {
  const integ = byToken('webform', req.params.token);
  if (!integ) return res.sendStatus(404);
  const { _gotcha, _source, ...fields } = req.body || {};
  if (_gotcha) return res.json({ ok: true }); // honeypot – troligen spam
  const r = ingestLead({ source: 'webform', sourceDetail: _source || integ.name, integrationId: integ.id, raw: fields });
  run("UPDATE integrations SET status = 'ok', last_sync_at = datetime('now') WHERE id = ?", integ.id);
  const redirect = integ.cfg.redirectUrl;
  if (redirect && req.is('application/x-www-form-urlencoded')) return res.redirect(303, redirect);
  res.json({ ok: true, result: r.result });
});
