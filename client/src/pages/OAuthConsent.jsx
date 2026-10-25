import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bot, Check, ShieldCheck, X } from 'lucide-react';
import { api } from '../api.js';
import { Button, Card, Spinner } from '../components/ui.jsx';
import { tr } from '../lib/i18n.js';

// Godkännande när Claude (eller en annan AI-assistent) vill koppla in sig via MCP.
// Visas efter inloggning; svaret skickar tillbaka användaren till assistenten.
export default function OAuthConsent() {
  const [params] = useSearchParams();
  const id = params.get('request');
  const [req, setReq] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    if (!id) { setError(tr('Förfrågan saknas. Starta kopplingen igen från Claude.')); return; }
    api.get(`/oauth/requests/${encodeURIComponent(id)}`).then(setReq).catch((e) => setError(e.message));
  }, [id]);

  const answer = async (approve) => {
    setBusy(approve ? 'yes' : 'no');
    try { const r = await api.post(`/oauth/requests/${encodeURIComponent(id)}`, { approve }); window.location.assign(r.redirect); }
    catch (e) { setError(e.message); setBusy(null); }
  };

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
            {req.workspace && <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-center text-sm text-slate-700">{tr('Arbetsyta')}: <strong>{req.workspace.name}</strong><span className="block text-xs text-slate-500">{tr('Byt arbetsyta i LeadFlow först om Claude ska kopplas till ett annat bolag.')}</span></p>}
            {req.allowed ? (
              <ul className="mt-6 space-y-3 text-sm text-slate-700">
                {[
                  tr('Läsa kunder, leads, affärer, möten, uppgifter och statistik som du själv kan se'),
                  tr('Skapa och uppdatera leads, affärer, anteckningar, uppgifter, möten och offerter i ditt namn'),
                  tr('Samma behörigheter som din roll ({role}) – inget mer', { role: tr(req.user.role) }),
                  tr('Allt loggas som du "via Claude", och du kan koppla bort när som helst under Inställningar'),
                ].map((t) => <li key={t} className="flex gap-2"><Check className="size-4 shrink-0 text-emerald-500 mt-0.5" />{t}</li>)}
              </ul>
            ) : (
              <p className="mt-6 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{tr('Din roll har inte behörighet att koppla AI-assistenter. Be en administratör om behörigheten "Koppla Claude och andra AI-assistenter (MCP)".')}</p>
            )}
            <p className="mt-6 flex items-center gap-1.5 text-xs text-slate-400"><ShieldCheck className="size-3.5" />{tr('Du skickas tillbaka till {host}', { host: req.redirectHost })}</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button variant="secondary" icon={X} loading={busy === 'no'} disabled={!!busy} onClick={() => answer(false)}>{tr('Avbryt')}</Button>
              <Button icon={Check} loading={busy === 'yes'} disabled={!!busy || !req.allowed} onClick={() => answer(true)}>{tr('Godkänn')}</Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
