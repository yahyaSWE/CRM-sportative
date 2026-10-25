import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Radio, Code2 } from 'lucide-react';
import { api } from '../api.js';
import { useFetch, useLive } from '../lib/app.jsx';
import { Card, PageHeader, Badge, SourceBadge, Empty, Spinner, Modal, Tabs, cx } from '../components/ui.jsx';
import { SOURCES, formatDateTime, timeAgo } from '../lib/meta.jsx';
import { tr } from '../lib/i18n.js';

const RESULT = {
  created: [tr("Ny lead"), 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'],
  merged: [tr("Sammanslagen"), 'bg-sky-50 text-sky-700 ring-sky-600/20'],
  duplicate: [tr("Dubblett"), 'bg-slate-100 text-slate-600 ring-slate-500/20'],
  error: [tr("Fel"), 'bg-rose-50 text-rose-700 ring-rose-600/20'],
};

export default function Inflow() {
  const { data, reload } = useFetch('/ingest-log?limit=200');
  const [filter, setFilter] = useState('all');
  const [payload, setPayload] = useState(null);
  const [fresh, setFresh] = useState(0);
  useLive('lead', () => { reload(); setFresh((n) => n + 1); });

  const rows = (data || []).filter((r) => filter === 'all' || r.source === filter);
  const today = (data || []).filter((r) => r.result === 'created' && new Date(r.created_at.replace(' ', 'T') + 'Z').toDateString() === new Date().toDateString());

  return (
    <div className="max-w-5xl">
      <PageHeader title={tr("Lead-inflöde")} subtitle={tr("Allt som kommer in från dina kanaler, i realtid.")}
        actions={<span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700"><span className="size-2 rounded-full bg-emerald-500 animate-pulse-ring" />{tr("Lyssnar")}{fresh > 0 && ` · ${fresh} nya`}</span>} />
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 mb-6">
        {['facebook', 'instagram', 'email', 'webform'].map((s) => (
          <Card key={s} className="p-4 flex items-center gap-3">
            <SourceBadge source={s} compact />
            <div><p className="text-lg font-semibold tabular-nums leading-none">{today.filter((r) => r.source === s).length}</p><p className="text-xs text-slate-500 mt-1">{SOURCES[s].label} {tr("idag")}</p></div>
          </Card>
        ))}
      </div>
      <div className="mb-3"><Tabs value={filter} onChange={setFilter} tabs={[{ value: 'all', label: tr("Alla") }, ...['facebook', 'instagram', 'email', 'webform'].map((s) => ({ value: s, label: SOURCES[s].label }))]} /></div>
      <Card className="overflow-hidden">
        {!data ? <div className="py-16 grid place-items-center"><Spinner /></div> : !rows.length ? <Empty icon={Radio} title={tr("Inget har kommit in ännu")} text={tr("Skicka en testlead från Integrationer för att se flödet.")} /> : (
          <ul className="divide-y divide-slate-100">
            {rows.map((r) => {
              const [label, cls] = RESULT[r.result] || RESULT.error;
              return (
                <li key={r.id} className="flex items-center gap-4 px-5 py-3 animate-fade-in">
                  <SourceBadge source={SOURCES[r.source] ? r.source : 'manual'} compact />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-800 truncate">{r.lead_id ? <Link to={`/leads/${r.lead_id}`} className="hover:text-brand-600">{r.summary}</Link> : r.summary}</p>
                    <p className="text-xs text-slate-500">{r.integration_name || SOURCES[r.source]?.label || r.source} · <span title={formatDateTime(r.created_at)}>{timeAgo(r.created_at)}</span></p>
                  </div>
                  <Badge className={cls}>{label}</Badge>
                  <button onClick={async () => setPayload(await api.get(`/ingest-log/${r.id}`))} className="text-slate-400 hover:text-slate-700" title={tr("Visa rådata")}><Code2 className="size-4" /></button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <Modal open={!!payload} onClose={() => setPayload(null)} title={tr("Inkommande rådata")} wide>
        <pre className={cx('rounded-lg bg-slate-900 text-slate-100 text-xs p-4 overflow-auto max-h-[60vh] scroll-thin')}>
          {payload?.payload ? JSON.stringify(JSON.parse(payload.payload), null, 2) : 'Ingen rådata sparad'}
        </pre>
      </Modal>
    </div>
  );
}
