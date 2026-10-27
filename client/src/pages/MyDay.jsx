import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, Circle, Phone, Video, MapPin, Briefcase, UserPlus, Clock, AlertTriangle, CheckCircle2, ArrowRight, Sparkles } from 'lucide-react';
import { api, qs } from '../api.js';
import { useApp, useFetch, useLive } from '../lib/app.jsx';
import { Card, Button, SourceBadge, Spinner, useToast, cx } from '../components/ui.jsx';
import { useRecordDrawers } from '../components/Records.jsx';
import MeetingModal, { parseUtc, toUtcSql, fmtTime } from '../components/MeetingModal.jsx';
import { STAGES, leadName, sek, timeAgo, dueLabel, daysSince } from '../lib/meta.jsx';
import { tr, locale } from '../lib/i18n.js';

function Section({ icon: Icon, title, count, tone = 'slate', action, children, empty }) {
  const tones = { slate: 'bg-slate-100 text-slate-600', brand: 'bg-brand-50 text-brand-600', amber: 'bg-amber-50 text-amber-600', rose: 'bg-rose-50 text-rose-600', violet: 'bg-violet-50 text-violet-600', emerald: 'bg-emerald-50 text-emerald-600' };
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-slate-100">
        <span className={cx('grid place-items-center size-7 rounded-lg', tones[tone])}><Icon className="size-4" /></span>
        <h2 className="font-semibold text-slate-900">{title}</h2>
        {count > 0 && <span className="rounded-full bg-slate-100 px-2 text-xs font-medium text-slate-600">{count}</span>}
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {count ? <div className="divide-y divide-slate-100">{children}</div> : <p className="px-5 py-6 text-sm text-slate-400">{empty}</p>}
    </Card>
  );
}

export default function MyDay() {
  const { user } = useApp();
  const toast = useToast();
  const [dayStart] = useState(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; });
  const url = '/today' + qs({ from: toUtcSql(dayStart), to: toUtcSql(new Date(dayStart.getTime() + 864e5)) });
  const { data, reload } = useFetch(url);
  const { openLead, openDeal, drawers } = useRecordDrawers(reload);
  const [meeting, setMeeting] = useState(null);
  const [done, setDone] = useState(new Set());
  useLive(['lead', 'refresh', 'meeting'], () => reload());

  const completeTask = async (t) => {
    setDone((s) => new Set(s).add(t.id));
    await api.patch(`/activities/${t.id}`, { done: true });
    toast(tr("Uppgiften är klar"));
    setTimeout(reload, 400);
  };
  const claim = async (l) => {
    try { await api.patch(`/leads/${l.id}`, { owner_id: user.id }); toast(tr("{0} är nu din", { 0: leadName(l) })); reload(); }
    catch (e) { toast(e.message, 'error'); }
  };

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 10 ? tr("God morgon") : hour < 17 ? tr("Hej") : tr("God kväll");
  const dateText = now.toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' });

  if (!data) return <div className="grid place-items-center h-64"><Spinner /></div>;
  const overdue = data.tasks.filter((t) => t.due_at && parseUtc(t.due_at) < dayStart);
  const nextMeeting = data.meetings.find((m) => parseUtc(m.end_at) > now && m.status === 'scheduled');
  const summary = [
    [data.meetings.length, data.meetings.length === 1 ? tr("möte") : tr("möten"), 'violet'],
    [data.tasks.length, tr("att göra"), overdue.length ? 'rose' : 'brand'],
    [data.newLeads.length, tr("nya leads"), 'brand'],
    [data.stuckDeals.length + data.followups.length, tr("att följa upp"), 'amber'],
  ];
  const allClear = !data.meetings.length && !data.tasks.length && !data.newLeads.length && !data.stuckDeals.length && !data.followups.length && !data.outcomes.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500 capitalize">{dateText}</p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{greeting}, {user.name.split(' ')[0]}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {summary.map(([n, label, tone]) => (
            <span key={label} className={cx('rounded-full px-3 py-1 text-sm font-medium', n ? { violet: 'bg-violet-50 text-violet-700', rose: 'bg-rose-50 text-rose-700', brand: 'bg-brand-50 text-brand-700', amber: 'bg-amber-50 text-amber-700' }[tone] : 'bg-slate-100 text-slate-400')}>
              {n} {label}
            </span>
          ))}
        </div>
      </div>

      {nextMeeting && (
        <Card className="p-4 flex flex-wrap items-center gap-4 border-violet-200 bg-gradient-to-r from-violet-50 to-white">
          <span className="grid place-items-center size-10 rounded-xl bg-violet-600 text-white"><CalendarClock className="size-5" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-violet-700">{tr("Nästa möte")} {parseUtc(nextMeeting.start_at) <= now ? tr("pågår nu") : `kl ${fmtTime(nextMeeting.start_at)}`}</p>
            <p className="font-semibold text-slate-900 truncate">{nextMeeting.title}</p>
            {(nextMeeting.company || nextMeeting.first_name) && <p className="text-sm text-slate-500 truncate">{[nextMeeting.first_name, nextMeeting.last_name].filter(Boolean).join(' ')}{nextMeeting.company && ` · ${nextMeeting.company}`}</p>}
          </div>
          {nextMeeting.video_url && <a href={nextMeeting.video_url} target="_blank" rel="noreferrer"><Button icon={Video}>{tr("Anslut")}</Button></a>}
          {nextMeeting.lead_phone && <a href={`tel:${nextMeeting.lead_phone}`}><Button variant="secondary" icon={Phone}>{tr("Ring")}</Button></a>}
          <Button variant="ghost" onClick={() => setMeeting(nextMeeting.id)}>{tr("Detaljer")}</Button>
        </Card>
      )}

      {allClear && (
        <Card className="p-10 text-center">
          <Sparkles className="mx-auto size-8 text-emerald-500" />
          <p className="mt-3 font-semibold text-slate-900">{tr("Allt är klart för idag")}</p>
          <p className="text-sm text-slate-500">{tr("Inga möten, uppgifter eller leads som väntar. Passa på att")} <Link to="/pipeline" className="text-brand-600 underline">{tr("gå igenom pipelinen")}</Link>.</p>
        </Card>
      )}

      {!allClear && (
        <div className="grid gap-6 xl:grid-cols-2">
          <div className="space-y-6">
            <Section icon={CalendarClock} tone="violet" title={tr("Dagens möten")} count={data.meetings.length} empty={tr("Inga möten idag.")}
              action={<Link to="/calendar" className="text-xs font-medium text-brand-600">{tr("Kalender")}</Link>}>
              {data.meetings.map((m) => {
                const past = parseUtc(m.end_at) < now;
                return (
                  <button key={m.id} onClick={() => setMeeting(m.id)} className={cx('flex w-full items-center gap-4 px-5 py-3 text-left hover:bg-slate-50', past && m.status !== 'scheduled' && 'opacity-60')}>
                    <span className="w-14 shrink-0 text-sm font-semibold tabular-nums text-slate-900">{m.all_day ? tr("Heldag") : fmtTime(m.start_at)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-slate-800 truncate">{m.title}</span>
                      <span className="flex items-center gap-1.5 text-xs text-slate-500 truncate">
                        {m.video_url && <Video className="size-3" />}{m.location && <><MapPin className="size-3" />{m.location}</>}
                        {(m.company || m.first_name) && <span className="truncate">{m.company || `${m.first_name} ${m.last_name || ''}`}</span>}
                      </span>
                    </span>
                    {past && m.status === 'scheduled' && (m.lead_id || m.deal_id) && <span className="text-xs font-medium text-amber-600">{tr("Logga utfall")}</span>}
                    {m.status === 'done' && <CheckCircle2 className="size-4 text-emerald-500" />}
                  </button>
                );
              })}
            </Section>

            {data.outcomes.length > 0 && (
              <Section icon={AlertTriangle} tone="amber" title={tr("Möten utan utfall")} count={data.outcomes.length}>
                {data.outcomes.map((m) => (
                  <button key={m.id} onClick={() => setMeeting(m.id)} className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-slate-50">
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-slate-800 truncate">{m.title}</span>
                      <span className="block text-xs text-slate-500">{parseUtc(m.start_at).toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short' })} · {m.company || [m.first_name, m.last_name].filter(Boolean).join(' ')}</span>
                    </span>
                    <span className="text-xs font-medium text-brand-600">{tr("Hur gick det?")}</span>
                  </button>
                ))}
              </Section>
            )}

            <Section icon={CheckCircle2} tone={overdue.length ? 'rose' : 'brand'} title={tr("Att göra idag")} count={data.tasks.length} empty={tr("Inga uppgifter idag.")}
              action={<Link to="/tasks" className="text-xs font-medium text-brand-600">{tr("Alla uppgifter")}</Link>}>
              {data.tasks.map((t) => {
                const due = dueLabel(t.due_at);
                const who = [t.first_name, t.last_name].filter(Boolean).join(' ') || t.company;
                return (
                  <div key={t.id} className={cx('flex items-center gap-3 px-5 py-3 transition', done.has(t.id) && 'opacity-40')}>
                    <button onClick={() => completeTask(t)} className="text-slate-300 hover:text-emerald-500" title={tr("Markera som klar")}>
                      {done.has(t.id) ? <CheckCircle2 className="size-5 text-emerald-500" /> : <Circle className="size-5" />}
                    </button>
                    <button onClick={() => (t.deal_id ? openDeal(t.deal_id) : t.lead_id && openLead(t.lead_id))} className="min-w-0 flex-1 text-left">
                      <p className={cx('text-sm text-slate-800 truncate', done.has(t.id) && 'line-through')}>{t.content}</p>
                      <p className="text-xs truncate"><span className={due.cls}>{due.text}</span>{who && <span className="text-slate-500"> · {who}</span>}{t.deal_title && <span className="text-violet-600"> · {t.deal_title}</span>}</p>
                    </button>
                    {t.phone && <a href={`tel:${t.phone}`} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600" title={tr("Ring {0}", { 0: t.phone })}><Phone className="size-4" /></a>}
                  </div>
                );
              })}
            </Section>
          </div>

          <div className="space-y-6">
            <Section icon={UserPlus} tone="brand" title={tr("Nya leads att ringa")} count={data.newLeads.length} empty={tr("Inga nya leads just nu.")}
              action={<Link to="/leads?view=new" className="text-xs font-medium text-brand-600">{tr("Alla nya")}</Link>}>
              {data.newLeads.map((l) => (
                <div key={l.id} className="flex items-center gap-3 px-5 py-3">
                  <SourceBadge source={l.source} compact />
                  <button onClick={() => openLead(l.id)} className="min-w-0 flex-1 text-left">
                    <p className="text-sm font-medium text-slate-800 truncate">{leadName(l)}</p>
                    <p className="text-xs text-slate-500 truncate">{[l.company !== leadName(l) && l.company, l.source_detail].filter(Boolean).join(' · ')} {tr("· inkom")} {timeAgo(l.created_at)}</p>
                  </button>
                  {!l.owner_id && <Button size="sm" variant="soft" onClick={() => claim(l)}>{tr("Ta")}</Button>}
                  {l.phone && <a href={`tel:${l.phone}`}><Button size="sm" variant="secondary" icon={Phone}>{tr("Ring")}</Button></a>}
                </div>
              ))}
            </Section>

            <Section icon={Briefcase} tone="amber" title={tr("Affärer utan nästa steg")} count={data.stuckDeals.length} empty={tr("Alla dina affärer har ett nästa steg.")}
              action={<Link to="/pipeline" className="text-xs font-medium text-brand-600">{tr("Pipeline")}</Link>}>
              {data.stuckDeals.map((d) => {
                const st = STAGES.find((s) => s.key === d.stage);
                const days = daysSince(d.stage_changed_at || d.updated_at);
                return (
                  <button key={d.id} onClick={() => openDeal(d.id)} className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-slate-50">
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-slate-800 truncate">{d.title}</span>
                      <span className="flex items-center gap-1.5 text-xs text-slate-500"><span className="size-2 rounded-full" style={{ background: st?.color }} />{st?.label} · {days} {tr("d i steget")}
                        {d.next_task && <span className="text-rose-600"> {tr("· försenad uppgift")}</span>}</span>
                    </span>
                    <span className="text-sm font-medium tabular-nums text-slate-700">{sek(d.value)}</span>
                    <ArrowRight className="size-4 text-slate-300" />
                  </button>
                );
              })}
            </Section>

            <Section icon={Clock} tone="amber" title={tr("Kontakta igen")} count={data.followups.length} empty={tr("Inga leads som riskerar att glömmas bort.")}
              action={<Link to="/leads?view=followup&owner=me" className="text-xs font-medium text-brand-600">{tr("Alla")}</Link>}>
              {data.followups.map((l) => (
                <div key={l.id} className="flex items-center gap-3 px-5 py-3">
                  <button onClick={() => openLead(l.id)} className="min-w-0 flex-1 text-left">
                    <p className="text-sm font-medium text-slate-800 truncate">{leadName(l)}</p>
                    <p className="text-xs text-slate-500 truncate">{l.company && l.company !== leadName(l) ? `${l.company} · ` : ''}{l.last_contact_at ? tr("senaste kontakt {0}", { 0: timeAgo(l.last_contact_at) }) : tr("ingen kontakt loggad")}</p>
                  </button>
                  {l.phone && <a href={`tel:${l.phone}`} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600" title={tr("Ring {0}", { 0: l.phone })}><Phone className="size-4" /></a>}
                </div>
              ))}
            </Section>
          </div>
        </div>
      )}

      {drawers}
      <MeetingModal open={!!meeting} meetingId={meeting} onClose={() => setMeeting(null)} onSaved={reload} />
    </div>
  );
}
