// Kör automatisk hämtning av leads för alla aktiva integrationer med polling.
import { all, get, run, forEachWorkspace, currentWorkspaceId } from '../db.js';
import { decrypt } from '../security.js';
import { broadcast } from '../events.js';
import { pollImap } from './email.js';
import { pollIntegration as pollMeta } from './meta.js';

const running = new Set();

export function isPollable(integ, cfg) {
  if (integ.type === 'email') return cfg.mode === 'imap' && !!(cfg.host && cfg.user && cfg.password);
  if (integ.type === 'facebook' || integ.type === 'instagram') return !!(cfg.pollEnabled && cfg.pageId && cfg.pageAccessToken);
  return false;
}

export async function syncIntegration(id) {
  const key = `${currentWorkspaceId()}:${id}`;
  if (running.has(key)) return { skipped: true };
  const row = get('SELECT * FROM integrations WHERE id = ?', id);
  if (!row) throw new Error('Integrationen finns inte');
  const integ = { ...row, cfg: decrypt(row.config) };
  running.add(key);
  run("UPDATE integrations SET status = 'syncing' WHERE id = ?", id);
  broadcast('integration', { id, status: 'syncing' }, () => true);
  try {
    const result = integ.type === 'email' ? await pollImap(integ) : await pollMeta(integ);
    run("UPDATE integrations SET status = 'ok', last_error = NULL, last_sync_at = datetime('now') WHERE id = ?", id);
    broadcast('integration', { id, status: 'ok', result }, () => true);
    return result;
  } catch (e) {
    const msg = String(e.message || e).slice(0, 500);
    run("UPDATE integrations SET status = 'error', last_error = ?, last_sync_at = datetime('now') WHERE id = ?", msg, id);
    broadcast('integration', { id, status: 'error', error: msg }, () => true);
    throw e;
  } finally {
    running.delete(key);
  }
}

export function startScheduler() {
  const tick = () => forEachWorkspace(() => {
    for (const row of all('SELECT * FROM integrations WHERE enabled = 1')) {
      const cfg = decrypt(row.config);
      if (!isPollable(row, cfg)) continue;
      const interval = Math.max(1, Number(cfg.intervalMinutes || (row.type === 'email' ? 2 : 15)));
      const last = row.last_sync_at ? new Date(row.last_sync_at + 'Z').getTime() : 0;
      if (Date.now() - last >= interval * 60000) syncIntegration(row.id).catch(() => {});
    }
  }, 'integrationer');
  setTimeout(tick, 5000);
  return setInterval(tick, 30000);
}
