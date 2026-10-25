import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Plus, RefreshCw, Copy, Check, Link2, Unlink, Settings2, Video, AlertTriangle, CalendarClock, CheckCircle2 } from 'lucide-react';
import { api, qs } from '../api.js';
import { useApp, useFetch, useLive } from '../lib/app.jsx';
import { Button, Card, PageHeader, Tabs, Select, Modal, Field, Input, Spinner, useToast, cx } from '../components/ui.jsx';
import MeetingModal, { parseUtc, toUtcSql, fmtTime } from '../components/MeetingModal.jsx';
import { timeAgo } from '../lib/meta.jsx';
import { tr, locale } from '../lib/i18n.js';

const DAY_START = 7, DAY_END = 20, HOUR_PX = 56;
const WEEKDAYS = [tr("Mån"), tr("Tis"), tr("Ons"), tr("Tor"), tr("Fre"), tr("Lör"), tr("Sön")];

const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const startOfWeek = (d) => { const x = startOfDay(d); return addDays(x, -((x.getDay() + 6) % 7)); };
const sameDay = (a, b) => a.toDateString() === b.toDateString();
const isoWeek = (d) => {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  return Math.ceil(((t - new Date(Date.UTC(t.getUTCFullYear(), 0, 1))) / 864e5 + 1) / 7);
};

function eventStyle(m, teamView) {
  if (m.status === 'cancelled') return { cls: 'bg-slate-100 text-slate-400 line-through border-slate-300' };
  if (teamView && m.owner_color) return { cls: 'text-white border-transparent', style: { background: m.owner_color } };
  if (m.status === 'done' || m.status === 'no_show') return { cls: 'bg-emerald-50 text-emerald-800 border-emerald-400' };
  if (m.source === 'google' && !m.lead_id) return { cls: 'bg-blue-50 text-blue-800 border-blue-400' };
  return { cls: 'bg-brand-50 text-brand-800 border-brand-500' };
}

// Lägger överlappande möten bredvid varandra.
function layoutDay(events) {
  const sorted = [...events].sort((a, b) => a.s - b.s || b.e - a.e);
  const lanes = [];
  const placed = sorted.map((ev) => {
    let lane = lanes.findIndex((end) => end <= ev.s);
    if (lane === -1) { lane = lanes.length; lanes.push(ev.e); } else lanes[lane] = ev.e;
    return { ...ev, lane };
  });
  return placed.map((ev) => {
    const overlapping = placed.filter((o) => o.s < ev.e && o.e > ev.s);
    return { ...ev, lanes: Math.max(...overlapping.map((o) => o.lane)) + 1 };
  });
}

function WeekView({ days, meetings, teamView, onOpen, onCreate }) {
  const scroller = useRef();
  const now = new Date();
  const hours = Array.from({ length: DAY_END - DAY_START }, (_, i) => DAY_START + i);
  useEffect(() => { scroller.current?.scrollTo({ top: Math.max(0, (now.getHours() - DAY_START - 1) * HOUR_PX) }); }, []);
  return (
    <div className="flex flex-col min-h-0">
      <div className="grid grid-cols-[56px_repeat(7,1fr)] border-b border-slate-200 bg-white">
        <div />
        {days.map((d) => {
          const allDay = meetings.filter((m) => m.all_day && sameDay(parseUtc(m.start_at), d));
          return (
            <div key={d} className="px-2 py-2 text-center border-l border-slate-100">
              <p className="text-[11px] font-medium uppercase text-slate-500">{WEEKDAYS[(d.getDay() + 6) % 7]}</p>
              <p className={cx('mx-auto mt-0.5 grid place-items-center size-8 rounded-full text-sm font-semibold', sameDay(d, now) ? 'bg-brand-600 text-white' : 'text-slate-800')}>{d.getDate()}</p>
              {allDay.map((m) => <button key={m.id} onClick={() => onOpen(m)} className={cx('mt-1 block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] border-l-2', eventStyle(m, teamView).cls)}>{m.title}</button>)}
            </div>
          );
        })}
      </div>
      <div ref={scroller} className="overflow-y-auto scroll-thin max-h-[calc(100vh-17rem)]">
        <div className="relative grid grid-cols-[56px_repeat(7,1fr)]" style={{ height: hours.length * HOUR_PX }}>
          <div>{hours.map((h) => <div key={h} style={{ height: HOUR_PX }} className="pr-2 text-right text-[11px] text-slate-400 -mt-1.5">{String(h).padStart(2, '0')}:00</div>)}</div>
          {days.map((d) => {
            const events = layoutDay(meetings.filter((m) => !m.all_day && sameDay(parseUtc(m.start_at), d)).map((m) => {
              const s = parseUtc(m.start_at), e = parseUtc(m.end_at);
              return { m, s: s.getHours() * 60 + s.getMinutes(), e: Math.max(s.getHours() * 60 + s.getMinutes() + 20, e.getHours() * 60 + e.getMinutes() + (sameDay(s, e) ? 0 : 24 * 60)) };
            }));
            return (
              <div key={d} className={cx('relative border-l border-slate-100', [5, 6].includes((d.getDay() + 6) % 7) && 'bg-slate-50/60')}>
                {hours.map((h) => (
                  <div key={h} style={{ height: HOUR_PX }} className="border-t border-slate-100">
                    {[0, 30].map((min) => (
                      <button key={min} aria-label={tr("Boka möte")} onClick={() => { const t = new Date(d); t.setHours(h, min, 0, 0); onCreate(t); }}
                        className="block w-full h-1/2 hover:bg-brand-50/60" />
                    ))}
                  </div>
                ))}
                {sameDay(d, now) && now.getHours() >= DAY_START && now.getHours() < DAY_END && (
                  <div className="absolute left-0 right-0 z-10 border-t-2 border-rose-500 pointer-events-none" style={{ top: ((now.getHours() - DAY_START) * 60 + now.getMinutes()) / 60 * HOUR_PX }}>
                    <span className="absolute -left-1 -top-[5px] size-2 rounded-full bg-rose-500" />
                  </div>
                )}
                {events.map(({ m, s, e, lane, lanes }) => {
                  const top = Math.max(0, (s - DAY_START * 60) / 60 * HOUR_PX);
                  const height = Math.max(22, (Math.min(e, DAY_END * 60) - Math.max(s, DAY_START * 60)) / 60 * HOUR_PX - 2);
                  const st = eventStyle(m, teamView);
                  return (
                    <button key={m.id} onClick={() => onOpen(m)} style={{ top, height, left: `calc(${(lane / lanes) * 100}% + 2px)`, width: `calc(${100 / lanes}% - 4px)`, ...st.style }}
                      className={cx('absolute z-20 overflow-hidden rounded-md border-l-[3px] px-1.5 py-1 text-left text-[11px] leading-tight shadow-sm hover:shadow-md transition', st.cls)}>
                      <p className="font-semibold truncate">{m.title}</p>
                      <p className="opacity-80 truncate">{fmtTime(m.start_at)}–{fmtTime(m.end_at)}{m.video_url && ' · video'}</p>
                      {height > 50 && (m.company || m.first_name) && <p className="opacity-80 truncate">{m.company || `${m.first_name} ${m.last_name || ''}`}</p>}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MonthView({ cursor, meetings, teamView, onOpen, onCreate }) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = startOfWeek(first);
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const now = new Date();
  return (
    <div>
      <div className="grid grid-cols-7 border-b border-slate-200">{WEEKDAYS.map((w) => <p key={w} className="py-2 text-center text-[11px] font-medium uppercase text-slate-500">{w}</p>)}</div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const list = meetings.filter((m) => sameDay(parseUtc(m.start_at), d));
          const inMonth = d.getMonth() === cursor.getMonth();
          return (
            <div key={d} onClick={() => { const t = new Date(d); t.setHours(10, 0, 0, 0); onCreate(t); }}
              className={cx('min-h-28 border-b border-l border-slate-100 p-1.5 cursor-pointer hover:bg-slate-50/80', !inMonth && 'bg-slate-50/50')}>
              <p className={cx('mb-1 grid place-items-center size-6 rounded-full text-xs font-medium', sameDay(d, now) ? 'bg-brand-600 text-white' : inMonth ? 'text-slate-700' : 'text-slate-300')}>{d.getDate()}</p>
              {list.slice(0, 3).map((m) => {
                const st = eventStyle(m, teamView);
                return (
                  <button key={m.id} onClick={(e) => { e.stopPropagation(); onOpen(m); }} style={st.style}
                    className={cx('mb-0.5 block w-full truncate rounded border-l-2 px-1.5 py-0.5 text-left text-[11px]', st.cls)}>
                    {!m.all_day && <span className="opacity-70">{fmtTime(m.start_at)} </span>}{m.title}
                  </button>
                );
              })}
              {list.length > 3 && <p className="px-1 text-[11px] text-slate-500">+{list.length - 3} {tr("till")}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GoogleConfigModal({ open, onClose, status, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState({ clientId: '', clientSecret: '' });
  useEffect(() => { if (open && status) setF({ clientId: status.clientId || '', clientSecret: status.clientSecret || '' }); }, [open]);
  const save = async () => {
    try { await api.patch('/calendar/google/config', f); toast(tr("Google-inställningarna sparades")); onSaved(); onClose(); }
    catch (e) { toast(e.message, 'error'); }
  };
  return (
    <Modal open={open} onClose={onClose} wide title={tr("Koppla Google Kalender för teamet")} description={tr("Görs en gång av en administratör. Därefter kopplar varje säljare sitt eget konto med ett klick.")}
      footer={<><Button variant="secondary" onClick={onClose}>{tr("Avbryt")}</Button><Button onClick={save}>{tr("Spara")}</Button></>}>
      <div className="space-y-5">
        <ol className="space-y-2.5 text-sm text-slate-600 list-decimal pl-5">
          <li>{tr("Öppna")} <a className="text-brand-600 underline" href="https://console.cloud.google.com/apis/library/calendar-json.googleapis.com" target="_blank" rel="noreferrer">{tr("Google Cloud Console")}</a> {tr("(gärna samma projekt som Places-nyckeln) och aktivera")} <b>{tr("Google Calendar API")}</b>{tr(" samt ")}<b>{tr("Gmail API")}</b>{tr(" (för att skicka e-post från appen).")}</li>
          <li>{tr("Under")} <b>{tr("OAuth-medgivandeskärm")}</b>{tr(": välj")} <i>{tr("Intern")}</i> {tr("om ni har Google Workspace, annars")} <i>{tr("Extern")}</i> {tr("och lägg till säljarna som testanvändare.")}</li>
          <li>{tr("Under")} <b>{tr("Inloggningsuppgifter → Skapa → OAuth-klient-id")}</b>{tr(": välj")} <i>{tr("Webbapplikation")}</i> {tr("och lägg till omdirigerings-URI:n nedan.")}</li>
          <li>{tr("Klistra in klient-id och klienthemlighet här.")}</li>
        </ol>
        <Field label={tr("Omdirigerings-URI att registrera hos Google")} hint={status?.redirectUri?.includes('localhost') ? tr("Byt till er riktiga adress (PUBLIC_URL) när appen körs i produktion.") : undefined}>
          <Input readOnly value={status?.redirectUri || ''} onFocus={(e) => e.target.select()} className="font-mono text-xs" />
        </Field>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label={tr("Klient-id")}><Input value={f.clientId} onChange={(e) => setF({ ...f, clientId: e.target.value })} placeholder={tr("…apps.googleusercontent.com")} /></Field>
          <Field label={tr("Klienthemlighet")}><Input type="password" value={f.clientSecret} onChange={(e) => setF({ ...f, clientSecret: e.target.value })} /></Field>
        </div>
      </div>
    </Modal>
  );
}

function SyncPanel({ status, reloadStatus, onSynced }) {
  const { can } = useApp();
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [config, setConfig] = useState(false);
  if (!status) return <Card className="p-5"><Spinner /></Card>;
  const g = status.google;
  const sync = async () => {
    setBusy(true);
    try { const r = await api.post('/calendar/google/sync'); toast(r.created || r.updated ? tr("{0} nya och {1} ändrade möten från Google", { 0: r.created, 1: r.updated }) : tr("Allt är redan synkat"), 'success'); onSynced(); reloadStatus(); }
    catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  const disconnect = async () => { await api.post('/calendar/google/disconnect'); toast(tr("Google Kalender kopplades bort")); reloadStatus(); };
  const regenerate = async () => { await api.post('/calendar/ical/regenerate'); toast(tr("Ny länk skapad – den gamla slutar fungera")); reloadStatus(); };
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-2">
          <svg viewBox="0 0 24 24" className="size-5"><rect x="3" y="4" width="18" height="17" rx="3" fill="#fff" stroke="#4285F4" strokeWidth="2" /><path d="M3 9h18" stroke="#4285F4" strokeWidth="2" /><text x="12" y="18.5" textAnchor="middle" fontSize="8" fontWeight="700" fill="#4285F4">31</text></svg>
          <h3 className="font-semibold text-slate-900">{tr("Google Kalender")}</h3>
          {can('integrations.manage') && <button onClick={() => setConfig(true)} className="ml-auto text-slate-400 hover:text-slate-700" title={tr("Inställningar för teamet")}><Settings2 className="size-4" /></button>}
        </div>
        {!status.googleConfigured ? (
          <p className="text-sm text-slate-600">{can('integrations.manage') ? <>{tr("Inte uppsatt ännu.")} <button onClick={() => setConfig(true)} className="text-brand-600 underline">{tr("Lägg in Google-uppgifterna")}</button> {tr("så kan alla koppla sin kalender.")}</> : tr("En administratör behöver koppla Google först. Använd iCal-länken nedan så länge.")}</p>
        ) : g ? (
          <div className="space-y-3">
            <p className="flex items-center gap-1.5 text-sm text-emerald-700"><CheckCircle2 className="size-4" />{tr("Kopplad till")} {g.email}</p>
            <p className="text-xs text-slate-500">{tr("Möten synkas åt båda hållen varje minut.")} {g.last_sync_at && tr("Senast {0}.", { 0: timeAgo(g.last_sync_at) })}</p>
            {g.last_error && <p className="flex items-start gap-1.5 text-xs text-rose-600"><AlertTriangle className="size-3.5 mt-px shrink-0" />{g.last_error}</p>}
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" icon={RefreshCw} loading={busy} onClick={sync}>{tr("Synka nu")}</Button>
              <Button size="sm" variant="ghost" icon={Unlink} onClick={disconnect}>{tr("Koppla bort")}</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">{tr("Möten du bokar här hamnar i Google, och möten du bokar i Google syns här och kopplas till rätt kund.")}</p>
            <a href="/api/calendar/google/connect"><Button icon={Link2} className="w-full">{tr("Koppla Google Kalender")}</Button></a>
          </div>
        )}
      </Card>
      <Card className="p-5">
        <h3 className="font-semibold text-slate-900">{tr("Prenumerera (iCal)")}</h3>
        <p className="mt-1 text-xs text-slate-500">{tr("Reserv för Outlook, Apple Kalender eller Google utan koppling. Bara läsning – kalenderappen hämtar ändringar med fördröjning.")}</p>
        <div className="mt-3 flex gap-2">
          <input readOnly value={status.icalUrl} className="input font-mono text-[11px] bg-slate-50" onFocus={(e) => e.target.select()} />
          <Button variant="secondary" icon={copied ? Check : Copy} onClick={() => { navigator.clipboard.writeText(status.icalUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); }} />
        </div>
        <p className="mt-2 text-[11px] text-slate-400">{tr("Google Kalender: Andra kalendrar → + → Från webbadress. Länken är personlig.")} <button onClick={regenerate} className="underline hover:text-slate-600">{tr("Skapa ny länk")}</button></p>
      </Card>
      <GoogleConfigModal open={config} onClose={() => setConfig(false)} status={status} onSaved={reloadStatus} />
    </div>
  );
}

export default function Calendar() {
  const { can, team, user } = useApp();
  const toast = useToast();
  const [sp, setSp] = useSearchParams();
  const [view, setView] = useState('week');
  const [cursor, setCursor] = useState(new Date());
  const [owner, setOwner] = useState('me');
  const [modal, setModal] = useState(null);
  const status = useFetch('/calendar/status');
  const pending = useFetch('/meetings?pending=1');

  const range = useMemo(() => {
    if (view === 'week') { const s = startOfWeek(cursor); return { from: s, to: addDays(s, 7), days: Array.from({ length: 7 }, (_, i) => addDays(s, i)) }; }
    const s = startOfWeek(new Date(cursor.getFullYear(), cursor.getMonth(), 1));
    return { from: s, to: addDays(s, 42) };
  }, [view, cursor]);
  const { data: meetings, reload } = useFetch('/meetings' + qs({ from: toUtcSql(range.from), to: toUtcSql(range.to), owner, include_cancelled: 1 }));
  useLive('meeting', () => { reload(); pending.reload(); });

  useEffect(() => {
    const g = sp.get('google');
    if (g === 'connected') toast(tr("Google Kalender är kopplad – dina möten synkas nu"), 'success');
    if (g === 'error') toast(tr("Kunde inte koppla Google: {0}", { 0: sp.get('reason') || 'okänt fel' }), 'error');
    if (sp.get('meeting')) setModal({ meetingId: Number(sp.get('meeting')) });
    if (g || sp.get('meeting')) setSp({}, { replace: true });
  }, []);

  const step = (n) => setCursor((c) => (view === 'week' ? addDays(c, 7 * n) : new Date(c.getFullYear(), c.getMonth() + n, 1)));
  const title = view === 'week'
    ? `${range.days[0].toLocaleDateString(locale(), { day: 'numeric', month: 'short' })} – ${range.days[6].toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' })} · ${tr('v.')} ${isoWeek(range.days[0])}`
    : cursor.toLocaleDateString(locale(), { month: 'long', year: 'numeric' });
  const teamView = owner === 'all';
  const refresh = () => { reload(); pending.reload(); };
  const upcoming = (meetings || []).filter((m) => m.status === 'scheduled' && parseUtc(m.start_at) > new Date()).length;

  return (
    <div>
      <PageHeader title={tr("Kalender")} subtitle={meetings ? tr("{0} kommande möten i vyn", { 0: upcoming }) : ' '}
        actions={<>
          {can('leads.view_all') && (
            <Select value={owner} onChange={(e) => setOwner(e.target.value)} className="!w-auto">
              <option value="me">{tr("Min kalender")}</option><option value="all">{tr("Hela teamet")}</option>
              {team.filter((u) => u.id !== user.id).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          )}
          {can('leads.edit_own') && <Button icon={Plus} onClick={() => setModal({ preset: {} })}>{tr("Boka möte")}</Button>}
        </>} />
      <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
        <Card className="overflow-hidden min-w-0">
          <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-slate-200">
            <Button size="sm" variant="secondary" onClick={() => setCursor(new Date())}>{tr("Idag")}</Button>
            <div className="flex">
              <button onClick={() => step(-1)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"><ChevronLeft className="size-5" /></button>
              <button onClick={() => step(1)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"><ChevronRight className="size-5" /></button>
            </div>
            <h2 className="text-base font-semibold text-slate-900 capitalize">{title}</h2>
            <div className="ml-auto"><Tabs value={view} onChange={setView} tabs={[{ value: 'week', label: tr("Vecka") }, { value: 'month', label: tr("Månad") }]} /></div>
          </div>
          {!meetings ? <div className="py-24 grid place-items-center"><Spinner /></div>
            : view === 'week'
              ? <WeekView days={range.days} meetings={meetings} teamView={teamView} onOpen={(m) => setModal({ meetingId: m.id })} onCreate={(t) => can('leads.edit_own') && setModal({ preset: { start: t } })} />
              : <MonthView cursor={cursor} meetings={meetings} teamView={teamView} onOpen={(m) => setModal({ meetingId: m.id })} onCreate={(t) => can('leads.edit_own') && setModal({ preset: { start: t } })} />}
        </Card>
        <aside className="space-y-4">
          {pending.data?.length > 0 && (
            <Card className="p-5 border-amber-200">
              <h3 className="flex items-center gap-2 font-semibold text-slate-900"><CalendarClock className="size-4 text-amber-500" />{tr("Väntar på utfall")}</h3>
              <p className="text-xs text-slate-500 mb-3">{tr("Logga hur det gick och boka nästa steg.")}</p>
              <ul className="space-y-1">
                {pending.data.slice(0, 6).map((m) => (
                  <li key={m.id}>
                    <button onClick={() => setModal({ meetingId: m.id })} className="w-full rounded-lg px-2 py-1.5 -mx-2 text-left hover:bg-slate-50">
                      <p className="text-sm font-medium text-slate-800 truncate">{m.title}</p>
                      <p className="text-xs text-slate-500">{parseUtc(m.start_at).toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short' })} {fmtTime(m.start_at)}{m.video_url && <Video className="inline size-3 ml-1" />}</p>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <SyncPanel status={status.data} reloadStatus={status.reload} onSynced={refresh} />
        </aside>
      </div>
      <MeetingModal open={!!modal} onClose={() => setModal(null)} meetingId={modal?.meetingId} preset={modal?.preset} onSaved={refresh} />
    </div>
  );
}
