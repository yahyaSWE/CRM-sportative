// Möten: bokning från lead/affär, tvåvägssynk mot Google Kalender, påminnelser och iCal-flöde.
import { all, get, run, tx, parseJSON, audit } from '../db.js';
import { can, randomToken } from '../security.js';
import { broadcast } from '../events.js';
import { notify, leadName, getLead } from '../services/leads.js';
import * as google from './google.js';

const sqlTime = (d) => new Date(d).toISOString().slice(0, 19).replace('T', ' ');
const isoTime = (s) => `${String(s).replace(' ', 'T')}Z`;

export const hydrateMeeting = (m) => m && { ...m, attendees: parseJSON(m.attendees, []), all_day: !!m.all_day };
export const canSeeMeeting = (user, m) => m.owner_id === user.id || can(user, 'leads.view_all');
export const canEditMeeting = (user, m) => can(user, 'leads.edit_all') || (m.owner_id === user.id && can(user, 'leads.edit_own'));

export function getMeeting(id) {
  return hydrateMeeting(get(`SELECT m.*, u.name AS owner_name, u.color AS owner_color,
      l.first_name, l.last_name, l.company, l.email AS lead_email, l.phone AS lead_phone, d.title AS deal_title, d.stage AS deal_stage
    FROM meetings m LEFT JOIN users u ON u.id = m.owner_id LEFT JOIN leads l ON l.id = m.lead_id LEFT JOIN deals d ON d.id = m.deal_id
    WHERE m.id = ?`, id));
}

function changed(m, type = 'updated') {
  broadcast('meeting', { type, id: m.id, owner_id: m.owner_id }, (u) => canSeeMeeting(u, m));
}

function timelineNote(m, userId, content, type = 'system') {
  if (!m.lead_id && !m.deal_id) return;
  const leadId = m.lead_id ?? get('SELECT lead_id FROM deals WHERE id = ?', m.deal_id)?.lead_id ?? null;
  run('INSERT INTO activities (lead_id, deal_id, user_id, type, content) VALUES (?,?,?,?,?)', leadId, m.deal_id ?? null, userId ?? null, type, content);
  if (leadId) run("UPDATE leads SET last_activity_at = datetime('now') WHERE id = ?", leadId);
}

const when = (m) => new Date(isoTime(m.start_at)).toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

// ---------- Google: CRM → Google ----------
function toGoogleEvent(m, { createMeet } = {}) {
  const lead = m.lead_id ? getLead(m.lead_id) : null;
  const extra = lead ? `\n\nKund: ${leadName(lead)}${lead.company ? `, ${lead.company}` : ''}${lead.phone ? ` · ${lead.phone}` : ''}` : '';
  const ev = {
    summary: m.title,
    description: `${m.description || ''}${extra}`.trim() || undefined,
    location: m.location || undefined,
    attendees: m.attendees.filter((a) => a.email).map((a) => ({ email: a.email, displayName: a.name || undefined })),
    extendedProperties: { private: { leadflowId: String(m.id) } },
    start: m.all_day ? { date: m.start_at.slice(0, 10) } : { dateTime: isoTime(m.start_at) },
    end: m.all_day ? { date: m.end_at.slice(0, 10) } : { dateTime: isoTime(m.end_at) },
  };
  if (createMeet && !m.video_url) ev.conferenceData = { createRequest: { requestId: google.newRequestId(), conferenceSolutionKey: { type: 'hangoutsMeet' } } };
  return ev;
}

export async function pushMeeting(id, { sendInvites = false, createMeet = false } = {}) {
  const m = hydrateMeeting(get('SELECT * FROM meetings WHERE id = ?', id));
  if (!m || !get('SELECT 1 FROM google_accounts WHERE user_id = ?', m.owner_id) || !google.isConfigured()) return null;
  const query = { sendUpdates: sendInvites ? 'all' : 'none', conferenceDataVersion: 1 };
  try {
    const ev = m.google_event_id
      ? await google.api(m.owner_id, 'PATCH', `/events/${encodeURIComponent(m.google_event_id)}`, { query, body: toGoogleEvent(m, { createMeet }) })
      : await google.api(m.owner_id, 'POST', '/events', { query, body: toGoogleEvent(m, { createMeet }) });
    run('UPDATE meetings SET google_event_id = ?, google_updated = ?, video_url = coalesce(?, video_url), sync_error = NULL WHERE id = ?',
      ev.id, ev.updated, ev.hangoutLink || null, m.id);
    return ev;
  } catch (e) {
    run('UPDATE meetings SET sync_error = ? WHERE id = ?', String(e.message).slice(0, 300), m.id);
    return null;
  }
}

async function removeRemote(m, sendInvites) {
  if (!m.google_event_id) return;
  try { await google.api(m.owner_id, 'DELETE', `/events/${encodeURIComponent(m.google_event_id)}`, { query: { sendUpdates: sendInvites ? 'all' : 'none' } }); }
  catch (e) { run('UPDATE meetings SET sync_error = ? WHERE id = ?', String(e.message).slice(0, 300), m.id); }
}

// ---------- Google: Google → CRM ----------
function fromGoogleEvent(ev, selfEmail) {
  const allDay = !!ev.start?.date;
  const start = allDay ? `${ev.start.date} 00:00:00` : sqlTime(ev.start.dateTime);
  const end = allDay ? `${ev.end?.date || ev.start.date} 00:00:00` : sqlTime(ev.end?.dateTime || ev.start.dateTime);
  const attendees = (ev.attendees || []).filter((a) => !a.self && a.email !== selfEmail && !a.resource).map((a) => ({ email: a.email, name: a.displayName || null, response: a.responseStatus }));
  return {
    title: ev.summary || '(Utan titel)', description: ev.description || null, location: ev.location || null,
    video_url: ev.hangoutLink || null, start_at: start, end_at: end, all_day: allDay ? 1 : 0, attendees: JSON.stringify(attendees),
  };
}

export async function pullAccount(userId) {
  const acc = get('SELECT * FROM google_accounts WHERE user_id = ?', userId);
  if (!acc) return null;
  const syncStart = new Date();
  const query = { singleEvents: true, showDeleted: true, maxResults: 250 };
  if (acc.last_sync_at) query.updatedMin = new Date(new Date(isoTime(acc.last_sync_at)).getTime() - 120000).toISOString();
  else { query.timeMin = new Date(Date.now() - 30 * 864e5).toISOString(); query.timeMax = new Date(Date.now() + 180 * 864e5).toISOString(); }
  let created = 0, updated = 0, pageToken;
  try {
    do {
      const page = await google.api(userId, 'GET', '/events', { query: { ...query, pageToken } });
      for (const ev of page.items || []) {
        const r = applyGoogleEvent(userId, acc.email, ev);
        if (r === 'created') created++; else if (r === 'updated') updated++;
      }
      pageToken = page.nextPageToken;
    } while (pageToken);
    run('UPDATE google_accounts SET last_sync_at = ?, last_error = NULL WHERE user_id = ?', sqlTime(syncStart), userId);
    if (created || updated) broadcast('meeting', { type: 'synced', owner_id: userId }, (u) => u.id === userId || can(u, 'leads.view_all'));
    return { created, updated };
  } catch (e) {
    run('UPDATE google_accounts SET last_error = ? WHERE user_id = ?', String(e.message).slice(0, 300), userId);
    throw e;
  }
}

function applyGoogleEvent(userId, selfEmail, ev) {
  const lfId = Number(ev.extendedProperties?.private?.leadflowId) || null;
  const existing = (lfId && get('SELECT * FROM meetings WHERE id = ? AND owner_id = ?', lfId, userId))
    || get('SELECT * FROM meetings WHERE owner_id = ? AND google_event_id = ?', userId, ev.id);
  // Vår egen ändring som kommer tillbaka – redan sparad.
  if (existing?.google_updated && ev.updated && ev.updated <= existing.google_updated) return null;

  if (ev.status === 'cancelled') {
    if (existing && existing.status === 'scheduled') {
      run("UPDATE meetings SET status = 'cancelled', google_updated = ?, updated_at = datetime('now') WHERE id = ?", ev.updated || null, existing.id);
      timelineNote(existing, null, `Mötet "${existing.title}" avbokades i Google Kalender`);
      return 'updated';
    }
    return null;
  }
  if (!ev.start) return null;
  const self = (ev.attendees || []).find((a) => a.self);
  if (self?.responseStatus === 'declined' && !existing) return null;
  const f = fromGoogleEvent(ev, selfEmail);

  if (existing) {
    const moved = f.start_at !== existing.start_at;
    run(`UPDATE meetings SET title = ?, description = ?, location = ?, video_url = coalesce(?, video_url), start_at = ?, end_at = ?, all_day = ?, attendees = ?,
        google_event_id = ?, google_updated = ?, reminder_sent = CASE WHEN ? THEN 0 ELSE reminder_sent END, followup_sent = CASE WHEN ? THEN 0 ELSE followup_sent END,
        updated_at = datetime('now') WHERE id = ?`,
      f.title, f.description, f.location, f.video_url, f.start_at, f.end_at, f.all_day, f.attendees, ev.id, ev.updated || null, moved ? 1 : 0, moved ? 1 : 0, existing.id);
    if (moved) timelineNote(existing, null, `Mötet "${f.title}" flyttades i Google Kalender till ${when(f)}`);
    return 'updated';
  }

  // Nytt möte bokat direkt i Google: koppla till en kund om någon deltagare finns som lead.
  const emails = parseJSON(f.attendees, []).map((a) => a.email.toLowerCase());
  const lead = emails.length ? get(`SELECT id FROM leads WHERE email IN (${emails.map(() => '?').join(',')}) ORDER BY last_activity_at DESC LIMIT 1`, ...emails) : null;
  const deal = lead ? get("SELECT id FROM deals WHERE lead_id = ? AND stage NOT IN ('won','lost') ORDER BY updated_at DESC LIMIT 1", lead.id) : null;
  run(`INSERT INTO meetings (title, description, location, video_url, start_at, end_at, all_day, attendees, owner_id, lead_id, deal_id, source, google_event_id, google_updated)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,'google',?,?)`, f.title, f.description, f.location, f.video_url, f.start_at, f.end_at, f.all_day, f.attendees,
    userId, lead?.id ?? null, deal?.id ?? null, ev.id, ev.updated || null);
  if (lead) timelineNote({ lead_id: lead.id, deal_id: deal?.id }, userId, `Möte bokat i Google Kalender: ${f.title} · ${when(f)}`);
  return 'created';
}

// ---------- CRM-operationer ----------
function validate(b) {
  if (!b.title?.trim()) throw Object.assign(new Error('Ange en rubrik för mötet'), { status: 400 });
  const s = new Date(isoTime(b.start_at)), e = new Date(isoTime(b.end_at));
  if (isNaN(s) || isNaN(e)) throw Object.assign(new Error('Ogiltig tid'), { status: 400 });
  if (e <= s && !b.all_day) throw Object.assign(new Error('Mötet måste sluta efter att det börjar'), { status: 400 });
}

const cleanAttendees = (list = []) => list
  .map((a) => (typeof a === 'string' ? { email: a } : a))
  .filter((a) => a?.email && /.+@.+\..+/.test(a.email))
  .map((a) => ({ email: a.email.trim().toLowerCase(), name: a.name || null }));

export async function createMeeting(user, b) {
  validate(b);
  const ownerId = b.owner_id && can(user, 'leads.assign') ? Number(b.owner_id) : user.id;
  let leadId = b.lead_id ? Number(b.lead_id) : null;
  const dealId = b.deal_id ? Number(b.deal_id) : null;
  if (dealId && !leadId) leadId = get('SELECT lead_id FROM deals WHERE id = ?', dealId)?.lead_id ?? null;
  const id = tx(() => {
    const ins = run(`INSERT INTO meetings (title, description, location, video_url, start_at, end_at, all_day, owner_id, lead_id, deal_id, attendees)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`, b.title.trim(), b.description || null, b.location || null, b.video_url || null, b.start_at, b.end_at,
      b.all_day ? 1 : 0, ownerId, leadId, dealId, JSON.stringify(cleanAttendees(b.attendees)));
    const m = { id: Number(ins.lastInsertRowid), lead_id: leadId, deal_id: dealId, title: b.title.trim(), start_at: b.start_at };
    timelineNote(m, user.id, `Möte bokat: ${m.title} · ${when(m)}`);
    // Ett bokat möte flyttar en nykvalificerad affär till "Möte bokat".
    if (dealId) {
      const d = get('SELECT * FROM deals WHERE id = ?', dealId);
      if (d?.stage === 'qualified') {
        run("UPDATE deals SET stage = 'contact', stage_changed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?", dealId);
        timelineNote({ lead_id: leadId, deal_id: dealId }, user.id, `Affären "${d.title}" flyttad till Möte bokat`);
      }
    }
    if (leadId) run("UPDATE leads SET status = CASE WHEN status = 'new' THEN 'contacted' ELSE status END WHERE id = ?", leadId);
    return m.id;
  });
  audit(user.id, 'meeting.create', 'meeting', id);
  await pushMeeting(id, { sendInvites: !!b.send_invites, createMeet: !!b.create_meet });
  const m = getMeeting(id);
  changed(m, 'created');
  if (dealId) broadcast('refresh', { entity: 'deals' });
  if (ownerId !== user.id) notify(ownerId, `${user.name} bokade ett möte åt dig: ${m.title} · ${when(m)}`, `/calendar?meeting=${id}`);
  return m;
}

export async function updateMeeting(user, m, b) {
  const next = { ...m, ...b };
  validate(next);
  const moved = next.start_at !== m.start_at;
  run(`UPDATE meetings SET title = ?, description = ?, location = ?, video_url = ?, start_at = ?, end_at = ?, all_day = ?, attendees = ?, owner_id = ?,
      reminder_sent = CASE WHEN ? THEN 0 ELSE reminder_sent END, followup_sent = CASE WHEN ? THEN 0 ELSE followup_sent END, updated_at = datetime('now') WHERE id = ?`,
    next.title.trim(), next.description || null, next.location || null, next.video_url || null, next.start_at, next.end_at, next.all_day ? 1 : 0,
    JSON.stringify(cleanAttendees(next.attendees)), b.owner_id && can(user, 'leads.assign') ? Number(b.owner_id) : m.owner_id, moved ? 1 : 0, moved ? 1 : 0, m.id);
  if (moved) timelineNote(m, user.id, `Mötet "${next.title}" flyttat till ${when(next)}`);
  audit(user.id, 'meeting.update', 'meeting', m.id);
  await pushMeeting(m.id, { sendInvites: !!b.send_invites, createMeet: !!b.create_meet });
  const out = getMeeting(m.id);
  changed(out);
  return out;
}

export async function cancelMeeting(user, m, { sendInvites } = {}) {
  run("UPDATE meetings SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?", m.id);
  timelineNote(m, user.id, `Mötet "${m.title}" avbokades`);
  await removeRemote(m, sendInvites);
  run('UPDATE meetings SET google_event_id = NULL WHERE id = ?', m.id);
  audit(user.id, 'meeting.cancel', 'meeting', m.id);
  changed(m);
}

export async function deleteMeeting(user, m) {
  await removeRemote(m, false);
  run('DELETE FROM meetings WHERE id = ?', m.id);
  audit(user.id, 'meeting.delete', 'meeting', m.id);
  changed(m, 'deleted');
}

// Utfall efter mötet: loggas på tidslinjen och kan skapa nästa steg.
export function recordOutcome(user, m, { status, outcome, next_task, next_due }) {
  if (!['done', 'no_show'].includes(status)) throw Object.assign(new Error('Ogiltigt utfall'), { status: 400 });
  tx(() => {
    run("UPDATE meetings SET status = ?, outcome = ?, followup_sent = 1, updated_at = datetime('now') WHERE id = ?", status, outcome || null, m.id);
    const text = status === 'no_show' ? `${m.title}: kunden dök inte upp${outcome ? `. ${outcome}` : ''}` : `${m.title}${outcome ? `: ${outcome}` : ' genomfört'}`;
    timelineNote(m, user.id, text, 'meeting');
    if (next_task?.trim()) {
      const leadId = m.lead_id ?? (m.deal_id ? get('SELECT lead_id FROM deals WHERE id = ?', m.deal_id)?.lead_id : null);
      run("INSERT INTO activities (lead_id, deal_id, user_id, type, content, due_at) VALUES (?, ?, ?, 'task', ?, ?)", leadId, m.deal_id, m.owner_id, next_task.trim(), next_due || null);
    }
  });
  audit(user.id, 'meeting.outcome', 'meeting', m.id, { status });
  const out = getMeeting(m.id);
  changed(out);
  if (m.deal_id) broadcast('refresh', { entity: 'deals' });
  return out;
}

// ---------- Schemalagt: påminnelser, uppföljning, synk ----------
let syncing = false;
export async function tick() {
  for (const m of all(`SELECT * FROM meetings WHERE status = 'scheduled' AND all_day = 0 AND reminder_sent = 0
      AND start_at > datetime('now') AND start_at <= datetime('now', '+15 minutes')`)) {
    run('UPDATE meetings SET reminder_sent = 1 WHERE id = ?', m.id);
    const mins = Math.max(1, Math.round((new Date(isoTime(m.start_at)) - Date.now()) / 60000));
    notify(m.owner_id, `Möte om ${mins} min: ${m.title}`, `/calendar?meeting=${m.id}`);
  }
  for (const m of all(`SELECT * FROM meetings WHERE status = 'scheduled' AND followup_sent = 0 AND (lead_id IS NOT NULL OR deal_id IS NOT NULL)
      AND end_at <= datetime('now') AND end_at > datetime('now', '-2 days')`)) {
    run('UPDATE meetings SET followup_sent = 1 WHERE id = ?', m.id);
    notify(m.owner_id, `Hur gick mötet "${m.title}"? Logga utfallet och boka nästa steg.`, `/calendar?meeting=${m.id}`);
  }
  if (syncing || !google.isConfigured()) return;
  syncing = true;
  try {
    for (const acc of all('SELECT user_id FROM google_accounts')) await pullAccount(acc.user_id).catch(() => {});
    // Möten som inte kom fram till Google (t.ex. vid nätverksfel) försöks igen.
    for (const m of all(`SELECT m.id FROM meetings m JOIN google_accounts g ON g.user_id = m.owner_id
        WHERE m.status = 'scheduled' AND m.google_event_id IS NULL AND m.source = 'crm' AND m.end_at > datetime('now') LIMIT 20`)) {
      await pushMeeting(m.id);
    }
  } finally { syncing = false; }
}

// ---------- iCal-prenumeration ----------
export function icalToken(userId, regenerate = false) {
  let t = get('SELECT ical_token FROM users WHERE id = ?', userId)?.ical_token;
  if (!t || regenerate) { t = randomToken(24); run('UPDATE users SET ical_token = ? WHERE id = ?', t, userId); }
  return t;
}

const icsEscape = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const icsTime = (s) => String(s).replace(/[-:]/g, '').replace(' ', 'T') + 'Z';
function fold(line) {
  const out = [];
  let rest = line;
  while (Buffer.byteLength(rest) > 74) {
    let n = 74;
    while (Buffer.byteLength(rest.slice(0, n)) > 74) n--;
    out.push(rest.slice(0, n)); rest = ' ' + rest.slice(n);
  }
  out.push(rest);
  return out.join('\r\n');
}

export function buildIcs(userId) {
  const user = get('SELECT name FROM users WHERE id = ?', userId);
  const meetings = all(`SELECT m.*, l.first_name, l.last_name, l.company, l.phone FROM meetings m LEFT JOIN leads l ON l.id = m.lead_id
    WHERE m.owner_id = ? AND m.start_at > datetime('now', '-90 days') AND m.start_at < datetime('now', '+365 days') ORDER BY m.start_at`, userId);
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//LeadFlow CRM//SV', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsEscape(`LeadFlow – ${user?.name || 'möten'}`)}`, 'X-PUBLISHED-TTL:PT15M', 'REFRESH-INTERVAL;VALUE=DURATION:PT15M'];
  for (const m of meetings) {
    const who = [m.first_name, m.last_name].filter(Boolean).join(' ') || m.company;
    lines.push('BEGIN:VEVENT', `UID:meeting-${m.id}@leadflow`, `DTSTAMP:${icsTime(m.updated_at)}`,
      m.all_day ? `DTSTART;VALUE=DATE:${m.start_at.slice(0, 10).replace(/-/g, '')}` : `DTSTART:${icsTime(m.start_at)}`,
      m.all_day ? `DTEND;VALUE=DATE:${m.end_at.slice(0, 10).replace(/-/g, '')}` : `DTEND:${icsTime(m.end_at)}`,
      `SUMMARY:${icsEscape(m.title)}`,
      `DESCRIPTION:${icsEscape([m.description, who && `Kund: ${who}${m.company && who !== m.company ? `, ${m.company}` : ''}${m.phone ? ` · ${m.phone}` : ''}`, m.video_url].filter(Boolean).join('\n'))}`,
      ...(m.location ? [`LOCATION:${icsEscape(m.location)}`] : []), ...(m.video_url ? [`URL:${m.video_url}`] : []),
      `STATUS:${m.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'}`, 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
