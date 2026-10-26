import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { X, Mail, Phone, Building2, MapPin, Briefcase, Trash2, ArrowRightLeft, Check, MessageSquare, ChevronRight, CalendarPlus, FileText, Sparkles } from 'lucide-react';
import { api } from '../api.js';
import { useApp, useLive } from '../lib/app.jsx';
import { Avatar, Button, SourceBadge, StatusBadge, Select, Spinner, Modal, Field, Input, Confirm, Tabs, useToast } from './ui.jsx';
import CompanyInsight from './CompanyInsight.jsx';
import { ActivityComposer, Timeline } from './Activity.jsx';
import MeetingModal from './MeetingModal.jsx';
import LeadMeetings from './LeadMeetings.jsx';
import TemplatePicker from './TemplatePicker.jsx';
import { useEmailStatus } from '../lib/email.js';
import { STATUSES, STAGES, leadName, timeAgo, sek, toSqlDate } from '../lib/meta.jsx';
import { tr } from '../lib/i18n.js';

export function EditableField({ icon: Icon, value, placeholder, onSave, disabled, href }) {
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState(value || '');
  useEffect(() => setV(value || ''), [value]);
  const commit = () => { setEdit(false); if (v !== (value || '')) onSave(v); };
  return (
    <div className="group flex items-center gap-3 py-1.5 min-h-9">
      <Icon className="size-4 text-slate-400 shrink-0" />
      {edit ? (
        <input autoFocus className="input !py-1" value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setV(value || ''); setEdit(false); } }} />
      ) : (
        <button disabled={disabled} onClick={() => setEdit(true)} className="flex-1 text-left text-sm truncate rounded px-1 -mx-1 hover:bg-slate-50 disabled:hover:bg-transparent">
          {value ? (href ? <a href={href} onClick={(e) => e.stopPropagation()} className="text-brand-600 hover:underline">{value}</a> : <span className="text-slate-700">{value}</span>) : <span className="text-slate-400">{placeholder}</span>}
        </button>
      )}
    </div>
  );
}

// Företaget kontakten tillhör: länk till företaget, eller sök/skapa ett nytt.
function CompanyField({ lead, disabled, onPatch }) {
  const [edit, setEdit] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState([]);
  useEffect(() => {
    if (!edit || q.trim().length < 2) return setHits([]);
    const t = setTimeout(() => api.get(`/companies-lookup?q=${encodeURIComponent(q.trim())}`).then(setHits), 150);
    return () => clearTimeout(t);
  }, [q, edit]);
  const pick = (body) => { setEdit(false); setQ(''); onPatch(body); };
  if (edit) {
    return (
      <div className="py-1.5">
        <input autoFocus className="input !py-1" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("Sök eller skriv nytt företag…")}
          onKeyDown={(e) => { if (e.key === 'Escape') setEdit(false); if (e.key === 'Enter' && q.trim()) pick(hits[0] && hits[0].name.toLowerCase() === q.trim().toLowerCase() ? { company_id: hits[0].id } : { company: q.trim() }); }} />
        <div className="mt-1 card py-1 shadow-lg">
          {hits.map((h) => <button key={h.id} onClick={() => pick({ company_id: h.id })} className="block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-50">{h.name}<span className="text-xs text-slate-400"> {h.city}</span></button>)}
          {q.trim().length > 1 && !hits.some((h) => h.name.toLowerCase() === q.trim().toLowerCase()) && <button onClick={() => pick({ company: q.trim() })} className="block w-full px-3 py-1.5 text-left text-sm text-brand-600 hover:bg-slate-50">{tr("+ Nytt företag \"")}{q.trim()}"</button>}
          {lead.company_id && <button onClick={() => pick({ company_id: null })} className="block w-full px-3 py-1.5 text-left text-xs text-slate-500 hover:bg-slate-50">{tr("Ta bort koppling till företag")}</button>}
          <button onClick={() => setEdit(false)} className="block w-full px-3 py-1.5 text-left text-xs text-slate-400 hover:bg-slate-50">{tr("Avbryt")}</button>
        </div>
      </div>
    );
  }
  return (
    <div className="group flex items-center gap-3 py-1.5 min-h-9">
      <Building2 className="size-4 text-slate-400 shrink-0" />
      {lead.company_id
        ? <Link to={`/companies/${lead.company_id}`} className="flex-1 truncate text-sm font-medium text-brand-600 hover:underline">{lead.company}</Link>
        : <span className="flex-1 text-sm text-slate-400">{lead.company || tr("Inget företag")}</span>}
      {!disabled && <button onClick={() => setEdit(true)} className="text-xs text-slate-400 opacity-0 group-hover:opacity-100 hover:text-slate-600">{tr("Ändra")}</button>}
    </div>
  );
}

// Standardförslag för första uppgiften: imorgon kl 10.
const tomorrowAt10 = () => {
  const d = new Date(Date.now() + 864e5); d.setHours(10, 0, 0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

export default function LeadDrawer({ id, onClose, onChanged }) {
  const { team, can, user } = useApp();
  const toast = useToast();
  const [lead, setLead] = useState(null);
  const [convert, setConvert] = useState(false);
  const [deal, setDeal] = useState({});
  const [del, setDel] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [book, setBook] = useState(false);
  const [templates, setTemplates] = useState(false);
  const mail = useEmailStatus();
  // Fliken Företagsinfo: hämtas när den öppnas; "Berika" hämtar och sammanfattar uppgifter om leadets företag.
  const [tab, setTab] = useState('timeline');
  const [info, setInfo] = useState(null);
  const [enriching, setEnriching] = useState(false);
  const loadInfo = () => api.get(`/leads/${id}/company-info`).then(setInfo).catch(() => setInfo({ company: null }));
  useEffect(() => { setTab('timeline'); setInfo(null); }, [id]);
  useEffect(() => { if (tab === 'company' && !info) loadInfo(); }, [tab, id]);
  const enrich = async () => {
    setTab('company');
    setEnriching(true);
    try { const r = await api.post(`/leads/${id}/enrich`); setInfo((i) => ({ ...i, company: r.company })); toast(tr('Företagsinfo hämtad')); load(); onChanged?.(); }
    catch (e) { toast(e.message, 'error'); } finally { setEnriching(false); }
  };

  const load = () => api.get(`/leads/${id}`).then(setLead).catch((e) => { toast(e.message, 'error'); onClose(); });
  useEffect(() => { setLead(null); load(); }, [id]);
  useLive('lead', (d) => d.lead?.id === id && load());
  useEffect(() => {
    // Escape stänger panelen bara när ingen dialog ligger ovanpå.
    const onKey = (e) => e.key === 'Escape' && !convert && !del && !document.querySelector('.z-50.fixed') && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [convert, del]);

  const patch = async (body) => {
    try { await api.patch(`/leads/${id}`, body); await load(); onChanged?.(); }
    catch (e) { toast(e.message, 'error'); }
  };
  const addActivity = async (body) => {
    try { await api.post(`/leads/${id}/activities`, body); await load(); onChanged?.(); }
    catch (err) { toast(err.message, 'error'); throw err; }
  };
  const openConvert = () => {
    setDeal({ title: tr("{0} – affär", { 0: lead.company || leadName(lead) }), value: '', expected_close: '', withTask: true, taskText: tr("Boka första mötet"), taskDue: tomorrowAt10() });
    setConvert(true);
  };
  const doConvert = async () => {
    try {
      await api.post(`/leads/${id}/convert`, {
        title: deal.title, value: deal.value, expected_close: deal.expected_close,
        task: deal.withTask && deal.taskText.trim() ? { content: deal.taskText, due_at: toSqlDate(deal.taskDue) } : null,
      });
      toast(tr("Affären finns nu i pipelinen"), 'success', { title: tr("Konverterad") });
      setConvert(false); load(); onChanged?.();
    } catch (e) { toast(e.message, 'error'); }
  };
  const remove = async () => {
    try { await api.del(`/leads/${id}`); toast(tr("Lead raderad")); onChanged?.(); onClose(); } catch (e) { toast(e.message, 'error'); }
  };
  const toggleTask = async (a) => { await api.patch(`/activities/${a.id}`, { done: !a.done }); load(); };

  const editable = lead?.canEdit;
  const ownerSelectable = can('leads.assign') || (editable && !lead?.owner_id);
  const openDeals = lead?.deals.filter((d) => !['won', 'lost'].includes(d.stage)) || [];
  // Bokas mötet från leadet kopplas det också till kontaktens senaste öppna affär.
  const meetingPreset = lead && {
    lead_id: lead.id, deal_id: openDeals[0]?.id, owner_id: openDeals[0]?.owner_id || lead.owner_id, title: tr("Möte – {0}", { 0: leadName(lead) }), attendees: lead.email ? [lead.email] : [],
    context: tr("Med {0}{1}", { 0: leadName(lead), 1: openDeals[0] ? ` · ${openDeals[0].title}` : '' }),
  };

  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-slate-900/20" onClick={onClose} />
      <div className="absolute inset-y-0 right-0 w-full max-w-3xl bg-white shadow-2xl animate-slide-in flex flex-col">
        {!lead ? <div className="flex-1 grid place-items-center"><Spinner /></div> : (
          <>
            <div className="px-6 pt-5 pb-4 border-b border-slate-100">
              <div className="flex items-start gap-4">
                <div className="grid place-items-center size-12 rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 text-slate-600 font-semibold text-lg shrink-0">
                  {leadName(lead).split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-semibold text-slate-900 truncate">{leadName(lead)}</h2>
                  <p className="text-sm text-slate-500 truncate">{[lead.title, lead.company].filter(Boolean).join(' på ') || tr("Inget företag angivet")}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <StatusBadge status={lead.status} />
                    {lead.tags.includes('Kund') && <span className="rounded-md bg-emerald-600 px-2 py-0.5 text-xs font-medium text-white">{tr("Kund")}</span>}
                    <span className="text-xs text-slate-400">{tr("Poäng")} {lead.score} {tr("· Inkom")} {timeAgo(lead.created_at)}</span>
                  </div>
                </div>
                <button onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100"><X className="size-5" /></button>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {lead.phone && <a href={`tel:${lead.phone}`}><Button size="sm" variant="secondary" icon={Phone}>{tr("Ring")}</Button></a>}
                {/* Med Gmail kopplat skrivs och skickas mejlet i appen; annars öppnas e-postprogrammet. */}
                {lead.email && (mail?.canSend && editable
                  ? <Button size="sm" variant="secondary" icon={Mail} onClick={() => setTemplates('blank')}>{tr("Mejla")}</Button>
                  : <a href={`mailto:${lead.email}`}><Button size="sm" variant="secondary" icon={Mail}>{tr("Mejla")}</Button></a>)}
                <Button size="sm" variant="secondary" icon={FileText} onClick={() => setTemplates(true)}>{tr("Mall")}</Button>
                {editable && <Button size="sm" variant="secondary" icon={CalendarPlus} onClick={() => setBook(true)}>{tr("Boka möte")}</Button>}
                {editable && lead.company && <Button size="sm" variant="secondary" icon={Sparkles} loading={enriching} onClick={enrich}>{tr("Berika")}</Button>}
                {editable && <Button size="sm" variant="soft" icon={ArrowRightLeft} onClick={openConvert}>{lead.deals.length ? tr("Ny affär") : tr("Konvertera till affär")}</Button>}
                {can('leads.delete') && <Button size="sm" variant="ghost" icon={Trash2} className="ml-auto !text-rose-600" onClick={() => setDel(true)} />}
              </div>
              {openDeals.length > 0 && (
                <div className="mt-4 space-y-2">
                  {openDeals.map((d) => {
                    const st = STAGES.find((s) => s.key === d.stage);
                    return (
                      <Link key={d.id} to={`/pipeline/${d.id}`} className="flex items-center gap-3 rounded-lg border border-violet-200 bg-violet-50/60 px-3 py-2 hover:bg-violet-50">
                        <Briefcase className="size-4 text-violet-600" />
                        <span className="min-w-0 flex-1 text-sm"><span className="font-medium text-slate-800">{d.title}</span><span className="text-slate-500"> · {sek(d.value)}</span></span>
                        <span className="inline-flex items-center gap-1.5 text-xs text-slate-600"><span className="size-2 rounded-full" style={{ background: st?.color }} />{st?.label}</span>
                        <ChevronRight className="size-4 text-slate-400" />
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto scroll-thin grid md:grid-cols-[1fr_250px]">
              <div className="px-6 py-5 md:border-r border-slate-100 min-w-0">
                {lead.company && <div className="mb-4"><Tabs value={tab} onChange={setTab} tabs={[{ value: 'timeline', label: tr("Tidslinje") }, { value: 'company', label: tr("Företagsinfo") }]} /></div>}
                {tab === 'company' ? (
                  !info ? <div className="grid place-items-center py-10"><Spinner /></div> : (
                    <CompanyInsight enrichment={info.company?.enrichment} companyName={info.company?.name || lead.company} configured={info.configured}
                      canEnrich={info.canEnrich} busy={enriching} onEnrich={enrich} companyLink={info.company && `/companies/${info.company.id}`} />
                  )
                ) : <>
                {editable && <div className="mb-6"><ActivityComposer onSubmit={addActivity} /></div>}
                {lead.message && (
                  <div className="mb-6 rounded-xl bg-slate-50 p-4">
                    <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500 mb-1.5"><MessageSquare className="size-3.5" />{tr("Meddelande från leadet")}</p>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{lead.message}</p>
                  </div>
                )}
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">{tr("Tidslinje")}</h3>
                <Timeline activities={lead.activities} onToggleTask={toggleTask} />
                </>}
              </div>

              <aside className="px-5 py-5 space-y-6 bg-slate-50/50">
                <div>
                  <p className="label">{tr("Status")}</p>
                  <Select value={lead.status} disabled={!editable} onChange={(e) => patch({ status: e.target.value })}>
                    {Object.entries(STATUSES).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
                  </Select>
                </div>
                <div>
                  <p className="label">{tr("Ansvarig")}</p>
                  {ownerSelectable ? (
                    <Select value={lead.owner_id ?? ''} onChange={(e) => patch({ owner_id: e.target.value ? Number(e.target.value) : null })}>
                      <option value="">{tr("Otilldelad")}</option>
                      {(can('leads.assign') ? team : team.filter((u) => u.id === user.id)).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </Select>
                  ) : (
                    <div className="flex items-center gap-2 text-sm">{lead.owner_name ? <><Avatar name={lead.owner_name} color={lead.owner_color} size="xs" />{lead.owner_name}</> : tr("Otilldelad")}</div>
                  )}
                  {!lead.owner_id && editable && !can('leads.assign') && <Button size="sm" variant="soft" className="mt-2 w-full" onClick={() => patch({ owner_id: user.id })}>{tr("Ta detta lead")}</Button>}
                </div>
                <LeadMeetings leadId={lead.id} preset={meetingPreset} canBook={editable} onChanged={load} />
                <div>
                  <p className="label">{tr("Kontaktuppgifter")}</p>
                  <EditableField icon={Mail} value={lead.email} placeholder={tr("Lägg till e-post")} href={lead.email && `mailto:${lead.email}`} disabled={!editable} onSave={(v) => patch({ email: v })} />
                  <EditableField icon={Phone} value={lead.phone} placeholder={tr("Lägg till telefon")} href={lead.phone && `tel:${lead.phone}`} disabled={!editable} onSave={(v) => patch({ phone: v })} />
                  <CompanyField lead={lead} disabled={!editable} onPatch={patch} />
                  <EditableField icon={Briefcase} value={lead.title} placeholder={tr("Titel")} disabled={!editable} onSave={(v) => patch({ title: v })} />
                  <EditableField icon={MapPin} value={lead.city} placeholder={tr("Ort")} disabled={!editable} onSave={(v) => patch({ city: v })} />
                </div>
                <div>
                  <p className="label">{tr("Källa")}</p>
                  <SourceBadge source={lead.source} detail={lead.source_detail} />
                </div>
                <div>
                  <p className="label">{tr("Taggar")}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {lead.tags.map((t) => (
                      <span key={t} className="inline-flex items-center gap-1 rounded-md bg-white border border-slate-200 px-2 py-0.5 text-xs text-slate-700">
                        {t}{editable && <button onClick={() => patch({ tags: lead.tags.filter((x) => x !== t) })} className="text-slate-400 hover:text-rose-500"><X className="size-3" /></button>}
                      </span>
                    ))}
                    {editable && (
                      <form onSubmit={(e) => { e.preventDefault(); if (newTag.trim() && !lead.tags.includes(newTag.trim())) patch({ tags: [...lead.tags, newTag.trim()] }); setNewTag(''); }}>
                        <input value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder={tr("+ tagg")} className="w-16 focus:w-24 transition-all bg-transparent text-xs outline-none py-0.5 placeholder:text-slate-400" />
                      </form>
                    )}
                  </div>
                </div>
                {Object.keys(lead.fields).length > 0 && (
                  <div>
                    <p className="label">{tr("Formulärsvar")}</p>
                    <dl className="space-y-2">{Object.entries(lead.fields).map(([k, v]) => <div key={k}><dt className="text-[11px] text-slate-400">{k.replace(/_/g, ' ')}</dt><dd className="text-sm text-slate-700 break-words">{v}</dd></div>)}</dl>
                  </div>
                )}
                {lead.deals.length > openDeals.length && (
                  <div>
                    <p className="label">{tr("Avslutade affärer")}</p>
                    {lead.deals.filter((d) => ['won', 'lost'].includes(d.stage)).map((d) => (
                      <Link key={d.id} to={`/pipeline/${d.id}`} className="card p-3 mb-2 block hover:border-slate-300">
                        <p className="text-sm font-medium text-slate-800 truncate">{d.title}</p>
                        <p className={`text-xs ${d.stage === 'won' ? 'text-emerald-600' : 'text-rose-600'}`}>{sek(d.value)} · {d.stage === 'won' ? tr("Vunnen") : tr("Förlorad{0}", { 0: d.lost_reason ? ` – ${tr(d.lost_reason)}` : '' })}</p>
                      </Link>
                    ))}
                  </div>
                )}
              </aside>
            </div>
          </>
        )}
      </div>

      <Modal open={convert} onClose={() => setConvert(false)} title={lead?.deals.length ? tr("Ny affär") : tr("Konvertera till affär")}
        description={tr("Affären hamnar i pipelinens första steg. All historik följer med.")}
        footer={<><Button variant="secondary" onClick={() => setConvert(false)}>{tr("Avbryt")}</Button><Button icon={Check} onClick={doConvert}>{tr("Skapa affär")}</Button></>}>
        <div className="space-y-4">
          <Field label={tr("Affärens namn")}><Input value={deal.title || ''} onChange={(e) => setDeal({ ...deal, title: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label={tr("Värde (kr)")}><Input type="number" value={deal.value || ''} onChange={(e) => setDeal({ ...deal, value: e.target.value })} placeholder="0" /></Field>
            <Field label={tr("Förväntat avslut")}><Input type="date" value={deal.expected_close || ''} onChange={(e) => setDeal({ ...deal, expected_close: e.target.value })} /></Field>
          </div>
          <div className="rounded-xl border border-slate-200 p-4 space-y-3">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
              <input type="checkbox" checked={!!deal.withTask} onChange={(e) => setDeal({ ...deal, withTask: e.target.checked })} className="accent-brand-600" />
              {tr("Skapa första uppgiften")}
            </label>
            {deal.withTask && (
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <Input value={deal.taskText} onChange={(e) => setDeal({ ...deal, taskText: e.target.value })} />
                <input type="datetime-local" className="input" value={deal.taskDue} onChange={(e) => setDeal({ ...deal, taskDue: e.target.value })} />
              </div>
            )}
            <p className="text-xs text-slate-500">{tr("Så blir affären aldrig liggande utan ett nästa steg.")}</p>
          </div>
        </div>
      </Modal>
      {lead && <TemplatePicker lead={lead} open={!!templates} blank={templates === 'blank'} onClose={() => setTemplates(false)} onLogged={() => { load(); onChanged?.(); }} />}
      <MeetingModal open={book} onClose={() => setBook(false)} preset={meetingPreset || {}} onSaved={load} />
      <Confirm open={del} onClose={() => setDel(false)} onConfirm={remove} title={tr("Radera lead?")} text={tr("Leadet och all dess historik raderas permanent.")} />
    </div>
  );
}
