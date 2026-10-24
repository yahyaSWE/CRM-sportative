import { Router } from 'express';
import { get, run, audit } from '../db.js';
import { hashPassword, verifyPassword, signSession, loadUser, PERMISSIONS } from '../security.js';
import { authenticate, COOKIE } from '../middleware.js';
import { PROD, ADMIN_EMAIL } from '../config.js';
import { ensureRoles } from '../seed.js';

const r = Router();
const attempts = new Map();

// I produktion skickas sessionscookien bara över https (Render terminerar https i sin proxy).
const setSession = (req, res, userId) => res.cookie(COOKIE, signSession(userId), {
  httpOnly: true, sameSite: 'lax', secure: PROD || req.secure, maxAge: 7 * 864e5, path: '/',
});
const noUsers = () => !get('SELECT 1 FROM users LIMIT 1');

// Första start: finns inga användare visar inloggningssidan ett formulär för att skapa administratören.
r.get('/setup', (req, res) => res.json({ needed: noUsers(), demo: !PROD, adminEmail: noUsers() && ADMIN_EMAIL ? ADMIN_EMAIL.replace(/^(.).*(@.*)$/, '$1…$2') : null }));

r.post('/setup', (req, res) => {
  // Samma spärr mot gissningar som vid inloggning.
  const key = `setup:${req.ip}`;
  const a = attempts.get(key) || { n: 0, t: Date.now() };
  if (Date.now() - a.t > 15 * 60000) Object.assign(a, { n: 0, t: Date.now() });
  if (++a.n > 10) return res.status(429).json({ error: 'För många försök. Vänta en stund och försök igen.' });
  attempts.set(key, a);
  if (!noUsers()) return res.status(409).json({ error: 'Det finns redan ett administratörskonto. Logga in i stället.' });
  if (PROD && !ADMIN_EMAIL) return res.status(403).json({ error: 'Sätt miljövariabeln ADMIN_EMAIL till din e-postadress och starta om tjänsten.' });
  const { name = '', email = '', password = '' } = req.body || {};
  if (ADMIN_EMAIL && email.trim().toLowerCase() !== ADMIN_EMAIL) return res.status(403).json({ error: 'Endast e-postadressen i ADMIN_EMAIL får skapa det första kontot.' });
  if (!name.trim() || !/.+@.+\..+/.test(email)) return res.status(400).json({ error: 'Ange namn och e-post' });
  if (password.length < 10) return res.status(400).json({ error: 'Lösenordet måste vara minst 10 tecken' });
  const [adminRole] = ensureRoles();
  const ins = run('INSERT INTO users (name, email, password_hash, role_id, color) VALUES (?,?,?,?,?)',
    name.trim(), email.trim().toLowerCase(), hashPassword(password), adminRole, '#6366f1');
  const id = Number(ins.lastInsertRowid);
  audit(id, 'user.setup', 'user', id);
  setSession(req, res, id);
  res.status(201).json({ user: loadUser(id) });
});

r.post('/login', (req, res) => {
  const { email = '', password = '' } = req.body || {};
  const key = `${req.ip}:${email.toLowerCase()}`;
  const a = attempts.get(key) || { n: 0, t: Date.now() };
  if (Date.now() - a.t > 15 * 60000) Object.assign(a, { n: 0, t: Date.now() });
  if (a.n >= 8) return res.status(429).json({ error: 'För många försök. Vänta en stund och försök igen.' });

  const row = get('SELECT * FROM users WHERE email = ?', email.trim());
  if (!row || !row.active || !verifyPassword(password, row.password_hash)) {
    a.n++; attempts.set(key, a);
    return res.status(401).json({ error: 'Fel e-post eller lösenord' });
  }
  attempts.delete(key);
  run("UPDATE users SET last_login_at = datetime('now') WHERE id = ?", row.id);
  audit(row.id, 'user.login', 'user', row.id);
  setSession(req, res, row.id);
  res.json({ user: loadUser(row.id) });
});

r.post('/logout', (req, res) => {
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
});

r.get('/me', authenticate, (req, res) => res.json({ user: req.user, permissions: PERMISSIONS }));

r.post('/password', authenticate, (req, res) => {
  const { current, next } = req.body || {};
  const row = get('SELECT password_hash FROM users WHERE id = ?', req.user.id);
  if (!verifyPassword(current || '', row.password_hash)) return res.status(400).json({ error: 'Nuvarande lösenord stämmer inte' });
  if (!next || next.length < 8) return res.status(400).json({ error: 'Nytt lösenord måste vara minst 8 tecken' });
  run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(next), req.user.id);
  audit(req.user.id, 'user.password_changed', 'user', req.user.id);
  res.json({ ok: true });
});

export default r;
