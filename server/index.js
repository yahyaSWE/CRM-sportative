import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { get } from './db.js';
import { authenticate } from './middleware.js';
import { sseHandler } from './events.js';
import authRoutes from './routes/auth.js';
import leadRoutes from './routes/leads.js';
import adminRoutes from './routes/admin.js';
import { manage as integrationRoutes, webhooks } from './routes/integrations.js';
import prospectingRoutes from './routes/prospecting.js';
import { startScheduler } from './integrations/scheduler.js';
import { scheduledTick as prospectingTick } from './prospecting/service.js';
import { seed } from './seed.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.set('trust proxy', 'loopback');
app.disable('x-powered-by');

// Rå body sparas för verifiering av Metas webhook-signatur.
app.use(express.json({ limit: '2mb', verify: (req, _res, buf) => { req.rawBody = buf; } }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

app.use('/api/webhooks', webhooks);
app.use('/api/auth', authRoutes);
app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.use('/api', authenticate);
app.get('/api/events', sseHandler);
app.use('/api', leadRoutes, adminRoutes, integrationRoutes, prospectingRoutes);
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

if (!get('SELECT 1 FROM users LIMIT 1')) seed();

// API_PORT används i utveckling (Vite tar PORT); i produktion räcker PORT.
const PORT = Number(process.env.API_PORT || (process.argv.includes('--serve') && process.env.PORT) || 4000);
app.listen(PORT, () => {
  console.log(`LeadFlow CRM API körs på http://localhost:${PORT}`);
  startScheduler();
  // Sparade sökningar körs veckovis, gammal Google-data rensas och avbruten berikning återupptas.
  setTimeout(prospectingTick, 8000);
  setInterval(prospectingTick, 15 * 60000);
});
