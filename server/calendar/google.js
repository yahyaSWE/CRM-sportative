// Google Kalender: OAuth per användare och anrop mot Calendar API v3.
import crypto from 'node:crypto';
import { get, run } from '../db.js';
import { encrypt, decrypt } from '../security.js';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://www.googleapis.com/calendar/v3';
const SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/calendar.events'];
const CONFIG_KEY = 'calendar:google';

export const getAppConfig = () => decrypt(get('SELECT value FROM settings WHERE key = ?', CONFIG_KEY)?.value);
export function saveAppConfig({ clientId, clientSecret }) {
  const cfg = { ...getAppConfig() };
  if (clientId !== undefined) cfg.clientId = clientId.trim();
  if (clientSecret && clientSecret !== '••••••••') cfg.clientSecret = clientSecret.trim();
  run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', CONFIG_KEY, encrypt(cfg));
  return cfg;
}
export const isConfigured = () => { const c = getAppConfig(); return !!(c.clientId && c.clientSecret); };

export function authUrl(redirectUri, state) {
  const { clientId } = getAppConfig();
  const p = new URLSearchParams({
    client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: SCOPES.join(' '),
    access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state,
  });
  return `${AUTH_URL}?${p}`;
}

async function tokenRequest(params) {
  const { clientId, clientSecret } = getAppConfig();
  const res = await fetch(TOKEN_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...params }),
    signal: AbortSignal.timeout(15000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.error_description || body.error || `Google svarade ${res.status}`), { code: body.error });
  return body;
}

export async function connectAccount(userId, code, redirectUri) {
  const t = await tokenRequest({ code, redirect_uri: redirectUri, grant_type: 'authorization_code' });
  if (!t.refresh_token) throw new Error('Google gav ingen offline-åtkomst. Ta bort LeadFlow under myaccount.google.com/permissions och försök igen.');
  const info = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${t.access_token}` } }).then((r) => r.json()).catch(() => ({}));
  const tokens = { refresh: t.refresh_token, access: t.access_token, exp: Date.now() + (t.expires_in - 60) * 1000 };
  run(`INSERT INTO google_accounts (user_id, email, tokens) VALUES (?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET email = excluded.email, tokens = excluded.tokens, last_error = NULL, last_sync_at = NULL, connected_at = datetime('now')`,
    userId, info.email || null, encrypt(tokens));
  return info.email;
}

export async function disconnectAccount(userId) {
  const acc = get('SELECT * FROM google_accounts WHERE user_id = ?', userId);
  if (!acc) return;
  const { refresh } = decrypt(acc.tokens);
  if (refresh) await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refresh)}`, { method: 'POST' }).catch(() => {});
  run('DELETE FROM google_accounts WHERE user_id = ?', userId);
  // Mötena finns kvar i CRM:et men kopplas loss från Google.
  run('UPDATE meetings SET google_event_id = NULL, google_updated = NULL WHERE owner_id = ?', userId);
}

async function accessToken(userId) {
  const acc = get('SELECT * FROM google_accounts WHERE user_id = ?', userId);
  if (!acc) return null;
  const tokens = decrypt(acc.tokens);
  if (tokens.access && tokens.exp > Date.now()) return { token: tokens.access, acc };
  try {
    const t = await tokenRequest({ refresh_token: tokens.refresh, grant_type: 'refresh_token' });
    const next = { ...tokens, access: t.access_token, exp: Date.now() + (t.expires_in - 60) * 1000 };
    run('UPDATE google_accounts SET tokens = ? WHERE user_id = ?', encrypt(next), userId);
    return { token: next.access, acc };
  } catch (e) {
    if (e.code === 'invalid_grant') run("UPDATE google_accounts SET last_error = 'Kopplingen har gått ut – koppla Google Kalender igen' WHERE user_id = ?", userId);
    throw e;
  }
}

export async function api(userId, method, path, { query, body } = {}) {
  const auth = await accessToken(userId);
  if (!auth) return null;
  const url = new URL(`${API}/calendars/${encodeURIComponent(auth.acc.calendar_id)}${path}`);
  for (const [k, v] of Object.entries(query || {})) if (v != null) url.searchParams.set(k, String(v));
  const res = await fetch(url, {
    method, headers: { Authorization: `Bearer ${auth.token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000),
  });
  if (res.status === 204 || (method === 'DELETE' && [404, 410].includes(res.status))) return {};
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error?.message || `Google Kalender svarade ${res.status}`), { status: res.status });
  return data;
}

export const newRequestId = () => crypto.randomUUID();
