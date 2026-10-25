// MCP-server för Claude och andra AI-assistenter: OAuth-inloggning med LeadFlow-kontot och verktyg på /mcp.
// Lägg till i Claude som anpassad connector med adressen <PUBLIC_URL>/mcp.
import { Router } from 'express';
import { mcpAuthRouter, getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { provider, SCOPES } from './oauth.js';
import { buildServer } from './tools.js';
import { requestContext } from '../context.js';
import { APP_URL } from '../config.js';
import { withWorkspace } from '../db.js';

export { oauthApi } from './oauth.js';
export { setApiPort } from './tools.js';

export function mcpRoutes() {
  const base = new URL(APP_URL);
  const mcpUrl = new URL('/mcp', base);
  const router = Router();

  // /authorize, /token, /register, /revoke och metadata under /.well-known (måste ligga i roten).
  router.use(mcpAuthRouter({
    provider, issuerUrl: base, resourceServerUrl: mcpUrl, scopesSupported: SCOPES,
    resourceName: 'LeadFlow CRM', serviceDocumentationUrl: new URL('/settings', base),
  }));

  const bearer = requireBearerAuth({ verifier: provider, requiredScopes: SCOPES, resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(mcpUrl) });

  // Tillståndslöst läge: varje anrop får en egen server byggd för användaren som token tillhör.
  router.post('/mcp', bearer, async (req, res) => {
    const server = withWorkspace(req.auth.extra.workspaceId, () => buildServer(req.auth));
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => { transport.close(); server.close(); });
    try {
      await server.connect(transport);
      await requestContext.run({ via: 'claude', clientId: req.auth.clientId }, () => transport.handleRequest(req, res, req.body));
    } catch (e) {
      console.error('[mcp]', e);
      if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
    }
  });
  const notAllowed = (_req, res) => res.status(405).set('Allow', 'POST').json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed' }, id: null });
  router.get('/mcp', bearer, notAllowed);
  router.delete('/mcp', bearer, notAllowed);
  return router;
}
