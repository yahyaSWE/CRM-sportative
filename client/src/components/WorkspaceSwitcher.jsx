import { useEffect, useRef, useState } from 'react';
import { Check, ChevronsUpDown, Pencil, Plus } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../lib/app.jsx';
import { Button, Field, Input, Modal, cx, useToast } from './ui.jsx';
import { tr } from '../lib/i18n.js';

const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';

// Byter mellan arbetsytor (bolag). Varje arbetsyta har egna kunder, leads, integrationer och inställningar,
// så sidan laddas om helt vid byte.
export default function WorkspaceSwitcher() {
  const { workspace, workspaces, can } = useApp();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  if (!workspace) return null;
  const multiple = workspaces.length > 1;
  const canCreate = can('users.manage');

  const switchTo = async (id) => {
    if (id === workspace.id) return setOpen(false);
    try { await api.post('/workspaces/switch', { id }); window.location.assign('/'); }
    catch (e) { toast(e.message, 'error'); }
  };
  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { await api.post('/workspaces', { name }); window.location.assign('/'); }
    catch (err) { toast(err.message, 'error'); setBusy(false); }
  };
  const rename = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { await api.patch('/workspaces/current', { name }); window.location.reload(); }
    catch (err) { toast(err.message, 'error'); setBusy(false); }
  };

  return (
    <div ref={ref} className="relative px-3 pb-2">
      <button onClick={() => (multiple || canCreate) && setOpen(!open)}
        className={cx('flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition', (multiple || canCreate) ? 'hover:bg-white/5' : 'cursor-default')}>
        <span className="grid place-items-center size-7 shrink-0 rounded-md bg-white/10 text-[11px] font-bold text-white">{initials(workspace.name)}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] text-slate-500">{tr('Arbetsyta')}</span>
          <span className="block truncate text-sm font-medium text-white">{workspace.name}</span>
        </span>
        {(multiple || canCreate) && <ChevronsUpDown className="size-4 shrink-0 text-slate-500" />}
      </button>
      {open && (
        <div className="absolute inset-x-3 top-full z-40 mt-1 overflow-hidden rounded-lg bg-white py-1 shadow-xl ring-1 ring-slate-900/10">
          {workspaces.map((w) => (
            <button key={w.id} onClick={() => switchTo(w.id)} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">
              <span className="grid place-items-center size-6 shrink-0 rounded bg-slate-100 text-[10px] font-bold text-slate-600">{initials(w.name)}</span>
              <span className="min-w-0 flex-1 truncate">{w.name}</span>
              {w.id === workspace.id && <Check className="size-4 text-brand-600" />}
            </button>
          ))}
          {canCreate && (
            <button onClick={() => { setOpen(false); setName(workspace.name); setRenaming(true); }} className="flex w-full items-center gap-2.5 border-t border-slate-100 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">
              <Pencil className="size-4 text-slate-400" />{tr('Byt namn på {name}', { name: workspace.name })}
            </button>
          )}
          {canCreate && (
            <button onClick={() => { setOpen(false); setName(''); setCreating(true); }} className="flex w-full items-center gap-2.5 border-t border-slate-100 px-3 py-2 text-left text-sm font-medium text-brand-700 hover:bg-brand-50">
              <Plus className="size-4" />{tr('Ny arbetsyta')}
            </button>
          )}
        </div>
      )}
      <Modal open={renaming} onClose={() => setRenaming(false)} title={tr('Byt namn på arbetsytan')}
        description={tr('Namnet visas i menyn för alla i arbetsytan. Bolagsnamnet på offerter ändrar du under Produkter & offerter.')}
        footer={<><Button variant="secondary" onClick={() => setRenaming(false)}>{tr('Avbryt')}</Button><Button type="submit" form="rename-workspace" loading={busy} disabled={!name.trim() || name.trim() === workspace.name}>{tr('Spara')}</Button></>}>
        <form id="rename-workspace" onSubmit={rename}>
          <Field label={tr('Bolagets eller arbetsytans namn')}><Input autoFocus value={name} onChange={(e) => setName(e.target.value)} /></Field>
        </form>
      </Modal>
      <Modal open={creating} onClose={() => setCreating(false)} title={tr('Ny arbetsyta')}
        description={tr('En arbetsyta är ett eget bolag med egna kunder, leads, affärer, produkter, integrationer och användare. Du blir administratör och kan bjuda in andra under Team & behörigheter.')}
        footer={<><Button variant="secondary" onClick={() => setCreating(false)}>{tr('Avbryt')}</Button><Button type="submit" form="new-workspace" loading={busy} disabled={!name.trim()}>{tr('Skapa arbetsyta')}</Button></>}>
        <form id="new-workspace" onSubmit={create}>
          <Field label={tr('Bolagets eller arbetsytans namn')}><Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={tr('t.ex. Sportative Event AB')} /></Field>
        </form>
      </Modal>
    </div>
  );
}
