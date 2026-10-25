import { Fragment, useEffect, useState } from 'react';
import { UserPlus, Shield, Plus, Pencil, Lock, Check, Minus } from 'lucide-react';
import { api } from '../api.js';
import { useApp, useFetch } from '../lib/app.jsx';
import { Button, Card, PageHeader, Modal, Field, Input, Select, Avatar, Badge, Tabs, Spinner, useToast, Confirm, cx } from '../components/ui.jsx';
import { timeAgo } from '../lib/meta.jsx';
import { tr } from '../lib/i18n.js';

function UserModal({ user, roles, onClose, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState({});
  useEffect(() => setF(user ? { name: user.name || '', email: user.email || '', role_id: user.role_id || roles.find((r) => r.name === 'Säljare')?.id, password: '' } : {}), [user]);
  if (!user) return null;
  const save = async () => {
    try {
      if (user.id) await api.patch(`/users/${user.id}`, { ...f, password: f.password || undefined });
      else await api.post('/users', f);
      toast(user.id ? tr("Användaren uppdaterades") : tr("Användaren skapades")); onSaved();
    } catch (e) { toast(e.message, 'error'); }
  };
  return (
    <Modal open onClose={onClose} title={user.id ? tr("Redigera användare") : tr("Lägg till användare")}
      footer={<><Button variant="secondary" onClick={onClose}>{tr("Avbryt")}</Button><Button onClick={save}>{user.id ? tr("Spara") : tr("Skapa användare")}</Button></>}>
      <div className="space-y-4">
        <Field label={tr("Namn")}><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></Field>
        <Field label={tr("E-post")}><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label={tr("Roll")}>
          <Select value={f.role_id} onChange={(e) => setF({ ...f, role_id: Number(e.target.value) })}>{roles.map((r) => <option key={r.id} value={r.id}>{tr(r.name)}</option>)}</Select>
        </Field>
        {f.role_id && <p className="-mt-2 text-xs text-slate-500">{roles.find((r) => r.id === f.role_id)?.description}</p>}
        <Field label={user.id ? tr("Nytt lösenord (lämna tomt för att behålla)") : tr("Tillfälligt lösenord")} hint={tr("Minst 8 tecken. Användaren kan byta det under Inställningar.")}>
          <Input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="new-password" />
        </Field>
      </div>
    </Modal>
  );
}

function RoleMatrix({ roles, permissions, manage, reload }) {
  const toast = useToast();
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  const groups = [...new Set(permissions.map((p) => p.group))];
  const toggle = async (role, key) => {
    if (role.name === 'Administratör') return;
    const perms = role.permissions.includes(key) ? role.permissions.filter((p) => p !== key) : [...role.permissions, key];
    try { await api.patch(`/roles/${role.id}`, { permissions: perms }); reload(); } catch (e) { toast(e.message, 'error'); }
  };
  const saveRole = async () => {
    try {
      if (edit.id) await api.patch(`/roles/${edit.id}`, edit); else await api.post('/roles', { ...edit, permissions: ['leads.edit_own'] });
      setEdit(null); reload();
    } catch (e) { toast(e.message, 'error'); }
  };
  return (
    <>
      <Card className="overflow-x-auto scroll-thin">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="text-left px-5 py-4 font-medium text-slate-500 text-xs min-w-64">{tr("Behörighet")}</th>
              {roles.map((r) => (
                <th key={r.id} className="px-4 py-4 text-center min-w-32">
                  <div className="flex items-center justify-center gap-1">
                    <span className="font-semibold text-slate-800">{tr(r.name)}</span>
                    {manage && r.name !== 'Administratör' && <button onClick={() => setEdit({ ...r })} className="text-slate-400 hover:text-slate-600"><Pencil className="size-3" /></button>}
                  </div>
                  <p className="text-[11px] font-normal text-slate-400">{r.user_count} {tr("användare")}</p>
                </th>
              ))}
              {manage && <th className="px-4"><Button size="sm" variant="ghost" icon={Plus} onClick={() => setEdit({ name: '', description: '' })}>{tr("Roll")}</Button></th>}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={g}>
                <tr className="bg-slate-50/80"><td colSpan={roles.length + 2} className="px-5 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{tr(g)}</td></tr>
                {permissions.filter((p) => p.group === g).map((p) => (
                  <tr key={p.key} className="border-b border-slate-50">
                    <td className="px-5 py-2.5 text-slate-700">{tr(p.label)}</td>
                    {roles.map((r) => {
                      const on = r.permissions.includes(p.key);
                      const locked = r.name === 'Administratör' || !manage;
                      return (
                        <td key={r.id} className="px-4 py-2.5 text-center">
                          <button disabled={locked} onClick={() => toggle(r, p.key)}
                            className={cx('inline-grid place-items-center size-6 rounded-md transition', on ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-300', !locked && 'hover:ring-2 hover:ring-brand-200')}>
                            {on ? <Check className="size-3.5" /> : <Minus className="size-3.5" />}
                          </button>
                        </td>
                      );
                    })}
                    {manage && <td />}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500"><Lock className="size-3" />{tr("Administratörsrollen har alltid full behörighet. Användare utan \"Se alla leads\" ser bara egna och otilldelade leads.")}</p>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? tr("Redigera roll") : tr("Ny roll")}
        footer={<>{edit?.id && !edit.is_system && <Button variant="ghost" className="mr-auto !text-rose-600" onClick={() => { setDel(edit); setEdit(null); }}>{tr("Radera")}</Button>}<Button variant="secondary" onClick={() => setEdit(null)}>{tr("Avbryt")}</Button><Button onClick={saveRole}>{tr("Spara")}</Button></>}>
        {edit && <div className="space-y-4">
          <Field label={tr("Namn")}><Input value={edit.name} disabled={!!edit.is_system} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
          <Field label={tr("Beskrivning")}><Input value={edit.description || ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
        </div>}
      </Modal>
      <Confirm open={!!del} onClose={() => setDel(null)} title={tr("Radera roll?")} text={tr("Rollen \"{0}\" tas bort.", { 0: del?.name })}
        onConfirm={async () => { try { await api.del(`/roles/${del.id}`); reload(); } catch (e) { toast(e.message, 'error'); } setDel(null); }} />
    </>
  );
}

export default function Team() {
  const { can, permissions, user: me, reloadTeam } = useApp();
  const toast = useToast();
  const manage = can('users.manage');
  const [tab, setTab] = useState('users');
  const users = useFetch('/users');
  const roles = useFetch('/roles');
  const [edit, setEdit] = useState(null);

  const setActive = async (u, active) => {
    try { await api.patch(`/users/${u.id}`, { active }); users.reload(); reloadTeam(); toast(active ? tr("Användaren aktiverades") : tr("Användaren inaktiverades – öppna leads blev otilldelade")); }
    catch (e) { toast(e.message, 'error'); }
  };

  return (
    <div>
      <PageHeader title={tr("Team & behörigheter")} subtitle={tr("Bjud in kollegor och styr vad varje roll får se och göra.")}
        actions={<>
          <Tabs value={tab} onChange={setTab} tabs={[{ value: 'users', label: tr("Användare"), count: users.data?.length }, { value: 'roles', label: tr("Roller & behörigheter") }]} />
          {manage && tab === 'users' && <Button icon={UserPlus} onClick={() => setEdit({})}>{tr("Lägg till användare")}</Button>}
        </>} />
      {tab === 'users' ? (
        !users.data ? <Spinner /> : (
          <Card className="overflow-x-auto scroll-thin">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/80 text-left text-xs text-slate-500 border-b border-slate-100">
                <tr><th className="px-5 py-3 font-medium">{tr("Användare")}</th><th className="px-5 py-3 font-medium">{tr("Roll")}</th>{manage && <><th className="px-5 py-3 font-medium text-right">{tr("Leads")}</th><th className="px-5 py-3 font-medium">{tr("Senast inloggad")}</th><th className="px-5 py-3" /></>}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.data.map((u) => (
                  <tr key={u.id} className={cx(manage && !u.active && 'opacity-50')}>
                    <td className="px-5 py-3"><div className="flex items-center gap-3"><Avatar name={u.name} color={u.color} /><div><p className="font-medium text-slate-800">{u.name}{u.id === me.id && <span className="ml-2 text-xs text-slate-400">{tr("(du)")}</span>}</p>{u.email && <p className="text-xs text-slate-500">{u.email}</p>}</div></div></td>
                    <td className="px-5 py-3"><Badge className={u.role === 'Administratör' ? 'bg-violet-50 text-violet-700 ring-violet-600/20' : 'bg-slate-100 text-slate-700 ring-slate-500/20'}><Shield className="size-3" />{tr(u.role)}</Badge>{manage && !u.active && <Badge className="ml-2 bg-rose-50 text-rose-700 ring-rose-600/20">{tr("Inaktiv")}</Badge>}</td>
                    {manage && <>
                      <td className="px-5 py-3 text-right tabular-nums text-slate-600">{u.lead_count}</td>
                      <td className="px-5 py-3 text-slate-500 text-xs">{u.last_login_at ? timeAgo(u.last_login_at) : tr("Aldrig")}</td>
                      <td className="px-5 py-3 text-right whitespace-nowrap">
                        <Button size="sm" variant="ghost" onClick={() => setEdit(u)}>{tr("Redigera")}</Button>
                        {u.id !== me.id && <Button size="sm" variant="ghost" onClick={() => setActive(u, !u.active)}>{u.active ? tr("Inaktivera") : tr("Aktivera")}</Button>}
                      </td>
                    </>}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )
      ) : !roles.data ? <Spinner /> : <RoleMatrix roles={roles.data} permissions={permissions} manage={manage} reload={roles.reload} />}
      {roles.data && <UserModal user={edit} roles={roles.data} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); users.reload(); roles.reload(); reloadTeam(); }} />}
    </div>
  );
}
