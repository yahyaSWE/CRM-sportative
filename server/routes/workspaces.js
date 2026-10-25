// Arbetsytor: byta mellan bolag, skapa ett nytt och byta namn. Varje arbetsyta har helt egna kunder, leads,
// affärer, produkter, integrationer, automatiseringar, roller och inställningar.
import { Router } from 'express';
import { central, audit, withWorkspace, createWorkspace, currentWorkspaceId } from '../db.js';
import { requirePerm } from '../middleware.js';
import { ensureRoles } from '../seed.js';
import { accountWorkspaces, isMember, addMember, getAccount } from '../accounts.js';

const r = Router();

r.get('/workspaces', (req, res) => res.json({ current: currentWorkspaceId(), items: accountWorkspaces(req.user.id) }));

r.post('/workspaces/switch', (req, res) => {
  const id = Number(req.body?.id);
  if (!isMember(req.user.id, id)) return res.status(404).json({ error: 'Arbetsytan finns inte' });
  central.run('UPDATE users SET workspace_id = ? WHERE id = ?', id, req.user.id);
  res.json({ ok: true });
});

// En administratör kan starta en ny arbetsyta (t.ex. för ett annat bolag) och blir själv administratör där.
r.post('/workspaces', requirePerm('users.manage'), (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Ange ett namn på arbetsytan' });
  const from = currentWorkspaceId();
  const id = createWorkspace(name, req.user.id);
  withWorkspace(id, () => {
    const [adminRole] = ensureRoles();
    addMember(getAccount(req.user.id), adminRole);
    audit(req.user.id, 'workspace.create', 'workspace', id, { name });
  });
  audit(req.user.id, 'workspace.create', 'workspace', id, { name, from });
  central.run('UPDATE users SET workspace_id = ? WHERE id = ?', id, req.user.id);
  res.status(201).json({ id, name });
});

r.patch('/workspaces/current', requirePerm('users.manage'), (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Ange ett namn på arbetsytan' });
  central.run('UPDATE workspaces SET name = ? WHERE id = ?', name, currentWorkspaceId());
  audit(req.user.id, 'workspace.rename', 'workspace', currentWorkspaceId(), { name });
  res.json({ id: currentWorkspaceId(), name });
});

export default r;
