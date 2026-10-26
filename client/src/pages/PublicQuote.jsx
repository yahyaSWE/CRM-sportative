import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Printer, CheckCircle2, XCircle, Clock, PenLine, Eraser, ShieldCheck, Loader2, Download } from 'lucide-react';
import { RECURRING_SV } from '../components/DealProducts.jsx';

const kr = (n) => new Intl.NumberFormat('sv-SE', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n || 0);
const date = (s) => (s ? new Date(String(s).includes('T') || s.length === 10 ? s : s.replace(' ', 'T') + 'Z').toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
const dateTime = (s) => (s ? new Date(s.replace(' ', 'T') + 'Z').toLocaleString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

async function call(method, url, body) {
  const res = await fetch(`/api/public${url}`, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Något gick fel');
  return data;
}

// Ritad signatur med mus, finger eller penna.
function SignaturePad({ onChange }) {
  const ref = useRef();
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);
  useEffect(() => {
    const c = ref.current;
    const ctx = c.getContext('2d');
    ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#0f172a';
  }, []);
  const pos = (e) => { const r = ref.current.getBoundingClientRect(); return [(e.clientX - r.left) * (ref.current.width / r.width), (e.clientY - r.top) * (ref.current.height / r.height)]; };
  const down = (e) => { e.preventDefault(); ref.current.setPointerCapture(e.pointerId); drawing.current = true; const ctx = ref.current.getContext('2d'); ctx.beginPath(); ctx.moveTo(...pos(e)); };
  const move = (e) => { if (!drawing.current) return; const ctx = ref.current.getContext('2d'); ctx.lineTo(...pos(e)); ctx.stroke(); };
  const up = () => { if (!drawing.current) return; drawing.current = false; setEmpty(false); onChange(ref.current.toDataURL('image/png')); };
  const clear = () => { ref.current.getContext('2d').clearRect(0, 0, ref.current.width, ref.current.height); setEmpty(true); onChange(null); };
  return (
    <div>
      <div className="relative rounded-xl border-2 border-dashed border-slate-300 bg-white">
        <canvas ref={ref} width={600} height={180} className="block w-full h-36 touch-none cursor-crosshair" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} />
        {empty && <span className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-slate-400">Rita din signatur här</span>}
        <span className="pointer-events-none absolute bottom-6 left-6 right-6 border-b border-slate-200" />
      </div>
      {!empty && <button type="button" onClick={clear} className="mt-1 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"><Eraser className="size-3" />Rensa</button>}
    </div>
  );
}

export default function PublicQuote() {
  const { token } = useParams();
  const [q, setQ] = useState(null);
  const [error, setError] = useState('');
  const [f, setF] = useState({ name: '', email: '', title: '', signature: null, accept: false });
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');

  useEffect(() => {
    call('GET', `/quotes/${token}`).then((d) => {
      setQ(d);
      setF((x) => ({ ...x, name: d.content.customer?.name || '', email: d.content.customer?.email || '' }));
      document.title = `Offert ${d.number} – ${d.content.seller?.name}`;
    }).catch((e) => setError(e.message));
  }, [token]);

  const sign = async (e) => {
    e.preventDefault();
    setBusy(true); setFormError('');
    try { setQ(await call('POST', `/quotes/${token}/sign`, f)); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    catch (err) { setFormError(err.message); } finally { setBusy(false); }
  };
  const decline = async () => {
    setBusy(true);
    try { setQ(await call('POST', `/quotes/${token}/decline`, { reason })); setDeclining(false); }
    catch (err) { setFormError(err.message); } finally { setBusy(false); }
  };

  if (error) return <div className="min-h-full grid place-items-center p-6 text-center"><div><XCircle className="mx-auto size-10 text-slate-300" /><p className="mt-3 font-semibold text-slate-800">{error}</p><p className="text-sm text-slate-500">Kontakta din kontaktperson för en ny länk.</p></div></div>;
  if (!q) return <div className="min-h-full grid place-items-center"><Loader2 className="size-6 animate-spin text-slate-400" /></div>;
  const c = q.content;
  const open = !['accepted', 'declined', 'expired'].includes(q.status);

  return (
    <div className="min-h-full bg-slate-100 py-6 sm:py-10 px-3 print:bg-white print:p-0">
      <div className="mx-auto max-w-3xl space-y-4">
        {q.status === 'accepted' && (
          <div className="flex items-start gap-3 rounded-xl bg-emerald-600 px-5 py-4 text-white print:hidden">
            <CheckCircle2 className="size-6 shrink-0" />
            <div><p className="font-semibold">Tack! Offerten är signerad.</p><p className="text-sm text-emerald-50">Signerad av {q.signed.name} {dateTime(q.signed.at)}. {c.contact?.name} återkommer om nästa steg.</p></div>
          </div>
        )}
        {q.status === 'declined' && <div className="rounded-xl bg-slate-700 px-5 py-4 text-white print:hidden"><p className="font-semibold">Offerten är avböjd</p><p className="text-sm text-slate-200">Tack för ditt svar. Vi hör gärna av oss igen om behoven ändras.</p></div>}
        {q.status === 'expired' && <div className="flex items-center gap-2 rounded-xl bg-amber-100 px-5 py-4 text-amber-900 print:hidden"><Clock className="size-5" />Offerten gällde till {date(q.valid_until)}. Kontakta {c.contact?.name || 'oss'} för en uppdaterad offert.</div>}

        <article className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 print:shadow-none print:ring-0">
          <div className="h-1.5" style={{ background: q.branding?.accent || '#4f46e5' }} />
          <header className="flex flex-wrap items-start justify-between gap-6 border-b border-slate-100 px-6 sm:px-10 py-8">
            <div>
              {q.branding?.logo && <img src={q.branding.logo} alt={c.seller?.name} className="mb-3 max-h-16 max-w-[220px] object-contain" />}
              <p className={q.branding?.logo ? 'font-semibold text-slate-900' : 'text-xl font-semibold text-slate-900'}>{c.seller?.name}</p>
              <p className="mt-1 text-sm text-slate-500 whitespace-pre-line">{[c.seller?.address, c.seller?.org_nr && `Org.nr ${c.seller.org_nr}`, c.seller?.website].filter(Boolean).join('\n')}</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Offert</p>
              <p className="text-lg font-semibold text-slate-900">{q.number}</p>
              <p className="text-sm text-slate-500">Datum {date(q.created_at)}</p>
              <p className="text-sm text-slate-500">Giltig t.o.m. {date(q.valid_until)}</p>
            </div>
          </header>

          <div className="grid sm:grid-cols-2 gap-6 px-6 sm:px-10 py-6 text-sm">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Till</p>
              {c.customer?.company && <p className="font-medium text-slate-900">{c.customer.company}</p>}
              {c.customer?.org_nr && <p className="text-slate-600">Org.nr {c.customer.org_nr}</p>}
              {c.customer?.address && <p className="text-slate-600">{c.customer.address}</p>}
              {c.customer?.name && <p className="text-slate-600">Att: {c.customer.name}</p>}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Din kontaktperson</p>
              <p className="font-medium text-slate-900">{c.contact?.name}</p>
              {c.contact?.email && <a href={`mailto:${c.contact.email}`} className="text-brand-600">{c.contact.email}</a>}
              {c.seller?.phone && <p className="text-slate-600">{c.seller.phone}</p>}
            </div>
          </div>

          <div className="px-6 sm:px-10">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{q.title}</h1>
            {q.intro && <p className="mt-3 text-slate-600 whitespace-pre-line">{q.intro}</p>}
          </div>

          <div className="px-6 sm:px-10 py-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b-2 border-slate-900 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 font-semibold">Beskrivning</th><th className="py-2 text-right font-semibold">Antal</th><th className="py-2 text-right font-semibold">À-pris</th><th className="py-2 text-right font-semibold">Rabatt</th><th className="py-2 text-right font-semibold">Summa</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {c.items.map((i, n) => (
                  <tr key={n} className="align-top">
                    <td className="py-3 pr-4"><p className="font-medium text-slate-900">{i.name}</p>{i.description && <p className="text-xs text-slate-500">{i.description}</p>}</td>
                    <td className="py-3 text-right whitespace-nowrap tabular-nums">{kr(i.quantity)} {i.unit}</td>
                    <td className="py-3 text-right whitespace-nowrap tabular-nums">{kr(i.unit_price)} kr{RECURRING_SV[i.recurring]}</td>
                    <td className="py-3 text-right tabular-nums">{i.discount ? `${kr(i.discount)} %` : '–'}</td>
                    <td className="py-3 text-right font-medium whitespace-nowrap tabular-nums">{kr(i.total)} kr{RECURRING_SV[i.recurring]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className="mt-4 ml-auto max-w-xs space-y-1 text-sm">
              <div className="flex justify-between text-slate-600"><dt>Summa exkl. moms</dt><dd className="tabular-nums">{kr(c.totals.subtotal)} kr</dd></div>
              {Object.entries(c.totals.vatByRate).map(([r, v]) => <div key={r} className="flex justify-between text-slate-600"><dt>Moms {r} %</dt><dd className="tabular-nums">{kr(v)} kr</dd></div>)}
              <div className="flex justify-between border-t-2 border-slate-900 pt-2 text-base font-semibold text-slate-900"><dt>Att betala</dt><dd className="tabular-nums">{kr(c.totals.total)} kr</dd></div>
              {c.items.some((i) => i.recurring !== 'none') && <p className="pt-1 text-xs text-slate-500">Rader markerade /mån eller /år faktureras löpande.</p>}
            </dl>
          </div>

          {q.terms && (
            <div className="px-6 sm:px-10 pb-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Villkor</p>
              <p className="text-sm text-slate-600 whitespace-pre-line">{q.terms}</p>
            </div>
          )}

          {q.status === 'accepted' && (
            <div className="border-t border-slate-100 px-6 sm:px-10 py-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Signerad</p>
              <img src={q.signed.signature} alt="Signatur" className="h-20" />
              <p className="text-sm text-slate-700">{q.signed.name}{q.signed.title && `, ${q.signed.title}`}</p>
              <p className="text-xs text-slate-500">{q.signed.email} · {dateTime(q.signed.at)}</p>
              <p className="mt-2 text-[11px] text-slate-400 break-all">Kontrollsumma {q.content_hash}</p>
            </div>
          )}
          {q.branding?.footer && <p className="border-t border-slate-100 px-6 sm:px-10 py-4 text-xs text-slate-500">{q.branding.footer}</p>}
        </article>

        {open && !declining && (
          <form onSubmit={sign} className="rounded-2xl bg-white p-6 sm:p-10 shadow-sm ring-1 ring-slate-200 space-y-5 print:hidden">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900"><PenLine className="size-5 text-brand-600" />Godkänn och signera</h2>
              <p className="text-sm text-slate-500">Fyll i dina uppgifter och skriv under för att acceptera offerten.</p>
            </div>
            <div className="grid sm:grid-cols-3 gap-4">
              <label className="block"><span className="label">Namn</span><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></label>
              <label className="block"><span className="label">E-post</span><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></label>
              <label className="block"><span className="label">Befattning (valfritt)</span><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="t.ex. VD" /></label>
            </div>
            <SignaturePad onChange={(signature) => setF((x) => ({ ...x, signature }))} />
            <label className="flex items-start gap-3 text-sm text-slate-700">
              <input type="checkbox" checked={f.accept} onChange={(e) => setF({ ...f, accept: e.target.checked })} className="mt-0.5 size-4 accent-brand-600" />
              <span>Jag har läst offerten och villkoren och godkänner dem för {c.customer?.company || 'vår'} räkning. Jag är behörig att ingå avtalet.</span>
            </label>
            {formError && <p className="text-sm text-rose-600">{formError}</p>}
            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" disabled={busy || !f.accept || !f.signature} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50">
                {busy ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}Signera offerten
              </button>
              {(!f.signature || !f.accept) && (
                <span className="text-xs text-slate-500">{!f.signature && !f.accept ? 'Rita din signatur och kryssa i rutan ovan' : !f.signature ? 'Rita din signatur i rutan' : 'Kryssa i rutan för att godkänna'}</span>
              )}
              <button type="button" onClick={() => setDeclining(true)} className="text-sm text-slate-500 hover:text-slate-700">Tacka nej</button>
              <a href={`/api/public/quotes/${token}/pdf`} className="ml-auto inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"><Download className="size-4" />Ladda ner PDF</a>
            </div>
            <p className="text-[11px] text-slate-400">Elektronisk underskrift. Namn, e-post, tidpunkt, IP-adress och en kontrollsumma av offerten sparas som bevis.</p>
          </form>
        )}
        {open && declining && (
          <div className="rounded-2xl bg-white p-6 sm:p-10 shadow-sm ring-1 ring-slate-200 space-y-3 print:hidden">
            <h2 className="text-lg font-semibold text-slate-900">Tacka nej till offerten</h2>
            <textarea className="input min-h-24" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Berätta gärna varför – det hjälper oss att bli bättre (valfritt)" />
            <div className="flex gap-2">
              <button onClick={decline} disabled={busy} className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900">Skicka svar</button>
              <button onClick={() => setDeclining(false)} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">Tillbaka</button>
            </div>
          </div>
        )}
        {!open && <p className="flex justify-center gap-5 print:hidden"><a href={`/api/public/quotes/${token}/pdf`} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"><Download className="size-4" />Ladda ner PDF</a><button onClick={() => window.print()} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"><Printer className="size-4" />Skriv ut</button></p>}
        <p className="text-center text-[11px] text-slate-400 print:hidden">Skickad via LeadFlow CRM</p>
      </div>
    </div>
  );
}
