// Säkerhetskopior av databasen. VACUUM INTO skapar en konsistent kopia även medan appen används.
import fs from 'node:fs';
import path from 'node:path';
import { db, DATA_DIR } from './db.js';

const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const KEEP = Number(process.env.BACKUP_KEEP || 14);

export function writeBackup(file) {
  if (fs.existsSync(file)) fs.rmSync(file);
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  return file;
}

// Daglig kopia på den beständiga disken; de äldsta tas bort när det finns fler än BACKUP_KEEP.
export function dailyBackup() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const file = path.join(BACKUP_DIR, `crm-${new Date().toISOString().slice(0, 10)}.db`);
  if (fs.existsSync(file)) return null;
  writeBackup(file);
  const old = fs.readdirSync(BACKUP_DIR).filter((f) => /^crm-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort().slice(0, -KEEP);
  for (const f of old) fs.rmSync(path.join(BACKUP_DIR, f));
  console.log(`[backup] ${path.basename(file)} sparad`);
  return file;
}

export const listBackups = () => (fs.existsSync(BACKUP_DIR)
  ? fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith('.db')).sort().reverse().map((f) => ({ name: f, size: fs.statSync(path.join(BACKUP_DIR, f)).size }))
  : []);
