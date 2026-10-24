import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Circle, CheckCircle2, CheckSquare, Trash2 } from 'lucide-react';
import { api } from '../api.js';
import { useApp, useFetch } from '../lib/app.jsx';
import { Card, PageHeader, Tabs, Empty, Spinner, Avatar, cx } from '../components/ui.jsx';
import { dueLabel } from '../lib/meta.jsx';

export default function Tasks() {
  const { can } = useApp();
  const [scope, setScope] = useState('mine');
  const [done, setDone] = useState('0');
  const { data, reload } = useFetch(`/tasks?scope=${scope}&done=${done}`);

  const toggle = async (t) => { await api.patch(`/activities/${t.id}`, { done: !t.done }); reload(); };
  const remove = async (t) => { await api.del(`/activities/${t.id}`); reload(); };

  const groups = {};
  for (const t of data || []) {
    const d = t.due_at ? new Date(t.due_at.replace(' ', 'T') + 'Z') : null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const key = t.done ? 'Klara' : !d ? 'Utan datum' : d < new Date() ? 'Försenade' : d < new Date(today.getTime() + 864e5) ? 'Idag' : d < new Date(today.getTime() + 7 * 864e5) ? 'Kommande vecka' : 'Senare';
    (groups[key] ||= []).push(t);
  }
  const order = ['Försenade', 'Idag', 'Kommande vecka', 'Senare', 'Utan datum', 'Klara'];

  return (
    <div className="max-w-4xl">
      <PageHeader title="Uppgifter" subtitle="Uppföljningar och att-göra kopplade till dina leads"
        actions={<>
          {can('leads.view_all') && <Tabs value={scope} onChange={setScope} tabs={[{ value: 'mine', label: 'Mina' }, { value: 'all', label: 'Teamets' }]} />}
          <Tabs value={done} onChange={setDone} tabs={[{ value: '0', label: 'Öppna' }, { value: '1', label: 'Klara' }]} />
        </>} />
      {!data ? <Spinner /> : !data.length ? (
        <Card><Empty icon={CheckSquare} title={done === '1' ? 'Inga klara uppgifter' : 'Allt är gjort!'} text="Uppgifter skapas från ett lead eller automatiskt via automatiseringsregler." /></Card>
      ) : (
        <div className="space-y-6">
          {order.filter((k) => groups[k]).map((k) => (
            <div key={k}>
              <h3 className={cx('text-xs font-semibold uppercase tracking-wide mb-2', k === 'Försenade' ? 'text-rose-600' : 'text-slate-400')}>{k} · {groups[k].length}</h3>
              <Card className="divide-y divide-slate-100">
                {groups[k].map((t) => {
                  const due = dueLabel(t.due_at);
                  return (
                    <div key={t.id} className="group flex items-center gap-3 px-4 py-3">
                      <button onClick={() => toggle(t)} className="text-slate-300 hover:text-emerald-500">{t.done ? <CheckCircle2 className="size-5 text-emerald-500" /> : <Circle className="size-5" />}</button>
                      <div className="min-w-0 flex-1">
                        <p className={cx('text-sm', t.done ? 'line-through text-slate-400' : 'text-slate-800')}>{t.content}</p>
                        <p className="text-xs text-slate-500">
                          {!t.done && <span className={due.cls}>{due.text}</span>}
                          {t.lead_id && <> · <Link to={`/leads/${t.lead_id}`} className="hover:text-brand-600">{[t.first_name, t.last_name].filter(Boolean).join(' ') || t.email}{t.company && `, ${t.company}`}</Link></>}
                          {t.deal_id && t.deal_title && <> · <Link to={`/pipeline/${t.deal_id}`} className="text-violet-600 hover:underline">{t.deal_title}</Link></>}
                        </p>
                      </div>
                      {scope === 'all' && t.user_name && <Avatar name={t.user_name} color={t.user_color} size="sm" />}
                      <button onClick={() => remove(t)} className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-500"><Trash2 className="size-4" /></button>
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
