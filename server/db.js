import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AsyncLocalStorage } from 'node:async_hooks';
import { currentVia } from './context.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

// Skapar och migrerar en arbetsytas databas.
function initSchema(db) {
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

  db.exec(`
  CREATE TABLE IF NOT EXISTS roles (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    permissions TEXT NOT NULL DEFAULT '[]',
    is_system INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role_id INTEGER NOT NULL REFERENCES roles(id),
    active INTEGER NOT NULL DEFAULT 1,
    color TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_login_at TEXT
  );
  CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY,
    first_name TEXT, last_name TEXT,
    email TEXT COLLATE NOCASE, phone TEXT,
    company TEXT, title TEXT, city TEXT,
    source TEXT NOT NULL DEFAULT 'manual',
    source_detail TEXT,
    external_id TEXT,
    status TEXT NOT NULL DEFAULT 'new',
    score INTEGER NOT NULL DEFAULT 0,
    owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    tags TEXT NOT NULL DEFAULT '[]',
    message TEXT,
    fields TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_activity_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE UNIQUE INDEX IF NOT EXISTS leads_external ON leads(source, external_id) WHERE external_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS leads_email ON leads(email);
  CREATE INDEX IF NOT EXISTS leads_owner ON leads(owner_id);
  CREATE TABLE IF NOT EXISTS deals (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    value REAL NOT NULL DEFAULT 0,
    stage TEXT NOT NULL DEFAULT 'qualified',
    lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
    owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    expected_close TEXT,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    closed_at TEXT
  );
  CREATE TABLE IF NOT EXISTS activities (
    id INTEGER PRIMARY KEY,
    lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE,
    deal_id INTEGER REFERENCES deals(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    type TEXT NOT NULL,
    content TEXT,
    due_at TEXT,
    done INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS activities_lead ON activities(lead_id);
  CREATE TABLE IF NOT EXISTS integrations (
    id INTEGER PRIMARY KEY,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    config TEXT NOT NULL DEFAULT '',
    enabled INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'idle',
    last_sync_at TEXT,
    last_error TEXT,
    leads_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS automation_rules (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    match TEXT NOT NULL DEFAULT 'all',
    conditions TEXT NOT NULL DEFAULT '[]',
    actions TEXT NOT NULL DEFAULT '[]',
    position INTEGER NOT NULL DEFAULT 0,
    runs INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS ingest_log (
    id INTEGER PRIMARY KEY,
    integration_id INTEGER REFERENCES integrations(id) ON DELETE SET NULL,
    source TEXT NOT NULL,
    result TEXT NOT NULL,
    lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
    summary TEXT,
    payload TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    link TEXT,
    read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity TEXT,
    entity_id INTEGER,
    details TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
  `);

  db.exec(`
  CREATE TABLE IF NOT EXISTS prospect_searches (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    query TEXT NOT NULL,
    location TEXT,
    filters TEXT NOT NULL DEFAULT '{}',
    schedule TEXT NOT NULL DEFAULT 'none',
    status TEXT NOT NULL DEFAULT 'idle',
    last_error TEXT,
    last_run_at TEXT,
    found_count INTEGER NOT NULL DEFAULT 0,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS prospects (
    id INTEGER PRIMARY KEY,
    search_id INTEGER REFERENCES prospect_searches(id) ON DELETE SET NULL,
    place_id TEXT NOT NULL UNIQUE,
    name TEXT, category TEXT, address TEXT, city TEXT,
    phone TEXT, website TEXT, email TEXT, org_nr TEXT,
    rating REAL, reviews INTEGER, maps_url TEXT, business_status TEXT,
    company TEXT NOT NULL DEFAULT '{}',
    enrich_status TEXT NOT NULL DEFAULT 'pending',
    enrich_note TEXT,
    status TEXT NOT NULL DEFAULT 'new',
    duplicate_lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
    lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
    demo INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS prospects_search ON prospects(search_id, status);
  `);

  db.exec(`
  CREATE TABLE IF NOT EXISTS meetings (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    location TEXT,
    video_url TEXT,
    start_at TEXT NOT NULL,
    end_at TEXT NOT NULL,
    all_day INTEGER NOT NULL DEFAULT 0,
    owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
    deal_id INTEGER REFERENCES deals(id) ON DELETE SET NULL,
    attendees TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'scheduled',
    outcome TEXT,
    source TEXT NOT NULL DEFAULT 'crm',
    reminder_sent INTEGER NOT NULL DEFAULT 0,
    followup_sent INTEGER NOT NULL DEFAULT 0,
    google_event_id TEXT,
    google_updated TEXT,
    sync_error TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS meetings_owner_start ON meetings(owner_id, start_at);
  CREATE UNIQUE INDEX IF NOT EXISTS meetings_google ON meetings(owner_id, google_event_id) WHERE google_event_id IS NOT NULL;
  CREATE TABLE IF NOT EXISTS google_accounts (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    email TEXT,
    tokens TEXT NOT NULL,
    calendar_id TEXT NOT NULL DEFAULT 'primary',
    last_sync_at TEXT,
    last_error TEXT,
    connected_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  `);

  db.exec(`
  CREATE TABLE IF NOT EXISTS companies (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    org_nr TEXT,
    website TEXT,
    domain TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    city TEXT,
    industry TEXT,
    owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE UNIQUE INDEX IF NOT EXISTS companies_org ON companies(org_nr) WHERE org_nr IS NOT NULL;
  CREATE INDEX IF NOT EXISTS companies_domain ON companies(domain);
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    sku TEXT,
    description TEXT,
    unit TEXT NOT NULL DEFAULT 'st',
    price REAL NOT NULL DEFAULT 0,
    vat_rate REAL NOT NULL DEFAULT 25,
    recurring TEXT NOT NULL DEFAULT 'none',
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS deal_items (
    id INTEGER PRIMARY KEY,
    deal_id INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    description TEXT,
    quantity REAL NOT NULL DEFAULT 1,
    unit TEXT NOT NULL DEFAULT 'st',
    unit_price REAL NOT NULL DEFAULT 0,
    discount REAL NOT NULL DEFAULT 0,
    vat_rate REAL NOT NULL DEFAULT 25,
    recurring TEXT NOT NULL DEFAULT 'none',
    position INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS deal_items_deal ON deal_items(deal_id);
  CREATE TABLE IF NOT EXISTS quotes (
    id INTEGER PRIMARY KEY,
    deal_id INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
    number TEXT NOT NULL UNIQUE,
    token TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'draft',
    title TEXT NOT NULL,
    intro TEXT,
    terms TEXT,
    valid_until TEXT,
    recipient_name TEXT,
    recipient_email TEXT,
    content TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    total REAL NOT NULL DEFAULT 0,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    sent_at TEXT,
    viewed_at TEXT,
    view_count INTEGER NOT NULL DEFAULT 0,
    signed_at TEXT,
    signer_name TEXT,
    signer_email TEXT,
    signer_title TEXT,
    signer_ip TEXT,
    signer_agent TEXT,
    signature TEXT,
    declined_at TEXT,
    decline_reason TEXT
  );
  CREATE INDEX IF NOT EXISTS quotes_deal ON quotes(deal_id);
  CREATE TABLE IF NOT EXISTS templates (
    id INTEGER PRIMARY KEY,
    type TEXT NOT NULL DEFAULT 'email',
    name TEXT NOT NULL,
    subject TEXT,
    body TEXT NOT NULL DEFAULT '',
    use_count INTEGER NOT NULL DEFAULT 0,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  `);

  // Enkla migreringar för databaser som skapades innan kolumnerna fanns.
  function addColumn(table, column, def) {
    if (!db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
  }
  addColumn('deals', 'lost_reason', 'TEXT');
  addColumn('deals', 'stage_changed_at', 'TEXT');
  addColumn('users', 'ical_token', 'TEXT');
  addColumn('users', 'language', "TEXT NOT NULL DEFAULT 'sv'");
  addColumn('leads', 'company_id', 'INTEGER REFERENCES companies(id) ON DELETE SET NULL');
  addColumn('deals', 'company_id', 'INTEGER REFERENCES companies(id) ON DELETE SET NULL');
  addColumn('activities', 'company_id', 'INTEGER REFERENCES companies(id) ON DELETE CASCADE');
  db.exec('CREATE INDEX IF NOT EXISTS leads_company ON leads(company_id); CREATE INDEX IF NOT EXISTS deals_company ON deals(company_id)');
  db.exec("UPDATE deals SET stage_changed_at = coalesce(closed_at, updated_at, created_at) WHERE stage_changed_at IS NULL");
  db.exec('CREATE INDEX IF NOT EXISTS activities_deal ON activities(deal_id)');

  // SQLite:s lower() hanterar bara ASCII – den här klarar å, ä och ö så att sökningar blir skiftlägesokänsliga.
  db.function('sv_lower', { deterministic: true }, (s) => (s == null ? null : String(s).toLowerCase()));

  // Aktiviteter som skapas genom en AI-koppling märks "via Claude" i tidslinjen, oavsett vilken kod som skapar dem.
  addColumn('activities', 'via', 'TEXT');
  addColumn('google_accounts', 'scopes', 'TEXT');
  // Gmails tråd-id för skickade mejl (för att kunna koppla svar senare).
  addColumn('activities', 'email_thread_id', 'TEXT');
  // Berikning av företag (sammanfattning, fakta, säljvinkel och källor) som JSON.
  addColumn('companies', 'enrichment', 'TEXT');
  // Inköpsinformation (beslutsfattare, materialansvarig, leverantör, avtalsutgång, nästa inköp) som JSON.
  addColumn('companies', 'purchasing', 'TEXT');
  // Utfall för samtal och mejl: 'answered' (svarade), 'no_answer' (inget svar) eller NULL (inväntar svar / ej angivet).
  addColumn('activities', 'outcome', 'TEXT');

  // Uppföljningsrytm för kontaktade leads: senaste kontaktförsöket och antal uppföljningar sedan första kontakten.
  // Hålls i synk av databasen själv, så att det stämmer oavsett var en kontakt loggas (appen, Gmail, Claude, kalendern).
  addColumn('leads', 'followup_last_at', 'TEXT');
  addColumn('leads', 'followup_attempts', 'INTEGER NOT NULL DEFAULT 0');
  db.exec(`
  CREATE TRIGGER IF NOT EXISTS leads_followup_contact AFTER INSERT ON activities
  WHEN NEW.lead_id IS NOT NULL AND NEW.type IN ('call', 'email', 'meeting')
  BEGIN
    UPDATE leads SET followup_attempts = CASE WHEN followup_last_at IS NULL THEN 0 ELSE followup_attempts + 1 END, followup_last_at = NEW.created_at
    WHERE id = NEW.lead_id AND status IN ('new', 'contacted');
  END;
  CREATE TRIGGER IF NOT EXISTS leads_followup_status AFTER UPDATE OF status ON leads
  WHEN NEW.status IS NOT OLD.status
  BEGIN
    UPDATE leads SET followup_attempts = 0, followup_last_at = CASE WHEN NEW.status = 'contacted' THEN coalesce(OLD.followup_last_at, datetime('now')) ELSE NULL END
    WHERE id = NEW.id;
  END;`);
  // Kontaktade leads från innan rytmen fanns räknas från senaste kontakten.
  db.exec(`UPDATE leads SET followup_last_at = coalesce((SELECT max(a.created_at) FROM activities a WHERE a.lead_id = leads.id AND a.type IN ('call', 'email', 'meeting')), updated_at)
    WHERE status = 'contacted' AND followup_last_at IS NULL`);
  db.function('current_via', () => currentVia());
  db.exec(`CREATE TRIGGER IF NOT EXISTS activities_via AFTER INSERT ON activities WHEN current_via() IS NOT NULL
    BEGIN UPDATE activities SET via = current_via() WHERE id = NEW.id; END`);
  // OAuth-tabellerna ligger i kontodatabasen.
  db.exec('DROP TABLE IF EXISTS oauth_tokens; DROP TABLE IF EXISTS oauth_codes; DROP TABLE IF EXISTS oauth_requests; DROP TABLE IF EXISTS oauth_clients;');
}

// ---------- Kontodatabasen ----------
// Gemensam för alla arbetsytor: konton (inloggning), arbetsytor, medlemskap och OAuth för AI-assistenter.
// Varje arbetsyta har en spegel av sina medlemmar i sin egen users-tabell (namn, roll, aktiv), så att
// frågor med JOIN users fungerar som förut; lösenord och språk finns bara här.
const accountsDb = new DatabaseSync(path.join(DATA_DIR, 'accounts.db'));
accountsDb.exec(`
PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS workspaces (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  file TEXT NOT NULL UNIQUE,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'sv',
  color TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  workspace_id INTEGER REFERENCES workspaces(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT
);
CREATE TABLE IF NOT EXISTS memberships (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, workspace_id)
);
CREATE TABLE IF NOT EXISTS oauth_clients (
  client_id TEXT PRIMARY KEY,
  info TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS oauth_requests (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
  params TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS oauth_codes (
  code_hash TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  redirect_uri TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  scopes TEXT NOT NULL DEFAULT '[]',
  resource TEXT,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS oauth_tokens (
  id INTEGER PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  access_hash TEXT UNIQUE,
  refresh_hash TEXT UNIQUE,
  scopes TEXT NOT NULL DEFAULT '[]',
  resource TEXT,
  access_expires INTEGER,
  refresh_expires INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT
);
CREATE INDEX IF NOT EXISTS oauth_tokens_user ON oauth_tokens(user_id);
`);
export const central = {
  db: accountsDb,
  all: (sql, ...p) => accountsDb.prepare(sql).all(...p),
  get: (sql, ...p) => accountsDb.prepare(sql).get(...p),
  run: (sql, ...p) => accountsDb.prepare(sql).run(...p),
  tx: (fn) => transaction(accountsDb, fn),
};
// En AI-koppling kan nå flera arbetsytor: workspaces är en JSON-lista, workspace_id är standardarbetsytan.
for (const table of ['oauth_codes', 'oauth_tokens']) {
  if (!accountsDb.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === 'workspaces')) accountsDb.exec(`ALTER TABLE ${table} ADD COLUMN workspaces TEXT`);
}

// En befintlig installation (en enda databas, crm.db) blir arbetsyta 1 och dess användare blir konton.
if (!central.get('SELECT 1 FROM workspaces LIMIT 1') && fs.existsSync(path.join(DATA_DIR, 'crm.db'))) {
  const legacy = new DatabaseSync(path.join(DATA_DIR, 'crm.db'));
  const hasUsers = legacy.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'users'").get()
    && legacy.prepare('SELECT 1 FROM users LIMIT 1').get();
  if (hasUsers) {
    const profile = legacy.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'settings'").get()
      && legacy.prepare("SELECT value FROM settings WHERE key = 'sales:profile'").get();
    let name = 'Mitt företag';
    try { name = JSON.parse(profile?.value || '{}').name || name; } catch { /* standardnamnet */ }
    const users = legacy.prepare('SELECT * FROM users').all();
    central.tx(() => {
      central.run('INSERT INTO workspaces (id, name, file) VALUES (1, ?, ?)', name, 'crm.db');
      for (const u of users) {
        central.run('INSERT INTO users (id, name, email, password_hash, language, color, active, workspace_id, created_at, last_login_at) VALUES (?,?,?,?,?,?,1,1,?,?)',
          u.id, u.name, u.email, u.password_hash, u.language || 'sv', u.color, u.created_at, u.last_login_at);
        central.run('INSERT INTO memberships (user_id, workspace_id, active) VALUES (?, 1, ?)', u.id, u.active);
      }
    });
    // Lösenorden i crm.db lämnas orörda (används inte längre) så att en äldre version fortfarande kan startas.
    console.log(`[migrering] ${users.length} användare flyttade till kontodatabasen; crm.db är arbetsytan "${name}".`);
  }
  legacy.close();
}

// ---------- Arbetsytor ----------
// Varje arbetsyta (ett eget bolag) har en egen databasfil med alla CRM-data, inställningar och integrationer.
// Vilken som används styrs av förfrågan (AsyncLocalStorage), så övrig kod använder all/get/run som vanligt.
const workspaceContext = new AsyncLocalStorage();
const open = new Map();
const initHooks = [];

/** Körs i varje arbetsyta när dess databas öppnas första gången (migreringar som behöver data). */
export const onWorkspaceOpen = (fn) => initHooks.push(fn);

function workspaceDb(id) {
  if (open.has(id)) return open.get(id);
  const ws = central.get('SELECT * FROM workspaces WHERE id = ?', id);
  if (!ws) throw new Error(`Arbetsytan ${id} finns inte`);
  const conn = new DatabaseSync(path.join(DATA_DIR, ws.file));
  initSchema(conn);
  open.set(id, conn);
  workspaceContext.run({ id, db: conn }, () => { for (const fn of initHooks) fn(); });
  return conn;
}

export const withWorkspace = (id, fn) => workspaceContext.run({ id: Number(id), db: workspaceDb(Number(id)) }, fn);
export const currentWorkspaceId = () => workspaceContext.getStore()?.id ?? null;
export const listWorkspaces = () => central.all('SELECT * FROM workspaces ORDER BY id');
export const workspaceFile = (id) => path.join(DATA_DIR, central.get('SELECT file FROM workspaces WHERE id = ?', id).file);

/** Kör fn i varje arbetsyta (schemalagda jobb). Fel i en arbetsyta stoppar inte de andra. */
export function forEachWorkspace(fn, label = 'jobb') {
  for (const ws of listWorkspaces()) {
    try {
      const r = withWorkspace(ws.id, fn);
      if (r?.catch) r.catch((e) => console.error(`[${label}] arbetsyta ${ws.id}`, e));
    } catch (e) { console.error(`[${label}] arbetsyta ${ws.id}`, e); }
  }
}

/** Hittar arbetsytan där test() är sant – för publika länkar och webhooks som bara har en token. */
export function findWorkspace(test) {
  for (const ws of listWorkspaces()) if (withWorkspace(ws.id, test)) return ws.id;
  return null;
}

export function currentDb() {
  const store = workspaceContext.getStore();
  if (!store) throw new Error('Ingen arbetsyta vald för databasanropet');
  return store.db;
}

export function createWorkspace(name, createdBy = null) {
  fs.mkdirSync(path.join(DATA_DIR, 'workspaces'), { recursive: true });
  const id = Number(central.run('INSERT INTO workspaces (name, file, created_by) VALUES (?, ?, ?)', name, `pending-${crypto.randomUUID()}`, createdBy).lastInsertRowid);
  central.run('UPDATE workspaces SET file = ? WHERE id = ?', path.join('workspaces', `ws-${id}.db`), id);
  workspaceDb(id);
  return id;
}

export const all = (sql, ...p) => currentDb().prepare(sql).all(...p);
export const get = (sql, ...p) => currentDb().prepare(sql).get(...p);
export const run = (sql, ...p) => currentDb().prepare(sql).run(...p);

function transaction(conn, fn) {
  conn.exec('BEGIN');
  try {
    const r = fn();
    conn.exec('COMMIT');
    return r;
  } catch (e) {
    conn.exec('ROLLBACK');
    throw e;
  }
}
export const tx = (fn) => transaction(currentDb(), fn);

export const parseJSON = (s, fallback) => {
  try { return s ? JSON.parse(s) : fallback; } catch { return fallback; }
};

export function audit(userId, action, entity, entityId, details) {
  run('INSERT INTO audit_log (user_id, action, entity, entity_id, details) VALUES (?,?,?,?,?)',
    userId ?? null, action, entity ?? null, entityId ?? null, details || currentVia() ? JSON.stringify({ ...details, ...(currentVia() && { via: currentVia() }) }) : null);
}
