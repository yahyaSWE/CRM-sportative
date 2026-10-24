import { useState } from 'react';
import { Zap, Plus, Trash2, Pencil, ArrowRight, X } from 'lucide-react';
import { api } from '../api.js';
import { useApp, useFetch } from '../lib/app.jsx';
import { Button, Card, PageHeader, Modal, Field, Input, Select, Toggle, Empty, Spinner, Avatar, useToast, Confirm } from '../components/ui.jsx';
import { SOURCES, STATUSES } from '../lib/meta.jsx';

const FIELDS = [
  ['source', 'Källa'], ['source_detail', 'Kampanj / formulär'], ['company', 'Företag'], ['email', 'E-post'], ['city', 'Ort'],
  ['message', 'Meddelande'], ['title', 'Titel'], ['score', 'Poäng'], ['phone', 'Telefon'],
];
const OPS = [
  ['equals', 'är'], ['not_equals', 'är inte'], ['contains', 'innehåller'], ['not_contains', 'innehåller inte'],
  ['is_not_empty', 'är ifyllt'], ['is_empty', 'är tomt'], ['gt', 'är större än'], ['lt', 'är mindre än'],
];
const ACTIONS = [
  ['round_robin', 'Fördela rättvist mellan'], ['assign_user', 'Tilldela'], ['add_tag', 'Lägg till tagg'],
  ['set_status', 'Sätt status'], ['add_score', 'Justera poäng'], ['create_task', 'Skapa uppgift'],
];
const noValue = (op) => op === 'is_empty' || op === 'is_not_empty';

function describe(rule, team) {
  const userName = (id) => team.find((u) => u.id === Number(id))?.name || 'okänd';
  const conds = rule.conditions.map((c) => {
    const f = FIELDS.find((x) => x[0] === c.field)?.[1] || c.field;
    const op = OPS.find((x) => x[0] === c.op)?.[1];
    const v = c.field === 'source' ? SOURCES[c.value]?.label || c.value : c.value;
    return `${f} ${op}${noValue(c.op) ? '' : ` "${v}"`}`;
  });
  const acts = rule.actions.map((a) => {
    if (a.type === 'round_robin') return { text: 'Fördela mellan', users: a.users };
    if (a.type === 'assign_user') return { text: `Tilldela ${userName(a.value)}` };
    if (a.type === 'add_tag') return { text: `Tagga "${a.value}"` };
    if (a.type === 'set_status') return { text: `Status → ${STATUSES[a.value]?.label}` };
    if (a.type === 'add_score') return { text: `Poäng ${a.value > 0 ? '+' : ''}${a.value}` };
    if (a.type === 'create_task') return { text: `Uppgift: "${a.value}" inom ${a.hours || 24} h` };
    return { text: a.type };
  });
  return { conds, acts };
}

function RuleEditor({ rule, setRule, team }) {
  const upd = (key, i, patch) => setRule({ ...rule, [key]: rule[key].map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const rm = (key, i) => setRule({ ...rule, [key]: rule[key].filter((_, j) => j !== i) });
  return (
    <div className="space-y-6">
      <Field label="Regelns namn"><Input value={rule.name} onChange={(e) => setRule({ ...rule, name: e.target.value })} placeholder="t.ex. Facebook-leads till säljteamet" autoFocus /></Field>
      <div>
        <div className="flex items-center gap-2 mb-2 text-sm">
          <span className="font-medium text-slate-800">När ett nytt lead kommer in och</span>
          <Select className="!w-auto !py-1" value={rule.match} onChange={(e) => setRule({ ...rule, match: e.target.value })}><option value="all">alla</option><option value="any">något</option></Select>
          <span className="font-medium text-slate-800">villkor stämmer:</span>
        </div>
        <div className="space-y-2">
          {rule.conditions.map((c, i) => (
            <div key={i} className="flex gap-2 items-center">
              <Select className="!w-40" value={c.field} onChange={(e) => upd('conditions', i, { field: e.target.value, value: '' })}>{FIELDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
              <Select className="!w-40" value={c.op} onChange={(e) => upd('conditions', i, { op: e.target.value })}>{OPS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
              {!noValue(c.op) && (c.field === 'source' ? (
                <Select value={c.value} onChange={(e) => upd('conditions', i, { value: e.target.value })}><option value="">Välj…</option>{Object.entries(SOURCES).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}</Select>
              ) : <Input value={c.value} onChange={(e) => upd('conditions', i, { value: e.target.value })} />)}
              <button onClick={() => rm('conditions', i)} className="p-1.5 text-slate-400 hover:text-rose-500"><X className="size-4" /></button>
            </div>
          ))}
          {!rule.conditions.length && <p className="text-xs text-slate-500">Inga villkor – regeln körs för alla nya leads.</p>}
          <Button size="sm" variant="ghost" icon={Plus} onClick={() => setRule({ ...rule, conditions: [...rule.conditions, { field: 'source', op: 'equals', value: '' }] })}>Lägg till villkor</Button>
        </div>
      </div>
      <div>
        <p className="text-sm font-medium text-slate-800 mb-2">…gör då följande:</p>
        <div className="space-y-2">
          {rule.actions.map((a, i) => (
            <div key={i} className="flex gap-2 items-start rounded-lg border border-slate-200 p-2">
              <Select className="!w-52" value={a.type} onChange={(e) => upd('actions', i, { type: e.target.value, value: '', users: [] })}>{ACTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
              <div className="flex-1">
                {a.type === 'round_robin' && (
                  <div className="flex flex-wrap gap-1.5">
                    {team.map((u) => {
                      const on = (a.users || []).includes(u.id);
                      return <button key={u.id} type="button" onClick={() => upd('actions', i, { users: on ? a.users.filter((x) => x !== u.id) : [...(a.users || []), u.id] })}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs ${on ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600'}`}><Avatar name={u.name} color={u.color} size="xs" />{u.name.split(' ')[0]}</button>;
                    })}
                  </div>
                )}
                {a.type === 'assign_user' && <Select value={a.value} onChange={(e) => upd('actions', i, { value: Number(e.target.value) })}><option value="">Välj person…</option>{team.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select>}
                {a.type === 'set_status' && <Select value={a.value} onChange={(e) => upd('actions', i, { value: e.target.value })}><option value="">Välj…</option>{Object.entries(STATUSES).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}</Select>}
                {a.type === 'add_tag' && <Input value={a.value} onChange={(e) => upd('actions', i, { value: e.target.value })} placeholder="t.ex. Het" />}
                {a.type === 'add_score' && <Input type="number" value={a.value} onChange={(e) => upd('actions', i, { value: Number(e.target.value) })} placeholder="+10 eller -10" />}
                {a.type === 'create_task' && <div className="flex gap-2"><Input value={a.value} onChange={(e) => upd('actions', i, { value: e.target.value })} placeholder="Ring upp leadet" /><Input type="number" className="input !w-24" value={a.hours || 24} onChange={(e) => upd('actions', i, { hours: Number(e.target.value) })} title="Inom antal timmar" /></div>}
              </div>
              <button onClick={() => rm('actions', i)} className="p-1.5 text-slate-400 hover:text-rose-500"><X className="size-4" /></button>
            </div>
          ))}
          <Button size="sm" variant="ghost" icon={Plus} onClick={() => setRule({ ...rule, actions: [...rule.actions, { type: 'add_tag', value: '' }] })}>Lägg till åtgärd</Button>
        </div>
      </div>
    </div>
  );
}

export default function Automations() {
  const { can, team } = useApp();
  const toast = useToast();
  const { data, reload } = useFetch('/automations');
  const [rule, setRule] = useState(null);
  const [del, setDel] = useState(null);
  const manage = can('automation.manage');

  const save = async () => {
    try {
      if (rule.id) await api.patch(`/automations/${rule.id}`, rule); else await api.post('/automations', rule);
      setRule(null); reload(); toast('Regeln sparades');
    } catch (e) { toast(e.message, 'error'); }
  };
  const toggle = async (r) => { await api.patch(`/automations/${r.id}`, { enabled: !r.enabled }); reload(); };

  return (
    <div className="max-w-4xl">
      <PageHeader title="Automatisering" subtitle="Regler som körs direkt när ett lead kommer in – fördela, tagga, poängsätt och skapa uppföljningar automatiskt."
        actions={manage && <Button icon={Plus} onClick={() => setRule({ name: '', match: 'all', conditions: [{ field: 'source', op: 'equals', value: 'facebook' }], actions: [{ type: 'round_robin', users: [] }], enabled: true })}>Ny regel</Button>} />
      {!data ? <Spinner /> : !data.length ? <Card><Empty icon={Zap} title="Inga regler än" text="Skapa en regel för att automatiskt fördela leads till rätt säljare." /></Card> : (
        <div className="space-y-3">
          {data.map((r, idx) => {
            const d = describe(r, team);
            return (
              <Card key={r.id} className="p-5">
                <div className="flex items-start gap-4">
                  <span className="grid place-items-center size-9 rounded-lg bg-amber-50 text-amber-600 shrink-0 text-sm font-semibold">{idx + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2"><h3 className="font-semibold text-slate-900">{r.name}</h3><span className="text-xs text-slate-400">körts {r.runs} gånger</span></div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-slate-500">Om</span>
                      {d.conds.length ? d.conds.map((c, i) => <span key={i} className="flex items-center gap-2">{i > 0 && <span className="text-slate-400">{r.match === 'any' ? 'eller' : 'och'}</span>}<span className="rounded-md bg-slate-100 px-2 py-1 text-slate-700">{c}</span></span>) : <span className="rounded-md bg-slate-100 px-2 py-1 text-slate-700">alla nya leads</span>}
                      <ArrowRight className="size-3.5 text-slate-400" />
                      {d.acts.map((a, i) => (
                        <span key={i} className="inline-flex items-center gap-1.5 rounded-md bg-brand-50 px-2 py-1 text-brand-700">{a.text}
                          {a.users && <span className="flex -space-x-1">{a.users.map((id) => { const u = team.find((x) => x.id === id); return u && <Avatar key={id} name={u.name} color={u.color} size="xs" />; })}</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                  {manage && <div className="flex items-center gap-1">
                    <Toggle checked={r.enabled} onChange={() => toggle(r)} />
                    <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setRule(JSON.parse(JSON.stringify(r)))} />
                    <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setDel(r)} />
                  </div>}
                </div>
              </Card>
            );
          })}
          <p className="text-xs text-slate-500 px-1">Reglerna körs uppifrån och ned. Om flera regler tilldelar ansvarig gäller den sista som matchar.</p>
        </div>
      )}
      <Modal open={!!rule} onClose={() => setRule(null)} wide title={rule?.id ? 'Redigera regel' : 'Ny automatiseringsregel'}
        footer={<><Button variant="secondary" onClick={() => setRule(null)}>Avbryt</Button><Button onClick={save}>Spara regel</Button></>}>
        {rule && <RuleEditor rule={rule} setRule={setRule} team={team} />}
      </Modal>
      <Confirm open={!!del} onClose={() => setDel(null)} title="Radera regel?" text={`"${del?.name}" tas bort.`} onConfirm={async () => { await api.del(`/automations/${del.id}`); setDel(null); reload(); }} />
    </div>
  );
}
