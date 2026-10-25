import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, get, run } from './db.js';

// En lokal hemlig nyckel används för att signera sessioner och kryptera integrationsuppgifter.
const keyFile = path.join(DATA_DIR, 'secret.key');
if (!process.env.APP_SECRET && !fs.existsSync(keyFile)) {
  fs.writeFileSync(keyFile, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
}
// 64 hextecken används som de är; annan text (t.ex. Renders base64-genererade värde) hashas till 32 byte.
const rawSecret = process.env.APP_SECRET || fs.readFileSync(keyFile, 'utf8').trim();
const SECRET = /^[0-9a-fA-F]{64}$/.test(rawSecret) ? Buffer.from(rawSecret, 'hex') : crypto.createHash('sha256').update(rawSecret).digest();
const ENC_KEY = crypto.createHash('sha256').update(Buffer.concat([SECRET, Buffer.from('enc')])).digest();

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  const [, saltHex, hashHex] = String(stored).split('$');
  if (!saltHex || !hashHex) return false;
  const hash = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), 64);
  return crypto.timingSafeEqual(hash, Buffer.from(hashHex, 'hex'));
}

const b64url = (buf) => Buffer.from(buf).toString('base64url');

// extra: t.ex. { via: 'claude' } för de interna anrop som MCP-kopplingen gör åt användaren.
export function signSession(userId, days = 7, extra = {}) {
  const payload = b64url(JSON.stringify({ ...extra, uid: userId, exp: Date.now() + days * 864e5 }));
  const sig = b64url(crypto.createHmac('sha256', SECRET).update(payload).digest());
  return `${payload}.${sig}`;
}

export function readSession(token) {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expected = b64url(crypto.createHmac('sha256', SECRET).update(payload).digest());
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return data.exp > Date.now() ? data : null;
  } catch { return null; }
}

export function encrypt(obj) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENC_KEY, iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(obj), 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${enc.toString('hex')}`;
}

export function decrypt(str) {
  if (!str) return {};
  try {
    const [iv, tag, data] = str.split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', ENC_KEY, Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(tag, 'hex'));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data, 'hex')), decipher.final()]).toString('utf8'));
  } catch { return {}; }
}

export const randomToken = (bytes = 18) => crypto.randomBytes(bytes).toString('base64url');

// ---------- Behörigheter ----------
export const PERMISSIONS = [
  { key: 'leads.view_all', group: 'Leads & affärer', label: 'Se alla leads och affärer' },
  { key: 'leads.edit_own', group: 'Leads & affärer', label: 'Skapa och redigera egna leads' },
  { key: 'leads.edit_all', group: 'Leads & affärer', label: 'Redigera alla leads' },
  { key: 'leads.assign', group: 'Leads & affärer', label: 'Tilldela leads till andra' },
  { key: 'leads.delete', group: 'Leads & affärer', label: 'Radera leads' },
  { key: 'leads.export', group: 'Leads & affärer', label: 'Exportera data' },
  { key: 'prospecting.use', group: 'Leads & affärer', label: 'Söka och importera nya företag (prospektering)' },
  { key: 'products.manage', group: 'Leads & affärer', label: 'Hantera produkter, priser och offertinställningar' },
  { key: 'reports.view', group: 'Rapporter', label: 'Se rapporter och teamstatistik' },
  { key: 'integrations.manage', group: 'Administration', label: 'Hantera integrationer' },
  { key: 'automation.manage', group: 'Administration', label: 'Hantera automatiseringar' },
  { key: 'users.manage', group: 'Administration', label: 'Hantera användare och roller' },
  { key: 'audit.view', group: 'Administration', label: 'Se aktivitetslogg' },
  { key: 'ai.connect', group: 'Administration', label: 'Koppla Claude och andra AI-assistenter (MCP)' },
];
export const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key);

// Nya behörigheter: administratören får alltid alla, säljchefen får de nya första gången de finns.
{
  run('UPDATE roles SET permissions = ? WHERE name = ?', JSON.stringify(PERMISSION_KEYS), 'Administratör');
  // AI-kopplingen ges till alla standardroller; vad assistenten får göra styrs ändå av rollens övriga behörigheter.
  const NEW = { 'prospecting.use': ['Säljchef'], 'products.manage': ['Säljchef'], 'ai.connect': ['Säljchef', 'Säljare', 'Läsbehörighet'] };
  for (const [key, roleNames] of Object.entries(NEW)) {
    if (get('SELECT 1 FROM settings WHERE key = ?', `migrated:${key}`)) continue;
    for (const name of roleNames) {
      const role = get('SELECT * FROM roles WHERE name = ?', name);
      if (!role) continue;
      const perms = JSON.parse(role.permissions || '[]');
      if (!perms.includes(key)) run('UPDATE roles SET permissions = ? WHERE id = ?', JSON.stringify([...perms, key]), role.id);
    }
    run('INSERT INTO settings (key, value) VALUES (?, ?)', `migrated:${key}`, '1');
  }
}

export function loadUser(userId) {
  const u = get(`SELECT u.id, u.name, u.email, u.active, u.color, u.language, u.role_id, r.name AS role, r.permissions
                 FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?`, userId);
  if (!u || !u.active) return null;
  u.permissions = JSON.parse(u.permissions || '[]');
  return u;
}

export const can = (user, perm) => !!user?.permissions?.includes(perm);
