import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { central, withWorkspace, forEachWorkspace, listWorkspaces, createWorkspace } from './db.js';
import { authenticate } from './middleware.js';
import { sseHandler } from './events.js';
import authRoutes from './routes/auth.js';
import leadRoutes from './routes/leads.js';
import adminRoutes from './routes/admin.js';
import { manage as integrationRoutes, webhooks } from './routes/integrations.js';
import prospectingRoutes from './routes/prospecting.js';
import companyRoutes from './routes/companies.js';
import salesRoutes, { publicQuotes } from './routes/sales.js';
import './services/companies.js';
import workspaceRoutes from './routes/workspaces.js';
import calendarRoutes from './routes/calendar.js';
import { tick as calendarTick } from './calendar/service.js';
import { startScheduler } from './integrations/scheduler.js';
import { scheduledTick as prospectingTick } from './prospecting/service.js';
import { seed } from './seed.js';
import { PROD, ADMIN_EMAIL, TRUST_PROXY, PORT } from './config.js';
import { dailyBackup } from './backup.js';
import { translateErrors } from './i18n.js';
import { mcpRoutes, oauthApi, setApiPort } from './mcp/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
// I produktion står appen bakom Renders proxy; antalet betrodda steg styrs av TRUST_PROXY (se config.js).
app.set('trust proxy', TRUST_PROXY);
app.disable('x-powered-by');

app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'SAMEORIGIN' });
  if (PROD) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

// Felmeddelanden översätts till användarens språk (svenska eller engelska).
app.use(translateErrors);

// Rå body sparas för verifiering av Metas webhook-signatur.
app.use(express.json({ limit: '2mb', verify: (req, _res, buf) => { req.rawBody = buf; } }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

app.use('/api/webhooks', webhooks);
app.use('/api/auth', authRoutes);
// Kalendern har två publika vägar (iCal-flöde och Googles OAuth-svar); resten kräver inloggning i routern.
app.use('/api', calendarRoutes);
// Kundens offertsida (öppnas via hemlig länk, utan inloggning).
app.use('/api/public', publicQuotes);
// ?ip=1 visar vilken IP appen ser för dig och hela X-Forwarded-For-kedjan – för att ställa in TRUST_PROXY.
app.get('/api/health', (req, res) => res.json(req.query.ip ? { ok: true, ip: req.ip, forwardedFor: req.get('x-forwarded-for') || null, trustProxy: TRUST_PROXY } : { ok: true }));

// MCP för Claude: OAuth-vägar i roten och själva servern på /mcp (egen token-autentisering).
app.use(mcpRoutes());

app.use('/api', authenticate);
app.get('/api/events', sseHandler);
app.use('/api', workspaceRoutes, oauthApi, leadRoutes, companyRoutes, salesRoutes, adminRoutes, integrationRoutes, prospectingRoutes);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Okänd endpoint' }));

const dist = path.join(__dirname, '..', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/.*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.status ? err.message : 'Ett oväntat fel inträffade' });
});

// Utveckling: tom installation får en demo-arbetsyta. Produktion: administratören och första arbetsytan skapas via setup-sidan.
if (!central.get('SELECT 1 FROM users LIMIT 1')) {
  if (PROD) {
    console.log(ADMIN_EMAIL ? `Inga användare än – öppna appen och skapa administratörskontot för ${ADMIN_EMAIL}.` : 'Inga användare än – sätt ADMIN_EMAIL och starta om för att kunna skapa administratörskontot.');
  } else withWorkspace(listWorkspaces()[0]?.id ?? createWorkspace('LeadFlow Demo'), () => seed());
}
// Öppnar alla arbetsytor direkt (kör deras migreringar) i stället för vid första förfrågan.
forEachWorkspace(() => {}, 'start');

app.listen(PORT, () => {
  console.log(`LeadFlow CRM API körs på http://localhost:${PORT}`);
  setApiPort(PORT);
  startScheduler();
  // Sparade sökningar körs veckovis, gammal Google-data rensas och avbruten berikning återupptas.
  const prospecting = () => forEachWorkspace(prospectingTick, 'prospektering');
  setTimeout(prospecting, 8000);
  setInterval(prospecting, 15 * 60000);
  // Mötespåminnelser, uppföljning och synk med Google Kalender varje minut.
  setInterval(() => forEachWorkspace(calendarTick, 'kalender'), 60000);
  // Daglig säkerhetskopia i produktion (kontrolleras varje timme).
  if (PROD) {
    const backup = () => { try { dailyBackup(); } catch (e) { console.error('[backup]', e); } };
    setTimeout(backup, 60000);
    setInterval(backup, 3600000);
  }
});
