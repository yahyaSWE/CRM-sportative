import { Router } from 'express';
import { get, run, audit } from '../db.js';
import { hashPassword, verifyPassword, signSession, loadUser, PERMISSIONS } from '../security.js';
import { authenticate, COOKIE } from '../middleware.js';

const r = Router();
const attempts = new Map();

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
  res.cookie(COOKIE, signSession(row.id), {
    httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge: 7 * 864e5, path: '/',
  });
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
