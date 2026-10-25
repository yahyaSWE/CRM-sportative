// Säkerhetskopior av databaserna. VACUUM INTO skapar en konsistent kopia även medan appen används.
// Varje arbetsyta får en egen fil (ws<id>-<datum>.db) och kontodatabasen en (accounts-<datum>.db).
import fs from 'node:fs';
import path from 'node:path';
import { currentDb, central, DATA_DIR, listWorkspaces, withWorkspace, currentWorkspaceId } from './db.js';

const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const KEEP = Number(process.env.BACKUP_KEEP || 14);

function vacuumInto(conn, file) {
  if (fs.existsSync(file)) fs.rmSync(file);
  conn.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  return file;
}

/** Kopia av den aktuella arbetsytans databas. */
export const writeBackup = (file) => vacuumInto(currentDb(), file);

function daily(prefix, conn, date) {
  const file = path.join(BACKUP_DIR, `${prefix}-${date}.db`);
  if (fs.existsSync(file)) return null;
  vacuumInto(conn, file);
  const pattern = new RegExp(`^${prefix}-\\d{4}-\\d{2}-\\d{2}\\.db$`);
  const old = fs.readdirSync(BACKUP_DIR).filter((f) => pattern.test(f)).sort().slice(0, -KEEP);
  for (const f of old) fs.rmSync(path.join(BACKUP_DIR, f));
  console.log(`[backup] ${path.basename(file)} sparad`);
  return file;
}

// Daglig kopia på den beständiga disken; de äldsta tas bort när det finns fler än BACKUP_KEEP.
export function dailyBackup() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  daily('accounts', central.db, date);
  for (const ws of listWorkspaces()) withWorkspace(ws.id, () => daily(`ws${ws.id}`, currentDb(), date));
}

/** Den aktuella arbetsytans kopior (äldre installationer har även crm-<datum>.db från arbetsyta 1). */
export function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  const ws = currentWorkspaceId();
  const mine = new RegExp(`^(ws${ws}${ws === 1 ? '|crm' : ''})-\\d{4}-\\d{2}-\\d{2}\\.db$`);
  return fs.readdirSync(BACKUP_DIR).filter((f) => mine.test(f)).sort().reverse()
    .map((f) => ({ name: f, size: fs.statSync(path.join(BACKUP_DIR, f)).size }));
}
