import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Circle, CheckCircle2, CheckSquare, Trash2, Plus } from 'lucide-react';
import { api } from '../api.js';
import { useApp, useFetch } from '../lib/app.jsx';
import { Card, PageHeader, Tabs, Empty, Spinner, Avatar, Button, Modal, Field, Input, useToast, cx } from '../components/ui.jsx';
import { dueLabel, leadName, toSqlDate } from '../lib/meta.jsx';

// Ny uppgift direkt från Uppgifter: välj lead, skriv vad som ska göras och när.
function NewTask({ open, onClose, onSaved }) {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState([]);
  const [lead, setLead] = useState(null);
  const [content, setContent] = useState('');
  const [due, setDue] = useState('');
  useEffect(() => { if (open) { setQ(''); setHits([]); setLead(null); setContent(''); setDue(''); } }, [open]);
  useEffect(() => {
    if (lead || q.trim().length < 2) return setHits([]);
    const t = setTimeout(() => api.get(`/search?q=${encodeURIComponent(q.trim())}`).then((r) => setHits(r.leads)).catch(() => {}), 200);
    return () => clearTimeout(t);
  }, [q, lead]);
  const save = async (e) => {
    e?.preventDefault();
    if (!lead || !content.trim()) return;
    try { await api.post(`/leads/${lead.id}/activities`, { type: 'task', content, due_at: toSqlDate(due) }); toast(tr('Uppgiften är skapad')); onSaved(); }
    catch (err) { toast(err.message, 'error'); }
  };
  return (
    <Modal open={open} onClose={onClose} title={tr('Ny uppgift')}
      footer={<><Button variant="secondary" onClick={onClose}>{tr('Avbryt')}</Button><Button onClick={save} disabled={!lead || !content.trim()}>{tr('Skapa uppgift')}</Button></>}>
      <form onSubmit={save} className="space-y-4">
        <Field label={tr('Lead')}>
          {lead ? (
            <span className="flex items-center justify-between gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <span className="truncate">{leadName(lead)}{lead.company && lead.company !== leadName(lead) && <span className="text-slate-500"> · {lead.company}</span>}</span>
              <button type="button" onClick={() => setLead(null)} className="text-xs font-medium text-brand-700 hover:underline">{tr('Byt')}</button>
            </span>
          ) : (
            <>
              <Input autoFocus type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('Sök namn, företag eller telefon…')} />
              {hits.length > 0 && (
                <ul className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-slate-200">
                  {hits.map((l) => (
                    <li key={l.id}><button type="button" onClick={() => setLead(l)} className="flex w-full items-baseline gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50">
                      <span className="font-medium text-slate-800">{leadName(l)}</span>{l.company && <span className="truncate text-xs text-slate-500">{l.company}</span>}
                    </button></li>
                  ))}
                </ul>
              )}
            </>
          )}
        </Field>
        <Field label={tr('Vad ska göras?')}><Input value={content} onChange={(e) => setContent(e.target.value)} placeholder={tr('t.ex. Ring och följ upp offerten')} /></Field>
        <Field label={tr('När')} hint={tr('Valfritt')}><Input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
      </form>
    </Modal>
  );
}
import { tr } from '../lib/i18n.js';

export default function Tasks() {
  const { can } = useApp();
  const [scope, setScope] = useState('mine');
  const [done, setDone] = useState('0');
  const [creating, setCreating] = useState(false);
  const { data, reload } = useFetch(`/tasks?scope=${scope}&done=${done}`);

  const toggle = async (t) => { await api.patch(`/activities/${t.id}`, { done: !t.done }); reload(); };
  const remove = async (t) => { await api.del(`/activities/${t.id}`); reload(); };

  const groups = {};
  for (const t of data || []) {
    const d = t.due_at ? new Date(t.due_at.replace(' ', 'T') + 'Z') : null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const key = t.done ? tr("Klara") : !d ? tr("Utan datum") : d < new Date() ? tr("Försenade") : d < new Date(today.getTime() + 864e5) ? tr("Idag") : d < new Date(today.getTime() + 7 * 864e5) ? tr("Kommande vecka") : tr("Senare");
    (groups[key] ||= []).push(t);
  }
  const order = [tr("Försenade"), tr("Idag"), tr("Kommande vecka"), tr("Senare"), tr("Utan datum"), tr("Klara")];

  return (
    <div className="max-w-4xl">
      <PageHeader title={tr("Uppgifter")} subtitle={tr("Uppföljningar och att-göra kopplade till dina leads")}
        actions={<>
          {can('leads.view_all') && <Tabs value={scope} onChange={setScope} tabs={[{ value: 'mine', label: tr("Mina") }, { value: 'all', label: tr("Teamets") }]} />}
          <Tabs value={done} onChange={setDone} tabs={[{ value: '0', label: tr("Öppna") }, { value: '1', label: tr("Klara") }]} />
          {can('leads.edit_own') && <Button icon={Plus} onClick={() => setCreating(true)}>{tr("Ny uppgift")}</Button>}
        </>} />
      <NewTask open={creating} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); reload(); }} />
      {!data ? <Spinner /> : !data.length ? (
        <Card><Empty icon={CheckSquare} title={done === '1' ? tr("Inga klara uppgifter") : tr("Allt är gjort!")} text={tr("Skapa en med Ny uppgift, från ett lead eller automatiskt via automatiseringsregler.")} /></Card>
      ) : (
        <div className="space-y-6">
          {order.filter((k) => groups[k]).map((k) => (
            <div key={k}>
              <h3 className={cx('text-xs font-semibold uppercase tracking-wide mb-2', k === tr("Försenade") ? 'text-rose-600' : 'text-slate-500')}>{k} · {groups[k].length}</h3>
              <Card className="divide-y divide-slate-100">
                {groups[k].map((t) => {
                  const due = dueLabel(t.due_at);
                  return (
                    <div key={t.id} className="group flex items-center gap-3 px-4 py-3">
                      <button onClick={() => toggle(t)} aria-label={t.done ? tr('Markera som ej klar: {t}', { t: t.content }) : tr('Markera som klar: {t}', { t: t.content })} className="-m-1 rounded-full p-1 text-slate-500 hover:text-emerald-600">{t.done ? <CheckCircle2 className="size-5 text-emerald-500" /> : <Circle className="size-5" />}</button>
                      <div className="min-w-0 flex-1">
                        <p className={cx('text-sm', t.done ? 'line-through text-slate-500' : 'text-slate-800')}>{t.content}</p>
                        <p className="text-xs text-slate-500">
                          {!t.done && <span className={due.cls}>{due.text}</span>}
                          {t.lead_id && <> · <Link to={`/leads/${t.lead_id}`} className="hover:text-brand-600">{[t.first_name, t.last_name].filter(Boolean).join(' ') || t.email}{t.company && `, ${t.company}`}</Link></>}
                          {t.deal_id && t.deal_title && <> · <Link to={`/pipeline/${t.deal_id}`} className="text-violet-600 hover:underline">{t.deal_title}</Link></>}
                        </p>
                      </div>
                      {scope === 'all' && t.user_name && <Avatar name={t.user_name} color={t.user_color} size="sm" />}
                      <button onClick={() => remove(t)} aria-label={tr('Radera uppgiften')} className="rounded-md p-1.5 max-sm:opacity-100 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-slate-500 hover:text-rose-500"><Trash2 className="size-4" /></button>
                    </div>
                  );
                })}
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
