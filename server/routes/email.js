// E-post från appen: säljaren skickar från sin egen Gmail (via Google-kopplingen) och mejlet loggas i tidslinjen.
import { Router } from 'express';
import { get, run, audit } from '../db.js';
import { broadcast } from '../events.js';
import { getLead, canSeeLead, canEditLead } from '../services/leads.js';
import * as google from '../calendar/google.js';

const r = Router();
const EMAIL = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;
const sent = new Map(); // spärr mot massutskick: högst LIMIT mejl per användare och timme
const LIMIT = 100;

r.get('/email/status', (req, res) => {
  const acc = get('SELECT email, scopes FROM google_accounts WHERE user_id = ?', req.user.id);
  res.json({ configured: google.isConfigured(), connected: !!acc, email: acc?.email || null, canSend: google.canSendMail(acc), needsReconnect: !!acc && !google.canSendMail(acc) });
});

r.post('/leads/:id/email', async (req, res, next) => {
  try {
    const lead = getLead(Number(req.params.id));
    if (!lead || !canSeeLead(req.user, lead)) return res.status(404).json({ error: 'Lead hittades inte' });
    if (!canEditLead(req.user, lead)) return res.status(403).json({ error: 'Du kan inte redigera detta lead' });
    const { subject = '', body = '', template_id } = req.body || {};
    const to = String(req.body?.to || lead.email || '').split(/[,;]/).map((s) => s.trim()).filter(Boolean);
    if (!to.length || !to.every((a) => EMAIL.test(a))) return res.status(400).json({ error: 'Ange en giltig e-postadress' });
    if (!subject.trim() || !body.trim()) return res.status(400).json({ error: 'Ange ämne och text' });

    const hour = Date.now() - 3600000;
    const mine = (sent.get(req.user.id) || []).filter((t) => t > hour);
    if (mine.length >= LIMIT) return res.status(429).json({ error: 'För många mejl på kort tid. Vänta en stund och försök igen.' });

    const result = await google.sendGmail(req.user.id, { fromName: req.user.name, to: to.join(', '), subject: subject.trim(), body });
    sent.set(req.user.id, [...mine, Date.now()]);

    const toText = to.join(', ');
    const content = `Ämne: ${subject.trim()}${toText.toLowerCase() !== String(lead.email || '').toLowerCase() ? `\nTill: ${toText}` : ''}\n\n${body}`;
    const act = run("INSERT INTO activities (lead_id, user_id, type, content, email_thread_id) VALUES (?, ?, 'email', ?, ?)", lead.id, req.user.id, content, result.threadId || null);
    run("UPDATE leads SET last_activity_at = datetime('now'), status = CASE WHEN status = 'new' THEN 'contacted' ELSE status END WHERE id = ?", lead.id);
    if (template_id) run('UPDATE templates SET use_count = use_count + 1 WHERE id = ?', Number(template_id));
    audit(req.user.id, 'email.send', 'lead', lead.id, { to: toText, subject: subject.trim() });
    const full = getLead(lead.id);
    broadcast('lead', { type: 'updated', lead: full }, (u) => canSeeLead(u, full));
    res.status(201).json({ ok: true, from: result.from, activity_id: Number(act.lastInsertRowid) });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    next(e);
  }
});

export default r;
