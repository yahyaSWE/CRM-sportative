import { Router } from 'express';
import { all, get, run, tx, audit } from '../db.js';
import { can } from '../security.js';
import { requirePerm } from '../middleware.js';
import { broadcast } from '../events.js';
import { hydrateLead, canSeeLead, LEAD_NEXT_COLUMNS, pickNextStep } from '../services/leads.js';
import { companyVisibilitySql, COMPANY_STATS, domainFromUrl, findCompany } from '../services/companies.js';
import { getConfig as prospectingConfig, hasBolagsverket } from '../prospecting/service.js';
import { lookupOrganisation, validOrgNr, formatOrgNr } from '../prospecting/bolagsverket.js';
import { presentEnrichment, aiConfigured } from '../services/enrich.js';
import { presentPurchasing, savePurchasing } from '../services/purchasing.js';

const r = Router();
const FIELDS = ['name', 'org_nr', 'website', 'phone', 'email', 'address', 'city', 'industry', 'notes'];

function loadCompany(req, res) {
  const vis = companyVisibilitySql(req.user);
  const c = get(`SELECT c.*, u.name AS owner_name, u.color AS owner_color, ${COMPANY_STATS()} FROM companies c
    LEFT JOIN users u ON u.id = c.owner_id WHERE c.id = ? AND ${vis.sql}`, Number(req.params.id), ...vis.params);
  if (!c) { res.status(404).json({ error: 'Företaget hittades inte' }); return null; }
  return c;
}
const canEditCompany = (user, c) => can(user, 'leads.edit_all') || (can(user, 'leads.edit_own') && (!c.owner_id || c.owner_id === user.id));

r.get('/companies', (req, res) => {
  const { q, owner, view, sort = 'name', dir } = req.query;
  const vis = companyVisibilitySql(req.user);
  const where = [vis.sql], params = [...vis.params];
  if (q) {
    const t = `%${String(q).trim().toLowerCase()}%`;
    const digits = String(q).replace(/\D/g, '');
    where.push(`(sv_lower(c.name) LIKE ? OR sv_lower(c.city) LIKE ? OR sv_lower(c.domain) LIKE ? OR sv_lower(c.industry) LIKE ?
      ${digits.length >= 4 ? "OR replace(c.org_nr, '-', '') LIKE ? OR replace(replace(c.phone, ' ', ''), '-', '') LIKE ?" : ''}
      OR EXISTS (SELECT 1 FROM leads sl WHERE sl.company_id = c.id AND sv_lower(coalesce(sl.first_name,'') || ' ' || coalesce(sl.last_name,'')) LIKE ?))`);
    params.push(t, t, t, t, ...(digits.length >= 4 ? [`%${digits}%`, `%${digits}%`] : []), t);
  }
  if (owner === 'me') { where.push('(c.owner_id = ? OR EXISTS (SELECT 1 FROM leads ol WHERE ol.company_id = c.id AND ol.owner_id = ?))'); params.push(req.user.id, req.user.id); }
  if (view === 'customers') where.push("EXISTS (SELECT 1 FROM deals wd WHERE wd.company_id = c.id AND wd.stage = 'won')");
  else if (view === 'open') where.push("EXISTS (SELECT 1 FROM deals od WHERE od.company_id = c.id AND od.stage NOT IN ('won','lost'))");
  else if (view === 'prospects') where.push("NOT EXISTS (SELECT 1 FROM deals pd WHERE pd.company_id = c.id AND pd.stage = 'won')");
  const sortCol = { name: 'sv_lower(c.name)', won_value: 'won_value', open_value: 'open_value', last_contact_at: 'coalesce(last_contact_at, c.created_at)', contacts: 'contact_count', created_at: 'c.created_at' }[sort] || 'sv_lower(c.name)';
  const direction = (dir || (sort === 'name' ? 'asc' : 'desc')) === 'asc' ? 'ASC' : 'DESC';
  const rows = all(`SELECT c.*, u.name AS owner_name, u.color AS owner_color, ${COMPANY_STATS()},
      (SELECT group_concat(coalesce(first_name,'') || ' ' || coalesce(last_name,''), ', ') FROM (SELECT first_name, last_name FROM leads WHERE company_id = c.id LIMIT 3)) AS contact_names
    FROM companies c LEFT JOIN users u ON u.id = c.owner_id WHERE ${where.join(' AND ')} ORDER BY ${sortCol} ${direction}, c.id DESC LIMIT 500`, ...params);
  const base = get(`SELECT count(*) AS total,
      sum(EXISTS (SELECT 1 FROM deals wd WHERE wd.company_id = c.id AND wd.stage = 'won')) AS customers,
      sum(EXISTS (SELECT 1 FROM deals od WHERE od.company_id = c.id AND od.stage NOT IN ('won','lost'))) AS open
    FROM companies c WHERE ${vis.sql}`, ...vis.params);
  res.json({ rows, counts: { ...base, prospects: base.total - base.customers } });
});

r.get('/companies/:id', (req, res) => {
  const c = loadCompany(req, res);
  if (!c) return;
  const contacts = all(`SELECT l.*, u.name AS owner_name, u.color AS owner_color, ${LEAD_NEXT_COLUMNS()} FROM leads l LEFT JOIN users u ON u.id = l.owner_id
    WHERE l.company_id = ? ORDER BY l.last_activity_at DESC`, c.id).map((x) => hydrateLead(pickNextStep(x)));
  const deals = all(`SELECT d.*, u.name AS owner_name, u.color AS owner_color, l.first_name, l.last_name FROM deals d
    LEFT JOIN users u ON u.id = d.owner_id LEFT JOIN leads l ON l.id = d.lead_id WHERE d.company_id = ? ORDER BY (d.stage IN ('won','lost')), d.updated_at DESC`, c.id);
  const activities = all(`SELECT a.*, u.name AS user_name, u.color AS user_color, dl.title AS deal_title,
      al.first_name AS contact_first_name, al.last_name AS contact_last_name FROM activities a
    LEFT JOIN users u ON u.id = a.user_id LEFT JOIN deals dl ON dl.id = a.deal_id LEFT JOIN leads al ON al.id = a.lead_id
    WHERE a.company_id = ? OR a.lead_id IN (SELECT id FROM leads WHERE company_id = ?) OR a.deal_id IN (SELECT id FROM deals WHERE company_id = ?)
    ORDER BY a.created_at DESC, a.id DESC LIMIT 300`, c.id, c.id, c.id);
  res.json({
    ...c, contacts: contacts.filter((l) => canSeeLead(req.user, l)), hiddenContacts: contacts.filter((l) => !canSeeLead(req.user, l)).length,
    deals: deals.filter((d) => can(req.user, 'leads.view_all') || d.owner_id === req.user.id), activities,
    canEdit: canEditCompany(req.user, c), bolagsverket: hasBolagsverket(prospectingConfig()),
    enrichment: presentEnrichment(c), aiConfigured: aiConfigured(), purchasing: presentPurchasing(c),
  });
});

r.post('/companies', requirePerm('leads.edit_own'), (req, res) => {
  const b = req.body || {};
  if (!b.name?.trim()) return res.status(400).json({ error: 'Ange företagets namn' });
  if (b.org_nr && !validOrgNr(b.org_nr)) return res.status(400).json({ error: 'Ogiltigt organisationsnummer' });
  const dup = findCompany({ name: b.name, org_nr: b.org_nr, domain: domainFromUrl(b.website) });
  if (dup) return res.status(409).json({ error: 'Företaget finns redan', id: dup });
  const ins = run(`INSERT INTO companies (name, org_nr, website, domain, phone, email, address, city, industry, owner_id) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    b.name.trim(), b.org_nr ? formatOrgNr(b.org_nr) : null, b.website || null, domainFromUrl(b.website), b.phone || null, b.email || null,
    b.address || null, b.city || null, b.industry || null, can(req.user, 'leads.assign') && b.owner_id ? Number(b.owner_id) : req.user.id);
  audit(req.user.id, 'company.create', 'company', Number(ins.lastInsertRowid));
  res.status(201).json({ id: Number(ins.lastInsertRowid) });
});

r.patch('/companies/:id', (req, res) => {
  const c = loadCompany(req, res);
  if (!c) return;
  if (!canEditCompany(req.user, c)) return res.status(403).json({ error: 'Du kan inte redigera företaget' });
  const b = req.body || {};
  if (b.org_nr && !validOrgNr(b.org_nr)) return res.status(400).json({ error: 'Ogiltigt organisationsnummer' });
  if (b.org_nr && get("SELECT 1 FROM companies WHERE replace(org_nr,'-','') = ? AND id != ?", b.org_nr.replace(/\D/g, ''), c.id)) {
    return res.status(409).json({ error: 'Ett annat företag har redan det organisationsnumret – slå ihop dem i stället' });
  }
  const sets = [], params = [];
  for (const k of FIELDS) if (k in b) { sets.push(`${k} = ?`); params.push(k === 'org_nr' && b[k] ? formatOrgNr(b[k]) : (b[k] || null)); }
  if ('website' in b) { sets.push('domain = ?'); params.push(domainFromUrl(b.website)); }
  if ('owner_id' in b && can(req.user, 'leads.assign')) { sets.push('owner_id = ?'); params.push(b.owner_id || null); }
  if (!sets.length) return res.json(c);
  run(`UPDATE companies SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`, ...params, c.id);
  if ('name' in b && b.name) run('UPDATE leads SET company = ? WHERE company_id = ?', b.name.trim(), c.id);
  audit(req.user.id, 'company.update', 'company', c.id);
  broadcast('refresh', { entity: 'companies' });
  res.json({ ok: true });
});

r.put('/companies/:id/purchasing', (req, res) => {
  const c = loadCompany(req, res);
  if (!c) return;
  if (!canEditCompany(req.user, c)) return res.status(403).json({ error: 'Du kan inte redigera företaget' });
  res.json({ purchasing: savePurchasing(c, req.user, req.body || {}) });
});

r.delete('/companies/:id', requirePerm('leads.delete'), (req, res) => {
  const c = loadCompany(req, res);
  if (!c) return;
  // Kontakter och affärer finns kvar men kopplas loss från företaget.
  tx(() => {
    run('UPDATE leads SET company_id = NULL WHERE company_id = ?', c.id);
    run('UPDATE deals SET company_id = NULL WHERE company_id = ?', c.id);
    run('DELETE FROM companies WHERE id = ?', c.id);
  });
  audit(req.user.id, 'company.delete', 'company', c.id, { name: c.name });
  res.json({ ok: true });
});

// Slå ihop två företag som är samma (t.ex. "Nordlys AB" och "Nordlys Sverige AB").
r.post('/companies/:id/merge', requirePerm('leads.edit_all'), (req, res) => {
  const target = loadCompany(req, res);
  if (!target) return;
  const source = get('SELECT * FROM companies WHERE id = ?', Number(req.body?.from_id));
  if (!source || source.id === target.id) return res.status(400).json({ error: 'Välj ett annat företag att slå ihop med' });
  tx(() => {
    run('UPDATE leads SET company_id = ?, company = ? WHERE company_id = ?', target.id, target.name, source.id);
    run('UPDATE deals SET company_id = ? WHERE company_id = ?', target.id, source.id);
    run('UPDATE activities SET company_id = ? WHERE company_id = ?', target.id, source.id);
    for (const k of ['org_nr', 'website', 'domain', 'phone', 'email', 'address', 'city', 'industry']) {
      if (!target[k] && source[k]) run(`UPDATE companies SET ${k} = ? WHERE id = ?`, source[k], target.id);
    }
    run('DELETE FROM companies WHERE id = ?', source.id);
    run("INSERT INTO activities (company_id, user_id, type, content) VALUES (?, ?, 'system', ?)", target.id, req.user.id, `Sammanslaget med ${source.name}`);
  });
  audit(req.user.id, 'company.merge', 'company', target.id, { from: source.name });
  res.json({ ok: true });
});

r.post('/companies/:id/activities', (req, res) => {
  const c = loadCompany(req, res);
  if (!c) return;
  if (!canEditCompany(req.user, c)) return res.status(403).json({ error: 'Du kan inte redigera företaget' });
  const { type, content, due_at, outcome } = req.body || {};
  if (!['note', 'call', 'email', 'meeting', 'task'].includes(type) || !content?.trim()) return res.status(400).json({ error: 'Ogiltig aktivitet' });
  const ins = run('INSERT INTO activities (company_id, user_id, type, content, due_at, outcome) VALUES (?,?,?,?,?,?)', c.id, req.user.id, type, content.trim(), due_at || null,
    ['call', 'email'].includes(type) && ['answered', 'no_answer'].includes(outcome) ? outcome : null);
  res.status(201).json(get('SELECT * FROM activities WHERE id = ?', ins.lastInsertRowid));
});

// Fyller i bolagsform, adress och bransch från Bolagsverket (kräver nycklar under Prospektering → Datakällor).
r.post('/companies/:id/bolagsverket', async (req, res) => {
  const c = loadCompany(req, res);
  if (!c) return;
  const cfg = prospectingConfig();
  if (!hasBolagsverket(cfg)) return res.status(400).json({ error: 'Bolagsverket är inte uppsatt. En administratör lägger in nycklar under Prospektering → Datakällor.' });
  if (!c.org_nr) return res.status(400).json({ error: 'Ange organisationsnummer först' });
  try {
    const org = await lookupOrganisation(cfg, c.org_nr);
    if (!org) return res.status(404).json({ error: 'Organisationsnumret finns inte hos Bolagsverket' });
    run(`UPDATE companies SET address = coalesce(address, ?), city = coalesce(city, ?), industry = coalesce(?, industry), updated_at = datetime('now') WHERE id = ?`,
      org.address, org.city, org.sni?.map((s) => s.text).join(', ') || null, c.id);
    run("INSERT INTO activities (company_id, user_id, type, content) VALUES (?, ?, 'system', ?)", c.id, req.user.id,
      `Uppgifter hämtade från Bolagsverket: ${[org.form, org.registered && `registrerat ${org.registered}`, org.deregistered && 'AVREGISTRERAT'].filter(Boolean).join(', ')}`);
    res.json(org);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Lista för att välja företag (t.ex. när en kontakt ska kopplas).
r.get('/companies-lookup', (req, res) => {
  const vis = companyVisibilitySql(req.user);
  const t = `%${String(req.query.q || '').toLowerCase()}%`;
  res.json(all(`SELECT c.id, c.name, c.city, c.org_nr FROM companies c WHERE ${vis.sql} AND sv_lower(c.name) LIKE ? ORDER BY sv_lower(c.name) LIMIT 20`, ...vis.params, t));
});

export default r;
