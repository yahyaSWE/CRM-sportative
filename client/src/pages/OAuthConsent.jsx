import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bot, Check, ShieldCheck, X } from 'lucide-react';
import { api } from '../api.js';
import { Button, Card, Spinner, cx } from '../components/ui.jsx';
import { tr } from '../lib/i18n.js';

// Godkännande när Claude (eller en annan AI-assistent) vill koppla in sig via MCP.
// Användaren väljer vilka arbetsytor (bolag) kopplingen får nå. Svaret skickar tillbaka användaren till assistenten.
export default function OAuthConsent() {
  const [params] = useSearchParams();
  const id = params.get('request');
  const [req, setReq] = useState(null);
  const [chosen, setChosen] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    if (!id) { setError(tr('Förfrågan saknas. Starta kopplingen igen från Claude.')); return; }
    api.get(`/oauth/requests/${encodeURIComponent(id)}`).then((r) => {
      setReq(r);
      // Förvalt: alla arbetsytor där användaren får koppla AI.
      setChosen(r.workspaces.filter((w) => w.allowed).map((w) => w.id));
    }).catch((e) => setError(e.message));
  }, [id]);

  const toggle = (wsId) => setChosen((c) => (c.includes(wsId) ? c.filter((x) => x !== wsId) : [...c, wsId]));
  const answer = async (approve) => {
    setBusy(approve ? 'yes' : 'no');
    try { const r = await api.post(`/oauth/requests/${encodeURIComponent(id)}`, { approve, workspaces: chosen }); window.location.assign(r.redirect); }
    catch (e) { setError(e.message); setBusy(null); }
  };
  const several = req?.workspaces.length > 1;

  return (
    <div className="min-h-full grid place-items-center bg-slate-50 p-4">
      <Card className="w-full max-w-md p-6 sm:p-8">
        <div className="flex items-center justify-center gap-3 mb-6">
          <div className="grid place-items-center size-12 rounded-xl bg-gradient-to-br from-brand-500 to-violet-500 text-white font-bold">LF</div>
          <span className="text-slate-300">⇄</span>
          <div className="grid place-items-center size-12 rounded-xl bg-orange-50 text-orange-600"><Bot className="size-6" /></div>
        </div>
        {error ? (
          <p className="text-center text-sm text-red-600">{error}</p>
        ) : !req ? (
          <div className="grid place-items-center py-6"><Spinner /></div>
        ) : (
          <>
            <h1 className="text-center text-lg font-semibold text-slate-900">{tr('{name} vill ansluta till ditt LeadFlow-konto', { name: req.client.name })}</h1>
            <p className="mt-1 text-center text-sm text-slate-500">{tr('Inloggad som {name} ({email})', { name: req.user.name, email: req.user.email })}</p>
            {several && (
              <div className="mt-5">
                <p className="mb-2 text-sm font-medium text-slate-700">{tr('Vilka arbetsytor ska kopplingen nå?')}</p>
                <ul className="space-y-1.5">
                  {req.workspaces.map((w) => (
                    <li key={w.id}>
                      <label className={cx('flex items-center gap-3 rounded-lg border px-3 py-2 text-sm', w.allowed ? 'cursor-pointer border-slate-200 hover:bg-slate-50' : 'border-slate-100 text-slate-400')}>
                        <input type="checkbox" className="size-4 accent-brand-600" checked={chosen.includes(w.id)} disabled={!w.allowed} onChange={() => toggle(w.id)} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{w.name}</span>
                          <span className="block text-xs text-slate-500">{w.allowed ? tr(w.role || '') : tr('Din roll får inte koppla AI-assistenter här')}</span>
                        </span>
                        {w.id === req.workspace?.id && <span className="text-[11px] text-slate-400">{tr('standard')}</span>}
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {!several && req.workspace && <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-center text-sm text-slate-700">{tr('Arbetsyta')}: <strong>{req.workspace.name}</strong></p>}
            {req.allowed ? (
              <ul className="mt-5 space-y-3 text-sm text-slate-700">
                {[
                  tr('Läsa kunder, leads, affärer, möten, uppgifter och statistik som du själv kan se'),
                  tr('Skapa och uppdatera leads, affärer, anteckningar, uppgifter, möten och offerter i ditt namn'),
                  several ? tr('Samma behörigheter som din roll i varje arbetsyta – inget mer') : tr('Samma behörigheter som din roll ({role}) – inget mer', { role: tr(req.user.role) }),
                  tr('Allt loggas som du "via Claude", och du kan koppla bort när som helst under Inställningar'),
                ].map((t) => <li key={t} className="flex gap-2"><Check className="size-4 shrink-0 text-emerald-500 mt-0.5" />{t}</li>)}
              </ul>
            ) : (
              <p className="mt-6 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{tr('Din roll har inte behörighet att koppla AI-assistenter. Be en administratör om behörigheten "Koppla Claude och andra AI-assistenter (MCP)".')}</p>
            )}
            <p className="mt-6 flex items-center gap-1.5 text-xs text-slate-400"><ShieldCheck className="size-3.5" />{tr('Du skickas tillbaka till {host}', { host: req.redirectHost })}</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button variant="secondary" icon={X} loading={busy === 'no'} disabled={!!busy} onClick={() => answer(false)}>{tr('Avbryt')}</Button>
              <Button icon={Check} loading={busy === 'yes'} disabled={!!busy || !req.allowed || !chosen.length} onClick={() => answer(true)}>{tr('Godkänn')}</Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
