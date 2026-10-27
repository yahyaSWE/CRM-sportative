import { Router } from 'express';
import { all, get, run, tx, audit } from '../db.js';
import { can } from '../security.js';
import { requirePerm } from '../middleware.js';
import { broadcast } from '../events.js';
import { linkLeadToCompany, companyVisibilitySql } from '../services/companies.js';
import {
  getLead, hydrateLead, canSeeLead, canEditLead, leadVisibilitySql, normalizeLeadData, notify, leadName,
  STATUSES, SOURCES, runAutomations, leadSearchSql, CUSTOMER_SQL, NEEDS_FOLLOWUP_SQL, LEAD_NEXT_COLUMNS, pickNextStep, getCadence, saveCadence,
} from '../services/leads.js';

const r = Router();
const EDITABLE = ['first_name', 'last_name', 'email', 'phone', 'company', 'title', 'city', 'status', 'score', 'message', 'source_detail'];
export const STAGES = ['qualified', 'contact', 'proposal', 'negotiation', 'won', 'lost'];

function loadVisibleLead(req, res) {
  const lead = getLead(Number(req.params.id));
  if (!lead || !canSeeLead(req.user, lead)) { res.status(404).json({ error: 'Lead hittades inte' }); return null; }
  return lead;
}

function checkOwnerChange(req, lead, ownerId) {
  if (ownerId === undefined || ownerId === lead?.owner_id) return null;
  if (can(req.user, 'leads.assign')) return null;
  // Utan tilldelningsrätt får man bara ta ett otilldelat lead själv.
  if (ownerId === req.user.id && (!lead || lead.owner_id == null)) return null;
  return 'Du har inte behörighet att tilldela leads till andra';
}

// ---------- Uppföljningsrytm ----------
r.get('/followup-cadence', (req, res) => res.json({ ...getCadence(), canEdit: can(req.user, 'automation.manage') }));
r.put('/followup-cadence', requirePerm('automation.manage'), (req, res) => {
  const { days, attempts, autoClose } = req.body || {};
  const c = saveCadence({ days, attempts, autoClose });
  audit(req.user.id, 'followup.cadence', 'settings', null, c);
  broadcast('refresh', { entity: 'leads' });
  res.json(c);
});

// ---------- Leads ----------
r.get('/leads', (req, res) => {
  const { q, status, source, owner, tag, view, sort = 'created_at', dir = 'desc' } = req.query;
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(200, Number(req.query.limit || 50));
  const vis = leadVisibilitySql(req.user);
  const where = [vis.sql];
  const params = [...vis.params];
  if (q) { const s = leadSearchSql(q); where.push(s.sql); params.push(...s.params); }
  // Snabbvyer: nya att ringa, kontakta igen, kunder och arkiv. Ej aktuella leads ligger i arkivet och visas
  // inte bland de andra – utom när man uttryckligen filtrerar på status Ej aktuell.
  if (view === 'new') where.push("l.status = 'new'");
  else if (view === 'followup') where.push(NEEDS_FOLLOWUP_SQL());
  else if (view === 'customers') where.push(CUSTOMER_SQL());
  if (view === 'archived') where.push("l.status = 'unqualified'");
  else if (status !== 'unqualified') where.push("l.status != 'unqualified'");
  if (status) { where.push('l.status = ?'); params.push(status); }
  if (source) { where.push('l.source = ?'); params.push(source); }
  if (owner === 'me') { where.push('l.owner_id = ?'); params.push(req.user.id); }
  else if (owner === 'none') where.push('l.owner_id IS NULL');
  else if (owner) { where.push('l.owner_id = ?'); params.push(Number(owner)); }
  if (tag) { where.push('EXISTS (SELECT 1 FROM json_each(l.tags) WHERE value = ?)'); params.push(tag); }
  const sortCol = {
    created_at: 'l.created_at', score: 'l.score', name: 'sv_lower(l.first_name)', company: 'sv_lower(l.company)', status: 'l.status',
    last_activity_at: 'l.last_activity_at', last_contact_at: 'coalesce(last_contact_at, l.created_at)',
  }[sort] || 'l.created_at';
  const sql = `FROM leads l LEFT JOIN users u ON u.id = l.owner_id WHERE ${where.join(' AND ')}`;
  const total = get(`SELECT count(*) AS n ${sql}`, ...params).n;
  // Antal per snabbvy (inom samma synlighet och sökning) för flikarna i gränssnittet.
  const base = { sql: [vis.sql, ...(q ? [leadSearchSql(q).sql] : [])].join(' AND '), params: [...vis.params, ...(q ? leadSearchSql(q).params : [])] };
  const counts = get(`SELECT sum(l.status != 'unqualified') AS total, sum(l.status = 'unqualified') AS archived, sum(l.status = 'new') AS new, sum(${NEEDS_FOLLOWUP_SQL()}) AS followup, sum(l.status != 'unqualified' AND ${CUSTOMER_SQL()}) AS customers
    FROM leads l WHERE ${base.sql}`, ...base.params);
  const rows = all(`SELECT l.*, u.name AS owner_name, u.color AS owner_color, ${LEAD_NEXT_COLUMNS()} ${sql}
    ORDER BY ${sortCol} ${dir === 'asc' ? 'ASC' : 'DESC'}, l.id DESC LIMIT ? OFFSET ?`, ...params, limit, (page - 1) * limit);
  res.json({ rows: rows.map((x) => hydrateLead(pickNextStep(x))), total, page, limit, counts });
});

r.get('/leads/export.csv', requirePerm('leads.export'), (req, res) => {
  const vis = leadVisibilitySql(req.user);
  const rows = all(`SELECT l.*, u.name AS owner_name FROM leads l LEFT JOIN users u ON u.id = l.owner_id WHERE ${vis.sql} ORDER BY l.id`, ...vis.params);
  const cols = ['id', 'first_name', 'last_name', 'email', 'phone', 'company', 'title', 'city', 'source', 'source_detail', 'status', 'score', 'owner_name', 'tags', 'created_at'];
  const esc = (v) => (v == null ? '' : /[",;\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const csv = '﻿' + [cols.join(';'), ...rows.map((row) => cols.map((c) => esc(row[c])).join(';'))].join('\n');
  audit(req.user.id, 'leads.export', 'lead', null, { count: rows.length });
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="leads.csv"' }).send(csv);
});

r.post('/leads', requirePerm('leads.edit_own'), (req, res) => {
  const b = req.body || {};
  const ownerId = b.owner_id === undefined ? req.user.id : b.owner_id;
  const err = checkOwnerChange(req, null, ownerId === req.user.id ? undefined : ownerId);
  if (err) return res.status(403).json({ error: err });
  const data = normalizeLeadData(b);
  if (!data.first_name && !data.email && !data.phone && !data.company) return res.status(400).json({ error: 'Ange minst namn, e-post, telefon eller företag' });
  const lead = { ...data, source: SOURCES.includes(b.source) ? b.source : 'manual', status: 'new', owner_id: ownerId, tags: Array.isArray(b.tags) ? b.tags : [], score: 20 };
  const { tasks } = b.runAutomations ? runAutomations(lead) : { tasks: [] };
  const id = tx(() => {
    const ins = run(`INSERT INTO leads (first_name, last_name, email, phone, company, title, city, source, source_detail, status, score, owner_id, tags, message, fields)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      lead.first_name ?? null, lead.last_name ?? null, lead.email ?? null, lead.phone ?? null, lead.company ?? null, lead.title ?? null,
      lead.city ?? null, lead.source, b.source_detail || null, lead.status, lead.score, lead.owner_id ?? null, JSON.stringify(lead.tags), lead.message ?? null, '{}');
    const newId = Number(ins.lastInsertRowid);
    // Kontakt som läggs till direkt på ett företag kopplas dit, annars hittas företaget automatiskt.
    const co = b.company_id && get('SELECT id, name FROM companies WHERE id = ?', Number(b.company_id));
    if (co) run('UPDATE leads SET company_id = ?, company = ? WHERE id = ?', co.id, co.name, newId);
    else linkLeadToCompany(newId);
    run("INSERT INTO activities (lead_id, user_id, type, content) VALUES (?, ?, 'system', ?)", newId, req.user.id, `Lead skapad av ${req.user.name}`);
    for (const t of tasks) run(`INSERT INTO activities (lead_id, user_id, type, content, due_at) VALUES (?, ?, 'task', ?, datetime('now', ?))`, newId, lead.owner_id, t.text, `+${t.hours} hours`);
    return newId;
  });
  audit(req.user.id, 'lead.create', 'lead', id);
  const full = getLead(id);
  broadcast('lead', { type: 'created', lead: full }, (u) => canSeeLead(u, full));
  if (full.owner_id && full.owner_id !== req.user.id) notify(full.owner_id, `${req.user.name} tilldelade dig ${leadName(full)}`, `/leads/${id}`);
  res.status(201).json(full);
});

r.post('/leads/import', requirePerm('leads.edit_own'), (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows.slice(0, 5000) : [];
  let created = 0, skipped = 0;
  tx(() => {
    for (const row of rows) {
      const d = normalizeLeadData(row);
      if (!d.first_name && !d.email && !d.phone) { skipped++; continue; }
      if (d.email && get('SELECT 1 FROM leads WHERE email = ?', d.email)) { skipped++; continue; }
      const ins = run(`INSERT INTO leads (first_name, last_name, email, phone, company, title, city, source, status, score, owner_id, message, fields)
        VALUES (?,?,?,?,?,?,?,'import','new',?,?,?,?)`, d.first_name ?? null, d.last_name ?? null, d.email ?? null, d.phone ?? null,
        d.company ?? null, d.title ?? null, d.city ?? null, 10, can(req.user, 'leads.assign') ? null : req.user.id, d.message ?? null, JSON.stringify(d.fields));
      linkLeadToCompany(Number(ins.lastInsertRowid));
      created++;
    }
  });
  audit(req.user.id, 'leads.import', 'lead', null, { created, skipped });
  broadcast('refresh', { entity: 'leads' });
  res.json({ created, skipped });
});

r.post('/leads/bulk', (req, res) => {
  const { ids = [], action, value } = req.body || {};
  const leads = ids.map((id) => getLead(Number(id))).filter((l) => l && canSeeLead(req.user, l));
  if (action === 'delete' && !can(req.user, 'leads.delete')) return res.status(403).json({ error: 'Du saknar behörighet att radera' });
  if (action === 'assign' && !can(req.user, 'leads.assign')) return res.status(403).json({ error: 'Du saknar behörighet att tilldela' });
  let n = 0;
  tx(() => {
    for (const l of leads) {
      if (action !== 'delete' && !canEditLead(req.user, l)) continue;
      if (action === 'delete') run('DELETE FROM leads WHERE id = ?', l.id);
      else if (action === 'assign') run("UPDATE leads SET owner_id = ?, updated_at = datetime('now') WHERE id = ?", value || null, l.id);
      else if (action === 'status' && STATUSES.includes(value)) run("UPDATE leads SET status = ?, updated_at = datetime('now') WHERE id = ?", value, l.id);
      else if (action === 'tag' && value) run("UPDATE leads SET tags = json_insert(tags, '$[#]', ?) WHERE id = ? AND NOT EXISTS (SELECT 1 FROM json_each(tags) WHERE value = ?)", value, l.id, value);
      else continue;
      n++;
    }
  });
  if (action === 'assign' && value && Number(value) !== req.user.id && n) notify(Number(value), `${req.user.name} tilldelade dig ${n} lead${n > 1 ? 's' : ''}`, '/leads?owner=me');
  audit(req.user.id, `leads.bulk_${action}`, 'lead', null, { count: n, value });
  broadcast('refresh', { entity: 'leads' });
  res.json({ updated: n });
});

r.get('/leads/:id', (req, res) => {
  const lead = loadVisibleLead(req, res);
  if (!lead) return;
  const activities = all(`SELECT a.*, u.name AS user_name, u.color AS user_color, dl.title AS deal_title FROM activities a
    LEFT JOIN users u ON u.id = a.user_id LEFT JOIN deals dl ON dl.id = a.deal_id
    WHERE a.lead_id = ? ORDER BY a.created_at DESC, a.id DESC`, lead.id);
  const deals = all(`SELECT d.*, u.name AS owner_name FROM deals d LEFT JOIN users u ON u.id = d.owner_id WHERE d.lead_id = ? ORDER BY d.id DESC`, lead.id);
  // Var i uppföljningsrytmen leadet är (bara kontaktade leads utan öppen uppgift eller bokat möte).
  const hasNextStep = get(`SELECT 1 FROM activities WHERE lead_id = ? AND type = 'task' AND done = 0
    UNION SELECT 1 FROM meetings WHERE lead_id = ? AND status = 'scheduled' AND end_at > datetime('now')`, lead.id, lead.id);
  const followup = lead.status === 'contacted' && !hasNextStep ? pickNextStep({ ...lead }).next_step : null;
  res.json({ ...lead, activities, deals, followup, canEdit: canEditLead(req.user, lead) });
});

r.patch('/leads/:id', (req, res) => {
  const lead = loadVisibleLead(req, res);
  if (!lead) return;
  if (!canEditLead(req.user, lead)) return res.status(403).json({ error: 'Du kan inte redigera detta lead' });
  const b = req.body || {};
  const err = checkOwnerChange(req, lead, b.owner_id);
  if (err) return res.status(403).json({ error: err });
  const sets = [], params = [], changes = [];
  for (const k of EDITABLE) if (k in b && b[k] !== lead[k]) {
    if (k === 'status' && !STATUSES.includes(b.status)) continue;
    sets.push(`${k} = ?`); params.push(b[k] === '' ? null : b[k]); changes.push(k);
  }
  if ('owner_id' in b && b.owner_id !== lead.owner_id) { sets.push('owner_id = ?'); params.push(b.owner_id || null); changes.push('owner_id'); }
  if (Array.isArray(b.tags)) { sets.push('tags = ?'); params.push(JSON.stringify(b.tags)); changes.push('tags'); }
  // Byte av företag: antingen ett valt företag (company_id) eller ett nytt namn som kopplas automatiskt.
  if ('company_id' in b && b.company_id !== lead.company_id) {
    const co = b.company_id ? get('SELECT id, name FROM companies WHERE id = ?', Number(b.company_id)) : null;
    sets.push('company_id = ?', 'company = ?'); params.push(co?.id ?? null, co?.name ?? null); changes.push('company_id');
  } else if (changes.includes('company')) { sets.push('company_id = NULL'); }
  if (!sets.length) return res.json(lead);
  run(`UPDATE leads SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`, ...params, lead.id);
  if (changes.includes('company') && !changes.includes('company_id')) linkLeadToCompany(lead.id);
  if (changes.includes('company_id') || changes.includes('company')) {
    run("UPDATE deals SET company_id = (SELECT company_id FROM leads WHERE id = ?) WHERE lead_id = ? AND stage NOT IN ('won','lost')", lead.id, lead.id);
  }
  const STATUS_SV = { new: 'Ny', contacted: 'Kontaktad', qualified: 'Kvalificerad', unqualified: 'Ej aktuell', converted: 'Konverterad' };
  if (changes.includes('status')) run("INSERT INTO activities (lead_id, user_id, type, content) VALUES (?, ?, 'system', ?)", lead.id, req.user.id, `Status ändrad till ${STATUS_SV[b.status]}`);
  if (changes.includes('owner_id')) {
    const owner = b.owner_id ? get('SELECT name FROM users WHERE id = ?', b.owner_id)?.name : null;
    run("INSERT INTO activities (lead_id, user_id, type, content) VALUES (?, ?, 'system', ?)", lead.id, req.user.id, owner ? `Tilldelad ${owner}` : 'Tilldelning borttagen');
    if (b.owner_id && b.owner_id !== req.user.id) notify(b.owner_id, `${req.user.name} tilldelade dig ${leadName(lead)}`, `/leads/${lead.id}`);
  }
  audit(req.user.id, 'lead.update', 'lead', lead.id, { changes });
  const full = getLead(lead.id);
  broadcast('lead', { type: 'updated', lead: full }, (u) => canSeeLead(u, full));
  res.json(full);
});

r.delete('/leads/:id', requirePerm('leads.delete'), (req, res) => {
  const lead = loadVisibleLead(req, res);
  if (!lead) return;
  run('DELETE FROM leads WHERE id = ?', lead.id);
  audit(req.user.id, 'lead.delete', 'lead', lead.id, { name: leadName(lead) });
  broadcast('refresh', { entity: 'leads' });
  res.json({ ok: true });
});

r.post('/leads/:id/activities', (req, res) => {
  const lead = loadVisibleLead(req, res);
  if (!lead) return;
  if (!canEditLead(req.user, lead)) return res.status(403).json({ error: 'Du kan inte redigera detta lead' });
  const { type, content, due_at } = req.body || {};
  if (!['note', 'call', 'email', 'meeting', 'task'].includes(type) || !content?.trim()) return res.status(400).json({ error: 'Ogiltig aktivitet' });
  const act = addActivity({ leadId: lead.id, userId: req.user.id, type, content: content.trim(), dueAt: due_at || null });
  if (['call', 'email', 'meeting'].includes(type) && lead.status === 'new') run("UPDATE leads SET status = 'contacted' WHERE id = ?", lead.id);
  res.status(201).json(act);
});

r.post('/leads/:id/convert', (req, res) => {
  const lead = loadVisibleLead(req, res);
  if (!lead) return;
  if (!canEditLead(req.user, lead)) return res.status(403).json({ error: 'Du kan inte redigera detta lead' });
  const { title, value = 0, expected_close, task } = req.body || {};
  const owner = lead.owner_id || req.user.id;
  const id = tx(() => {
    const ins = run("INSERT INTO deals (title, value, stage, lead_id, company_id, owner_id, expected_close, stage_changed_at) VALUES (?,?,?,?,?,?,?,datetime('now'))",
      title || `${lead.company || leadName(lead)} – affär`, Number(value) || 0, 'qualified', lead.id, lead.company_id ?? null, owner, expected_close || null);
    const dealId = Number(ins.lastInsertRowid);
    run("UPDATE leads SET status = 'converted', owner_id = coalesce(owner_id, ?), updated_at = datetime('now') WHERE id = ?", req.user.id, lead.id);
    addActivity({ leadId: lead.id, dealId, userId: req.user.id, type: 'system', content: `Konverterad till affär (${(Number(value) || 0).toLocaleString('sv-SE')} kr)` });
    // Första uppgiften gör att affären aldrig blir liggande utan nästa steg.
    if (task?.content?.trim()) addActivity({ leadId: lead.id, dealId, userId: owner, type: 'task', content: task.content.trim(), dueAt: task.due_at || null });
    return dealId;
  });
  audit(req.user.id, 'lead.convert', 'deal', id);
  broadcast('refresh', { entity: 'deals' });
  res.status(201).json(get('SELECT * FROM deals WHERE id = ?', id));
});

// ---------- Aktiviteter & uppgifter ----------
r.get('/tasks', (req, res) => {
  const scope = req.query.scope === 'all' && can(req.user, 'leads.view_all') ? 'all' : 'mine';
  const params = [];
  let where = "a.type = 'task'";
  if (scope === 'mine') { where += ' AND (a.user_id = ? OR (a.user_id IS NULL AND l.owner_id = ?))'; params.push(req.user.id, req.user.id); }
  if (req.query.done !== 'all') where += ` AND a.done = ${req.query.done === '1' ? 1 : 0}`;
  res.json(all(`SELECT a.*, u.name AS user_name, u.color AS user_color, l.first_name, l.last_name, l.company, l.email, dl.title AS deal_title
    FROM activities a LEFT JOIN users u ON u.id = a.user_id LEFT JOIN leads l ON l.id = a.lead_id LEFT JOIN deals dl ON dl.id = a.deal_id
    WHERE ${where} ORDER BY a.done, coalesce(a.due_at, '9999') ASC LIMIT 500`, ...params));
});

r.patch('/activities/:id', (req, res) => {
  const a = get('SELECT * FROM activities WHERE id = ?', req.params.id);
  const lead = a?.lead_id ? getLead(a.lead_id) : null;
  if (!a || (lead && !canSeeLead(req.user, lead))) return res.status(404).json({ error: 'Hittades inte' });
  if (lead && !canEditLead(req.user, lead) && a.user_id !== req.user.id) return res.status(403).json({ error: 'Saknar behörighet' });
  const { done, content, due_at } = req.body || {};
  run('UPDATE activities SET done = coalesce(?, done), content = coalesce(?, content), due_at = coalesce(?, due_at) WHERE id = ?',
    done == null ? null : done ? 1 : 0, content ?? null, due_at ?? null, a.id);
  res.json(get('SELECT * FROM activities WHERE id = ?', a.id));
});

r.delete('/activities/:id', (req, res) => {
  const a = get('SELECT * FROM activities WHERE id = ?', req.params.id);
  if (!a || a.type === 'system') return res.status(404).json({ error: 'Hittades inte' });
  if (a.user_id !== req.user.id && !can(req.user, 'leads.edit_all')) return res.status(403).json({ error: 'Saknar behörighet' });
  run('DELETE FROM activities WHERE id = ?', a.id);
  res.json({ ok: true });
});

// ---------- Affärer / pipeline ----------
const dealVisibility = (user) => (can(user, 'leads.view_all') ? { sql: '1=1', params: [] } : { sql: 'd.owner_id = ?', params: [user.id] });

export const LOST_REASONS = ['Pris', 'Valde en konkurrent', 'Ingen respons', 'Fel målgrupp', 'Fel tidpunkt', 'Annat'];
const STAGE_SV = { qualified: 'Kvalificerad', contact: 'Möte bokat', proposal: 'Offert skickad', negotiation: 'Förhandling', won: 'Vunnen', lost: 'Förlorad' };

// Aktiviteter som hör till affären: dess egna plus allt på det kopplade leadet (gemensam tidslinje).
const DEAL_ACTIVITY_SCOPE = `(a.deal_id = d.id OR (d.lead_id IS NOT NULL AND a.lead_id = d.lead_id))`;

const canSeeDeal = (user, d) => can(user, 'leads.view_all') || d.owner_id === user.id;
const canEditDeal = (user, d) => can(user, 'leads.edit_all') || (d.owner_id === user.id && can(user, 'leads.edit_own'));

function dealRows(where, params) {
  return all(`SELECT d.*, u.name AS owner_name, u.color AS owner_color,
      l.first_name, l.last_name, coalesce(co.name, l.company) AS company, l.source, l.email, l.phone,
      (SELECT json_object('id', a.id, 'content', a.content, 'due_at', a.due_at) FROM activities a
        WHERE a.type = 'task' AND a.done = 0 AND ${DEAL_ACTIVITY_SCOPE} ORDER BY coalesce(a.due_at, '9999') LIMIT 1) AS next_task,
      (SELECT max(a.created_at) FROM activities a WHERE a.type NOT IN ('system', 'task') AND ${DEAL_ACTIVITY_SCOPE}) AS last_contact_at
    FROM deals d LEFT JOIN users u ON u.id = d.owner_id LEFT JOIN leads l ON l.id = d.lead_id LEFT JOIN companies co ON co.id = d.company_id
    WHERE ${where} ORDER BY d.position, d.updated_at DESC`, ...params)
    .map((d) => ({ ...d, next_task: d.next_task ? JSON.parse(d.next_task) : null }));
}

function addActivity({ leadId = null, dealId = null, userId, type, content, dueAt = null }) {
  const ins = run('INSERT INTO activities (lead_id, deal_id, user_id, type, content, due_at) VALUES (?,?,?,?,?,?)', leadId, dealId, userId, type, content, dueAt);
  if (leadId) run("UPDATE leads SET last_activity_at = datetime('now') WHERE id = ?", leadId);
  return get(`SELECT a.*, u.name AS user_name, u.color AS user_color, dl.title AS deal_title FROM activities a
    LEFT JOIN users u ON u.id = a.user_id LEFT JOIN deals dl ON dl.id = a.deal_id WHERE a.id = ?`, ins.lastInsertRowid);
}

r.get('/deals', (req, res) => {
  const vis = dealVisibility(req.user);
  res.json(dealRows(vis.sql, vis.params));
});

r.get('/deals/:id', (req, res) => {
  const deal = dealRows('d.id = ?', [Number(req.params.id)])[0];
  if (!deal || !canSeeDeal(req.user, deal)) return res.status(404).json({ error: 'Affären hittades inte' });
  const lead = deal.lead_id ? getLead(deal.lead_id) : null;
  const activities = all(`SELECT a.*, u.name AS user_name, u.color AS user_color, dl.title AS deal_title FROM deals d
    JOIN activities a ON ${DEAL_ACTIVITY_SCOPE} LEFT JOIN users u ON u.id = a.user_id LEFT JOIN deals dl ON dl.id = a.deal_id
    WHERE d.id = ? ORDER BY a.created_at DESC, a.id DESC`, deal.id);
  const otherDeals = deal.lead_id ? all('SELECT id, title, value, stage FROM deals WHERE lead_id = ? AND id != ? ORDER BY id DESC', deal.lead_id, deal.id) : [];
  const company = deal.company_id ? get('SELECT id, name, org_nr, city, website, phone, address FROM companies WHERE id = ?', deal.company_id) : null;
  const contacts = company ? all('SELECT id, first_name, last_name, email, phone, title FROM leads WHERE company_id = ? ORDER BY last_activity_at DESC', company.id) : [];
  res.json({ ...deal, lead, company, contacts, activities, otherDeals, canEdit: canEditDeal(req.user, deal), lostReasons: LOST_REASONS });
});

r.post('/deals/:id/activities', (req, res) => {
  const d = get('SELECT * FROM deals WHERE id = ?', req.params.id);
  if (!d || !canSeeDeal(req.user, d)) return res.status(404).json({ error: 'Affären hittades inte' });
  if (!canEditDeal(req.user, d)) return res.status(403).json({ error: 'Du kan inte redigera denna affär' });
  const { type, content, due_at } = req.body || {};
  if (!['note', 'call', 'email', 'meeting', 'task'].includes(type) || !content?.trim()) return res.status(400).json({ error: 'Ogiltig aktivitet' });
  const act = addActivity({ leadId: d.lead_id, dealId: d.id, userId: req.user.id, type, content: content.trim(), dueAt: due_at || null });
  broadcast('refresh', { entity: 'deals' });
  res.status(201).json(act);
});

r.post('/deals', requirePerm('leads.edit_own'), (req, res) => {
  const { title, value = 0, stage = 'qualified', lead_id, company_id, expected_close, owner_id } = req.body || {};
  // En affär hör till företaget; skapas den från en kontakt ärvs kontaktens företag.
  const companyId = company_id || (lead_id ? get('SELECT company_id FROM leads WHERE id = ?', lead_id)?.company_id : null) || null;
  if (!title?.trim()) return res.status(400).json({ error: 'Titel krävs' });
  const owner = can(req.user, 'leads.assign') && owner_id ? owner_id : req.user.id;
  const ins = run("INSERT INTO deals (title, value, stage, lead_id, company_id, owner_id, expected_close, stage_changed_at) VALUES (?,?,?,?,?,?,?,datetime('now'))",
    title.trim(), Number(value) || 0, STAGES.includes(stage) ? stage : 'qualified', lead_id || null, companyId, owner, expected_close || null);
  audit(req.user.id, 'deal.create', 'deal', Number(ins.lastInsertRowid));
  broadcast('refresh', { entity: 'deals' });
  res.status(201).json(get('SELECT * FROM deals WHERE id = ?', ins.lastInsertRowid));
});

r.patch('/deals/:id', (req, res) => {
  const d = get('SELECT * FROM deals WHERE id = ?', req.params.id);
  if (!d) return res.status(404).json({ error: 'Hittades inte' });
  if (!canEditDeal(req.user, d)) return res.status(403).json({ error: 'Saknar behörighet' });
  const b = req.body || {};
  if (b.owner_id !== undefined && b.owner_id !== d.owner_id && !can(req.user, 'leads.assign')) return res.status(403).json({ error: 'Saknar behörighet att tilldela' });
  const stage = STAGES.includes(b.stage) ? b.stage : d.stage;
  const stageChanged = stage !== d.stage;
  if (stage === 'lost' && stageChanged && !b.lost_reason) return res.status(400).json({ error: 'Ange varför affären förlorades' });
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const closed = ['won', 'lost'].includes(stage) ? (stageChanged ? now : d.closed_at) : null;
  const lostReason = stage === 'lost' ? (b.lost_reason ?? d.lost_reason) : null;
  tx(() => {
    run(`UPDATE deals SET title = ?, value = ?, stage = ?, expected_close = ?, owner_id = ?, position = ?, closed_at = ?, lost_reason = ?,
        stage_changed_at = ?, updated_at = datetime('now') WHERE id = ?`,
      b.title ?? d.title, b.value != null ? Number(b.value) : d.value, stage, b.expected_close !== undefined ? b.expected_close || null : d.expected_close,
      b.owner_id !== undefined ? b.owner_id : d.owner_id, b.position ?? d.position, closed, lostReason, stageChanged ? now : d.stage_changed_at, d.id);
    if (stageChanged) {
      const extra = stage === 'lost' ? ` – anledning: ${lostReason}${b.lost_note ? ` (${b.lost_note})` : ''}` : '';
      addActivity({ leadId: d.lead_id, dealId: d.id, userId: req.user.id, type: 'system', content: `Affären "${d.title}" flyttad till ${STAGE_SV[stage]}${extra}` });
      // En vunnen affär gör kontakten till kund.
      if (stage === 'won' && d.lead_id) {
        run(`UPDATE leads SET status = 'converted', tags = CASE WHEN EXISTS (SELECT 1 FROM json_each(tags) WHERE value = 'Kund') THEN tags
          ELSE json_insert(tags, '$[#]', 'Kund') END, updated_at = datetime('now') WHERE id = ?`, d.lead_id);
      }
    }
  });
  audit(req.user.id, 'deal.update', 'deal', d.id, { stage, lostReason });
  broadcast('refresh', { entity: 'deals' });
  if (stageChanged && d.lead_id) { const lead = getLead(d.lead_id); broadcast('lead', { type: 'updated', lead }, (u) => canSeeLead(u, lead)); }
  res.json(dealRows('d.id = ?', [d.id])[0]);
});

r.delete('/deals/:id', requirePerm('leads.delete'), (req, res) => {
  // Historik som också hör till ett lead ska finnas kvar där, så den kopplas loss i stället för att raderas.
  tx(() => {
    run('UPDATE activities SET deal_id = NULL WHERE deal_id = ? AND lead_id IS NOT NULL', req.params.id);
    run('DELETE FROM deals WHERE id = ?', req.params.id);
  });
  audit(req.user.id, 'deal.delete', 'deal', Number(req.params.id));
  broadcast('refresh', { entity: 'deals' });
  res.json({ ok: true });
});

// ---------- Översikt ----------
r.get('/dashboard', (req, res) => {
  const days = Math.min(365, Math.max(7, Number(req.query.days || 30)));
  const team = can(req.user, 'reports.view');
  const vis = team ? { sql: '1=1', params: [] } : { sql: 'l.owner_id = ?', params: [req.user.id] };
  const dvis = team ? { sql: '1=1', params: [] } : { sql: 'd.owner_id = ?', params: [req.user.id] };
  const since = `-${days} days`;
  const count = (extra, ...p) => get(`SELECT count(*) AS n FROM leads l WHERE ${vis.sql} AND ${extra}`, ...vis.params, ...p).n;

  const newLeads = count("l.created_at >= datetime('now', ?)", since);
  const prevLeads = count("l.created_at >= datetime('now', ?) AND l.created_at < datetime('now', ?)", `-${days * 2} days`, since);
  const today = count("date(l.created_at) = date('now')");
  const converted = count("l.status = 'converted' AND l.created_at >= datetime('now', ?)", since);
  const unassigned = get('SELECT count(*) AS n FROM leads WHERE owner_id IS NULL AND status = \'new\'').n;
  const pipeline = get(`SELECT coalesce(sum(value),0) AS v, count(*) AS n FROM deals d WHERE ${dvis.sql} AND stage NOT IN ('won','lost')`, ...dvis.params);
  const won = get(`SELECT coalesce(sum(value),0) AS v, count(*) AS n FROM deals d WHERE ${dvis.sql} AND stage = 'won' AND closed_at >= datetime('now', ?)`, ...dvis.params, since);
  const lost = get(`SELECT count(*) AS n FROM deals d WHERE ${dvis.sql} AND stage = 'lost' AND closed_at >= datetime('now', ?)`, ...dvis.params, since).n;

  const perDay = all(`SELECT date(l.created_at) AS day, l.source, count(*) AS n FROM leads l
    WHERE ${vis.sql} AND l.created_at >= datetime('now', ?) GROUP BY day, l.source ORDER BY day`, ...vis.params, since);
  const bySource = all(`SELECT l.source, count(*) AS n, sum(l.status = 'converted') AS converted FROM leads l
    WHERE ${vis.sql} AND l.created_at >= datetime('now', ?) GROUP BY l.source ORDER BY n DESC`, ...vis.params, since);
  const byStatus = all(`SELECT l.status, count(*) AS n FROM leads l WHERE ${vis.sql} GROUP BY l.status`, ...vis.params);
  const stages = all(`SELECT stage, count(*) AS n, coalesce(sum(value),0) AS v FROM deals d WHERE ${dvis.sql} GROUP BY stage`, ...dvis.params);
  const lostReasons = all(`SELECT coalesce(d.lost_reason, 'Ej angiven') AS reason, coalesce(l.source, 'manual') AS source, count(*) AS n, sum(d.value) AS v
    FROM deals d LEFT JOIN leads l ON l.id = d.lead_id WHERE ${dvis.sql} AND d.stage = 'lost' AND d.closed_at >= datetime('now', ?)
    GROUP BY reason, source`, ...dvis.params, since);
  const leaderboard = team ? all(`SELECT u.id, u.name, u.color,
      (SELECT count(*) FROM leads WHERE owner_id = u.id AND created_at >= datetime('now', ?)) AS leads,
      (SELECT count(*) FROM deals WHERE owner_id = u.id AND stage = 'won' AND closed_at >= datetime('now', ?)) AS won,
      (SELECT coalesce(sum(value),0) FROM deals WHERE owner_id = u.id AND stage = 'won' AND closed_at >= datetime('now', ?)) AS revenue
    FROM users u WHERE u.active = 1 ORDER BY revenue DESC, leads DESC LIMIT 8`, since, since, since) : [];
  const lv = leadVisibilitySql(req.user);
  const recent = all(`SELECT l.*, u.name AS owner_name, u.color AS owner_color FROM leads l LEFT JOIN users u ON u.id = l.owner_id
    WHERE ${lv.sql} ORDER BY l.created_at DESC LIMIT 8`, ...lv.params).map(hydrateLead);
  const tasks = all(`SELECT a.*, l.first_name, l.last_name, l.company FROM activities a LEFT JOIN leads l ON l.id = a.lead_id
    WHERE a.type = 'task' AND a.done = 0 AND (a.user_id = ? OR (a.user_id IS NULL AND l.owner_id = ?))
    ORDER BY coalesce(a.due_at, '9999') LIMIT 6`, req.user.id, req.user.id);
  const responseTime = get(`SELECT avg((julianday(a.created_at) - julianday(l.created_at)) * 24) AS h FROM leads l
    JOIN activities a ON a.id = (SELECT id FROM activities WHERE lead_id = l.id AND type IN ('call','email','meeting','note') ORDER BY created_at LIMIT 1)
    WHERE ${vis.sql} AND l.created_at >= datetime('now', ?)`, ...vis.params, since).h;

  res.json({
    team, days,
    kpi: {
      newLeads, prevLeads, today, unassigned,
      conversionRate: newLeads ? converted / newLeads : 0,
      pipelineValue: pipeline.v, openDeals: pipeline.n,
      wonValue: won.v, wonCount: won.n, winRate: won.n + lost ? won.n / (won.n + lost) : 0,
      responseHours: responseTime,
    },
    perDay, bySource, byStatus, stages, leaderboard, recent, tasks, lostReasons,
  });
});

// Global sökning: kunder, leads och affärer (affärer hittas även via kontaktperson, företag, telefon och ansvarig).
r.get('/search', (req, res) => {
  const q = String(req.query.q || '').trim();
  const limit = req.query.all ? 100 : 6;
  if (q.length < 2) return res.json({ companies: [], leads: [], deals: [], counts: { companies: 0, leads: 0, deals: 0 } });
  const vis = leadVisibilitySql(req.user);
  const s = leadSearchSql(q);
  const leadCols = `l.id, l.first_name, l.last_name, l.email, l.phone, l.company, l.city, l.source, l.status, l.tags, u.name AS owner_name, u.color AS owner_color`;
  const leadFrom = `FROM leads l LEFT JOIN users u ON u.id = l.owner_id WHERE ${vis.sql} AND ${s.sql}`;
  const find = (extra) => ({
    rows: all(`SELECT ${leadCols} ${leadFrom} AND ${extra} ORDER BY l.last_activity_at DESC LIMIT ?`, ...vis.params, ...s.params, limit).map(hydrateLead),
    n: get(`SELECT count(*) AS n ${leadFrom} AND ${extra}`, ...vis.params, ...s.params).n,
  });
  const leads = find('1=1');
  // Företag: namn, org.nr, ort, bransch, domän eller växelnummer.
  const cv = companyVisibilitySql(req.user);
  const t = `%${q.toLowerCase()}%`;
  const digits = q.replace(/\D/g, '');
  const coWhere = `${cv.sql} AND (sv_lower(c.name) LIKE ? OR sv_lower(c.city) LIKE ? OR sv_lower(c.industry) LIKE ? OR sv_lower(c.domain) LIKE ?${digits.length >= 4 ? " OR replace(c.org_nr, '-', '') LIKE ? OR replace(replace(c.phone, ' ', ''), '-', '') LIKE ?" : ''})`;
  const coParams = [...cv.params, t, t, t, t, ...(digits.length >= 4 ? [`%${digits}%`, `%${digits}%`] : [])];
  const companies = {
    rows: all(`SELECT c.id, c.name, c.org_nr, c.city, (SELECT count(*) FROM leads WHERE company_id = c.id) AS contact_count,
        EXISTS (SELECT 1 FROM deals WHERE company_id = c.id AND stage = 'won') AS is_customer FROM companies c WHERE ${coWhere} ORDER BY is_customer DESC, sv_lower(c.name) LIMIT ?`, ...coParams, limit),
    n: get(`SELECT count(*) AS n FROM companies c WHERE ${coWhere}`, ...coParams).n,
  };
  const dv = dealVisibility(req.user);
  const ds = leadSearchSql(q, 'l');
  const dealWhere = `${dv.sql} AND (sv_lower(d.title) LIKE ? OR sv_lower(u.name) LIKE ? OR (d.lead_id IS NOT NULL AND ${ds.sql}))`;
  const dParams = [...dv.params, `%${q.toLowerCase()}%`, `%${q.toLowerCase()}%`, ...ds.params];
  const dealFrom = `FROM deals d LEFT JOIN leads l ON l.id = d.lead_id LEFT JOIN users u ON u.id = d.owner_id WHERE ${dealWhere}`;
  const deals = all(`SELECT d.id, d.title, d.value, d.stage, d.lead_id, l.first_name, l.last_name, l.company, u.name AS owner_name ${dealFrom}
    ORDER BY (d.stage IN ('won','lost')), d.updated_at DESC LIMIT ?`, ...dParams, limit);
  res.json({
    companies: companies.rows, leads: leads.rows, deals,
    counts: { companies: companies.n, leads: leads.n, deals: get(`SELECT count(*) AS n ${dealFrom}`, ...dParams).n },
  });
});

// Min dag: allt säljaren behöver agera på idag, samlat. `from`/`to` = dagens gränser i användarens tidszon (UTC).
r.get('/today', (req, res) => {
  const uid = req.user.id;
  const from = req.query.from || new Date(new Date().setHours(0, 0, 0, 0)).toISOString().slice(0, 19).replace('T', ' ');
  const to = req.query.to || new Date(new Date().setHours(24, 0, 0, 0)).toISOString().slice(0, 19).replace('T', ' ');
  const meetings = all(`SELECT m.*, l.first_name, l.last_name, l.company, l.phone AS lead_phone, d.title AS deal_title FROM meetings m
    LEFT JOIN leads l ON l.id = m.lead_id LEFT JOIN deals d ON d.id = m.deal_id
    WHERE m.owner_id = ? AND m.status != 'cancelled' AND m.start_at < ? AND m.end_at > ? ORDER BY m.start_at`, uid, to, from)
    .map((m) => ({ ...m, attendees: JSON.parse(m.attendees || '[]') }));
  const outcomes = all(`SELECT m.id, m.title, m.start_at, m.end_at, l.first_name, l.last_name, l.company FROM meetings m LEFT JOIN leads l ON l.id = m.lead_id
    WHERE m.owner_id = ? AND m.status = 'scheduled' AND m.end_at <= datetime('now') AND m.end_at < ? AND (m.lead_id IS NOT NULL OR m.deal_id IS NOT NULL)
    ORDER BY m.start_at DESC LIMIT 10`, uid, from);
  const tasks = all(`SELECT a.*, l.first_name, l.last_name, l.company, l.phone, dl.title AS deal_title FROM activities a
    LEFT JOIN leads l ON l.id = a.lead_id LEFT JOIN deals dl ON dl.id = a.deal_id
    WHERE a.type = 'task' AND a.done = 0 AND (a.user_id = ? OR (a.user_id IS NULL AND l.owner_id = ?)) AND (a.due_at IS NULL OR a.due_at < ?)
    ORDER BY a.due_at IS NULL, a.due_at LIMIT 30`, uid, uid, to);
  const newLeads = all(`SELECT l.*, u.name AS owner_name FROM leads l LEFT JOIN users u ON u.id = l.owner_id
    WHERE l.status = 'new' AND (l.owner_id = ? OR l.owner_id IS NULL) ORDER BY l.owner_id IS NULL, l.score DESC, l.created_at DESC LIMIT 12`, uid).map(hydrateLead);
  const stuckDeals = dealRows(`d.owner_id = ? AND d.stage NOT IN ('won','lost')`, [uid])
    .filter((d) => !d.next_task || (d.next_task.due_at && d.next_task.due_at < from))
    .filter((d) => !get("SELECT 1 FROM meetings WHERE deal_id = ? AND status = 'scheduled' AND end_at > datetime('now')", d.id));
  const followups = all(`SELECT l.*, ${LEAD_NEXT_COLUMNS()} FROM leads l WHERE l.owner_id = ? AND ${NEEDS_FOLLOWUP_SQL()}
    AND NOT EXISTS (SELECT 1 FROM deals fd WHERE fd.lead_id = l.id AND fd.stage NOT IN ('won','lost'))
    ORDER BY coalesce(last_contact_at, l.created_at) LIMIT 12`, uid).map((x) => hydrateLead(pickNextStep(x)));
  res.json({ meetings, outcomes, tasks, newLeads, stuckDeals, followups });
});

export default r;
