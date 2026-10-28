import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, BarChart, Bar } from 'recharts';
import { TrendingUp, TrendingDown, Users, Target, Wallet, Clock, Inbox, ArrowRight, CheckCircle2, Circle } from 'lucide-react';
import { useApp, useFetch, useLive } from '../lib/app.jsx';
import { api } from '../api.js';
import { Card, PageHeader, Tabs, SourceBadge, StatusBadge, Avatar, Spinner, Empty, cx } from '../components/ui.jsx';
import { SOURCES, STAGES, leadName, sek, num, pct, timeAgo, dueLabel } from '../lib/meta.jsx';
import { tr, locale } from '../lib/i18n.js';
import ContactResults from '../components/ContactResults.jsx';

function Kpi({ label, value, sub, icon: Icon, trend, accent }) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <span className={cx('grid place-items-center size-9 rounded-lg', accent)}><Icon className="size-[18px]" /></span>
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">{value}</p>
      <div className="mt-1 flex items-center gap-1.5 text-xs">
        {trend != null && (
          <span className={cx('inline-flex items-center gap-0.5 font-medium', trend >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
            {trend >= 0 ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}{Math.abs(Math.round(trend * 100))} %
          </span>
        )}
        <span className="text-slate-500">{sub}</span>
      </div>
    </Card>
  );
}

const ChartTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + (p.value || 0), 0);
  return (
    <div className="card px-3 py-2 shadow-lg text-xs">
      <p className="font-medium text-slate-900 mb-1">{label} · {total} {tr("leads")}</p>
      {payload.filter((p) => p.value).map((p) => (
        <p key={p.dataKey} className="flex items-center gap-2 text-slate-600"><span className="size-2 rounded-full" style={{ background: p.color }} />{SOURCES[p.dataKey]?.label}: {p.value}</p>
      ))}
    </div>
  );
};

function LostReasons({ rows, days }) {
  const byReason = {};
  for (const r of rows) {
    const x = (byReason[r.reason] ||= { reason: r.reason, n: 0, v: 0, sources: {} });
    x.n += r.n; x.v += r.v; x.sources[r.source] = (x.sources[r.source] || 0) + r.n;
  }
  const list = Object.values(byReason).sort((a, b) => b.n - a.n);
  const max = list[0].n;
  const total = list.reduce((s, r) => s + r.n, 0);
  return (
    <Card className="p-5">
      <div className="flex items-baseline justify-between mb-4">
        <div><h3 className="font-semibold text-slate-900">{tr("Varför förlorar vi affärer?")}</h3><p className="text-xs text-slate-500">{total} {tr("förlorade affärer senaste")} {days} {tr("dagarna, per orsak och kanal")}</p></div>
        <span className="text-sm text-slate-500">{sek(list.reduce((s, r) => s + r.v, 0))} {tr("förlorat")}</span>
      </div>
      <div className="space-y-3">
        {list.map((r) => (
          <div key={r.reason} className="grid grid-cols-[140px_1fr_auto] items-center gap-4">
            <span className="text-sm text-slate-700 truncate">{tr(r.reason)}</span>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full bg-rose-400" style={{ width: `${(r.n / max) * 100}%` }} /></div>
            <span className="flex items-center gap-2 text-xs text-slate-500">
              {Object.entries(r.sources).sort((a, b) => b[1] - a[1]).map(([s, n]) => <span key={s} className="inline-flex items-center gap-1" title={SOURCES[s]?.label}><SourceBadge source={s} compact />{n}</span>)}
              <span className="w-10 text-right font-medium text-slate-700 tabular-nums">{r.n} {tr("st")}</span>
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function Dashboard() {
  const { user } = useApp();
  const [days, setDays] = useState(30);
  const { data, reload } = useFetch(`/dashboard?days=${days}`);
  useLive(['lead', 'refresh'], () => reload());

  const series = useMemo(() => {
    if (!data) return [];
    const map = {};
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
      map[d] = { day: d, label: new Date(d).toLocaleDateString(locale(), { day: 'numeric', month: 'short' }), ...Object.fromEntries(Object.keys(SOURCES).map((s) => [s, 0])) };
    }
    for (const r of data.perDay) if (map[r.day]) map[r.day][r.source] = r.n;
    return Object.values(map);
  }, [data, days]);

  if (!data) return <div className="grid place-items-center h-64"><Spinner /></div>;
  const k = data.kpi;
  const trend = k.prevLeads ? (k.newLeads - k.prevLeads) / k.prevLeads : null;
  const sourceKeys = Object.keys(SOURCES).filter((s) => data.perDay.some((r) => r.source === s));
  const hour = new Date().getHours();
  const greeting = hour < 10 ? tr("God morgon") : hour < 17 ? tr("Hej") : tr("God kväll");

  return (
    <div className="space-y-6">
      <PageHeader title={`${greeting}, ${user.name.split(' ')[0]}`}
        subtitle={data.team ? tr("Så här går det för teamet.") : tr("Så här går det för dig.")}
        actions={<Tabs value={days} onChange={setDays} tabs={[{ value: 7, label: '7 dagar' }, { value: 30, label: '30 dagar' }, { value: 90, label: '90 dagar' }]} />} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label={tr("Nya leads")} value={num(k.newLeads)} sub={`${k.today} idag`} trend={trend} icon={Users} accent="bg-brand-50 text-brand-600" />
        <Kpi label={tr("Konverteringsgrad")} value={pct(k.conversionRate)} sub={tr("Vinstgrad affärer {0}", { 0: pct(k.winRate) })} icon={Target} accent="bg-emerald-50 text-emerald-600" />
        <Kpi label={tr("Pipelinevärde")} value={sek(k.pipelineValue)} sub={tr("{0} öppna affärer · {1} vunnet", { 0: k.openDeals, 1: sek(k.wonValue) })} icon={Wallet} accent="bg-violet-50 text-violet-600" />
        <Kpi label={tr("Svarstid")} value={k.responseHours != null ? `${k.responseHours < 1 ? Math.round(k.responseHours * 60) + ' min' : k.responseHours.toFixed(1) + ' h'}` : '–'} sub="snitt till första kontakt" icon={Clock} accent="bg-amber-50 text-amber-600" />
      </div>

      {data.contactResults && <ContactResults data={data.contactResults} days={days} />}

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="p-5 xl:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div><h3 className="font-semibold text-slate-900">{tr("Inkommande leads per kanal")}</h3><p className="text-xs text-slate-500">{tr("Automatiskt insamlade och manuellt skapade")}</p></div>
            <div className="hidden sm:flex flex-wrap gap-3">{sourceKeys.map((s) => <span key={s} className="flex items-center gap-1.5 text-xs text-slate-600"><span className="size-2 rounded-full" style={{ background: SOURCES[s].color }} />{SOURCES[s].label}</span>)}</div>
          </div>
          <div className="h-72">
            <ResponsiveContainer>
              <AreaChart data={series} margin={{ left: -20, right: 4, top: 4 }}>
                <defs>{sourceKeys.map((s) => (
                  <linearGradient key={s} id={`g-${s}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={SOURCES[s].color} stopOpacity={0.35} /><stop offset="100%" stopColor={SOURCES[s].color} stopOpacity={0.02} /></linearGradient>
                ))}</defs>
                <CartesianGrid vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={24} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTip />} />
                {sourceKeys.map((s) => <Area key={s} type="monotone" dataKey={s} stackId="1" stroke={SOURCES[s].color} strokeWidth={2} fill={`url(#g-${s})`} />)}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="font-semibold text-slate-900">{tr("Leadkällor")}</h3>
          <p className="text-xs text-slate-500 mb-2">{tr("Andel och konvertering per kanal")}</p>
          <div className="h-44">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={data.bySource} dataKey="n" nameKey="source" innerRadius={52} outerRadius={78} paddingAngle={2} stroke="none">
                  {data.bySource.map((s) => <Cell key={s.source} fill={SOURCES[s.source]?.color || '#94a3b8'} />)}
                </Pie>
                <Tooltip formatter={(v, n) => [v, SOURCES[n]?.label]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2.5 mt-2">
            {data.bySource.map((s) => {
              const total = data.bySource.reduce((a, b) => a + b.n, 0);
              return (
                <div key={s.source} className="flex items-center gap-3 text-sm">
                  <SourceBadge source={s.source} compact />
                  <span className="flex-1 text-slate-700">{SOURCES[s.source]?.label}</span>
                  <span className="text-xs text-slate-400">{pct(s.n ? s.converted / s.n : 0)} {tr("konv.")}</span>
                  <span className="w-12 text-right font-medium tabular-nums">{Math.round((s.n / total) * 100)} %</span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <div><h3 className="font-semibold text-slate-900">{tr("Senaste leads")}</h3>
              {k.unassigned > 0 && <p className="text-xs text-amber-600">{k.unassigned} {tr("nya leads väntar på att tilldelas")}</p>}</div>
            <Link to="/leads" className="text-sm font-medium text-brand-600 hover:text-brand-700 inline-flex items-center gap-1">{tr("Visa alla")}<ArrowRight className="size-4" /></Link>
          </div>
          {!data.recent.length ? <Empty icon={Inbox} title={tr("Inga leads än")} text={tr("Koppla in en kanal under Integrationer så hämtas leads automatiskt.")} /> : (
            <div className="divide-y divide-slate-100">
              {data.recent.map((l) => (
                <Link key={l.id} to={`/leads/${l.id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-slate-50/80">
                  <SourceBadge source={l.source} compact />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800 truncate">{leadName(l)}</p>
                    <p className="text-xs text-slate-500 truncate">{[l.company, l.source_detail].filter(Boolean).join(' · ')}</p>
                  </div>
                  <StatusBadge status={l.status} />
                  <span className="hidden sm:block w-24 text-right text-xs text-slate-400">{timeAgo(l.created_at)}</span>
                  {l.owner_name ? <Avatar name={l.owner_name} color={l.owner_color} size="sm" /> : <span className="size-7 rounded-full border border-dashed border-slate-300" title={tr("Otilldelad")} />}
                </Link>
              ))}
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex items-center justify-between mb-3"><h3 className="font-semibold text-slate-900">{tr("Mina uppgifter")}</h3><Link to="/tasks" className="text-xs font-medium text-brand-600">{tr("Alla")}</Link></div>
            {!data.tasks.length ? <p className="text-sm text-slate-500 py-4 text-center">{tr("Inga öppna uppgifter 🎉")}</p> : (
              <ul className="space-y-1">
                {data.tasks.map((t) => {
                  const due = dueLabel(t.due_at);
                  return (
                    <li key={t.id} className="flex items-start gap-3 rounded-lg p-2 -mx-2 hover:bg-slate-50">
                      <button onClick={async () => { await api.patch(`/activities/${t.id}`, { done: true }); reload(); }} className="mt-0.5 text-slate-300 hover:text-emerald-500"><Circle className="size-4" /></button>
                      <Link to={`/leads/${t.lead_id}`} className="min-w-0 flex-1">
                        <p className="text-sm text-slate-700 truncate">{t.content}</p>
                        <p className="text-xs"><span className={due.cls}>{due.text}</span>{t.first_name && <span className="text-slate-400"> · {t.first_name} {t.last_name}</span>}</p>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
          <Card className="p-5">
            <h3 className="font-semibold text-slate-900 mb-3">{tr("Pipeline")}</h3>
            <div className="h-40">
              <ResponsiveContainer>
                <BarChart data={STAGES.filter((s) => s.key !== 'lost').map((s) => ({ ...s, v: data.stages.find((x) => x.stage === s.key)?.v || 0 }))} margin={{ left: -10, right: 0 }}>
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} interval={0} />
                  <YAxis hide />
                  <Tooltip formatter={(v) => sek(v)} cursor={{ fill: '#f8fafc' }} />
                  <Bar dataKey="v" radius={[6, 6, 0, 0]}>{STAGES.filter((s) => s.key !== 'lost').map((s) => <Cell key={s.key} fill={s.color} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      </div>

      {data.lostReasons.length > 0 && <LostReasons rows={data.lostReasons} days={days} />}

      {data.team && data.leaderboard.length > 0 && (
        <Card className="overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100"><h3 className="font-semibold text-slate-900">{tr("Topplista")}</h3><p className="text-xs text-slate-500">{tr("Senaste")} {days} {tr("dagarna")}</p></div>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-slate-500"><th className="px-5 py-2 font-medium">{tr("Säljare")}</th><th className="px-5 py-2 font-medium text-right">{tr("Nya leads")}</th><th className="px-5 py-2 font-medium text-right">{tr("Vunna affärer")}</th><th className="px-5 py-2 font-medium text-right">{tr("Intäkt")}</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {data.leaderboard.map((u, i) => (
                <tr key={u.id}>
                  <td className="px-5 py-3"><div className="flex items-center gap-3"><span className="w-4 text-xs text-slate-400">{i + 1}</span><Avatar name={u.name} color={u.color} size="sm" /><span className="font-medium text-slate-800">{u.name}</span>{i === 0 && u.revenue > 0 && <CheckCircle2 className="size-4 text-amber-400" />}</div></td>
                  <td className="px-5 py-3 text-right tabular-nums">{u.leads}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{u.won}</td>
                  <td className="px-5 py-3 text-right tabular-nums font-medium">{sek(u.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
