import { loadUser, readSession, can } from './security.js';
import { requestContext } from './context.js';
import { withWorkspace } from './db.js';
import { getAccount, pickWorkspace } from './accounts.js';

export const COOKIE = 'lf_session';

export function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map((c) => c.trim().split('=')).filter(([k]) => k).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
}

// Inloggningen gäller kontot; resten av förfrågan körs i den arbetsyta användaren valt (eller som en
// MCP-koppling är bunden till), så att alla databasanrop går till rätt bolags data.
export function authenticate(req, res, next) {
  const session = readSession(parseCookies(req.headers.cookie)[COOKIE]);
  const account = session && getAccount(session.uid);
  if (!account?.active) return res.status(401).json({ error: 'Inte inloggad' });
  const workspaceId = pickWorkspace(account, session.ws);
  if (!workspaceId || (session.ws && workspaceId !== session.ws)) return res.status(403).json({ error: 'Du har inte tillgång till någon arbetsyta' });
  withWorkspace(workspaceId, () => {
    const user = loadUser(account.id);
    if (!user) return res.status(401).json({ error: 'Inte inloggad' });
    req.user = user;
    // Anrop som MCP-kopplingen gör åt användaren bär via: 'claude' – det märker loggen och tidslinjen.
    if (session.via) { req.via = session.via; return requestContext.run({ via: session.via, clientId: session.cid }, next); }
    next();
  });
}

export const requirePerm = (...perms) => (req, res, next) =>
  perms.every((p) => can(req.user, p)) ? next() : res.status(403).json({ error: 'Du saknar behörighet för detta' });

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
