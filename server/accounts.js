// Konton och medlemskap i arbetsytor. Ett konto (e-post + lösenord) kan vara medlem i flera arbetsytor med olika
// roller. Varje arbetsyta har en spegelrad i sin users-tabell med samma id som kontot.
import { central, get, run, withWorkspace, currentWorkspaceId } from './db.js';

export const findAccount = (email) => central.get('SELECT * FROM users WHERE email = ?', String(email || '').trim());
export const getAccount = (id) => central.get('SELECT * FROM users WHERE id = ?', id);

/** Arbetsytor kontot är aktiv medlem i. */
export const accountWorkspaces = (userId) => central.all(`SELECT w.id, w.name FROM memberships m JOIN workspaces w ON w.id = m.workspace_id
  WHERE m.user_id = ? AND m.active = 1 ORDER BY w.name COLLATE NOCASE`, userId);

export const isMember = (userId, workspaceId) => !!central.get('SELECT 1 FROM memberships WHERE user_id = ? AND workspace_id = ? AND active = 1', userId, workspaceId);

/** Arbetsytan som används: den önskade om kontot är medlem där, annars den senast valda, annars den första. */
export function pickWorkspace(account, preferred) {
  for (const id of [preferred, account.workspace_id]) if (id && isMember(account.id, id)) return Number(id);
  return accountWorkspaces(account.id)[0]?.id ?? null;
}

export function createAccount({ name, email, passwordHash, color, language = 'sv' }) {
  return Number(central.run('INSERT INTO users (name, email, password_hash, color, language) VALUES (?,?,?,?,?)',
    name.trim(), email.trim().toLowerCase(), passwordHash, color || null, language).lastInsertRowid);
}

/** Lägger till (eller återaktiverar) kontot i den aktuella arbetsytan med en roll. */
export function addMember(account, roleId) {
  const ws = currentWorkspaceId();
  if (get('SELECT 1 FROM users WHERE id = ?', account.id)) {
    run('UPDATE users SET name = ?, email = ?, role_id = ?, active = 1 WHERE id = ?', account.name, account.email, roleId, account.id);
  } else {
    // En annan rad kan ha samma e-post sedan tidigare (t.ex. ett borttaget konto) – den frigörs först.
    run("UPDATE users SET email = email || '.old-' || id, active = 0 WHERE email = ? AND id != ?", account.email, account.id);
    run("INSERT INTO users (id, name, email, password_hash, role_id, color, active) VALUES (?,?,?,'-',?,?,1)", account.id, account.name, account.email, roleId, account.color);
  }
  central.run(`INSERT INTO memberships (user_id, workspace_id, active) VALUES (?, ?, 1)
    ON CONFLICT(user_id, workspace_id) DO UPDATE SET active = 1`, account.id, ws);
  if (!account.workspace_id) central.run('UPDATE users SET workspace_id = ? WHERE id = ?', ws, account.id);
}

/** Aktiverar eller inaktiverar medlemskapet i den aktuella arbetsytan (kontot finns kvar för andra arbetsytor). */
export function setMemberActive(userId, active) {
  run('UPDATE users SET active = ? WHERE id = ?', active ? 1 : 0, userId);
  central.run('UPDATE memberships SET active = ? WHERE user_id = ? AND workspace_id = ?', active ? 1 : 0, userId, currentWorkspaceId());
}

/** Namn och e-post ändras på kontot och i alla arbetsytor kontot tillhör. */
export function updateAccountProfile(userId, { name, email }) {
  central.run('UPDATE users SET name = coalesce(?, name), email = coalesce(?, email) WHERE id = ?', name || null, email || null, userId);
  const acc = getAccount(userId);
  for (const { workspace_id } of central.all('SELECT workspace_id FROM memberships WHERE user_id = ?', userId)) {
    withWorkspace(workspace_id, () => run('UPDATE users SET name = ?, email = ? WHERE id = ?', acc.name, acc.email, userId));
  }
}

/**
 * Får `admin` ändra kontouppgifter (namn, e-post, lösenord) för `userId`? Bara om admin hanterar användare i
 * alla arbetsytor kontot tillhör – annars kunde en administratör i ett bolag ta över ett konto i ett annat.
 */
export function canManageAccount(adminId, userId, can) {
  return central.all('SELECT workspace_id FROM memberships WHERE user_id = ?', userId).every(({ workspace_id }) =>
    withWorkspace(workspace_id, () => {
      const u = get(`SELECT r.permissions FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ? AND u.active = 1`, adminId);
      return !!u && can({ permissions: JSON.parse(u.permissions || '[]') }, 'users.manage');
    }));
}
