import { loadUser, readSession, can } from './security.js';
import { requestContext } from './context.js';

export const COOKIE = 'lf_session';

export function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map((c) => c.trim().split('=')).filter(([k]) => k).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
}

export function authenticate(req, res, next) {
  const session = readSession(parseCookies(req.headers.cookie)[COOKIE]);
  const user = session && loadUser(session.uid);
  if (!user) return res.status(401).json({ error: 'Inte inloggad' });
  req.user = user;
  // Anrop som MCP-kopplingen gör åt användaren bär via: 'claude' – det märker loggen och tidslinjen.
  if (session.via) { req.via = session.via; return requestContext.run({ via: session.via, clientId: session.cid }, next); }
  next();
}

export const requirePerm = (...perms) => (req, res, next) =>
  perms.every((p) => can(req.user, p)) ? next() : res.status(403).json({ error: 'Du saknar behörighet för detta' });

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
