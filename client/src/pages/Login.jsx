import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../lib/app.jsx';
import { Button } from '../components/ui.jsx';
import { FacebookIcon, InstagramIcon } from '../lib/meta.jsx';
import { Mail, Zap, ShieldCheck } from 'lucide-react';
import { tr, LANGUAGES, getLanguage, applyLanguage } from '../lib/i18n.js';

export default function Login() {
  const { setUser } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [setup, setSetup] = useState(null);
  const [name, setName] = useState('');
  const [confirm, setConfirm] = useState('');
  useEffect(() => { api.get('/auth/setup').then(setSetup).catch(() => setSetup({ needed: false, demo: false })); }, []);
  const createAdmin = async (e) => {
    e.preventDefault();
    if (password !== confirm) return setError(tr("Lösenorden matchar inte"));
    setLoading(true); setError('');
    try { const r = await api.post('/auth/setup', { name, email, password, language: getLanguage() }); setUser(r.user); }
    catch (err) { setError(err.message); } finally { setLoading(false); }
  };

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try { const r = await api.post('/auth/login', { email, password }); setUser(r.user); }
    catch (err) { setError(err.message); } finally { setLoading(false); }
  };

  return (
    <div className="min-h-full grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between bg-slate-950 p-12 text-white relative overflow-hidden">
        <div className="absolute -top-40 -right-40 size-[520px] rounded-full bg-brand-600/30 blur-3xl" />
        <div className="absolute -bottom-40 -left-20 size-[420px] rounded-full bg-violet-600/20 blur-3xl" />
        <div className="relative flex items-center gap-2.5">
          <div className="grid place-items-center size-9 rounded-lg bg-gradient-to-br from-brand-500 to-violet-500">
            <svg viewBox="0 0 32 32" className="size-5"><path d="M7 22l6-7 4 3 8-9" stroke="white" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
          <span className="text-lg font-semibold">{tr("LeadFlow")}</span>
        </div>
        <div className="relative max-w-md">
          <h1 className="text-4xl font-semibold tracking-tight leading-tight">{tr("Varje lead, från varje kanal – automatiskt på ett ställe.")}</h1>
          <p className="mt-4 text-slate-400">{tr("Koppla in e-post, Facebook och Instagram. LeadFlow hämtar in, sorterar och fördelar leads åt ditt team i realtid.")}</p>
          <div className="mt-10 space-y-3">
            {[[FacebookIcon, tr("Facebook Lead Ads & Messenger"), 'text-[#1877F2]'], [InstagramIcon, tr("Instagram Lead Ads & direktmeddelanden"), 'text-[#E1306C]'],
              [Mail, tr("E-postinkorg via IMAP eller vidarebefordran"), 'text-amber-400'], [Zap, tr("Automatisk fördelning och poängsättning"), 'text-brand-400'],
              [ShieldCheck, tr("Roller och behörigheter för hela teamet"), 'text-emerald-400']].map(([I, t, c]) => (
              <div key={t} className="flex items-center gap-3 text-sm text-slate-300"><span className="grid place-items-center size-8 rounded-lg bg-white/5"><I className={`size-4 ${c}`} /></span>{t}</div>
            ))}
          </div>
        </div>
        <p className="relative text-xs text-slate-500">© {new Date().getFullYear()} {tr("LeadFlow CRM")}</p>
      </div>
      <div className="relative flex items-center justify-center p-6">
        {/* Språkval innan inloggning; efter inloggning gäller kontots sparade språk. */}
        <div className="absolute top-5 right-6 flex gap-1 text-xs">
          {LANGUAGES.map((x) => (
            <button key={x.code} onClick={() => applyLanguage(x.code)} className={x.code === getLanguage() ? "rounded px-2 py-1 font-semibold text-slate-900 bg-slate-100" : "rounded px-2 py-1 text-slate-500 hover:text-slate-800"}>{x.label}</button>
          ))}
        </div>
        {setup?.needed ? (
        <form onSubmit={createAdmin} className="w-full max-w-sm">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">{tr("Välkommen till LeadFlow")}</h2>
          <p className="mt-1 text-sm text-slate-500">{tr("Skapa administratörskontot. Därefter bjuder du in resten av teamet under Team & behörigheter.")}</p>
          <div className="mt-8 space-y-4">
            <label className="block"><span className="label">{tr("Ditt namn")}</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus required /></label>
            <label className="block"><span className="label">{tr("E-post")}</span><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={setup.adminEmail || ''} required />
              {setup.adminEmail && <span className="mt-1 block text-xs text-slate-400">{tr("Måste vara adressen i ADMIN_EMAIL (")}{setup.adminEmail})</span>}</label>
            <label className="block"><span className="label">{tr("Lösenord (minst 10 tecken)")}</span><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={10} required autoComplete="new-password" /></label>
            <label className="block"><span className="label">{tr("Upprepa lösenord")}</span><input className="input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" /></label>
            {error && <p className="text-sm text-rose-600">{error}</p>}
            <Button type="submit" className="w-full py-2.5" loading={loading}>{tr("Skapa konto och logga in")}</Button>
          </div>
        </form>
        ) : (
        <form onSubmit={submit} className="w-full max-w-sm">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">{tr("Logga in")}</h2>
          <p className="mt-1 text-sm text-slate-500">{tr("Välkommen tillbaka! Ange dina uppgifter.")}</p>
          <div className="mt-8 space-y-4">
            <label className="block"><span className="label">{tr("E-post")}</span><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required /></label>
            <label className="block"><span className="label">{tr("Lösenord")}</span><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
            {error && <p className="text-sm text-rose-600">{error}</p>}
            <Button type="submit" className="w-full py-2.5" loading={loading}>{tr("Logga in")}</Button>
          </div>
          {setup?.demo && (
            <div className="mt-8 rounded-lg border border-dashed border-slate-300 p-4 text-xs text-slate-500">
              <p className="font-medium text-slate-700 mb-1">{tr("Demokonton (bara i utvecklingsläge)")}</p>
              <p>{tr("Administratör: admin@leadflow.se · Säljchef: sofia@leadflow.se · Säljare: marcus@leadflow.se · Läsbehörighet: ali@leadflow.se")}</p>
              <p className="mt-1">{tr("Lösenordet står i README.md.")}</p>
            </div>
          )}
        </form>
        )}
      </div>
    </div>
  );
}
