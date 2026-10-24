import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, CalendarDays, Clock, AlertTriangle, Search, ArrowUpDown } from 'lucide-react';
import { api } from '../api.js';
import { useApp, useFetch, useLive } from '../lib/app.jsx';
import { Avatar, Button, PageHeader, Modal, Field, Input, Select, Spinner, SourceBadge, Tabs, useToast, cx } from '../components/ui.jsx';
import DealDrawer, { LostReasonModal } from '../components/DealDrawer.jsx';
import { STAGES, sek, formatDate, dueLabel, daysSince } from '../lib/meta.jsx';

const STALE_DAYS = 14;

function DealCard({ d, dragging, onDragStart, onDragEnd, onOpen }) {
  const open = !['won', 'lost'].includes(d.stage);
  const inStage = daysSince(d.stage_changed_at || d.updated_at);
  const due = d.next_task ? dueLabel(d.next_task.due_at) : null;
  const overdue = due?.cls === 'text-rose-600';
  const contact = [d.first_name, d.last_name].filter(Boolean).join(' ');
  return (
    <div draggable onDragStart={onDragStart} onDragEnd={onDragEnd} onClick={onOpen}
      className={cx('card p-3 cursor-pointer active:cursor-grabbing hover:shadow-md hover:border-slate-300 transition', dragging && 'opacity-40', overdue && 'border-rose-200')}>
      <div className="flex items-start gap-2">
        <p className="flex-1 text-sm font-medium text-slate-800 leading-snug">{d.title}</p>
        {d.owner_name && <Avatar name={d.owner_name} color={d.owner_color} size="xs" />}
      </div>
      {(contact || d.company) && (
        <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500 min-w-0">
          {d.source && <SourceBadge source={d.source} compact />}
          <span className="truncate">{contact}{contact && d.company && ' · '}{d.company}</span>
        </p>
      )}
      <div className="mt-2 flex items-end justify-between gap-2">
        <p className="text-base font-semibold text-slate-900 tabular-nums">{sek(d.value)}</p>
        {d.expected_close && open && <span className="flex items-center gap-1 text-[11px] text-slate-500"><CalendarDays className="size-3" />{formatDate(d.expected_close, { day: 'numeric', month: 'short' })}</span>}
      </div>
      {open && (
        <div className="mt-2 pt-2 border-t border-slate-100 space-y-1">
          {d.next_task ? (
            <p className={cx('flex items-center gap-1.5 text-xs min-w-0', overdue ? 'text-rose-600 font-medium' : 'text-slate-600')}>
              <Clock className="size-3 shrink-0" /><span className="truncate">{d.next_task.content}</span><span className={cx('ml-auto whitespace-nowrap', due.cls)}>{due.text.replace(' · försenad', '')}</span>
            </p>
          ) : <p className="flex items-center gap-1.5 text-xs text-amber-600"><AlertTriangle className="size-3" />Inget nästa steg</p>}
          {inStage >= STALE_DAYS && <p className="text-[11px] text-amber-600">{inStage} dagar i steget</p>}
        </div>
      )}
      {d.stage === 'lost' && d.lost_reason && <p className="mt-2 text-xs text-rose-600">{d.lost_reason}</p>}
    </div>
  );
}

// Listvy: alla affärer (även äldre avslutade) i en sorterbar tabell.
function DealList({ deals, stage, setStage, sort, setSort, onOpen }) {
  const rows = deals.filter((d) => stage === 'all' || (stage === 'open' ? !['won', 'lost'].includes(d.stage) : stage === 'closed' ? ['won', 'lost'].includes(d.stage) : d.stage === stage));
  const key = {
    title: (d) => d.title.toLowerCase(), customer: (d) => (d.company || `${d.first_name || ''} ${d.last_name || ''}`).toLowerCase(), value: (d) => d.value,
    stage: (d) => STAGES.findIndex((s) => s.key === d.stage), next: (d) => d.next_task?.due_at || '9999', expected_close: (d) => d.expected_close || '9999',
    updated_at: (d) => d.updated_at, owner: (d) => d.owner_name || '',
  }[sort.col];
  const sorted = [...rows].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0) * (sort.dir === 'asc' ? 1 : -1));
  const Th = ({ col, children, className }) => (
    <th className={cx('px-4 py-3 font-medium', className)}>
      <button onClick={() => setSort((s) => ({ col, dir: s.col === col && s.dir === 'desc' ? 'asc' : 'desc' }))} className={cx('inline-flex items-center gap-1 hover:text-slate-700', sort.col === col && 'text-slate-800')}>{children}<ArrowUpDown className="size-3" /></button>
    </th>
  );
  return (
    <div className="card flex-1 overflow-hidden flex flex-col min-h-0">
      <div className="flex flex-wrap items-center gap-3 p-3 border-b border-slate-100">
        <Tabs value={stage} onChange={setStage} tabs={[
          { value: 'open', label: 'Öppna', count: deals.filter((d) => !['won', 'lost'].includes(d.stage)).length },
          { value: 'won', label: 'Vunna', count: deals.filter((d) => d.stage === 'won').length },
          { value: 'lost', label: 'Förlorade', count: deals.filter((d) => d.stage === 'lost').length },
          { value: 'all', label: 'Alla', count: deals.length },
        ]} />
        <span className="ml-auto text-sm text-slate-500">{sorted.length} affärer · {sek(sorted.reduce((s, d) => s + d.value, 0))}</span>
      </div>
      <div className="flex-1 overflow-auto scroll-thin">
        {!sorted.length ? <p className="py-16 text-center text-sm text-slate-500">Inga affärer här</p> : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500 border-b border-slate-100">
              <tr><Th col="title">Affär</Th><Th col="customer">Kund</Th><Th col="value" className="text-right">Värde</Th><Th col="stage">Steg</Th><Th col="next">Nästa steg</Th><Th col="expected_close">Förv. avslut</Th><Th col="owner">Ansvarig</Th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sorted.map((d) => {
                const st = STAGES.find((s) => s.key === d.stage);
                const due = d.next_task && dueLabel(d.next_task.due_at);
                const closed = ['won', 'lost'].includes(d.stage);
                return (
                  <tr key={d.id} onClick={() => onOpen(d)} className="cursor-pointer hover:bg-slate-50/80">
                    <td className="px-4 py-3 font-medium text-slate-800">{d.title}</td>
                    <td className="px-4 py-3"><p className="text-slate-700">{d.company || [d.first_name, d.last_name].filter(Boolean).join(' ') || '—'}</p>{d.company && d.first_name && <p className="text-xs text-slate-500">{d.first_name} {d.last_name}</p>}</td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">{sek(d.value)}</td>
                    <td className="px-4 py-3"><span className="inline-flex items-center gap-1.5 text-xs text-slate-700"><span className="size-2 rounded-full" style={{ background: st?.color }} />{st?.label}</span>{d.stage === 'lost' && d.lost_reason && <p className="text-[11px] text-rose-600">{d.lost_reason}</p>}</td>
                    <td className="px-4 py-3 text-xs max-w-56">
                      {closed ? <span className="text-slate-400">Avslutad {formatDate(d.closed_at, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                        : d.next_task ? <><p className="truncate text-slate-700">{d.next_task.content}</p><p className={due.cls}>{due.text.replace(' · försenad', '')}</p></>
                          : <span className="inline-flex items-center gap-1 text-amber-600"><AlertTriangle className="size-3" />Inget nästa steg</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{d.expected_close ? formatDate(d.expected_close, { day: 'numeric', month: 'short' }) : '—'}</td>
                    <td className="px-4 py-3">{d.owner_name && <span className="flex items-center gap-2"><Avatar name={d.owner_name} color={d.owner_color} size="xs" /><span className="text-xs text-slate-600">{d.owner_name.split(' ')[0]}</span></span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default function Pipeline() {
  const { id } = useParams();
  const nav = useNavigate();
  const { can, team, user } = useApp();
  const toast = useToast();
  const { data: deals, setData, reload } = useFetch('/deals');
  const [drag, setDrag] = useState(null);
  const [over, setOver] = useState(null);
  const [create, setCreate] = useState(null);
  const [lostDeal, setLostDeal] = useState(null);
  const [scope, setScope] = useState('all');
  const [mode, setMode] = useState(() => { try { return localStorage.getItem('lf:pipelineMode') || 'board'; } catch { return 'board'; } });
  const [search, setSearch] = useState('');
  const [listStage, setListStage] = useState('open');
  const [listSort, setListSort] = useState({ col: 'updated_at', dir: 'desc' });
  useLive('refresh', (d) => d.entity === 'deals' && reload());
  const switchMode = (m) => { setMode(m); try { localStorage.setItem('lf:pipelineMode', m); } catch { /* inte kritiskt */ } };

  const move = async (deal, stage, extra = {}) => {
    if (deal.stage === stage) return;
    if (stage === 'lost' && !extra.lost_reason) return setLostDeal(deal);
    setData((ds) => ds.map((d) => (d.id === deal.id ? { ...d, stage, ...extra, stage_changed_at: new Date().toISOString() } : d)));
    try {
      await api.patch(`/deals/${deal.id}`, { stage, ...extra });
      if (stage === 'won') toast(`${deal.title} är vunnen!`, 'success', { title: 'Grattis! 🎉' });
    } catch (e) { toast(e.message, 'error'); }
    reload();
  };
  const save = async () => {
    try { const d = await api.post('/deals', { ...create, value: Number(create.value) || 0 }); setCreate(null); await reload(); nav(`/pipeline/${d.id}`); }
    catch (e) { toast(e.message, 'error'); }
  };

  if (!deals) return <div className="grid place-items-center h-64"><Spinner /></div>;
  // Sök på affär, kontaktperson, företag, ansvarig, e-post eller telefon (siffror jämförs oavsett format).
  const term = search.trim().toLowerCase();
  const digits = term.replace(/\D/g, '').replace(/^46/, '0');
  const matches = (d) => !term || [d.title, d.first_name, d.last_name, `${d.first_name || ''} ${d.last_name || ''}`, d.company, d.owner_name, d.email]
    .some((v) => v && String(v).toLowerCase().includes(term))
    || (digits.length >= 4 && (d.phone || '').replace(/\D/g, '').replace(/^46/, '0').includes(digits));
  const visible = (scope === 'mine' ? deals.filter((d) => d.owner_id === user.id) : deals).filter(matches);
  const open = visible.filter((d) => !['won', 'lost'].includes(d.stage));
  // Tavlan visar bara affärer som avslutats senaste 30 dagarna; äldre finns i listvyn.
  const recentClosed = (d) => !['won', 'lost'].includes(d.stage) || daysSince(d.closed_at || d.updated_at) <= 30;
  const olderClosed = visible.filter((d) => !recentClosed(d)).length;
  const weighted = open.reduce((s, d) => s + d.value * (STAGES.find((x) => x.key === d.stage)?.prob || 0), 0);
  const needsAction = open.filter((d) => !d.next_task || dueLabel(d.next_task.due_at).cls === 'text-rose-600').length;

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <PageHeader title="Pipeline"
        subtitle={<>{open.length} öppna affärer · {sek(open.reduce((s, d) => s + d.value, 0))} totalt · {sek(weighted)} viktat
          {needsAction > 0 && <span className="text-amber-600"> · {needsAction} behöver ett nästa steg</span>}</>}
        actions={<>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Sök affär, kund, telefon…" className="input !w-60 pl-9" />
          </div>
          <Tabs value={mode} onChange={switchMode} tabs={[{ value: 'board', label: 'Tavla' }, { value: 'list', label: 'Lista' }]} />
          {can('leads.view_all') && <Tabs value={scope} onChange={setScope} tabs={[{ value: 'all', label: 'Alla' }, { value: 'mine', label: 'Mina' }]} />}
          {can('leads.edit_own') && <Button icon={Plus} onClick={() => setCreate({ title: '', value: '', stage: 'qualified', expected_close: '', owner_id: user.id })}>Ny affär</Button>}
        </>} />
      {mode === 'list' ? (
        <DealList deals={visible} stage={listStage} setStage={setListStage} sort={listSort} setSort={setListSort} onOpen={(d) => nav(`/pipeline/${d.id}`)} />
      ) : (
      <div className="flex-1 flex gap-4 overflow-x-auto pb-4 scroll-thin">
        {STAGES.map((s) => {
          const list = visible.filter((d) => d.stage === s.key && recentClosed(d));
          const total = list.reduce((a, d) => a + d.value, 0);
          return (
            <div key={s.key} onDragOver={(e) => { e.preventDefault(); setOver(s.key); }} onDragLeave={() => setOver(null)}
              onDrop={() => { if (drag) move(drag, s.key); setDrag(null); setOver(null); }}
              className={cx('flex flex-col w-72 shrink-0 rounded-xl bg-slate-100/70 transition', over === s.key && (s.key === 'lost' ? 'ring-2 ring-rose-300 bg-rose-50/60' : 'ring-2 ring-brand-400 bg-brand-50/60'))}>
              <div className="px-3 pt-3 pb-2">
                <div className="flex items-center gap-2"><span className="size-2 rounded-full" style={{ background: s.color }} /><h3 className="text-sm font-semibold text-slate-800">{s.label}</h3><span className="ml-auto rounded-full bg-white px-2 text-xs font-medium text-slate-500">{list.length}</span></div>
                <p className="mt-0.5 text-xs text-slate-500 tabular-nums">{sek(total)}{!['won', 'lost'].includes(s.key) && total > 0 && ` · ${Math.round(s.prob * 100)} % sannolikhet`}</p>
              </div>
              <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-2 scroll-thin">
                {list.map((d) => (
                  <DealCard key={d.id} d={d} dragging={drag?.id === d.id} onDragStart={() => setDrag(d)} onDragEnd={() => setDrag(null)} onOpen={() => nav(`/pipeline/${d.id}`)} />
                ))}
                {!list.length && <div className="rounded-lg border-2 border-dashed border-slate-200 py-8 text-center text-xs text-slate-400">{term ? 'Inga träffar' : 'Dra hit en affär'}</div>}
                {s.key === 'lost' && olderClosed > 0 && (
                  <button onClick={() => { switchMode('list'); setListStage('closed'); }} className="w-full rounded-lg py-2 text-xs text-slate-500 hover:bg-white hover:text-slate-700">
                    {olderClosed} äldre avslutade · visa i listan
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      )}

      {id && <DealDrawer id={Number(id)} onClose={() => nav('/pipeline')} onChanged={reload} />}
      <LostReasonModal deal={lostDeal} onClose={() => setLostDeal(null)}
        onConfirm={(reason, note) => { const d = lostDeal; setLostDeal(null); move(d, 'lost', { lost_reason: reason, lost_note: note }); }} />

      <Modal open={!!create} onClose={() => setCreate(null)} title="Ny affär" description="Tips: skapa affärer från ett lead så följer kontaktuppgifter och historik med."
        footer={<><Button variant="secondary" onClick={() => setCreate(null)}>Avbryt</Button><Button onClick={save}>Skapa</Button></>}>
        {create && (
          <div className="space-y-4">
            <Field label="Namn"><Input value={create.title} onChange={(e) => setCreate({ ...create, title: e.target.value })} autoFocus /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Värde (kr)"><Input type="number" value={create.value} onChange={(e) => setCreate({ ...create, value: e.target.value })} /></Field>
              <Field label="Steg"><Select value={create.stage} onChange={(e) => setCreate({ ...create, stage: e.target.value })}>{STAGES.filter((s) => !['won', 'lost'].includes(s.key)).map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</Select></Field>
              <Field label="Förväntat avslut"><Input type="date" value={create.expected_close} onChange={(e) => setCreate({ ...create, expected_close: e.target.value })} /></Field>
              <Field label="Ansvarig"><Select value={create.owner_id} disabled={!can('leads.assign')} onChange={(e) => setCreate({ ...create, owner_id: Number(e.target.value) })}>{team.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
