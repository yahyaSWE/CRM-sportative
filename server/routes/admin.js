import { Router } from 'express';
import { all, get, run, audit, parseJSON, central } from '../db.js';
import { findAccount, getAccount, createAccount, addMember, setMemberActive, updateAccountProfile, canManageAccount } from '../accounts.js';
import { hashPassword, PERMISSION_KEYS, can } from '../security.js';
import { requirePerm } from '../middleware.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeBackup, listBackups } from '../backup.js';
import { PROD } from '../config.js';

const r = Router();
const COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

// ---------- Användare ----------
r.get('/users', (req, res) => {
  const full = can(req.user, 'users.manage');
  const rows = all(`SELECT u.id, u.name, u.email, u.active, u.color, u.role_id, r.name AS role, u.created_at, u.last_login_at,
    (SELECT count(*) FROM leads WHERE owner_id = u.id) AS lead_count
    FROM users u JOIN roles r ON r.id = u.role_id ORDER BY u.active DESC, u.name`);
  // Senaste inloggning finns på kontot (gemensamt för alla arbetsytor).
  const logins = new Map(central.all('SELECT id, last_login_at FROM users').map((a) => [a.id, a.last_login_at]));
  for (const u of rows) u.last_login_at = logins.get(u.id) ?? null;
  res.json(full ? rows : rows.filter((u) => u.active).map(({ id, name, color, role }) => ({ id, name, color, role })));
});

// Ny medlem i arbetsytan. Har personen redan ett konto (i en annan arbetsyta) läggs kontot till och behåller sitt lösenord.
r.post('/users', requirePerm('users.manage'), (req, res) => {
  const { name, email, password, role_id } = req.body || {};
  if (!name?.trim() || !email?.includes('@')) return res.status(400).json({ error: 'Namn och giltig e-post krävs' });
  if (!get('SELECT 1 FROM roles WHERE id = ?', role_id)) return res.status(400).json({ error: 'Välj en roll' });
  let account = findAccount(email);
  if (account && get('SELECT 1 FROM users WHERE id = ? AND active = 1', account.id)) return res.status(409).json({ error: 'E-postadressen används redan' });
  const existing = !!account;
  if (!account) {
    if (!password || password.length < 8) return res.status(400).json({ error: 'Lösenordet måste vara minst 8 tecken' });
    const n = central.get('SELECT count(*) AS n FROM users').n;
    account = getAccount(createAccount({ name, email, passwordHash: hashPassword(password), color: COLORS[n % COLORS.length] }));
  }
  addMember(account, role_id);
  audit(req.user.id, 'user.create', 'user', account.id, { email, existing });
  res.status(201).json({ id: account.id, existing });
});

const adminCount = () => get(`SELECT count(*) AS n FROM users u JOIN roles r ON r.id = u.role_id
  WHERE u.active = 1 AND EXISTS (SELECT 1 FROM json_each(r.permissions) WHERE value = 'users.manage')`).n;
const roleIsAdmin = (roleId) => parseJSON(get('SELECT permissions FROM roles WHERE id = ?', roleId)?.permissions, []).includes('users.manage');

r.patch('/users/:id', requirePerm('users.manage'), (req, res) => {
  const u = get('SELECT * FROM users WHERE id = ?', req.params.id);
  if (!u) return res.status(404).json({ error: 'Hittades inte' });
  const { name, email, role_id, active, password } = req.body || {};
  const losingAdmin = roleIsAdmin(u.role_id) && u.active && ((role_id && !roleIsAdmin(role_id)) || active === false);
  if (losingAdmin && adminCount() <= 1) return res.status(400).json({ error: 'Det måste finnas minst en aktiv administratör' });
  if (password && password.length < 8) return res.status(400).json({ error: 'Lösenordet måste vara minst 8 tecken' });
  // Namn, e-post och lösenord hör till kontot, som kan finnas i flera arbetsytor.
  const accountChange = (name?.trim() && name.trim() !== u.name) || (email?.trim() && email.trim().toLowerCase() !== u.email) || password;
  if (accountChange && !canManageAccount(req.user.id, u.id, can)) return res.status(403).json({ error: 'Kontot finns även i en arbetsyta du inte administrerar. Personen ändrar själv namn, e-post och lösenord.' });
  if (email?.trim() && central.get('SELECT 1 FROM users WHERE email = ? AND id != ?', email.trim(), u.id)) return res.status(409).json({ error: 'E-postadressen används redan' });
  if (role_id) run('UPDATE users SET role_id = ? WHERE id = ?', role_id, u.id);
  if (active != null) setMemberActive(u.id, active);
  if (name?.trim() || email?.trim()) updateAccountProfile(u.id, { name: name?.trim(), email: email?.trim().toLowerCase() });
  if (password) central.run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(password), u.id);
  if (active === false) run("UPDATE leads SET owner_id = NULL WHERE owner_id = ? AND status IN ('new','contacted')", u.id);
  audit(req.user.id, 'user.update', 'user', u.id, { role_id, active, passwordReset: !!password });
  res.json({ ok: true });
});

// ---------- Roller ----------
r.get('/roles', (req, res) => {
  res.json(all('SELECT r.*, (SELECT count(*) FROM users WHERE role_id = r.id) AS user_count FROM roles r ORDER BY r.id')
    .map((x) => ({ ...x, permissions: parseJSON(x.permissions, []) })));
});

r.post('/roles', requirePerm('users.manage'), (req, res) => {
  const { name, description, permissions = [] } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'Namn krävs' });
  if (get('SELECT 1 FROM roles WHERE name = ?', name.trim())) return res.status(409).json({ error: 'En roll med det namnet finns redan' });
  const ins = run('INSERT INTO roles (name, description, permissions) VALUES (?,?,?)', name.trim(), description || '',
    JSON.stringify(permissions.filter((p) => PERMISSION_KEYS.includes(p))));
  audit(req.user.id, 'role.create', 'role', Number(ins.lastInsertRowid), { name });
  res.status(201).json({ id: Number(ins.lastInsertRowid) });
});

r.patch('/roles/:id', requirePerm('users.manage'), (req, res) => {
  const role = get('SELECT * FROM roles WHERE id = ?', req.params.id);
  if (!role) return res.status(404).json({ error: 'Hittades inte' });
  const { name, description, permissions } = req.body || {};
  let perms = Array.isArray(permissions) ? permissions.filter((p) => PERMISSION_KEYS.includes(p)) : null;
  if (role.name === 'Administratör') perms = PERMISSION_KEYS; // administratören har alltid full behörighet
  run('UPDATE roles SET name = coalesce(?, name), description = coalesce(?, description), permissions = coalesce(?, permissions) WHERE id = ?',
    role.is_system ? null : name?.trim() || null, description ?? null, perms ? JSON.stringify(perms) : null, role.id);
  audit(req.user.id, 'role.update', 'role', role.id, { permissions: perms });
  res.json({ ok: true });
});

r.delete('/roles/:id', requirePerm('users.manage'), (req, res) => {
  const role = get('SELECT * FROM roles WHERE id = ?', req.params.id);
  if (!role || role.is_system) return res.status(400).json({ error: 'Systemroller kan inte raderas' });
  if (get('SELECT 1 FROM users WHERE role_id = ?', role.id)) return res.status(400).json({ error: 'Rollen används av användare' });
  run('DELETE FROM roles WHERE id = ?', role.id);
  audit(req.user.id, 'role.delete', 'role', role.id, { name: role.name });
  res.json({ ok: true });
});

// ---------- Automatiseringar ----------
const hydrateRule = (x) => ({ ...x, conditions: parseJSON(x.conditions, []), actions: parseJSON(x.actions, []), enabled: !!x.enabled });

r.get('/automations', (req, res) => res.json(all('SELECT * FROM automation_rules ORDER BY position, id').map(hydrateRule)));

r.post('/automations', requirePerm('automation.manage'), (req, res) => {
  const { name, match = 'all', conditions = [], actions = [], enabled = true } = req.body || {};
  if (!name?.trim() || !actions.length) return res.status(400).json({ error: 'Namn och minst en åtgärd krävs' });
  const pos = get('SELECT coalesce(max(position), 0) + 1 AS p FROM automation_rules').p;
  const ins = run('INSERT INTO automation_rules (name, match, conditions, actions, enabled, position) VALUES (?,?,?,?,?,?)',
    name.trim(), match === 'any' ? 'any' : 'all', JSON.stringify(conditions), JSON.stringify(actions), enabled ? 1 : 0, pos);
  audit(req.user.id, 'automation.create', 'automation', Number(ins.lastInsertRowid), { name });
  res.status(201).json(hydrateRule(get('SELECT * FROM automation_rules WHERE id = ?', ins.lastInsertRowid)));
});

r.patch('/automations/:id', requirePerm('automation.manage'), (req, res) => {
  const x = get('SELECT * FROM automation_rules WHERE id = ?', req.params.id);
  if (!x) return res.status(404).json({ error: 'Hittades inte' });
  const b = req.body || {};
  run('UPDATE automation_rules SET name = ?, match = ?, conditions = ?, actions = ?, enabled = ?, position = ? WHERE id = ?',
    b.name ?? x.name, b.match ?? x.match, b.conditions ? JSON.stringify(b.conditions) : x.conditions,
    b.actions ? JSON.stringify(b.actions) : x.actions, b.enabled == null ? x.enabled : b.enabled ? 1 : 0, b.position ?? x.position, x.id);
  audit(req.user.id, 'automation.update', 'automation', x.id);
  res.json(hydrateRule(get('SELECT * FROM automation_rules WHERE id = ?', x.id)));
});

r.delete('/automations/:id', requirePerm('automation.manage'), (req, res) => {
  run('DELETE FROM automation_rules WHERE id = ?', req.params.id);
  audit(req.user.id, 'automation.delete', 'automation', Number(req.params.id));
  res.json({ ok: true });
});

// ---------- Säkerhetskopior ----------
r.get('/admin/backups', requirePerm('users.manage'), (req, res) => res.json({ items: listBackups(), auto: PROD }));

// Laddar ned en färsk kopia av hela databasen (för att spara utanför servern).
r.get('/admin/backup', requirePerm('users.manage'), (req, res) => {
  const file = path.join(os.tmpdir(), `leadflow-${Date.now()}.db`);
  writeBackup(file);
  audit(req.user.id, 'backup.download', 'settings', null);
  res.download(file, `leadflow-${new Date().toISOString().slice(0, 10)}.db`, () => fs.rm(file, () => {}));
});

// ---------- Notiser & logg ----------
r.get('/notifications', (req, res) => {
  res.json({
    items: all('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 30', req.user.id),
    unread: get('SELECT count(*) AS n FROM notifications WHERE user_id = ? AND read = 0', req.user.id).n,
  });
});

r.post('/notifications/read', (req, res) => {
  run('UPDATE notifications SET read = 1 WHERE user_id = ?', req.user.id);
  res.json({ ok: true });
});

r.get('/audit', requirePerm('audit.view'), (req, res) => {
  res.json(all(`SELECT a.*, u.name AS user_name, u.color AS user_color FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
    ORDER BY a.id DESC LIMIT ? OFFSET ?`, Math.min(200, Number(req.query.limit || 100)), Number(req.query.offset || 0)));
});

export default r;
