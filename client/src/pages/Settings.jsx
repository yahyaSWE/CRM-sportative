import { useEffect, useState } from 'react';
import { Download, DatabaseBackup, Languages, Bot, Copy, Unplug, Mail, CheckCircle2, FileText, ChevronRight, Sparkles, Target, RotateCcw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useSearchParams } from 'react-router-dom';
import { loadEmailStatus } from '../lib/email.js';
import { api } from '../api.js';
import { useApp } from '../lib/app.jsx';
import { Card, PageHeader, Field, Input, Button, Avatar, Badge, useToast, cx } from '../components/ui.jsx';
import { tr, LANGUAGES, getLanguage, applyLanguage } from '../lib/i18n.js';
import { timeAgo } from '../lib/meta.jsx';

// Säkerhetskopior: automatiska dagliga kopior i produktion och nedladdning av en färsk kopia.
function BackupCard() {
  const [data, setData] = useState(null);
  useEffect(() => { api.get('/admin/backups').then(setData).catch(() => {}); }, []);
  if (!data) return null;
  return (
    <Card className="p-6">
      <h3 className="flex items-center gap-2 font-semibold text-slate-900"><DatabaseBackup className="size-4 text-slate-400" />{tr("Säkerhetskopior")}</h3>
      <p className="text-sm text-slate-500 mb-4">{data.auto ? tr("En kopia av databasen sparas automatiskt varje dag (de senaste 14 behålls). Ladda gärna ned en kopia ibland och spara den utanför servern.") : tr("Automatiska kopior körs bara i produktion. Du kan alltid ladda ned en kopia.")}</p>
      <a href="/api/admin/backup"><Button variant="secondary" icon={Download}>{tr("Ladda ned säkerhetskopia nu")}</Button></a>
      {data.items.length > 0 && <p className="mt-3 text-xs text-slate-500">{tr("Senaste automatiska kopior:")} {data.items.slice(0, 3).map((b) => b.name.replace(/^(crm|ws\d+)-/, '').replace('.db', '')).join(', ')}</p>}
    </Card>
  );
}

// E-post: säljaren kopplar sin Gmail (samma Google-koppling som kalendern) för att skicka mejl från appen.
function EmailCard() {
  const { can } = useApp();
  const toast = useToast();
  const [sp, setSp] = useSearchParams();
  const [s, setS] = useState(null);
  useEffect(() => {
    loadEmailStatus(true).then(setS).catch(() => setS({}));
    const g = sp.get('google');
    if (g === 'connected') toast(tr('Google är kopplat'));
    if (g === 'error') toast(tr('Kunde inte koppla Google: {0}', { 0: sp.get('reason') || 'okänt fel' }), 'error');
    if (g) setSp({}, { replace: true });
  }, []);
  if (!s) return null;
  return (
    <Card className="p-6">
      <h3 className="flex items-center gap-2 font-semibold text-slate-900"><Mail className="size-4 text-slate-400" />{tr('E-post')}</h3>
      <p className="text-sm text-slate-500 mb-4">{tr('Koppla din Gmail för att skicka mejl direkt från ett lead. Mejlen skickas från din egen adress, hamnar i din Skickat-mapp och loggas i tidslinjen. Samma koppling används för Google Kalender.')}</p>
      {!s.configured ? (
        <p className="text-sm text-slate-600">{can('integrations.manage') ? tr('Google är inte uppsatt ännu. Lägg in Google-uppgifterna under Kalender → Google Kalender (kugghjulet).') : tr('En administratör behöver koppla Google först.')}</p>
      ) : s.canSend ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 text-sm text-emerald-700"><CheckCircle2 className="size-4" />{tr('Kopplad som {email}', { email: s.email })}</span>
          <a href="/api/calendar/google/connect?return=settings" className="text-sm text-slate-500 underline hover:text-slate-700">{tr('Koppla ett annat konto')}</a>
        </div>
      ) : (
        <div className="space-y-2">
          {s.needsReconnect && <p className="text-sm text-slate-600">{tr('Du har kopplat Google ({email}) men inte gett rätt att skicka e-post.', { email: s.email })}</p>}
          <a href="/api/calendar/google/connect?return=settings"><Button icon={Mail}>{s.needsReconnect ? tr('Ge rätt att skicka e-post') : tr('Koppla Gmail')}</Button></a>
        </div>
      )}
    </Card>
  );
}

// AI-berikning: OpenRouter-nyckel och modell för den här arbetsytan (administratörer).
function AiEnrichCard() {
  const toast = useToast();
  const [cfg, setCfg] = useState(null);
  const [f, setF] = useState({ apiKey: '', model: '' });
  const [saving, setSaving] = useState(false);
  const load = () => api.get('/ai/config').then((c) => { setCfg(c); setF({ apiKey: c.apiKey, model: c.model }); }).catch(() => {});
  useEffect(() => { load(); }, []);
  if (!cfg) return null;
  const custom = !cfg.models.some((m) => m.id === f.model);
  const save = async () => {
    setSaving(true);
    try { await api.patch('/ai/config', f); toast(tr('AI-inställningarna sparades')); load(); }
    catch (e) { toast(e.message, 'error'); } finally { setSaving(false); }
  };
  return (
    <Card className="p-6">
      <h3 className="flex items-center gap-2 font-semibold text-slate-900"><Sparkles className="size-4 text-slate-400" />{tr('AI-berikning')}
        <Badge className={cfg.configured ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' : 'bg-slate-100 text-slate-500 ring-slate-400/20'}>{cfg.configured ? tr('Uppsatt') : tr('Ej uppsatt')}</Badge>
      </h3>
      <p className="text-sm text-slate-500 mb-4">{tr('Knappen Berika på leads och företag sammanfattar bolaget med AI via OpenRouter. Nyckeln gäller den här arbetsytan; du betalar OpenRouter per användning (med standardmodellen ungefär en hundradels krona per berikning).')}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={tr('API-nyckel')} hint={cfg.fromEnv ? tr('Nyckeln kommer från miljövariabeln OPENROUTER_API_KEY.') : <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">{tr('Skapa en nyckel på openrouter.ai/keys')}</a>}>
          <Input type="password" value={f.apiKey} onChange={(e) => setF({ ...f, apiKey: e.target.value })} placeholder="sk-or-v1-…" autoComplete="off" />
        </Field>
        <Field label={tr('Modell')}>
          <select className="input" value={custom ? '__custom' : f.model} onChange={(e) => setF({ ...f, model: e.target.value === '__custom' ? '' : e.target.value })}>
            {cfg.models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            <option value="__custom">{tr('Egen modell')}</option>
          </select>
          {custom && <Input className="mt-2" value={f.model} onChange={(e) => setF({ ...f, model: e.target.value })} placeholder={tr('leverantör/modell')} />}
        </Field>
      </div>
      <Button className="mt-4" loading={saving} onClick={save}>{tr('Spara')}</Button>
    </Card>
  );
}

// Vårt erbjudande: vad bolaget säljer, så att säljvinklar och mejlutkast från AI anpassas efter det (per arbetsyta).
const OFFER_FIELDS = [
  ['what', 'Vad vi gör', 'Vi arrangerar teambuilding, sportevent och kickoffer för företag och föreningar.'],
  ['audience', 'Målgrupp', 'HR-chefer och VD på bolag med 20–500 anställda i Småland, samt idrottsföreningar.'],
  ['problems', 'Problem vi löser', 'Svårt att samla personalen, låg sammanhållning, tidskrävande att planera event.'],
  ['why_us', 'Varför oss', 'Allt-i-ett med lokaler, aktiviteter och mat. Eget team på plats. 4,9 i betyg.'],
  ['references', 'Referenser', 'Kunder vi får nämna, t.ex. Husqvarna och Jönköpings kommun.'],
  ['goal', 'Målet med första kontakten', 'Boka ett 15 minuters samtal.'],
  ['tone', 'Ton', 'Personlig och rak, du-tilltal, korta meningar.'],
];

function OfferCard() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [f, setF] = useState({});
  const [website, setWebsite] = useState('');
  const [saving, setSaving] = useState(false);
  const [drafting, setDrafting] = useState(false);
  useEffect(() => { api.get('/ai/offer').then((d) => { setData(d); setF(d.offer || {}); setWebsite(d.website || ''); }).catch(() => {}); }, []);
  if (!data) return null;
  const ro = !data.canEdit;
  const save = async () => {
    setSaving(true);
    try { const r = await api.put('/ai/offer', f); setF(r.offer); toast(tr('Erbjudandet sparades')); }
    catch (e) { toast(e.message, 'error'); } finally { setSaving(false); }
  };
  const draft = async () => {
    setDrafting(true);
    try { const r = await api.post('/ai/offer/draft', { website }); setF((cur) => ({ ...cur, ...Object.fromEntries(Object.entries(r.offer).filter(([, v]) => v)) })); toast(tr('Förslag ifyllt – granska och klicka Spara')); }
    catch (e) { toast(e.message, 'error'); } finally { setDrafting(false); }
  };
  return (
    <Card className="p-6">
      <h3 className="flex items-center gap-2 font-semibold text-slate-900"><Target className="size-4 text-slate-400" />{tr('Vårt erbjudande')}</h3>
      <p className="text-sm text-slate-500 mb-4">{tr('Beskriv vad {name} säljer. AI:n använder det i säljvinkeln när du berikar ett företag, när den skriver första mejlet och när Claude skriver säljtexter. Gäller den här arbetsytan.', { name: data.company || tr('ert bolag') })}</p>
      {!ro && (
        <div className="mb-5 flex flex-wrap items-end gap-2 rounded-lg bg-slate-50 p-3">
          <Field label={tr('Er hemsida')} className="min-w-56 flex-1"><Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="sportative.se" /></Field>
          <Button variant="secondary" icon={Sparkles} loading={drafting} disabled={!data.configured || !website.trim()} onClick={draft}>{tr('Fyll i från vår hemsida')}</Button>
          {!data.configured && <p className="w-full text-xs text-slate-500">{tr('Kräver AI-berikning (OpenRouter-nyckel) ovan.')}</p>}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {OFFER_FIELDS.map(([k, label, ph]) => (
          <Field key={k} label={tr(label)} className={['what', 'problems', 'why_us'].includes(k) ? 'sm:col-span-2' : ''}>
            <textarea className="input min-h-16" rows={2} value={f[k] || ''} onChange={(e) => setF({ ...f, [k]: e.target.value })} placeholder={tr(ph)} disabled={ro} />
          </Field>
        ))}
      </div>
      {!ro && <Button className="mt-4" loading={saving} onClick={save}>{tr('Spara')}</Button>}
    </Card>
  );
}

// Uppföljningsrytm: hur länge man väntar på svar och hur många gånger man följer upp innan leadet blir Ej aktuell.
function CadenceCard() {
  const toast = useToast();
  const [c, setC] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { api.get('/followup-cadence').then(setC).catch(() => {}); }, []);
  if (!c) return null;
  const ro = !c.canEdit;
  const save = async () => {
    setSaving(true);
    try { const r = await api.put('/followup-cadence', { days: Number(c.days), attempts: Number(c.attempts), autoClose: c.autoClose }); setC({ ...c, ...r }); toast(tr('Uppföljningen sparades')); }
    catch (e) { toast(e.message, 'error'); } finally { setSaving(false); }
  };
  const total = Number(c.days) * (Number(c.attempts) + 1);
  return (
    <Card className="p-6">
      <h3 className="flex items-center gap-2 font-semibold text-slate-900"><RotateCcw className="size-4 text-slate-400" />{tr('Uppföljning av kontaktade leads')}</h3>
      <p className="text-sm text-slate-500 mb-4">{tr('När ett lead är Kontaktat och inte svarat hamnar det under Leads → Kontakta igen efter valt antal dagar. Varje loggat samtal, mejl eller möte räknas som ett försök. Gäller den här arbetsytan.')}</p>
      <div className="grid gap-4 sm:grid-cols-2 max-w-lg">
        <Field label={tr('Dagar innan nästa försök')}><Input type="number" min={1} max={60} value={c.days} disabled={ro} onChange={(e) => setC({ ...c, days: e.target.value })} /></Field>
        <Field label={tr('Antal uppföljningar')}><Input type="number" min={0} max={10} value={c.attempts} disabled={ro} onChange={(e) => setC({ ...c, attempts: e.target.value })} /></Field>
      </div>
      <label className="mt-4 flex items-start gap-2 text-sm text-slate-700">
        <input type="checkbox" className="mt-0.5 size-4 accent-brand-600" checked={c.autoClose} disabled={ro} onChange={(e) => setC({ ...c, autoClose: e.target.checked })} />
        <span>{tr('Markera som Ej aktuell automatiskt när uppföljningarna är slut utan svar')}</span>
      </label>
      <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
        {tr('Exempel: kontakt dag 0, påminnelse efter {d} dagar, sedan {n} uppföljning(ar) med {d} dagars mellanrum – {end} efter {total} dagar utan svar.', {
          d: c.days, n: c.attempts, total, end: c.autoClose ? tr('Ej aktuell') : tr('kvar i listan'),
        })}
      </p>
      {!ro && <Button className="mt-4" loading={saving} onClick={save}>{tr('Spara')}</Button>}
    </Card>
  );
}

// Claude och andra AI-assistenter som kopplats in via MCP. Administratörer ser och kan koppla bort allas.
function AiCard() {
  const { can, user } = useApp();
  const toast = useToast();
  const admin = can('users.manage');
  const [items, setItems] = useState(null);
  const load = () => api.get(`/oauth/connections${admin ? '?all=1' : ''}`).then(setItems).catch(() => setItems([]));
  useEffect(() => { load(); }, []);
  const url = `${window.location.origin}/mcp`;
  const copy = () => navigator.clipboard?.writeText(url).then(() => toast(tr('Adressen är kopierad')));
  const remove = async (c) => {
    try { await api.del(`/oauth/connections/${c.id}`); toast(tr('Kopplingen är borttagen')); load(); }
    catch (e) { toast(e.message, 'error'); }
  };
  return (
    <Card className="p-6">
      <h3 className="flex items-center gap-2 font-semibold text-slate-900"><Bot className="size-4 text-slate-400" />{tr('Claude och AI-assistenter')}</h3>
      <p className="text-sm text-slate-500 mb-4">{tr('Låt Claude läsa och uppdatera CRM:et åt dig, med samma behörigheter som du har. I Claude: Inställningar → Connectors → Lägg till anpassad connector, och klistra in adressen nedan.')}</p>
      {can('ai.connect') ? (
        <div className="flex gap-2 max-w-lg">
          <Input readOnly value={url} onFocus={(e) => e.target.select()} />
          <Button variant="secondary" icon={Copy} onClick={copy}>{tr('Kopiera')}</Button>
        </div>
      ) : <p className="text-sm text-amber-700">{tr('Din roll har inte behörighet att koppla AI-assistenter.')}</p>}
      {items?.length > 0 && (
        <ul className="mt-5 divide-y divide-slate-100 rounded-lg border border-slate-200">
          {items.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-4 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-800">{c.client_name}<span className="font-normal text-slate-500"> · {c.workspace_names.join(', ')}{admin && c.user_id !== user.id && ` · ${c.user_name}`}</span></p>
                <p className="text-xs text-slate-500">{tr('Kopplad {when}', { when: timeAgo(c.created_at) })}{c.last_used_at && ` · ${tr('senast använd {when}', { when: timeAgo(c.last_used_at) })}`}</p>
              </div>
              <Button size="sm" variant="secondary" icon={Unplug} onClick={() => remove(c)}>{tr('Koppla bort')}</Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// Språk: sparas på användaren och gäller på alla enheter. Sidan laddas om på det nya språket.
function LanguageCard() {
  const toast = useToast();
  const [busy, setBusy] = useState(null);
  const current = getLanguage();
  const choose = async (code) => {
    if (code === current) return;
    setBusy(code);
    try { await api.patch('/auth/profile', { language: code }); applyLanguage(code); }
    catch (e) { toast(e.message, 'error'); setBusy(null); }
  };
  return (
    <Card className="p-6">
      <h3 className="flex items-center gap-2 font-semibold text-slate-900"><Languages className="size-4 text-slate-400" />{tr('Språk')}</h3>
      <p className="text-sm text-slate-500 mb-4">{tr('Gäller för ditt konto på alla enheter.')}</p>
      <div className="grid grid-cols-2 gap-2 max-w-sm">
        {LANGUAGES.map((l) => (
          <button key={l.code} onClick={() => choose(l.code)} disabled={!!busy}
            className={cx('rounded-lg border px-4 py-3 text-left text-sm font-medium transition', l.code === current ? 'border-brand-500 bg-brand-50 text-brand-700 ring-4 ring-brand-100' : 'border-slate-200 text-slate-700 hover:border-slate-300')}>
            {l.label}{busy === l.code && '…'}
          </button>
        ))}
      </div>
    </Card>
  );
}

export default function Settings() {
  const { user, permissions, can } = useApp();
  const toast = useToast();
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [saving, setSaving] = useState(false);

  const change = async (e) => {
    e.preventDefault();
    if (pw.next !== pw.confirm) return toast(tr("Lösenorden matchar inte"), 'error');
    setSaving(true);
    try { await api.post('/auth/password', pw); toast(tr("Lösenordet är bytt")); setPw({ current: '', next: '', confirm: '' }); }
    catch (err) { toast(err.message, 'error'); } finally { setSaving(false); }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title={tr("Inställningar")} subtitle={tr("Din profil och säkerhet")} />
      <Card className="p-6 flex items-center gap-4">
        <Avatar name={user.name} color={user.color} size="lg" />
        <div className="flex-1"><p className="font-semibold text-slate-900">{user.name}</p><p className="text-sm text-slate-500">{user.email}</p></div>
        <Badge className="bg-brand-50 text-brand-700 ring-brand-600/20">{tr(user.role)}</Badge>
      </Card>
      <LanguageCard />
      <EmailCard />
      <CadenceCard />
      {can('integrations.manage') && <AiEnrichCard />}
      <OfferCard />
      {can('products.manage') && (
        <Link to="/products?tab=profile" className="block">
          <Card className="flex items-center gap-3 p-6 hover:bg-slate-50">
            <FileText className="size-4 text-slate-400" />
            <div className="flex-1"><h3 className="font-semibold text-slate-900">{tr('Offerter')}</h3><p className="text-sm text-slate-500">{tr('Företagsuppgifter, logga, färg, sidfot och villkor på offerter och PDF:er.')}</p></div>
            <ChevronRight className="size-4 text-slate-400" />
          </Card>
        </Link>
      )}
      <AiCard />
      <Card className="p-6">
        <h3 className="font-semibold text-slate-900">{tr("Dina behörigheter")}</h3>
        <p className="text-sm text-slate-500 mb-4">{tr("Styrs av din roll. Kontakta en administratör för ändringar.")}</p>
        <ul className="grid sm:grid-cols-2 gap-2">
          {permissions.map((p) => {
            const on = user.permissions.includes(p.key);
            return <li key={p.key} className={`flex items-center gap-2 text-sm ${on ? 'text-slate-700' : 'text-slate-400 line-through'}`}><span className={`size-1.5 rounded-full ${on ? 'bg-emerald-500' : 'bg-slate-300'}`} />{tr(p.label)}</li>;
          })}
        </ul>
      </Card>
      <Card className="p-6">
        <h3 className="font-semibold text-slate-900 mb-4">{tr("Byt lösenord")}</h3>
        <form onSubmit={change} className="grid sm:grid-cols-3 gap-4 items-end">
          <Field label={tr("Nuvarande")}><Input type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" /></Field>
          <Field label={tr("Nytt (minst 8 tecken)")}><Input type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" /></Field>
          <Field label={tr("Bekräfta")}><Input type="password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} autoComplete="new-password" /></Field>
          <div className="sm:col-span-3"><Button type="submit" loading={saving}>{tr("Uppdatera lösenord")}</Button></div>
        </form>
      </Card>
      {can('users.manage') && <BackupCard />}
    </div>
  );
}
