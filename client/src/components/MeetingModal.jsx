import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Video, MapPin, Users, Clock, Trash2, Ban, CheckCircle2, XCircle, ExternalLink, Briefcase, User, AlertTriangle } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../lib/app.jsx';
import { Modal, Button, Field, Input, Select, Textarea, Toggle, Badge, Avatar, useToast, cx } from './ui.jsx';
import { STAGES } from '../lib/meta.jsx';
import { tr, locale } from '../lib/i18n.js';

// Datum/tid: databasen lagrar UTC "YYYY-MM-DD HH:MM:SS", formulären visar lokal tid.
export const parseUtc = (s) => new Date(String(s).replace(' ', 'T') + 'Z');
export const toUtcSql = (d) => d.toISOString().slice(0, 19).replace('T', ' ');
const pad = (n) => String(n).padStart(2, '0');
const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const fmtTime = (s) => parseUtc(s).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
export const fmtDay = (s) => parseUtc(s).toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' });

const DURATIONS = [[15, '15 min'], [30, '30 min'], [45, '45 min'], [60, '1 timme'], [90, '1,5 timme'], [120, '2 timmar']];

// Nästa hela halvtimme, minst en timme fram.
function defaultStart() {
  const d = new Date(Date.now() + 3600000);
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
  return d;
}

/**
 * Boka eller redigera ett möte. `preset` kan innehålla lead_id, deal_id, title, attendees och start (Date).
 * Visar ett befintligt möte när `meetingId` anges, med möjlighet att logga utfall.
 */
export default function MeetingModal({ open, onClose, onSaved, preset = {}, meetingId }) {
  const { user, team, can } = useApp();
  const toast = useToast();
  const [status, setStatus] = useState(null);
  const [m, setM] = useState(null);
  const [f, setF] = useState(null);
  const [edit, setEdit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState({ status: 'done', outcome: '', next_task: '', next_due: '' });

  useEffect(() => {
    if (!open) return;
    api.get('/calendar/status').then(setStatus).catch(() => {});
    setOutcome({ status: 'done', outcome: '', next_task: '', next_due: '' });
    if (meetingId) {
      setEdit(false); setM(null);
      api.get(`/meetings/${meetingId}`).then((x) => { setM(x); setF(toForm(x)); }).catch((e) => { toast(e.message, 'error'); onClose(); });
    } else {
      const start = preset.start || defaultStart();
      setM(null); setEdit(true);
      setF({
        title: preset.title || '', date: localDate(start), time: localTime(start), duration: 60, all_day: false,
        // Mötet hamnar hos kundens ansvariga säljare när man får boka åt andra.
        location: '', description: '', attendees: (preset.attendees || []).join(', '), owner_id: can('leads.assign') ? preset.owner_id || user.id : user.id,
        create_meet: true, send_invites: false, lead_id: preset.lead_id || null, deal_id: preset.deal_id || null,
      });
    }
  }, [open, meetingId]);

  const toForm = (x) => {
    const s = parseUtc(x.start_at);
    return {
      title: x.title, date: localDate(s), time: localTime(s), duration: Math.max(15, Math.round((parseUtc(x.end_at) - s) / 60000)), all_day: x.all_day,
      location: x.location || '', description: x.description || '', attendees: x.attendees.map((a) => a.email).join(', '), owner_id: x.owner_id,
      create_meet: false, send_invites: false, lead_id: x.lead_id, deal_id: x.deal_id, video_url: x.video_url || '',
    };
  };

  const googleOn = !!status?.google;
  const set = (k) => (e) => setF({ ...f, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e });

  const save = async () => {
    const start = f.all_day ? new Date(`${f.date}T00:00:00Z`) : new Date(`${f.date}T${f.time}`);
    const end = f.all_day ? new Date(start.getTime() + 864e5) : new Date(start.getTime() + Number(f.duration) * 60000);
    const body = {
      title: f.title, start_at: toUtcSql(start), end_at: toUtcSql(end), all_day: f.all_day, location: f.location, description: f.description,
      video_url: f.video_url || null, attendees: f.attendees.split(/[,;\s]+/).filter(Boolean), owner_id: Number(f.owner_id),
      lead_id: f.lead_id, deal_id: f.deal_id, create_meet: googleOn && f.create_meet && !f.video_url, send_invites: googleOn && f.send_invites,
    };
    setBusy(true);
    try {
      const saved = m ? await api.patch(`/meetings/${m.id}`, body) : await api.post('/meetings', body);
      toast(m ? tr("Mötet uppdaterades") : tr("Mötet är bokat{0}", { 0: saved.google_event_id ? ' och synkat till Google Kalender' : '' }), 'success');
      if (saved.sync_error) toast(tr("Kunde inte synka till Google: {0}", { 0: saved.sync_error }), 'error');
      onSaved?.(saved); onClose();
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  const cancel = async () => {
    setBusy(true);
    try { await api.post(`/meetings/${m.id}/cancel`, { send_invites: googleOn && m.attendees.length > 0 }); toast(tr("Mötet avbokades")); onSaved?.(); onClose(); }
    catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  const remove = async () => {
    setBusy(true);
    try { await api.del(`/meetings/${m.id}`); toast(tr("Mötet togs bort")); onSaved?.(); onClose(); }
    catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  const saveOutcome = async () => {
    setBusy(true);
    try {
      await api.post(`/meetings/${m.id}/outcome`, { ...outcome, next_due: outcome.next_due ? toUtcSql(new Date(outcome.next_due)) : null });
      toast(tr("Utfallet loggades på tidslinjen")); onSaved?.(); onClose();
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };

  if (!open || !f) return null;
  const isPast = m && parseUtc(m.end_at) < new Date();
  const needsOutcome = m && m.status === 'scheduled' && isPast && (m.lead_id || m.deal_id) && m.canEdit;
  const who = m && ([m.first_name, m.last_name].filter(Boolean).join(' ') || m.company);

  // ---------- Visa befintligt möte ----------
  if (m && !edit) {
    const st = STAGES.find((s) => s.key === m.deal_stage);
    return (
      <Modal open onClose={onClose} title={m.title} description={m.all_day ? fmtDay(m.start_at) : `${fmtDay(m.start_at)} · ${fmtTime(m.start_at)}–${fmtTime(m.end_at)}`}
        footer={m.canEdit && <>
          {m.status === 'scheduled' && !isPast && <Button variant="ghost" icon={Ban} className="mr-auto !text-rose-600" onClick={cancel} loading={busy}>{tr("Avboka")}</Button>}
          {m.status !== 'scheduled' && <Button variant="ghost" icon={Trash2} className="mr-auto !text-rose-600" onClick={remove} loading={busy}>{tr("Ta bort")}</Button>}
          {!needsOutcome && <Button variant="secondary" onClick={() => setEdit(true)}>{tr("Redigera")}</Button>}
          {needsOutcome && <Button onClick={saveOutcome} loading={busy}>{tr("Spara utfall")}</Button>}
        </>}>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {m.status === 'done' && <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-600/20"><CheckCircle2 className="size-3" />{tr("Genomfört")}</Badge>}
            {m.status === 'no_show' && <Badge className="bg-amber-50 text-amber-700 ring-amber-600/20">{tr("Kunden dök inte upp")}</Badge>}
            {m.status === 'cancelled' && <Badge className="bg-slate-100 text-slate-600 ring-slate-500/20">{tr("Avbokat")}</Badge>}
            {m.google_event_id && <Badge className="bg-blue-50 text-blue-700 ring-blue-600/20">{tr("Synkat med Google")}</Badge>}
            {m.source === 'google' && <Badge className="bg-blue-50 text-blue-700 ring-blue-600/20">{tr("Bokat i Google Kalender")}</Badge>}
            {m.sync_error && <Badge className="bg-rose-50 text-rose-700 ring-rose-600/20" ><AlertTriangle className="size-3" />{tr("Synkfel")}</Badge>}
          </div>
          <div className="space-y-2 text-sm">
            {m.owner_name && <p className="flex items-center gap-2 text-slate-700"><Avatar name={m.owner_name} color={m.owner_color} size="xs" />{m.owner_name}</p>}
            {m.video_url && <a href={m.video_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-brand-600 hover:underline"><Video className="size-4" />{tr("Anslut till videomöte")}<ExternalLink className="size-3" /></a>}
            {m.location && <p className="flex items-center gap-2 text-slate-700"><MapPin className="size-4 text-slate-400" />{m.location}</p>}
            {m.attendees.length > 0 && <p className="flex items-start gap-2 text-slate-700"><Users className="size-4 text-slate-400 mt-0.5" />{m.attendees.map((a) => a.name || a.email).join(', ')}</p>}
            {who && m.lead_id && <Link to={`/leads/${m.lead_id}`} onClick={onClose} className="flex items-center gap-2 text-brand-600 hover:underline"><User className="size-4" />{who}{m.company && who !== m.company && ` · ${m.company}`}</Link>}
            {m.deal_id && <Link to={`/pipeline/${m.deal_id}`} onClick={onClose} className="flex items-center gap-2 text-violet-700 hover:underline"><Briefcase className="size-4" />{m.deal_title}{st && <span className="text-xs text-slate-500">· {st.label}</span>}</Link>}
          </div>
          {m.description && <p className="text-sm text-slate-600 whitespace-pre-wrap rounded-lg bg-slate-50 p-3">{m.description}</p>}
          {m.outcome && <p className="text-sm text-slate-700 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3"><b>{tr("Utfall:")}</b> {m.outcome}</p>}
          {m.sync_error && <p className="text-xs text-rose-600">{m.sync_error}</p>}
          {needsOutcome && (
            <div className="rounded-xl border border-brand-200 bg-brand-50/40 p-4 space-y-3">
              <p className="text-sm font-semibold text-slate-900">{tr("Hur gick mötet?")}</p>
              <div className="grid grid-cols-2 gap-2">
                {[['done', tr("Genomfört"), CheckCircle2], ['no_show', tr("Kunden dök inte upp"), XCircle]].map(([k, l, I]) => (
                  <button key={k} type="button" onClick={() => setOutcome({ ...outcome, status: k })}
                    className={cx('flex items-center gap-2 rounded-lg border px-3 py-2 text-sm', outcome.status === k ? 'border-brand-500 bg-white ring-4 ring-brand-100' : 'border-slate-200 bg-white text-slate-600')}><I className="size-4" />{l}</button>
                ))}
              </div>
              <Textarea value={outcome.outcome} onChange={(e) => setOutcome({ ...outcome, outcome: e.target.value })} placeholder={tr("Vad kom ni fram till?")} />
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <Input value={outcome.next_task} onChange={(e) => setOutcome({ ...outcome, next_task: e.target.value })} placeholder={tr("Nästa steg, t.ex. Skicka offert")} />
                <input type="datetime-local" className="input" value={outcome.next_due} onChange={(e) => setOutcome({ ...outcome, next_due: e.target.value })} />
              </div>
            </div>
          )}
        </div>
      </Modal>
    );
  }

  // ---------- Boka / redigera ----------
  return (
    <Modal open onClose={onClose} title={m ? tr("Redigera möte") : tr("Boka möte")} description={!m && preset.context}
      footer={<><Button variant="secondary" onClick={() => (m ? setEdit(false) : onClose())}>{tr("Avbryt")}</Button><Button onClick={save} loading={busy}>{m ? tr("Spara") : tr("Boka möte")}</Button></>}>
      <div className="space-y-4">
        <Field label={tr("Rubrik")}><Input value={f.title} onChange={set('title')} placeholder={tr("t.ex. Demo av tjänsten")} autoFocus /></Field>
        <div className="grid grid-cols-[1fr_auto_auto] gap-3 items-end">
          <Field label={tr("Datum")}><Input type="date" value={f.date} onChange={set('date')} /></Field>
          {!f.all_day && <Field label={tr("Start")}><input type="time" step="900" className="input" value={f.time} onChange={set('time')} /></Field>}
          {!f.all_day && <Field label={tr("Längd")}><Select value={f.duration} onChange={set('duration')}>{DURATIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}{!DURATIONS.some(([v]) => v === Number(f.duration)) && <option value={f.duration}>{f.duration} min</option>}</Select></Field>}
        </div>
        <Toggle checked={f.all_day} onChange={set('all_day')} label={tr("Heldag")} />
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label={tr("Plats")}><Input value={f.location} onChange={set('location')} placeholder={tr("Adress eller telefon")} /></Field>
          <Field label={tr("Ansvarig")}><Select value={f.owner_id} onChange={set('owner_id')} disabled={!can('leads.assign')}>{team.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>
        </div>
        <Field label={tr("Deltagare (e-post)")} hint={tr("Kommaseparerat. Kunden fylls i automatiskt när du bokar från ett lead.")}><Input value={f.attendees} onChange={set('attendees')} placeholder={tr("kund@foretag.se")} /></Field>
        <Field label={tr("Anteckning till mötet")}><Textarea value={f.description} onChange={set('description')} placeholder={tr("Agenda eller förberedelser")} /></Field>
        {googleOn ? (
          <div className="space-y-3 rounded-xl bg-blue-50/50 p-4">
            <p className="flex items-center gap-2 text-xs font-medium text-blue-800"><CheckCircle2 className="size-3.5" />{tr("Synkas till Google Kalender (")}{status.google.email})</p>
            {!f.video_url && <Toggle checked={f.create_meet} onChange={set('create_meet')} label={tr("Skapa Google Meet-länk")} />}
            <Toggle checked={f.send_invites} onChange={set('send_invites')} label={tr("Skicka inbjudan till deltagarna")} description={tr("Google mejlar en kalenderinbjudan till alla deltagare")} />
          </div>
        ) : (
          <Field label={tr("Videolänk (valfritt)")}><Input value={f.video_url || ''} onChange={set('video_url')} placeholder={tr("https://meet.google.com/… eller Teams-länk")} /></Field>
        )}
      </div>
    </Modal>
  );
}
