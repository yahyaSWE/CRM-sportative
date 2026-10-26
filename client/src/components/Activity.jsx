import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, StickyNote, PhoneCall, CalendarClock, CheckSquare, Sparkles, Circle, CheckCircle2, Briefcase, Trash2 } from 'lucide-react';
import { useApp } from '../lib/app.jsx';
import { Button, Confirm, cx } from './ui.jsx';
import { timeAgo, formatDateTime, dueLabel, toSqlDate } from '../lib/meta.jsx';
import { tr, translateStored } from '../lib/i18n.js';

export const ACT = {
  note: { label: tr("Anteckning"), icon: StickyNote, cls: 'bg-amber-50 text-amber-600' },
  call: { label: tr("Samtal"), icon: PhoneCall, cls: 'bg-emerald-50 text-emerald-600' },
  email: { label: tr("E-post"), icon: Mail, cls: 'bg-sky-50 text-sky-600' },
  meeting: { label: tr("Möte"), icon: CalendarClock, cls: 'bg-violet-50 text-violet-600' },
  task: { label: tr("Uppgift"), icon: CheckSquare, cls: 'bg-brand-50 text-brand-600' },
  system: { label: tr("System"), icon: Sparkles, cls: 'bg-slate-100 text-slate-500' },
};

// Skrivfält för anteckningar, samtal, möten och uppgifter. `onSubmit` får { type, content, due_at }.
export function ActivityComposer({ onSubmit, hint }) {
  const [type, setType] = useState('note');
  const [text, setText] = useState('');
  const [due, setDue] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSaving(true);
    try {
      await onSubmit({ type, content: text, due_at: type === 'task' ? toSqlDate(due) : null });
      setText(''); setDue('');
    } finally { setSaving(false); }
  };
  return (
    <form onSubmit={submit} className="card p-3">
      <div className="flex gap-1 mb-2 overflow-x-auto scroll-thin">
        {['note', 'call', 'email', 'meeting', 'task'].map((t) => {
          const I = ACT[t].icon;
          return <button type="button" key={t} onClick={() => setType(t)} className={cx('inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap', type === t ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100')}><I className="size-3.5" />{ACT[t].label}</button>;
        })}
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2}
        placeholder={type === 'task' ? tr("Vad behöver göras?") : type === 'call' ? tr("Vad pratade ni om?") : type === 'meeting' ? tr("Vad kom ni fram till?") : tr("Skriv en anteckning…")}
        className="w-full resize-none text-sm outline-none placeholder:text-slate-400 px-1" />
      <div className="flex items-center justify-end gap-2">
        {hint && <span className="mr-auto text-[11px] text-slate-400">{hint}</span>}
        {type === 'task' && <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} className="input !w-auto !py-1 text-xs" />}
        <Button size="sm" type="submit" loading={saving} disabled={!text.trim()}>{tr("Spara")}</Button>
      </div>
    </form>
  );
}

// Gemensam tidslinje för lead och affär. Aktiviteter från en affär märks med affärens namn.
// Egna anteckningar, samtal, mejl, möten och uppgifter kan raderas (säljchefer och admin kan radera allas);
// systemhändelser som statusändringar ligger kvar.
export function Timeline({ activities, onToggleTask, onDelete, currentDealId, showContact }) {
  const { user, can } = useApp();
  const [del, setDel] = useState(null);
  const [deleting, setDeleting] = useState(false);
  if (!activities.length) return <p className="text-sm text-slate-400">{tr("Ingen historik än.")}</p>;
  const deletable = (a) => onDelete && a.type !== 'system' && (a.user_id === user?.id || can('leads.edit_all'));
  const confirmDelete = async () => {
    setDeleting(true);
    try { await onDelete(del); setDel(null); } finally { setDeleting(false); }
  };
  return (
    <>
    <ol className="relative space-y-5 before:absolute before:left-[15px] before:top-2 before:bottom-2 before:w-px before:bg-slate-200">
      {activities.map((a) => {
        const m = ACT[a.type] || ACT.system;
        const I = m.icon;
        const due = a.due_at && !a.done ? dueLabel(a.due_at) : null;
        return (
          <li key={a.id} className="group relative flex gap-3">
            <span className={cx('relative z-10 grid place-items-center size-8 rounded-full ring-4 ring-white shrink-0', m.cls)}><I className="size-4" /></span>
            <div className="min-w-0 flex-1 pt-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                <span className="font-medium text-slate-700">{a.user_name || tr("LeadFlow")}</span><span>·</span><span>{m.label}</span><span>·</span>
                <span title={formatDateTime(a.created_at)}>{timeAgo(a.created_at)}</span>
                {deletable(a) && <button onClick={() => setDel(a)} title={tr("Radera")} className="ml-auto rounded p-0.5 text-slate-300 opacity-0 hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100 focus:opacity-100"><Trash2 className="size-3.5" /></button>}
                {a.via === 'claude' && <span className="rounded bg-orange-50 px-1.5 py-px text-[11px] font-medium text-orange-700">{tr('via Claude')}</span>}
                {a.deal_id && a.deal_id !== currentDealId && a.deal_title && (
                  <Link to={`/pipeline/${a.deal_id}`} className="inline-flex items-center gap-1 rounded bg-violet-50 px-1.5 py-px text-[11px] font-medium text-violet-700 hover:bg-violet-100">
                    <Briefcase className="size-3" />{a.deal_title}
                  </Link>
                )}
                {currentDealId && !a.deal_id && <span className="rounded bg-slate-100 px-1.5 py-px text-[11px] text-slate-500">{tr("Från leadet")}</span>}
                {showContact && a.lead_id && (a.contact_first_name || a.contact_last_name) && (
                  <Link to={`/leads/${a.lead_id}`} className="rounded bg-slate-100 px-1.5 py-px text-[11px] text-slate-600 hover:bg-slate-200">{[a.contact_first_name, a.contact_last_name].filter(Boolean).join(' ')}</Link>
                )}
              </div>
              {a.type === 'task' ? (
                <button onClick={() => onToggleTask?.(a)} className="mt-1 flex items-start gap-2 text-left">
                  {a.done ? <CheckCircle2 className="size-4 text-emerald-500 mt-0.5" /> : <Circle className="size-4 text-slate-300 mt-0.5 hover:text-emerald-500" />}
                  <span className={cx('text-sm', a.done ? 'line-through text-slate-400' : 'text-slate-700')}>{a.content}{due && <span className={cx('ml-2 text-xs', due.cls)}>{due.text}</span>}</span>
                </button>
              ) : <p className={cx('mt-1 text-sm whitespace-pre-wrap', a.type === 'system' ? 'text-slate-500' : 'text-slate-700')}>{['system', 'meeting'].includes(a.type) ? translateStored(a.content) : a.content}</p>}
            </div>
          </li>
        );
      })}
    </ol>
    <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={confirmDelete} loading={deleting}
      title={del?.type === 'task' ? tr("Radera uppgiften?") : tr("Radera aktiviteten?")}
      text={del && `"${String(del.content || '').slice(0, 120)}${String(del.content || '').length > 120 ? '…' : ''}" ${tr("tas bort från tidslinjen.")}`} />
    </>
  );
}
