import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, 'crm.db'));
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

// Enkla migreringar för databaser som skapades innan kolumnerna fanns.
function addColumn(table, column, def) {
  if (!db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
}
addColumn('deals', 'lost_reason', 'TEXT');
addColumn('deals', 'stage_changed_at', 'TEXT');
addColumn('users', 'ical_token', 'TEXT');
db.exec("UPDATE deals SET stage_changed_at = coalesce(closed_at, updated_at, created_at) WHERE stage_changed_at IS NULL");
db.exec('CREATE INDEX IF NOT EXISTS activities_deal ON activities(deal_id)');

// SQLite:s lower() hanterar bara ASCII – den här klarar å, ä och ö så att sökningar blir skiftlägesokänsliga.
db.function('sv_lower', { deterministic: true }, (s) => (s == null ? null : String(s).toLowerCase()));

export const all = (sql, ...p) => db.prepare(sql).all(...p);
export const get = (sql, ...p) => db.prepare(sql).get(...p);
export const run = (sql, ...p) => db.prepare(sql).run(...p);

export function tx(fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export const parseJSON = (s, fallback) => {
  try { return s ? JSON.parse(s) : fallback; } catch { return fallback; }
};

export function audit(userId, action, entity, entityId, details) {
  run('INSERT INTO audit_log (user_id, action, entity, entity_id, details) VALUES (?,?,?,?,?)',
    userId ?? null, action, entity ?? null, entityId ?? null, details ? JSON.stringify(details) : null);
}
