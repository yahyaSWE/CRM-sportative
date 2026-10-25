import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Search, Crosshair, Star, Globe, Phone, Mail, Building2, Loader2, Repeat, Play, Trash2, Settings2, AlertTriangle, Check, X,
  ExternalLink, SlidersHorizontal, Download, Undo2, ShieldCheck, Info,
} from 'lucide-react';
import { api, qs } from '../api.js';
import { useApp, useFetch, useLive } from '../lib/app.jsx';
import { Button, Card, PageHeader, Modal, Field, Input, Select, Toggle, Tabs, Badge, Empty, Spinner, Confirm, useToast, cx } from '../components/ui.jsx';
import { timeAgo } from '../lib/meta.jsx';
import { tr } from '../lib/i18n.js';

const EXAMPLES = [[tr("Tandläkare"), tr("Uppsala")], [tr("Byggfirma"), tr("Västerås")], [tr("Redovisningsbyrå"), tr("Göteborg")], [tr("Frisör"), tr("Malmö")], [tr("Restaurang"), tr("Stockholm")]];

function SettingsModal({ open, onClose, onSaved }) {
  const toast = useToast();
  const [cfg, setCfg] = useState(null);
  const [test, setTest] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setTest(null); api.get('/prospecting/config').then(setCfg); } }, [open]);
  if (!cfg) return null;
  const set = (k) => (e) => setCfg({ ...cfg, [k]: e.target.value });
  const save = async (andTest) => {
    setBusy(true);
    try {
      const saved = await api.patch('/prospecting/config', cfg);
      setCfg(saved); onSaved?.(saved);
      if (andTest) setTest(await api.post('/prospecting/config/test'));
      else { toast(tr("Inställningarna sparades")); onClose(); }
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  const Result = ({ r }) => r && <p className={cx('mt-1 text-xs', r.ok ? 'text-emerald-600' : 'text-rose-600')}>{r.ok ? '✓ ' : '✗ '}{r.message}</p>;
  return (
    <Modal open={open} onClose={onClose} wide title={tr("Datakällor för prospektering")} description={tr("Nycklar lagras krypterat.")}
      footer={<><Button variant="secondary" onClick={() => save(false)} loading={busy}>{tr("Spara")}</Button><Button onClick={() => save(true)} loading={busy}>{tr("Spara och testa")}</Button></>}>
      <div className="space-y-6">
        <section className="space-y-3">
          <div className="flex items-center gap-2"><span className="grid place-items-center size-8 rounded-lg bg-blue-50 text-blue-600"><Search className="size-4" /></span><h3 className="font-semibold text-slate-900">{tr("Google Places API")}</h3><Badge className={cfg.googleConfigured ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' : 'bg-amber-50 text-amber-700 ring-amber-600/20'}>{cfg.googleConfigured ? tr("Konfigurerad") : tr("Demoläge")}</Badge></div>
          <p className="text-sm text-slate-600">{tr("Hittar företag efter bransch och ort – samma data som Google Maps, via Googles officiella API. Skapa en nyckel i")} <a className="text-brand-600 underline" href="https://console.cloud.google.com/apis/library/places.googleapis.com" target="_blank" rel="noreferrer">{tr("Google Cloud Console")}</a>{tr(", aktivera")} <b>{tr("Places API (New)")}</b> {tr("och begränsa nyckeln till just det API:t. Google debiterar per sökning (det finns en månatlig gratiskvot).")}</p>
          <Field label={tr("API-nyckel")}><Input type="password" value={cfg.googleApiKey} onChange={set('googleApiKey')} placeholder={tr("AIza…")} /></Field>
          <Result r={test?.google} />
        </section>
        <section className="space-y-3 border-t border-slate-100 pt-5">
          <div className="flex items-center gap-2"><span className="grid place-items-center size-8 rounded-lg bg-slate-100 text-slate-700"><Building2 className="size-4" /></span><h3 className="font-semibold text-slate-900">{tr("Bolagsverket")}</h3><Badge className={cfg.bolagsverketConfigured ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' : 'bg-slate-100 text-slate-600 ring-slate-500/20'}>{cfg.bolagsverketConfigured ? tr("Konfigurerad") : tr("Valfritt")}</Badge></div>
          <p className="text-sm text-slate-600">{tr("Verifierar bolaget när ett organisationsnummer hittats på hemsidan: bolagsform, registreringsdatum, bransch (SNI) och om bolaget är avregistrerat. Kostnadsfritt API för \"värdefulla datamängder\" – registrera en klient på Bolagsverkets API-portal för att få klient-id och hemlighet.")}</p>
          <div className="grid sm:grid-cols-3 gap-4">
            <Field label={tr("Klient-id")}><Input value={cfg.bvClientId} onChange={set('bvClientId')} /></Field>
            <Field label={tr("Klienthemlighet")}><Input type="password" value={cfg.bvClientSecret} onChange={set('bvClientSecret')} /></Field>
            <Field label={tr("Miljö")}><Select value={cfg.bvEnv} onChange={set('bvEnv')}><option value="prod">{tr("Produktion")}</option><option value="test">{tr("Test (accept2)")}</option></Select></Field>
          </div>
          <Result r={test?.bolagsverket} />
        </section>
        <div className="flex gap-3 rounded-xl bg-slate-50 p-4 text-xs text-slate-600">
          <Info className="size-4 shrink-0 text-slate-400" />
          <p>{tr("Allabolag och Google Maps tillåter inte skrapning, därför används officiella API:er. Google tillåter inte att platsdata sparas permanent – företag du inte importerar rensas automatiskt efter")} {cfg.retentionDays} {tr("dagar.")}</p>
        </div>
      </div>
    </Modal>
  );
}

function SearchForm({ onDone }) {
  const toast = useToast();
  const [f, setF] = useState({ query: '', location: '', minRating: '', minReviews: '', requireWebsite: false, requirePhone: true, exclude: '', max: 60, weekly: false });
  const [adv, setAdv] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e?.target ? e.target.value : e });
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api.post('/prospecting/searches', {
        query: f.query, location: f.location, schedule: f.weekly ? 'weekly' : 'none',
        filters: { minRating: f.minRating, minReviews: f.minReviews, requireWebsite: f.requireWebsite, requirePhone: f.requirePhone, exclude: f.exclude, max: f.max },
      });
      toast(r.added ? tr("{0} nya företag att granska{1}", { 0: r.added, 1: r.skipped ? ` (${r.skipped} filtrerades bort eller fanns redan)` : '' }) : tr("Inga nya företag hittades"), r.added ? 'success' : 'info', { title: tr("Sökning klar") });
      onDone(r.id);
    } catch (err) { toast(err.message, 'error'); } finally { setBusy(false); }
  };
  return (
    <Card className="p-5">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
          <Field label={tr("Vad söker du?")}><Input value={f.query} onChange={set('query')} placeholder={tr("t.ex. tandläkare, byggfirma, redovisningsbyrå")} required /></Field>
          <Field label={tr("Var?")}><Input value={f.location} onChange={set('location')} placeholder={tr("t.ex. Uppsala eller Södermalm, Stockholm")} /></Field>
          <Button type="submit" icon={Search} loading={busy} className="h-[38px]">{tr("Sök företag")}</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-400">{tr("Exempel:")}</span>
          {EXAMPLES.map(([q, l]) => <button key={q} type="button" onClick={() => setF({ ...f, query: q, location: l })} className="rounded-full border border-slate-200 px-2.5 py-0.5 text-xs text-slate-600 hover:border-brand-300 hover:text-brand-700">{q} i {l}</button>)}
          <button type="button" onClick={() => setAdv(!adv)} className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"><SlidersHorizontal className="size-3.5" />{tr("Filter")}{adv ? ' ▴' : ' ▾'}</button>
        </div>
        {adv && (
          <div className="grid sm:grid-cols-4 gap-4 border-t border-slate-100 pt-4 animate-fade-in">
            <Field label={tr("Lägsta betyg")}><Select value={f.minRating} onChange={set('minRating')}><option value="">{tr("Alla")}</option><option value="3.5">3,5+</option><option value="4">4,0+</option><option value="4.5">4,5+</option></Select></Field>
            <Field label={tr("Minst antal omdömen")}><Input type="number" min="0" value={f.minReviews} onChange={set('minReviews')} placeholder="0" /></Field>
            <Field label={tr("Antal träffar")}><Select value={f.max} onChange={set('max')}><option value={20}>20</option><option value={40}>40</option><option value={60}>{tr("60 (max)")}</option></Select></Field>
            <Field label={tr("Uteslut namn som innehåller")} hint={tr("Kommaseparerat, t.ex. kedjor")}><Input value={f.exclude} onChange={set('exclude')} placeholder={tr("Folktandvården, Apoteket")} /></Field>
            <div className="sm:col-span-4 flex flex-wrap gap-6">
              <Toggle checked={f.requirePhone} onChange={set('requirePhone')} label={tr("Måste ha telefon")} />
              <Toggle checked={f.requireWebsite} onChange={set('requireWebsite')} label={tr("Måste ha hemsida")} description={tr("Behövs för att hitta e-post och org.nr")} />
              <Toggle checked={f.weekly} onChange={set('weekly')} label={tr("Bevaka veckovis")} description={tr("Nya företag som matchar hamnar i granskningslistan")} />
            </div>
          </div>
        )}
      </form>
    </Card>
  );
}

function OrgNrInput({ p, onSaved }) {
  const toast = useToast();
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState('');
  if (!edit) return <button onClick={() => setEdit(true)} className="text-xs text-brand-600 hover:underline">{tr("+ Ange org.nr")}</button>;
  const save = async () => {
    try { await api.patch(`/prospecting/prospects/${p.id}`, { org_nr: v }); setEdit(false); onSaved(); } catch (e) { toast(e.message, 'error'); }
  };
  return (
    <form onSubmit={(e) => { e.preventDefault(); save(); }} className="flex gap-1">
      <input autoFocus value={v} onChange={(e) => setV(e.target.value)} onBlur={() => !v && setEdit(false)} placeholder={tr("556xxx-xxxx")} className="input !py-0.5 !px-2 text-xs w-28" />
      <button className="text-brand-600"><Check className="size-4" /></button>
    </form>
  );
}

function ProspectRow({ p, checked, onToggle, reload }) {
  const c = p.company || {};
  const enriching = ['pending', 'running'].includes(p.enrich_status);
  const dup = p.duplicate_lead_id;
  return (
    <tr className={cx('align-top hover:bg-slate-50/60', checked && 'bg-brand-50/40')}>
      <td className="pl-4 pt-4">{p.status === 'new' && <input type="checkbox" checked={checked} onChange={onToggle} disabled={!!dup} className="rounded accent-brand-600" />}</td>
      <td className="px-4 py-3 min-w-56">
        <p className="font-medium text-slate-800">{p.name}</p>
        <p className="text-xs text-slate-500">{p.category}{p.city && ` · ${p.city}`}</p>
        {p.rating != null && <p className="mt-1 inline-flex items-center gap-1 text-xs text-slate-600"><Star className="size-3 fill-amber-400 text-amber-400" />{String(p.rating).replace('.', ',')} <span className="text-slate-400">({p.reviews})</span></p>}
        {p.demo && <Badge className="ml-2 bg-amber-50 text-amber-700 ring-amber-600/20">{tr("Exempel")}</Badge>}
      </td>
      <td className="px-4 py-3 text-xs space-y-1 min-w-48">
        {p.phone && <p className="flex items-center gap-1.5 text-slate-700"><Phone className="size-3 text-slate-400" />{p.phone}</p>}
        {p.email ? <p className="flex items-center gap-1.5 text-slate-700"><Mail className="size-3 text-slate-400" />{p.email}</p>
          : enriching ? <p className="flex items-center gap-1.5 text-slate-400"><Loader2 className="size-3 animate-spin" />{tr("Söker e-post…")}</p> : <p className="text-slate-400">{tr("Ingen e-post hittad")}</p>}
        {p.website && <a href={p.website} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-brand-600 hover:underline truncate max-w-56"><Globe className="size-3" />{p.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}</a>}
      </td>
      <td className="px-4 py-3 text-xs min-w-52">
        {p.org_nr ? (
          <>
            <p className="font-medium text-slate-700 tabular-nums">{p.org_nr}</p>
            {c.form && <p className="text-slate-500">{c.form}{c.registered && ` · sedan ${String(c.registered).slice(0, 4)}`}</p>}
            {c.sni?.[0] && <p className="text-slate-500 truncate max-w-52" title={c.sni.map((s) => `${s.kod} ${s.text}`).join(', ')}>{c.sni[0].text}</p>}
            {c.source === 'bolagsverket' && <p className="inline-flex items-center gap-1 text-emerald-600"><ShieldCheck className="size-3" />{tr("Verifierad hos Bolagsverket")}</p>}
            {c.deregistered && <p className="text-rose-600 font-medium">{tr("Avregistrerat bolag")}</p>}
          </>
        ) : enriching ? <span className="text-slate-400">{tr("Letar…")}</span> : p.status === 'new' ? <OrgNrInput p={p} onSaved={reload} /> : <span className="text-slate-300">—</span>}
        {p.enrich_note && !enriching && <p className="mt-1 text-[11px] text-slate-400">{p.enrich_note}</p>}
      </td>
      <td className="px-4 py-3 text-xs min-w-40">
        {p.status === 'imported' && p.lead_id && <Link to={`/leads/${p.lead_id}`} className="inline-flex items-center gap-1 font-medium text-emerald-600 hover:underline"><Check className="size-3.5" />{tr("Importerad")}</Link>}
        {dup && p.status !== 'imported' && (
          <Link to={`/leads/${dup}`} className="inline-flex items-start gap-1 text-amber-700 hover:underline">
            <AlertTriangle className="size-3.5 mt-px shrink-0" /><span>{tr("Finns redan")}{p.dup_owner ? ` · ${p.dup_owner}` : ''}</span>
          </Link>
        )}
        {p.status === 'rejected' && <span className="text-slate-400">{tr("Avvisad")}</span>}
        {p.maps_url && <a href={p.maps_url} target="_blank" rel="noreferrer" className="mt-1 flex items-center gap-1 text-slate-500 hover:text-brand-600">{tr("Google Maps")}<ExternalLink className="size-3" /></a>}
      </td>
    </tr>
  );
}

export default function Prospecting() {
  const { can, team, user } = useApp();
  const toast = useToast();
  const [sp, setSp] = useSearchParams();
  const searchId = sp.get('search') || '';
  const [tab, setTab] = useState('new');
  const [selected, setSelected] = useState(new Set());
  const [settings, setSettings] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [owner, setOwner] = useState('rules');
  const [del, setDel] = useState(null);
  const [busy, setBusy] = useState(false);
  const config = useFetch('/prospecting/config');
  const searches = useFetch('/prospecting/searches');
  const { data: prospects, setData, reload } = useFetch('/prospecting/prospects' + qs({ search: searchId, status: tab }));
  useEffect(() => setSelected(new Set()), [searchId, tab]);
  useLive('prospect', (p) => setData((list) => list?.map((x) => (x.id === p.id ? { ...x, ...p } : x))));
  useLive('prospects', () => { searches.reload(); reload(); });

  const selectable = useMemo(() => (prospects || []).filter((p) => p.status === 'new' && !p.duplicate_lead_id), [prospects]);
  const allChecked = selectable.length > 0 && selectable.every((p) => selected.has(p.id));
  const toggle = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const current = searches.data?.find((s) => String(s.id) === searchId);

  const doImport = async () => {
    setBusy(true);
    try {
      const r = await api.post('/prospecting/prospects/import', { ids: [...selected], owner_id: owner === 'rules' ? undefined : Number(owner) });
      toast(tr("{0} företag importerades som leads{1}", { 0: r.created, 1: r.duplicates ? `, ${r.duplicates} fanns redan` : '' }), 'success', { title: tr("Import klar") });
      setImportOpen(false); setSelected(new Set()); reload(); searches.reload();
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  const reject = async (ids) => { await api.post('/prospecting/prospects/reject', { ids }); setSelected(new Set()); reload(); searches.reload(); };
  const restore = async (ids) => { await api.post('/prospecting/prospects/restore', { ids }); reload(); searches.reload(); };
  const rerun = async (s) => {
    try { const r = await api.post(`/prospecting/searches/${s.id}/run`); toast(r.added ? tr("{0} nya företag", { 0: r.added }) : tr("Inga nya företag sedan förra sökningen"), 'info'); }
    catch (e) { toast(e.message, 'error'); }
  };
  const toggleWeekly = async (s) => { await api.patch(`/prospecting/searches/${s.id}`, { schedule: s.schedule === 'weekly' ? 'none' : 'weekly' }); searches.reload(); };
  const removeSearch = async () => { await api.del(`/prospecting/searches/${del.id}`); setDel(null); if (String(del.id) === searchId) setSp({}); searches.reload(); reload(); };

  const demo = config.data && !config.data.googleConfigured;
  const exportCsv = () => {
    const rows = (prospects || []).map((p) => [p.name, p.category, p.city, p.phone, p.email, p.website, p.org_nr, p.rating]);
    const csv = '﻿' + [['Företag', 'Kategori', 'Ort', 'Telefon', 'E-post', 'Hemsida', 'Org.nr', 'Betyg'], ...rows].map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'prospekt.csv'; a.click();
  };

  return (
    <div className="space-y-6">
      <PageHeader title={tr("Prospektering")} subtitle={tr("Hitta nya företag efter bransch och ort, granska dem och importera de du vill bearbeta som leads.")}
        actions={can('integrations.manage') && <Button variant="secondary" icon={Settings2} onClick={() => setSettings(true)}>{tr("Datakällor")}</Button>} />

      {demo && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="size-4 shrink-0" />
          <span className="flex-1 min-w-60"><b>{tr("Demoläge:")}</b> {tr("utan Google API-nyckel visas påhittade exempelföretag så att du kan prova flödet.")}</span>
          {can('integrations.manage') && <Button size="sm" variant="secondary" onClick={() => setSettings(true)}>{tr("Lägg in API-nyckel")}</Button>}
        </div>
      )}

      <SearchForm onDone={(id) => { searches.reload(); setTab('new'); setSp({ search: String(id) }); }} />

      <div className="grid gap-6 xl:grid-cols-[280px_1fr]">
        <aside className="space-y-2">
          <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{tr("Sökningar")}</h3>
          <button onClick={() => setSp({})} className={cx('w-full rounded-lg px-3 py-2 text-left text-sm', !searchId ? 'bg-white shadow-sm ring-1 ring-slate-200 font-medium' : 'text-slate-600 hover:bg-white/60')}>{tr("Alla sökningar")}</button>
          {!searches.data ? <Spinner /> : searches.data.map((s) => (
            <div key={s.id} className={cx('group rounded-lg px-3 py-2.5 cursor-pointer', String(s.id) === searchId ? 'bg-white shadow-sm ring-1 ring-slate-200' : 'hover:bg-white/60')} onClick={() => setSp({ search: String(s.id) })}>
              <div className="flex items-center gap-2">
                <p className="flex-1 truncate text-sm font-medium text-slate-800">{s.name}</p>
                {s.status === 'running' && <Loader2 className="size-3.5 animate-spin text-brand-500" />}
                {s.to_review > 0 && <span className="rounded-full bg-brand-600 px-1.5 text-[11px] font-semibold text-white">{s.to_review}</span>}
              </div>
              <p className="mt-0.5 text-xs text-slate-500">{s.imported} {tr("importerade ·")} {s.last_run_at ? timeAgo(s.last_run_at) : tr("aldrig körd")}</p>
              {s.status === 'error' && <p className="text-xs text-rose-600 truncate" title={s.last_error}>{s.last_error}</p>}
              <div className="mt-1.5 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => toggleWeekly(s)} className={cx('inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px]', s.schedule === 'weekly' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-400 hover:bg-slate-100')} title={tr("Kör automatiskt varje vecka")}>
                  <Repeat className="size-3" />{s.schedule === 'weekly' ? tr("Veckobevakning") : tr("Bevaka")}
                </button>
                <button onClick={() => rerun(s)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title={tr("Kör igen")}><Play className="size-3" /></button>
                <button onClick={() => setDel(s)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-rose-600 ml-auto opacity-0 group-hover:opacity-100" title={tr("Ta bort")}><Trash2 className="size-3" /></button>
              </div>
            </div>
          ))}
          {searches.data && !searches.data.length && <p className="px-3 text-sm text-slate-500">{tr("Inga sökningar än.")}</p>}
        </aside>

        <Card className="overflow-hidden min-w-0">
          <div className="flex flex-wrap items-center gap-3 p-3 border-b border-slate-100">
            <Tabs value={tab} onChange={setTab} tabs={[{ value: 'new', label: tr("Att granska") }, { value: 'imported', label: tr("Importerade") }, { value: 'duplicate', label: tr("Fanns redan") }, { value: 'rejected', label: tr("Avvisade") }]} />
            {current && <span className="text-sm text-slate-500 truncate">{current.query}{current.location && ` i ${current.location}`}</span>}
            {prospects?.length > 0 && <Button size="sm" variant="ghost" icon={Download} className="ml-auto" onClick={exportCsv}>{tr("CSV")}</Button>}
          </div>
          {selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 bg-brand-50/70 border-b border-brand-100 animate-fade-in">
              <span className="text-sm font-medium text-brand-800 mr-2">{selected.size} {tr("valda")}</span>
              <Button size="sm" icon={Crosshair} onClick={() => setImportOpen(true)}>{tr("Importera som leads")}</Button>
              <Button size="sm" variant="secondary" icon={X} onClick={() => reject([...selected])}>{tr("Avvisa")}</Button>
              <button onClick={() => setSelected(new Set())} className="ml-auto text-xs text-slate-500 hover:text-slate-700">{tr("Avmarkera")}</button>
            </div>
          )}
          <div className="overflow-x-auto scroll-thin">
            {!prospects ? <div className="py-16 grid place-items-center"><Spinner /></div> : !prospects.length ? (
              <Empty icon={Crosshair} title={tab === 'new' ? tr("Inget att granska") : tr("Inga företag här")} text={tab === 'new' ? tr("Gör en sökning ovan för att hitta nya företag i din målgrupp.") : undefined} />
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50/80 text-left text-xs text-slate-500 border-b border-slate-100">
                  <tr>
                    <th className="w-10 pl-4">{tab === 'new' && <input type="checkbox" checked={allChecked} onChange={() => setSelected(allChecked ? new Set() : new Set(selectable.map((p) => p.id)))} className="rounded accent-brand-600" />}</th>
                    <th className="px-4 py-3 font-medium">{tr("Företag")}</th><th className="px-4 py-3 font-medium">{tr("Kontakt")}</th><th className="px-4 py-3 font-medium">{tr("Bolagsuppgifter")}</th><th className="px-4 py-3 font-medium">{tr("Status")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {prospects.map((p) => <ProspectRow key={p.id} p={p} checked={selected.has(p.id)} onToggle={() => toggle(p.id)} reload={reload} />)}
                </tbody>
              </table>
            )}
          </div>
          {tab === 'rejected' && prospects?.length > 0 && (
            <div className="p-3 border-t border-slate-100"><Button size="sm" variant="ghost" icon={Undo2} onClick={() => restore(prospects.map((p) => p.id))}>{tr("Flytta tillbaka alla till granskning")}</Button></div>
          )}
        </Card>
      </div>

      <p className="flex items-start gap-2 text-xs text-slate-500 max-w-3xl">
        <ShieldCheck className="size-4 shrink-0 text-slate-400" />
        {tr("Kalla leads från prospektering märks \"Kall lead\" och får lägre startpoäng än förfrågningar. Kontaktar du enskilda firmor eller namngivna personer gäller GDPR: informera om var uppgifterna kommer ifrån vid första kontakten och respektera önskemål om att inte bli kontaktad.")}
      </p>

      <SettingsModal open={settings} onClose={() => setSettings(false)} onSaved={() => config.reload()} />
      <Modal open={importOpen} onClose={() => setImportOpen(false)} title={tr("Importera {0} företag", { 0: selected.size })} description={tr("De blir leads med källan Prospektering och taggen Kall lead.")}
        footer={<><Button variant="secondary" onClick={() => setImportOpen(false)}>{tr("Avbryt")}</Button><Button loading={busy} onClick={doImport}>{tr("Importera")}</Button></>}>
        <Field label={tr("Vem ska bearbeta dem?")}>
          <Select value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="rules">{tr("Fördela enligt automatiseringsreglerna")}</option>
            <option value={user.id}>{tr("Mig själv")}</option>
            {can('leads.assign') && team.filter((u) => u.id !== user.id).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
        </Field>
        <p className="mt-3 text-xs text-slate-500">{tr("Tips: skapa en automatiseringsregel för källan Prospektering, t.ex. som skapar uppgiften \"Ring och presentera oss\".")}</p>
      </Modal>
      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={removeSearch} title={tr("Ta bort sökning?")} text={tr("Ogranskade företag från sökningen tas bort. Redan importerade leads påverkas inte.")} confirmText={tr("Ta bort")} />
    </div>
  );
}
