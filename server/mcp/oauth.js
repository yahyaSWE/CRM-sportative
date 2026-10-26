// OAuth 2.1-server för AI-assistenter (t.ex. Claude) som kopplar in sig via MCP.
// Klienten registrerar sig själv (dynamisk registrering), användaren loggar in i LeadFlow och godkänner kopplingen
// på en egen sida, och klienten får sedan token som bara gäller för användarens eget konto och behörigheter.
// En koppling kan omfatta flera arbetsytor (bolag); användaren väljer vilka vid godkännandet.
import crypto from 'node:crypto';
import { Router } from 'express';
import { InvalidGrantError, InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import { central, audit, parseJSON, withWorkspace, currentWorkspaceId } from '../db.js';
import { loadUser, can, randomToken } from '../security.js';
import { isMember, accountWorkspaces } from '../accounts.js';

// OAuth-data ligger i kontodatabasen; en koppling är bunden till en användare och en eller flera arbetsytor.
const { all, get, run } = central;

export const SCOPES = ['crm'];
const ACCESS_TTL = 3600;              // sekunder
const REFRESH_TTL = 90 * 86400;       // en koppling som inte används på 90 dagar måste godkännas igen
const CODE_TTL = 300;
const REQUEST_TTL_MIN = 15;

const hash = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const now = () => Math.floor(Date.now() / 1000);
// Kopplingar från innan flera arbetsytor stöddes har bara workspace_id.
const workspacesOf = (row) => parseJSON(row.workspaces, null) || [row.workspace_id];

// Rensar gamla förfrågningar och koder, och klienter som registrerats men aldrig kopplats till ett konto.
function cleanup() {
  run("DELETE FROM oauth_requests WHERE created_at < datetime('now', ?)", `-${REQUEST_TTL_MIN} minutes`);
  run('DELETE FROM oauth_codes WHERE expires_at < ?', now());
  run('DELETE FROM oauth_tokens WHERE refresh_expires < ?', now());
  run(`DELETE FROM oauth_clients WHERE created_at < datetime('now', '-1 day')
    AND NOT EXISTS (SELECT 1 FROM oauth_tokens t WHERE t.client_id = oauth_clients.client_id)`);
}

const clientsStore = {
  getClient(clientId) {
    const row = get('SELECT info FROM oauth_clients WHERE client_id = ?', String(clientId));
    return row ? parseJSON(row.info, undefined) : undefined;
  },
  registerClient(client) {
    cleanup();
    run('INSERT INTO oauth_clients (client_id, info) VALUES (?, ?)', client.client_id, JSON.stringify(client));
    return client;
  },
};

function issueTokens(tokenRowId, { clientId, userId, workspaceId, workspaces, scopes, resource }) {
  const access = `lfa_${randomToken(32)}`;
  const refresh = `lfr_${randomToken(32)}`;
  const values = [hash(access), hash(refresh), JSON.stringify(scopes), resource ?? null, now() + ACCESS_TTL, now() + REFRESH_TTL];
  if (tokenRowId) run('UPDATE oauth_tokens SET access_hash = ?, refresh_hash = ?, scopes = ?, resource = ?, access_expires = ?, refresh_expires = ? WHERE id = ?', ...values, tokenRowId);
  else run('INSERT INTO oauth_tokens (access_hash, refresh_hash, scopes, resource, access_expires, refresh_expires, client_id, user_id, workspace_id, workspaces) VALUES (?,?,?,?,?,?,?,?,?,?)', ...values, clientId, userId, workspaceId, JSON.stringify(workspaces));
  return { access_token: access, token_type: 'Bearer', expires_in: ACCESS_TTL, refresh_token: refresh, scope: scopes.join(' ') };
}

// Användaren måste fortfarande vara aktiv medlem i arbetsytan och ha rätt att koppla AI-assistenter där.
const allowedUser = (userId, workspaceId) => {
  if (!isMember(userId, workspaceId)) return null;
  const user = withWorkspace(workspaceId, () => loadUser(userId));
  return user && can(user, 'ai.connect') ? user : null;
};
// De av kopplingens arbetsytor som användaren fortfarande får nå.
const allowedWorkspaces = (row) => workspacesOf(row).filter((ws) => allowedUser(row.user_id, ws));

export const provider = {
  clientsStore,

  // Förfrågan sparas och användaren skickas till godkännandesidan i appen (som visar inloggning vid behov).
  async authorize(client, params, res) {
    cleanup();
    const id = randomToken(24);
    run('INSERT INTO oauth_requests (id, client_id, params) VALUES (?, ?, ?)', id, client.client_id, JSON.stringify(params));
    res.redirect(`/oauth/consent?request=${encodeURIComponent(id)}`);
  },

  async challengeForAuthorizationCode(client, code) {
    const row = get('SELECT * FROM oauth_codes WHERE code_hash = ? AND client_id = ?', hash(code), client.client_id);
    if (!row || row.expires_at < now()) throw new InvalidGrantError('Invalid or expired authorization code');
    return row.code_challenge;
  },

  async exchangeAuthorizationCode(client, code, _verifier, redirectUri, resource) {
    const row = get('SELECT * FROM oauth_codes WHERE code_hash = ? AND client_id = ?', hash(code), client.client_id);
    // Koden går bara att använda en gång.
    run('DELETE FROM oauth_codes WHERE code_hash = ?', hash(code));
    if (!row || row.expires_at < now()) throw new InvalidGrantError('Invalid or expired authorization code');
    if (redirectUri && redirectUri !== row.redirect_uri) throw new InvalidGrantError('redirect_uri does not match');
    if (resource && row.resource && resource.href !== row.resource) throw new InvalidGrantError('resource does not match');
    const workspaces = allowedWorkspaces(row);
    if (!workspaces.length) throw new InvalidGrantError('The user can no longer connect AI assistants');
    return issueTokens(null, {
      clientId: client.client_id, userId: row.user_id, workspaceId: workspaces.includes(row.workspace_id) ? row.workspace_id : workspaces[0],
      workspaces, scopes: parseJSON(row.scopes, SCOPES), resource: row.resource,
    });
  },

  async exchangeRefreshToken(client, refreshToken, scopes) {
    const row = get('SELECT * FROM oauth_tokens WHERE refresh_hash = ? AND client_id = ?', hash(refreshToken), client.client_id);
    if (!row || row.refresh_expires < now()) throw new InvalidGrantError('Invalid or expired refresh token');
    if (!allowedWorkspaces(row).length) throw new InvalidGrantError('The user can no longer connect AI assistants');
    const granted = parseJSON(row.scopes, SCOPES);
    const next = scopes?.length ? scopes.filter((s) => granted.includes(s)) : granted;
    // Rotering: varje förnyelse ger ett nytt refresh-token och det gamla slutar gälla.
    return issueTokens(row.id, { scopes: next, resource: row.resource });
  },

  async verifyAccessToken(token) {
    const row = get('SELECT * FROM oauth_tokens WHERE access_hash = ?', hash(token));
    if (!row || row.access_expires < now()) throw new InvalidTokenError('Invalid or expired access token');
    const workspaces = allowedWorkspaces(row);
    if (!workspaces.length) throw new InvalidTokenError('The user can no longer connect AI assistants');
    run("UPDATE oauth_tokens SET last_used_at = datetime('now') WHERE id = ? AND (last_used_at IS NULL OR last_used_at < datetime('now', '-1 minute'))", row.id);
    return {
      token, clientId: row.client_id, scopes: parseJSON(row.scopes, SCOPES), expiresAt: row.access_expires,
      extra: { userId: row.user_id, workspaceId: workspaces.includes(row.workspace_id) ? row.workspace_id : workspaces[0], workspaces, connectionId: row.id },
    };
  },

  async revokeToken(client, { token }) {
    run('DELETE FROM oauth_tokens WHERE client_id = ? AND (access_hash = ? OR refresh_hash = ?)', client.client_id, hash(token), hash(token));
  },
};

const clientName = (clientId) => clientsStore.getClient(clientId)?.client_name || 'AI-assistent';
const workspaceNames = (ids) => ids.map((id) => get('SELECT name FROM workspaces WHERE id = ?', id)?.name).filter(Boolean);

// ---------- API för godkännandesidan och kopplingslistan (kräver inloggning) ----------
export const oauthApi = Router();

function loadRequest(req, res) {
  const row = get(`SELECT * FROM oauth_requests WHERE id = ? AND created_at >= datetime('now', ?)`, String(req.params.id), `-${REQUEST_TTL_MIN} minutes`);
  if (!row) { res.status(404).json({ error: 'Förfrågan har gått ut. Starta kopplingen igen från Claude.' }); return null; }
  return { ...row, params: parseJSON(row.params, {}), client: clientsStore.getClient(row.client_id) };
}

// Alla arbetsytor användaren är medlem i, och om kopplingen får omfatta dem (rätten att koppla AI per arbetsyta).
const consentWorkspaces = (userId) => accountWorkspaces(userId).map((w) => {
  const user = allowedUser(userId, w.id) || withWorkspace(w.id, () => loadUser(userId));
  return { id: w.id, name: w.name, role: user?.role || null, allowed: !!allowedUser(userId, w.id) };
});

oauthApi.get('/oauth/requests/:id', (req, res) => {
  const r = loadRequest(req, res);
  if (!r) return;
  const redirect = new URL(r.params.redirectUri);
  const workspaces = consentWorkspaces(req.user.id);
  res.json({
    client: { name: r.client?.client_name || 'AI-assistent', uri: r.client?.client_uri || null },
    redirectHost: redirect.host,
    allowed: workspaces.some((w) => w.allowed),
    user: { name: req.user.name, email: req.user.email, role: req.user.role },
    workspace: get('SELECT id, name FROM workspaces WHERE id = ?', currentWorkspaceId()),
    workspaces,
  });
});

oauthApi.post('/oauth/requests/:id', (req, res) => {
  const r = loadRequest(req, res);
  if (!r) return;
  const url = new URL(r.params.redirectUri);
  if (r.params.state) url.searchParams.set('state', r.params.state);
  // Valda arbetsytor (standard: den aktuella) – bara de där användaren får koppla AI.
  const requested = Array.isArray(req.body?.workspaces) ? req.body.workspaces.map(Number) : [currentWorkspaceId()];
  const workspaces = [...new Set(requested)].filter((id) => allowedUser(req.user.id, id));
  if (req.body?.approve && !workspaces.length) return res.status(400).json({ error: 'Välj minst en arbetsyta' });
  run('DELETE FROM oauth_requests WHERE id = ?', r.id);
  if (!req.body?.approve) {
    url.searchParams.set('error', 'access_denied');
    return res.json({ redirect: url.href });
  }
  const defaultWs = workspaces.includes(currentWorkspaceId()) ? currentWorkspaceId() : workspaces[0];
  const code = randomToken(32);
  run('INSERT INTO oauth_codes (code_hash, client_id, user_id, workspace_id, workspaces, redirect_uri, code_challenge, scopes, resource, expires_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
    hash(code), r.client_id, req.user.id, defaultWs, JSON.stringify(workspaces), r.params.redirectUri, r.params.codeChallenge,
    JSON.stringify(r.params.scopes?.length ? r.params.scopes : SCOPES), r.params.resource?.href ?? r.params.resource ?? null, now() + CODE_TTL);
  // Loggas i varje arbetsyta kopplingen omfattar.
  for (const ws of workspaces) withWorkspace(ws, () => audit(req.user.id, 'ai.connect', 'oauth_client', null, { client: r.client?.client_name || r.client_id, workspaces: workspaceNames(workspaces) }));
  url.searchParams.set('code', code);
  res.json({ redirect: url.href });
});

const inWorkspaceSql = "EXISTS (SELECT 1 FROM json_each(coalesce(t.workspaces, json_array(t.workspace_id))) WHERE value = ?)";

// Egna kopplingar – plus alla användares som når den aktuella arbetsytan, för den som hanterar användare.
oauthApi.get('/oauth/connections', (req, res) => {
  const everyone = can(req.user, 'users.manage') && req.query.all;
  const rows = all(`SELECT t.id, t.client_id, t.user_id, t.workspace_id, t.workspaces, t.created_at, t.last_used_at, u.name AS user_name
    FROM oauth_tokens t JOIN users u ON u.id = t.user_id
    WHERE t.user_id = ? ${everyone ? `OR ${inWorkspaceSql}` : ''} ORDER BY coalesce(t.last_used_at, t.created_at) DESC`, req.user.id, ...(everyone ? [currentWorkspaceId()] : []));
  res.json(rows.map(({ workspaces, ...r }) => ({ ...r, client_name: clientName(r.client_id), workspace_names: workspaceNames(workspacesOf({ workspaces, workspace_id: r.workspace_id })) })));
});

// Den som äger kopplingen tar bort den helt. En administratör tar bara bort den aktuella arbetsytan ur någon annans koppling.
oauthApi.delete('/oauth/connections/:id', (req, res) => {
  const t = get('SELECT * FROM oauth_tokens WHERE id = ?', Number(req.params.id));
  const ws = currentWorkspaceId();
  const own = t?.user_id === req.user.id;
  if (!t || (!own && !(can(req.user, 'users.manage') && workspacesOf(t).includes(ws)))) return res.status(404).json({ error: 'Hittades inte' });
  const rest = own ? [] : workspacesOf(t).filter((id) => id !== ws);
  if (rest.length) run('UPDATE oauth_tokens SET workspaces = ?, workspace_id = ? WHERE id = ?', JSON.stringify(rest), rest.includes(t.workspace_id) ? t.workspace_id : rest[0], t.id);
  else run('DELETE FROM oauth_tokens WHERE id = ?', t.id);
  audit(req.user.id, 'ai.disconnect', 'oauth_client', null, { client: clientName(t.client_id), user_id: t.user_id });
  res.json({ ok: true });
});
