import { Router } from 'express';
import { all, get, findWorkspace, withWorkspace, currentWorkspaceId } from '../db.js';
import { can, signSession, readSession } from '../security.js';
import { authenticate, requirePerm, parseCookies, COOKIE } from '../middleware.js';
import * as google from '../calendar/google.js';
import {
  getMeeting, hydrateMeeting, canSeeMeeting, canEditMeeting, createMeeting, updateMeeting, cancelMeeting, deleteMeeting,
  recordOutcome, pullAccount, icalToken, buildIcs,
} from '../calendar/service.js';

const r = Router();
const baseUrl = (req) => process.env.PUBLIC_URL || `${req.protocol}://${req.get('x-forwarded-host') || req.get('host')}`;
const redirectUri = (req) => `${baseUrl(req)}/api/calendar/google/callback`;
const wrap = (fn) => (req, res, next) => fn(req, res).catch((e) => (e.status ? res.status(e.status).json({ error: e.message }) : next(e)));

// ---------- Publikt: iCal-prenumeration (hemlig länk per användare) ----------
r.get('/calendar/ical/:token.ics', (req, res) => {
  const find = () => get('SELECT id FROM users WHERE ical_token = ? AND active = 1', req.params.token);
  const ws = findWorkspace(() => !!find());
  if (!ws) return res.sendStatus(404);
  withWorkspace(ws, () => res.set({ 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'no-cache' }).send(buildIcs(find().id)));
});

// ---------- Google OAuth (callback kräver inloggad session via cookie) ----------
r.get('/calendar/google/callback', wrap(async (req, res) => {
  const session = readSession(parseCookies(req.headers.cookie)[COOKIE]);
  const state = readSession(req.query.state);
  // Kopplingen kan startas från kalendern eller inställningarna; svaret skickas tillbaka dit.
  const back = state?.ret === 'settings' ? '/settings' : '/calendar';
  if (!session || !state || state.uid !== session.uid || !state.ws) return res.redirect(`${back}?google=error&reason=session`);
  if (req.query.error) return res.redirect(`${back}?google=error&reason=${encodeURIComponent(req.query.error)}`);
  // Kopplingen hör till arbetsytan där användaren startade den (state är signerad).
  await withWorkspace(state.ws, () => connectGoogle(req, res, session, back));
}));

async function connectGoogle(req, res, session, back) {
  try {
    await google.connectAccount(session.uid, req.query.code, redirectUri(req));
    pullAccount(session.uid).catch(() => {});
    res.redirect(`${back}?google=connected`);
  } catch (e) {
    res.redirect(`${back}?google=error&reason=${encodeURIComponent(e.message)}`);
  }
}

r.use('/calendar', authenticate);
r.use('/meetings', authenticate);

r.get('/calendar/status', (req, res) => {
  const acc = get('SELECT email, last_sync_at, last_error, connected_at FROM google_accounts WHERE user_id = ?', req.user.id);
  const cfg = google.getAppConfig();
  res.json({
    googleConfigured: google.isConfigured(), google: acc || null,
    icalUrl: `${baseUrl(req)}/api/calendar/ical/${icalToken(req.user.id)}.ics`,
    redirectUri: redirectUri(req),
    ...(can(req.user, 'integrations.manage') ? { clientId: cfg.clientId || '', clientSecret: cfg.clientSecret ? '••••••••' : '' } : {}),
  });
});

r.patch('/calendar/google/config', requirePerm('integrations.manage'), (req, res) => {
  google.saveAppConfig(req.body || {});
  res.json({ googleConfigured: google.isConfigured() });
});

r.get('/calendar/google/connect', (req, res) => {
  const ret = req.query.return === 'settings' ? 'settings' : undefined;
  if (!google.isConfigured()) return res.redirect(`/${ret || 'calendar'}?google=error&reason=` + encodeURIComponent('Google är inte konfigurerat ännu'));
  // state = kortlivad signerad token som binder svaret till den inloggade användaren (skydd mot CSRF).
  res.redirect(google.authUrl(redirectUri(req), signSession(req.user.id, 1 / 144, { ws: currentWorkspaceId(), ret })));
});

r.post('/calendar/google/disconnect', wrap(async (req, res) => {
  await google.disconnectAccount(req.user.id);
  res.json({ ok: true });
}));

r.post('/calendar/google/sync', wrap(async (req, res) => {
  try { res.json(await pullAccount(req.user.id) || { created: 0, updated: 0 }); }
  catch (e) { res.status(400).json({ error: e.message }); }
}));

r.post('/calendar/ical/regenerate', (req, res) => {
  icalToken(req.user.id, true);
  res.json({ ok: true });
});

// ---------- Möten ----------
r.get('/meetings', (req, res) => {
  const { from, to, owner, lead_id, deal_id, pending } = req.query;
  const where = [], params = [];
  if (owner === 'all' && can(req.user, 'leads.view_all')) { /* hela teamet */ }
  else if (owner && owner !== 'me' && can(req.user, 'leads.view_all')) { where.push('m.owner_id = ?'); params.push(Number(owner)); }
  else if (!lead_id && !deal_id) { where.push('m.owner_id = ?'); params.push(req.user.id); }
  if (from) { where.push('m.end_at >= ?'); params.push(from); }
  if (to) { where.push('m.start_at < ?'); params.push(to); }
  if (lead_id) { where.push('(m.lead_id = ? OR m.deal_id IN (SELECT id FROM deals WHERE lead_id = ?))'); params.push(Number(lead_id), Number(lead_id)); }
  if (deal_id) { where.push('m.deal_id = ?'); params.push(Number(deal_id)); }
  if (pending) where.push("m.status = 'scheduled' AND m.end_at <= datetime('now') AND (m.lead_id IS NOT NULL OR m.deal_id IS NOT NULL)");
  if (!req.query.include_cancelled) where.push("m.status != 'cancelled'");
  const rows = all(`SELECT m.*, u.name AS owner_name, u.color AS owner_color, l.first_name, l.last_name, l.company, d.title AS deal_title
    FROM meetings m LEFT JOIN users u ON u.id = m.owner_id LEFT JOIN leads l ON l.id = m.lead_id LEFT JOIN deals d ON d.id = m.deal_id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY m.start_at LIMIT 1000`, ...params).map(hydrateMeeting);
  res.json(rows.filter((m) => canSeeMeeting(req.user, m)));
});

function load(req, res, edit) {
  const m = getMeeting(Number(req.params.id));
  if (!m || !canSeeMeeting(req.user, m)) { res.status(404).json({ error: 'Mötet hittades inte' }); return null; }
  if (edit && !canEditMeeting(req.user, m)) { res.status(403).json({ error: 'Du kan inte ändra detta möte' }); return null; }
  return m;
}

r.get('/meetings/:id', (req, res) => {
  const m = load(req, res);
  if (m) res.json({ ...m, canEdit: canEditMeeting(req.user, m) });
});

r.post('/meetings', requirePerm('leads.edit_own'), wrap(async (req, res) => res.status(201).json(await createMeeting(req.user, req.body || {}))));

r.patch('/meetings/:id', wrap(async (req, res) => {
  const m = load(req, res, true);
  if (m) res.json(await updateMeeting(req.user, m, req.body || {}));
}));

r.post('/meetings/:id/cancel', wrap(async (req, res) => {
  const m = load(req, res, true);
  if (m) { await cancelMeeting(req.user, m, { sendInvites: !!req.body?.send_invites }); res.json({ ok: true }); }
}));

r.delete('/meetings/:id', wrap(async (req, res) => {
  const m = load(req, res, true);
  if (m) { await deleteMeeting(req.user, m); res.json({ ok: true }); }
}));

r.post('/meetings/:id/outcome', wrap(async (req, res) => {
  const m = load(req, res, true);
  if (m) res.json(recordOutcome(req.user, m, req.body || {}));
}));

export default r;
