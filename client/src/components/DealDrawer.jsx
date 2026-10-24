import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { X, Mail, Phone, Building2, MapPin, Briefcase, Trash2, MessageSquare, Trophy, XCircle, Clock, CalendarDays, AlertTriangle, ArrowUpRight, RotateCcw } from 'lucide-react';
import { api } from '../api.js';
import { useApp, useLive } from '../lib/app.jsx';
import { Avatar, Button, SourceBadge, Select, Spinner, Modal, Field, Input, Textarea, Confirm, useToast, cx } from './ui.jsx';
import { ActivityComposer, Timeline } from './Activity.jsx';
import { STAGES, LOST_REASONS, leadName, sek, formatDate, dueLabel, daysSince, timeAgo } from '../lib/meta.jsx';

export function LostReasonModal({ deal, onClose, onConfirm }) {
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => { setReason(''); setNote(''); }, [deal?.id]);
  return (
    <Modal open={!!deal} onClose={onClose} title="Varför förlorades affären?" description={deal && `${deal.title} · ${sek(deal.value)}`}
      footer={<><Button variant="secondary" onClick={onClose}>Avbryt</Button><Button variant="danger" disabled={!reason} onClick={() => onConfirm(reason, note)}>Markera som förlorad</Button></>}>
      <div className="grid grid-cols-2 gap-2">
        {LOST_REASONS.map((r) => (
          <button key={r} type="button" onClick={() => setReason(r)}
            className={cx('rounded-lg border px-3 py-2.5 text-left text-sm transition', reason === r ? 'border-rose-500 bg-rose-50 text-rose-700 ring-4 ring-rose-100' : 'border-slate-200 text-slate-700 hover:border-slate-300')}>{r}</button>
        ))}
      </div>
      <Field label="Kommentar (valfritt)" className="mt-4"><Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="t.ex. valde Konkurrent AB, 15 % billigare" /></Field>
      <p className="mt-3 text-xs text-slate-500">Anledningarna sammanställs på Översikten så att ni ser varför affärer går förlorade.</p>
    </Modal>
  );
}

function InlineEdit({ value, onSave, className, type = 'text', disabled, render }) {
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState(value ?? '');
  useEffect(() => setV(value ?? ''), [value]);
  const commit = () => { setEdit(false); if (String(v) !== String(value ?? '')) onSave(v); };
  if (edit) return <input autoFocus type={type} className={cx('input !py-1', className)} value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setV(value ?? ''); setEdit(false); } }} />;
  return <button disabled={disabled} onClick={() => setEdit(true)} className={cx('text-left rounded px-1 -mx-1 hover:bg-slate-100 disabled:hover:bg-transparent', className)}>{render ? render(value) : value}</button>;
}

function StageBar({ stage, onChange, disabled }) {
  const open = STAGES.filter((s) => !['won', 'lost'].includes(s.key));
  const idx = open.findIndex((s) => s.key === stage);
  const closed = stage === 'won' || stage === 'lost';
  return (
    <div className="flex gap-1">
      {open.map((s, i) => {
        const active = closed ? stage === 'won' : i <= idx;
        return (
          <button key={s.key} disabled={disabled} onClick={() => onChange(s.key)} title={s.label}
            className={cx('group relative flex-1 h-9 text-xs font-medium transition first:rounded-l-lg last:rounded-r-lg',
              active ? (stage === 'won' ? 'bg-emerald-500 text-white' : 'bg-brand-600 text-white') : 'bg-slate-100 text-slate-500 hover:bg-slate-200',
              stage === 'lost' && 'bg-slate-100 text-slate-400', s.key === stage && 'ring-2 ring-offset-1 ring-brand-300')}>
            <span className="truncate px-2">{s.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export default function DealDrawer({ id, onClose, onChanged }) {
  const { team, can } = useApp();
  const toast = useToast();
  const [deal, setDeal] = useState(null);
  const [lost, setLost] = useState(false);
  const [del, setDel] = useState(false);

  const load = () => api.get(`/deals/${id}`).then(setDeal).catch((e) => { toast(e.message, 'error'); onClose(); });
  useEffect(() => { setDeal(null); load(); }, [id]);
  useLive('lead', (d) => deal?.lead_id && d.lead?.id === deal.lead_id && load());
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !lost && !del && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lost, del]);

  const patch = async (body) => {
    try { await api.patch(`/deals/${id}`, body); await load(); onChanged?.(); return true; }
    catch (e) { toast(e.message, 'error'); return false; }
  };
  const setStage = async (stage) => {
    if (stage === deal.stage) return;
    if (stage === 'lost') return setLost(true);
    if (await patch({ stage }) && stage === 'won') toast(`${deal.title} är vunnen!`, 'success', { title: 'Grattis! 🎉' });
  };
  const addActivity = async (body) => {
    try { await api.post(`/deals/${id}/activities`, body); await load(); onChanged?.(); }
    catch (e) { toast(e.message, 'error'); throw e; }
  };
  const toggleTask = async (a) => { await api.patch(`/activities/${a.id}`, { done: !a.done }); load(); onChanged?.(); };
  const remove = async () => { await api.del(`/deals/${id}`); toast('Affären raderades'); onChanged?.(); onClose(); };

  const editable = deal?.canEdit;
  const lead = deal?.lead;
  const stageInfo = deal && STAGES.find((s) => s.key === deal.stage);
  const inStage = deal ? daysSince(deal.stage_changed_at || deal.updated_at) : 0;
  const isOpen = deal && !['won', 'lost'].includes(deal.stage);
  const nextTask = deal?.next_task;

  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-slate-900/20" onClick={onClose} />
      <div className="absolute inset-y-0 right-0 w-full max-w-3xl bg-white shadow-2xl animate-slide-in flex flex-col">
        {!deal ? <div className="flex-1 grid place-items-center"><Spinner /></div> : (
          <>
            <div className="px-6 pt-5 pb-5 border-b border-slate-100 space-y-4">
              <div className="flex items-start gap-4">
                <div className="grid place-items-center size-12 rounded-xl bg-violet-100 text-violet-600 shrink-0"><Briefcase className="size-6" /></div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-violet-600">Affär</p>
                  <InlineEdit value={deal.title} disabled={!editable} onSave={(v) => v.trim() && patch({ title: v.trim() })} className="block w-full text-lg font-semibold text-slate-900 truncate" />
                  {lead && <Link to={`/leads/${lead.id}`} className="mt-0.5 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-600">{leadName(lead)}{lead.company && ` · ${lead.company}`}<ArrowUpRight className="size-3.5" /></Link>}
                </div>
                <button onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100"><X className="size-5" /></button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <p className="text-[11px] text-slate-500">Värde</p>
                  <InlineEdit type="number" value={deal.value} disabled={!editable} onSave={(v) => patch({ value: Number(v) || 0 })} render={(v) => sek(v)} className="text-base font-semibold text-slate-900 tabular-nums" />
                </div>
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <p className="text-[11px] text-slate-500">Viktat värde</p>
                  <p className="text-base font-semibold text-slate-900 tabular-nums">{sek(deal.value * (stageInfo?.prob ?? 0))}</p>
                </div>
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <p className="text-[11px] text-slate-500">Förväntat avslut</p>
                  <InlineEdit type="date" value={deal.expected_close || ''} disabled={!editable} onSave={(v) => patch({ expected_close: v || null })}
                    render={(v) => v ? formatDate(v) : <span className="text-slate-400">Sätt datum</span>} className="text-sm font-medium text-slate-800" />
                </div>
                <div className={cx('rounded-lg px-3 py-2', isOpen && inStage >= 14 ? 'bg-amber-50' : 'bg-slate-50')}>
                  <p className="text-[11px] text-slate-500">I steget</p>
                  <p className={cx('text-sm font-medium', isOpen && inStage >= 14 ? 'text-amber-700' : 'text-slate-800')}>{inStage} {inStage === 1 ? 'dag' : 'dagar'}</p>
                </div>
              </div>

              <div className="space-y-2">
                <StageBar stage={deal.stage} onChange={setStage} disabled={!editable} />
                <div className="flex items-center gap-2">
                  {deal.stage === 'won' && <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600"><Trophy className="size-4" />Vunnen {formatDate(deal.closed_at)}</span>}
                  {deal.stage === 'lost' && <span className="inline-flex items-center gap-1.5 text-sm font-medium text-rose-600"><XCircle className="size-4" />Förlorad – {deal.lost_reason || 'ingen anledning angiven'}</span>}
                  {editable && (isOpen ? (
                    <div className="ml-auto flex gap-2">
                      <Button size="sm" variant="secondary" icon={XCircle} className="!text-rose-600" onClick={() => setLost(true)}>Förlorad</Button>
                      <Button size="sm" icon={Trophy} className="!bg-emerald-600 hover:!bg-emerald-700" onClick={() => setStage('won')}>Vunnen</Button>
                    </div>
                  ) : <Button size="sm" variant="ghost" icon={RotateCcw} className="ml-auto" onClick={() => patch({ stage: 'negotiation' })}>Öppna igen</Button>)}
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto scroll-thin grid md:grid-cols-[1fr_250px]">
              <div className="px-6 py-5 md:border-r border-slate-100 min-w-0 space-y-6">
                {isOpen && (nextTask ? (
                  <div className={cx('flex items-center gap-3 rounded-xl border px-4 py-3', dueLabel(nextTask.due_at).cls === 'text-rose-600' ? 'border-rose-200 bg-rose-50' : 'border-brand-100 bg-brand-50/60')}>
                    <Clock className="size-4 text-brand-600 shrink-0" />
                    <div className="min-w-0 flex-1"><p className="text-xs text-slate-500">Nästa steg</p><p className="text-sm font-medium text-slate-800 truncate">{nextTask.content}</p></div>
                    <span className={cx('text-xs font-medium whitespace-nowrap', dueLabel(nextTask.due_at).cls)}>{dueLabel(nextTask.due_at).text}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    <AlertTriangle className="size-4 shrink-0" />Affären saknar nästa steg. Lägg till en uppgift nedan.
                  </div>
                ))}
                {editable && <ActivityComposer onSubmit={addActivity} hint={lead ? 'Syns även på leadet' : undefined} />}
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">Tidslinje</h3>
                  <Timeline activities={deal.activities} onToggleTask={toggleTask} currentDealId={deal.id} />
                </div>
              </div>

              <aside className="px-5 py-5 space-y-6 bg-slate-50/50">
                <div>
                  <p className="label">Ansvarig</p>
                  {can('leads.assign') ? (
                    <Select value={deal.owner_id || ''} onChange={(e) => patch({ owner_id: Number(e.target.value) })}>{team.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select>
                  ) : <div className="flex items-center gap-2 text-sm">{deal.owner_name && <Avatar name={deal.owner_name} color={deal.owner_color} size="xs" />}{deal.owner_name || '–'}</div>}
                </div>
                {lead ? (
                  <>
                    <div>
                      <p className="label">Kontakt</p>
                      <Link to={`/leads/${lead.id}`} className="block text-sm font-medium text-slate-800 hover:text-brand-600">{leadName(lead)}</Link>
                      {lead.title && <p className="text-xs text-slate-500">{lead.title}</p>}
                      <div className="mt-2 space-y-1.5 text-sm">
                        {lead.phone && <a href={`tel:${lead.phone}`} className="flex items-center gap-2 text-brand-600 hover:underline"><Phone className="size-4 text-slate-400" />{lead.phone}</a>}
                        {lead.email && <a href={`mailto:${lead.email}`} className="flex items-center gap-2 text-brand-600 hover:underline truncate"><Mail className="size-4 text-slate-400 shrink-0" /><span className="truncate">{lead.email}</span></a>}
                        {lead.company && <p className="flex items-center gap-2 text-slate-700"><Building2 className="size-4 text-slate-400" />{lead.company}</p>}
                        {lead.city && <p className="flex items-center gap-2 text-slate-700"><MapPin className="size-4 text-slate-400" />{lead.city}</p>}
                      </div>
                    </div>
                    <div>
                      <p className="label">Källa</p>
                      <SourceBadge source={lead.source} detail={lead.source_detail} />
                      <p className="mt-1 text-xs text-slate-400">Inkom {timeAgo(lead.created_at)}</p>
                    </div>
                    {lead.message && (
                      <div>
                        <p className="label flex items-center gap-1"><MessageSquare className="size-3" />Ursprunglig förfrågan</p>
                        <p className="text-sm text-slate-700 whitespace-pre-wrap rounded-lg bg-white border border-slate-200 p-3">{lead.message}</p>
                      </div>
                    )}
                    {Object.keys(lead.fields).length > 0 && (
                      <div>
                        <p className="label">Formulärsvar</p>
                        <dl className="space-y-2">{Object.entries(lead.fields).map(([k, v]) => <div key={k}><dt className="text-[11px] text-slate-400">{k.replace(/_/g, ' ')}</dt><dd className="text-sm text-slate-700 break-words">{v}</dd></div>)}</dl>
                      </div>
                    )}
                  </>
                ) : <p className="text-sm text-slate-500">Affären är inte kopplad till något lead.</p>}
                {deal.otherDeals.length > 0 && (
                  <div>
                    <p className="label">Kontaktens andra affärer</p>
                    {deal.otherDeals.map((d) => (
                      <Link key={d.id} to={`/pipeline/${d.id}`} className="card p-3 mb-2 block hover:border-slate-300">
                        <p className="text-sm font-medium text-slate-800 truncate">{d.title}</p>
                        <p className="text-xs text-slate-500">{sek(d.value)} · {STAGES.find((s) => s.key === d.stage)?.label}</p>
                      </Link>
                    ))}
                  </div>
                )}
                {can('leads.delete') && <Button size="sm" variant="ghost" icon={Trash2} className="!text-rose-600 -ml-2" onClick={() => setDel(true)}>Radera affär</Button>}
              </aside>
            </div>
          </>
        )}
      </div>
      <LostReasonModal deal={lost ? deal : null} onClose={() => setLost(false)}
        onConfirm={async (reason, note) => { if (await patch({ stage: 'lost', lost_reason: reason, lost_note: note })) setLost(false); }} />
      <Confirm open={del} onClose={() => setDel(false)} onConfirm={remove} title="Radera affär?" text="Affären tas bort från pipelinen. Historiken på leadet finns kvar." />
    </div>
  );
}
