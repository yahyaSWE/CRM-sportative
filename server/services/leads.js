import { all, get, run, tx, parseJSON, audit } from '../db.js';
import { broadcast } from '../events.js';
import { can } from '../security.js';

export const SOURCES = ['email', 'facebook', 'instagram', 'webform', 'prospecting', 'manual', 'import'];
export const STATUSES = ['new', 'contacted', 'qualified', 'unqualified', 'converted'];

// ---------- Synlighet ----------
export const canSeeLead = (user, lead) =>
  can(user, 'leads.view_all') || lead.owner_id == null || lead.owner_id === user.id;

export const canEditLead = (user, lead) =>
  can(user, 'leads.edit_all') || (can(user, 'leads.edit_own') && (lead.owner_id == null || lead.owner_id === user.id));

export function leadVisibilitySql(user, alias = 'l') {
  if (can(user, 'leads.view_all')) return { sql: '1=1', params: [] };
  return { sql: `(${alias}.owner_id IS NULL OR ${alias}.owner_id = ?)`, params: [user.id] };
}

export function hydrateLead(l) {
  if (!l) return l;
  return { ...l, tags: parseJSON(l.tags, []), fields: parseJSON(l.fields, {}) };
}

export function getLead(id) {
  return hydrateLead(get(`SELECT l.*, u.name AS owner_name, u.color AS owner_color
    FROM leads l LEFT JOIN users u ON u.id = l.owner_id WHERE l.id = ?`, id));
}

// ---------- Normalisering av inkommande data ----------
const KEYMAP = {
  full_name: ['fullname', 'name', 'namn', 'fullstandigtnamn', 'fullständigtnamn', 'contactname', 'kontaktperson'],
  first_name: ['firstname', 'fornamn', 'förnamn', 'givenname'],
  last_name: ['lastname', 'efternamn', 'surname', 'familyname'],
  email: ['email', 'epost', 'emailaddress', 'mail', 'epostadress', 'workemail'],
  phone: ['phone', 'phonenumber', 'telefon', 'telefonnummer', 'tel', 'mobil', 'mobile', 'mobilnummer', 'workphonenumber'],
  company: ['company', 'companyname', 'foretag', 'företag', 'organisation', 'organization', 'foretagsnamn', 'företagsnamn'],
  title: ['jobtitle', 'title', 'titel', 'roll', 'befattning'],
  city: ['city', 'stad', 'ort'],
  message: ['message', 'meddelande', 'comments', 'comment', 'kommentar', 'description', 'beskrivning', 'fritext', 'question'],
};
const KEYLOOKUP = Object.fromEntries(Object.entries(KEYMAP).flatMap(([k, list]) => list.map((a) => [a, k])));
const normKey = (k) => String(k).toLowerCase().replace(/[^a-z0-9åäö]/g, '');

export function normalizeLeadData(raw = {}) {
  const out = { fields: {} };
  for (const [key, value] of Object.entries(raw)) {
    if (value == null || value === '') continue;
    const v = Array.isArray(value) ? value.join(', ') : String(value).trim();
    const target = KEYLOOKUP[normKey(key)];
    if (target && !out[target]) out[target] = v;
    else if (!target) out.fields[key] = v;
  }
  if (out.full_name && !out.first_name) {
    const parts = out.full_name.split(/\s+/);
    out.first_name = parts.shift();
    if (!out.last_name) out.last_name = parts.join(' ') || null;
  }
  delete out.full_name;
  if (out.email) out.email = out.email.toLowerCase();
  if (out.phone) out.phone = out.phone.replace(/[^\d+]/g, '').replace(/^00/, '+');
  return out;
}

function baseScore(lead, source) {
  let s = 0;
  if (lead.email) s += 15;
  if (lead.phone) s += 15;
  if (lead.company) s += 10;
  if (lead.title) s += 5;
  if (lead.message) s += 5;
  // Kalla leads från prospektering har inte själva hört av sig och får därför ingen kanalbonus.
  s += { webform: 15, email: 10, facebook: 10, instagram: 10, manual: 5, import: 0, prospecting: -10 }[source] ?? 0;
  return Math.max(0, Math.min(100, s));
}

const phoneTail = (p) => (p ? p.replace(/\D/g, '').slice(-9) : null);

function findDuplicate(data, source, externalId) {
  if (externalId) {
    const byExt = get('SELECT * FROM leads WHERE source = ? AND external_id = ?', source, externalId);
    if (byExt) return { lead: byExt, exact: true };
  }
  if (data.email) {
    const byEmail = get('SELECT * FROM leads WHERE email = ? ORDER BY id LIMIT 1', data.email);
    if (byEmail) return { lead: byEmail, exact: false };
  }
  const tail = phoneTail(data.phone);
  if (tail && tail.length >= 7) {
    const byPhone = get(`SELECT * FROM leads WHERE phone IS NOT NULL AND substr(replace(replace(phone,'+',''),' ',''), -9) = ? LIMIT 1`, tail);
    if (byPhone) return { lead: byPhone, exact: false };
  }
  return null;
}

// ---------- Automatiseringsregler ----------
function fieldValue(lead, field) {
  if (field in lead) return lead[field];
  return lead.fields?.[field];
}

export function matchCondition(lead, c) {
  const raw = c.field === 'tags' ? (lead.tags || []).join(',') : fieldValue(lead, c.field);
  const v = raw == null ? '' : String(raw).toLowerCase();
  const target = String(c.value ?? '').toLowerCase();
  switch (c.op) {
    case 'equals': return v === target;
    case 'not_equals': return v !== target;
    case 'contains': return v.includes(target);
    case 'not_contains': return !v.includes(target);
    case 'gt': return Number(raw) > Number(c.value);
    case 'lt': return Number(raw) < Number(c.value);
    case 'is_empty': return v === '';
    case 'is_not_empty': return v !== '';
    default: return false;
  }
}

function nextRoundRobin(ruleId, userIds) {
  const active = userIds.filter((id) => get('SELECT 1 FROM users WHERE id = ? AND active = 1', id));
  if (!active.length) return null;
  const key = `rr:${ruleId}`;
  const last = Number(get('SELECT value FROM settings WHERE key = ?', key)?.value ?? -1);
  const idx = (last + 1) % active.length;
  run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, String(idx));
  return active[idx];
}

export function runAutomations(lead) {
  const rules = all('SELECT * FROM automation_rules WHERE enabled = 1 ORDER BY position, id');
  const applied = [];
  const tasks = [];
  for (const rule of rules) {
    const conditions = parseJSON(rule.conditions, []);
    const ok = conditions.length === 0 ||
      (rule.match === 'any' ? conditions.some((c) => matchCondition(lead, c)) : conditions.every((c) => matchCondition(lead, c)));
    if (!ok) continue;
    for (const a of parseJSON(rule.actions, [])) {
      if (a.type === 'assign_user' && a.value) lead.owner_id = Number(a.value);
      else if (a.type === 'round_robin' && a.users?.length) lead.owner_id = nextRoundRobin(rule.id, a.users.map(Number)) ?? lead.owner_id;
      else if (a.type === 'add_tag' && a.value && !lead.tags.includes(a.value)) lead.tags.push(a.value);
      else if (a.type === 'set_status' && STATUSES.includes(a.value)) lead.status = a.value;
      else if (a.type === 'add_score') lead.score = Math.max(0, Math.min(100, lead.score + Number(a.value || 0)));
      else if (a.type === 'create_task' && a.value) tasks.push({ text: a.value, hours: Number(a.hours || 24) });
    }
    run('UPDATE automation_rules SET runs = runs + 1 WHERE id = ?', rule.id);
    applied.push(rule.name);
  }
  return { applied, tasks };
}

export function notify(userId, text, link) {
  if (!userId) return;
  run('INSERT INTO notifications (user_id, text, link) VALUES (?,?,?)', userId, text, link ?? null);
  broadcast('notification', { text, link }, (u) => u.id === userId);
}

export const leadName = (l) => [l.first_name, l.last_name].filter(Boolean).join(' ') || l.company || l.email || l.phone || 'Okänd';

const SOURCE_LABEL = { email: 'e-post', facebook: 'Facebook', instagram: 'Instagram', webform: 'webbformulär', prospecting: 'prospektering', manual: 'manuellt', import: 'import' };

/**
 * Central pipeline för alla inkommande leads (e-post, Facebook, Instagram, webbformulär).
 * Normaliserar → dubblettkontroll → poängsättning → automatiseringar → notiser.
 */
export function ingestLead({ source, sourceDetail = null, externalId = null, raw = {}, integrationId = null, note = null, payload = null }) {
  const data = normalizeLeadData(raw);
  const summarySrc = SOURCE_LABEL[source] || source;

  const result = tx(() => {
    const dup = findDuplicate(data, source, externalId);
    if (dup?.exact) {
      return { result: 'duplicate', lead: dup.lead, summary: `Redan importerad (${leadName(dup.lead)})` };
    }
    if (dup) {
      // Befintlig kontakt hör av sig igen: logga som aktivitet och höj poängen.
      const l = dup.lead;
      const patch = {};
      for (const k of ['first_name', 'last_name', 'phone', 'company', 'title', 'city']) if (!l[k] && data[k]) patch[k] = data[k];
      const sets = Object.keys(patch).map((k) => `${k} = ?`);
      run(`UPDATE leads SET ${[...sets, 'score = min(100, score + 10)', "last_activity_at = datetime('now')", "updated_at = datetime('now')"].join(', ')} WHERE id = ?`,
        ...Object.values(patch), l.id);
      run('INSERT INTO activities (lead_id, type, content) VALUES (?, ?, ?)', l.id, 'system',
        `Ny förfrågan via ${summarySrc}${sourceDetail ? ` (${sourceDetail})` : ''}${data.message || note ? `:\n${data.message || note}` : ''}`);
      return { result: 'merged', lead: l, summary: `Sammanslagen med befintlig kontakt ${leadName(l)}` };
    }

    const lead = {
      ...data, source, source_detail: sourceDetail, external_id: externalId,
      status: 'new', owner_id: null, tags: [], score: baseScore(data, source),
    };
    const { applied, tasks } = runAutomations(lead);
    const r = run(`INSERT INTO leads (first_name, last_name, email, phone, company, title, city, source, source_detail, external_id,
        status, score, owner_id, tags, message, fields) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      lead.first_name ?? null, lead.last_name ?? null, lead.email ?? null, lead.phone ?? null, lead.company ?? null,
      lead.title ?? null, lead.city ?? null, source, sourceDetail, externalId, lead.status, lead.score, lead.owner_id,
      JSON.stringify(lead.tags), lead.message ?? note ?? null, JSON.stringify(lead.fields));
    const id = Number(r.lastInsertRowid);
    run('INSERT INTO activities (lead_id, type, content) VALUES (?, ?, ?)', id, 'system',
      `Lead skapad automatiskt via ${summarySrc}${sourceDetail ? ` (${sourceDetail})` : ''}${applied.length ? `. Regler: ${applied.join(', ')}` : ''}`);
    for (const t of tasks) {
      run(`INSERT INTO activities (lead_id, user_id, type, content, due_at) VALUES (?, ?, 'task', ?, datetime('now', ?))`,
        id, lead.owner_id, t.text, `+${t.hours} hours`);
    }
    if (integrationId) run('UPDATE integrations SET leads_count = leads_count + 1 WHERE id = ?', integrationId);
    return { result: 'created', lead: { ...lead, id }, summary: `Ny lead: ${leadName(lead)}` };
  });

  run('INSERT INTO ingest_log (integration_id, source, result, lead_id, summary, payload) VALUES (?,?,?,?,?,?)',
    integrationId, source, result.result, result.lead?.id ?? null, result.summary,
    payload ? JSON.stringify(payload).slice(0, 20000) : JSON.stringify(raw).slice(0, 20000));

  if (result.result !== 'duplicate') {
    const lead = getLead(result.lead.id);
    broadcast('lead', { type: result.result, lead }, (u) => canSeeLead(u, lead));
    if (result.result === 'created') {
      if (lead.owner_id) notify(lead.owner_id, `Ny lead tilldelad dig: ${leadName(lead)} (${summarySrc})`, `/leads/${lead.id}`);
    } else if (lead.owner_id) {
      notify(lead.owner_id, `${leadName(lead)} har hört av sig igen via ${summarySrc}`, `/leads/${lead.id}`);
    }
    audit(null, `lead.${result.result}`, 'lead', lead.id, { source, sourceDetail });
  }
  return result;
}
