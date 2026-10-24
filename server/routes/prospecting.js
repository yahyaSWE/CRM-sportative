import { Router } from 'express';
import { all, get, run, audit } from '../db.js';
import { can } from '../security.js';
import { requirePerm } from '../middleware.js';
import { testKey } from '../prospecting/google.js';
import { ping } from '../prospecting/bolagsverket.js';
import {
  getConfig, saveConfig, hasBolagsverket, runSearch, importProspects, setOrgNr, hydrateProspect, hydrateSearch, RETENTION_DAYS,
} from '../prospecting/service.js';

const r = Router();
r.use('/prospecting', requirePerm('prospecting.use'));

const presentConfig = (cfg) => ({
  googleConfigured: !!cfg.googleApiKey, bolagsverketConfigured: hasBolagsverket(cfg),
  googleApiKey: cfg.googleApiKey ? '••••••••' : '', bvClientId: cfg.bvClientId || '', bvClientSecret: cfg.bvClientSecret ? '••••••••' : '',
  bvEnv: cfg.bvEnv || 'prod', retentionDays: RETENTION_DAYS,
});

r.get('/prospecting/config', (req, res) => res.json(presentConfig(getConfig())));

r.patch('/prospecting/config', requirePerm('integrations.manage'), (req, res) => {
  const { googleApiKey, bvClientId, bvClientSecret, bvEnv } = req.body || {};
  const cfg = saveConfig({ googleApiKey, bvClientId, bvClientSecret, bvEnv });
  audit(req.user.id, 'prospecting.config', 'settings', null);
  res.json(presentConfig(cfg));
});

r.post('/prospecting/config/test', requirePerm('integrations.manage'), async (req, res) => {
  const cfg = getConfig();
  const result = {};
  if (cfg.googleApiKey) { try { const t = await testKey(cfg.googleApiKey); result.google = { ok: true, message: `Fungerar (hittade t.ex. ${t.sample || 'en plats'})` }; } catch (e) { result.google = { ok: false, message: e.message }; } }
  if (hasBolagsverket(cfg)) { try { await ping(cfg); result.bolagsverket = { ok: true, message: 'Fungerar' }; } catch (e) { result.bolagsverket = { ok: false, message: e.message }; } }
  res.json(result);
});

// ---------- Sökningar ----------
r.get('/prospecting/searches', (req, res) => {
  res.json(all(`SELECT s.*, u.name AS created_by_name,
      (SELECT count(*) FROM prospects WHERE search_id = s.id AND status = 'new') AS to_review,
      (SELECT count(*) FROM prospects WHERE search_id = s.id AND status = 'imported') AS imported
    FROM prospect_searches s LEFT JOIN users u ON u.id = s.created_by ORDER BY s.id DESC`).map(hydrateSearch));
});

r.post('/prospecting/searches', async (req, res) => {
  const { query, location, filters = {}, schedule = 'none', name } = req.body || {};
  if (!query?.trim()) return res.status(400).json({ error: 'Ange vad du söker efter, t.ex. "tandläkare"' });
  const ins = run('INSERT INTO prospect_searches (name, query, location, filters, schedule, created_by) VALUES (?,?,?,?,?,?)',
    name?.trim() || [query.trim(), location?.trim()].filter(Boolean).join(' · '), query.trim(), location?.trim() || null,
    JSON.stringify(filters), schedule === 'weekly' ? 'weekly' : 'none', req.user.id);
  const id = Number(ins.lastInsertRowid);
  audit(req.user.id, 'prospecting.search', 'prospect_search', id, { query, location });
  try { const result = await runSearch(id); res.status(201).json({ id, ...result }); }
  catch (e) { res.status(400).json({ id, error: `Sökningen misslyckades: ${e.message}` }); }
});

r.post('/prospecting/searches/:id/run', async (req, res) => {
  try { res.json(await runSearch(Number(req.params.id))); } catch (e) { res.status(400).json({ error: e.message }); }
});

r.patch('/prospecting/searches/:id', (req, res) => {
  const { schedule, name } = req.body || {};
  run('UPDATE prospect_searches SET schedule = coalesce(?, schedule), name = coalesce(?, name) WHERE id = ?',
    schedule ? (schedule === 'weekly' ? 'weekly' : 'none') : null, name?.trim() || null, req.params.id);
  res.json(hydrateSearch(get('SELECT * FROM prospect_searches WHERE id = ?', req.params.id)));
});

r.delete('/prospecting/searches/:id', (req, res) => {
  // Ej importerade prospekt från sökningen tas bort; place_id för avvisade behålls så de inte dyker upp igen.
  run("DELETE FROM prospects WHERE search_id = ? AND status = 'new'", req.params.id);
  run('DELETE FROM prospect_searches WHERE id = ?', req.params.id);
  res.json({ ok: true });
});

// ---------- Prospekt ----------
r.get('/prospecting/prospects', (req, res) => {
  const { search, status = 'new' } = req.query;
  const where = ['p.name IS NOT NULL'];
  const params = [];
  if (search) { where.push('p.search_id = ?'); params.push(Number(search)); }
  if (status !== 'all') { where.push('p.status = ?'); params.push(status); }
  res.json(all(`SELECT p.*, s.name AS search_name,
      dl.first_name AS dup_first_name, dl.last_name AS dup_last_name, dl.company AS dup_company, du.name AS dup_owner
    FROM prospects p LEFT JOIN prospect_searches s ON s.id = p.search_id
    LEFT JOIN leads dl ON dl.id = p.duplicate_lead_id LEFT JOIN users du ON du.id = dl.owner_id
    WHERE ${where.join(' AND ')} ORDER BY (p.duplicate_lead_id IS NOT NULL), p.rating DESC NULLS LAST, p.id LIMIT 500`, ...params).map(hydrateProspect));
});

r.post('/prospecting/prospects/import', (req, res) => {
  const { ids = [], owner_id } = req.body || {};
  if (!ids.length) return res.status(400).json({ error: 'Välj minst ett företag' });
  const ownerId = owner_id && can(req.user, 'leads.assign') ? Number(owner_id) : owner_id === undefined ? null : req.user.id;
  res.json(importProspects(ids.map(Number), req.user, { ownerId }));
});

r.post('/prospecting/prospects/reject', (req, res) => {
  const { ids = [] } = req.body || {};
  for (const id of ids) run("UPDATE prospects SET status = 'rejected' WHERE id = ? AND status = 'new'", Number(id));
  res.json({ rejected: ids.length });
});

r.post('/prospecting/prospects/restore', (req, res) => {
  const { ids = [] } = req.body || {};
  for (const id of ids) run("UPDATE prospects SET status = 'new' WHERE id = ? AND status = 'rejected'", Number(id));
  res.json({ ok: true });
});

r.patch('/prospecting/prospects/:id', async (req, res) => {
  const p = get('SELECT * FROM prospects WHERE id = ?', req.params.id);
  if (!p) return res.status(404).json({ error: 'Hittades inte' });
  const { email, org_nr } = req.body || {};
  if (email !== undefined) run("UPDATE prospects SET email = ?, updated_at = datetime('now') WHERE id = ?", email || null, p.id);
  if (org_nr) { try { await setOrgNr(p.id, org_nr); } catch (e) { return res.status(400).json({ error: e.message }); } }
  res.json(hydrateProspect(get('SELECT * FROM prospects WHERE id = ?', p.id)));
});

export default r;
