import { useEffect, useState } from 'react';
import { Plus, Trash2, FileText, Copy, ExternalLink, Send, Check, PenLine, Eye, XCircle, Clock, Repeat } from 'lucide-react';
import { api } from '../api.js';
import { useLive } from '../lib/app.jsx';
import { Button, Badge, Modal, Field, Input, Select, Textarea, Spinner, Confirm, useToast, cx } from './ui.jsx';
import { sek, formatDate, formatDateTime, timeAgo } from '../lib/meta.jsx';

export const QUOTE_STATUS = {
  draft: ['Utkast', 'bg-slate-100 text-slate-600 ring-slate-500/20'],
  sent: ['Skickad', 'bg-sky-50 text-sky-700 ring-sky-600/20'],
  viewed: ['Öppnad av kunden', 'bg-violet-50 text-violet-700 ring-violet-600/20'],
  accepted: ['Signerad', 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'],
  declined: ['Avböjd', 'bg-rose-50 text-rose-700 ring-rose-600/20'],
  expired: ['Utgången', 'bg-amber-50 text-amber-700 ring-amber-600/20'],
};
export const RECURRING_SV = { none: '', monthly: '/mån', yearly: '/år' };
const kr = (n) => new Intl.NumberFormat('sv-SE', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n || 0);
export const quoteUrl = (token) => `${window.location.origin}/q/${token}`;

// Inmatningsfält som sparar när man lämnar det (eller trycker Enter).
function Cell({ value, onSave, type = 'text', className, disabled, suffix }) {
  const [v, setV] = useState(value ?? '');
  useEffect(() => setV(value ?? ''), [value]);
  const commit = () => { if (String(v) !== String(value ?? '')) onSave(type === 'number' ? Number(v) || 0 : v); };
  return (
    <span className="relative block">
      <input disabled={disabled} type={type} value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
        className={cx('w-full rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm hover:border-slate-200 focus:border-brand-500 focus:bg-white focus:outline-none disabled:hover:border-transparent', className)} />
      {suffix && <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">{suffix}</span>}
    </span>
  );
}

export default function DealProducts({ deal, editable, onChanged }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [products, setProducts] = useState([]);
  const [create, setCreate] = useState(null);
  const [profile, setProfile] = useState(null);
  const [del, setDel] = useState(null);
  const [sig, setSig] = useState(null);
  const load = () => api.get(`/deals/${deal.id}/items`).then(setData);
  useEffect(() => { load(); api.get('/products').then(setProducts); }, [deal.id]);
  useLive('refresh', (d) => d.entity === 'deals' && load());

  const call = async (fn) => { try { setData(await fn()); onChanged?.(); } catch (e) { toast(e.message, 'error'); } };
  const addProduct = (productId) => call(() => api.post(`/deals/${deal.id}/items`, { product_id: Number(productId) }));
  const addFree = () => call(() => api.post(`/deals/${deal.id}/items`, { name: 'Ny rad', quantity: 1, unit_price: 0 }));
  const update = (item, patch) => call(() => api.patch(`/deals/${deal.id}/items/${item.id}`, patch));
  const remove = (item) => call(() => api.del(`/deals/${deal.id}/items/${item.id}`));

  const openCreate = async () => {
    const p = profile || await api.get('/sales/profile');
    setProfile(p);
    const valid = new Date(Date.now() + Number(p.validity_days || 30) * 864e5).toISOString().slice(0, 10);
    setCreate({ title: deal.title, intro: '', terms: p.terms, valid_until: valid, recipient_id: deal.lead_id || deal.contacts?.[0]?.id || '' });
  };
  const doCreate = async () => {
    try { await api.post(`/deals/${deal.id}/quotes`, { ...create, recipient_id: create.recipient_id ? Number(create.recipient_id) : null }); toast('Offerten är skapad – skicka länken till kunden'); setCreate(null); load(); onChanged?.(); }
    catch (e) { toast(e.message, 'error'); }
  };
  const copy = (q) => { navigator.clipboard.writeText(quoteUrl(q.token)); toast('Länken är kopierad'); };
  const markSent = async (q) => { await api.post(`/quotes/${q.id}/sent`); load(); onChanged?.(); };
  const sendEmail = async (q) => {
    const subject = encodeURIComponent(`Offert ${q.number}: ${q.title}`);
    const body = encodeURIComponent(`Hej ${q.recipient_name?.split(' ')[0] || ''},\n\nTack för ett trevligt samtal! Här är vår offert. Du kan läsa och signera den direkt via länken:\n\n${quoteUrl(q.token)}\n\nOfferten gäller till och med ${formatDate(q.valid_until)}. Hör av dig om du har några frågor.\n\nVänliga hälsningar\n${q.content.contact?.name || ''}`);
    window.location.href = `mailto:${q.recipient_email || ''}?subject=${subject}&body=${body}`;
    if (q.status === 'draft') await markSent(q);
  };
  const removeQuote = async () => { await api.del(`/quotes/${del.id}`); setDel(null); load(); };
  const showSignature = async (q) => setSig({ q, ...(await api.get(`/quotes/${q.id}/signature`)) });

  if (!data) return <div className="py-10 grid place-items-center"><Spinner /></div>;
  const t = data.totals;
  const recurring = data.items.filter((i) => i.recurring !== 'none');

  return (
    <div className="space-y-6">
      <section>
        <div className="overflow-x-auto scroll-thin rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr><th className="px-3 py-2 font-medium min-w-52">Produkt</th><th className="px-2 py-2 font-medium w-20 text-right">Antal</th><th className="px-2 py-2 font-medium w-28 text-right">À-pris</th><th className="px-2 py-2 font-medium w-20 text-right">Rabatt</th><th className="px-3 py-2 font-medium w-28 text-right">Summa</th><th className="w-8" /></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map((i) => (
                <tr key={i.id} className="group align-top">
                  <td className="px-2 py-1.5">
                    <Cell value={i.name} disabled={!editable} onSave={(v) => update(i, { name: v })} className="font-medium text-slate-800" />
                    <Cell value={i.description || ''} disabled={!editable} onSave={(v) => update(i, { description: v })} className="!text-xs text-slate-500" />
                  </td>
                  <td className="px-1 py-1.5"><Cell type="number" value={i.quantity} disabled={!editable} onSave={(v) => update(i, { quantity: v })} className="text-right" />
                    <p className="px-1.5 text-right text-[11px] text-slate-400 truncate">{i.unit}</p></td>
                  <td className="px-1 py-1.5"><Cell type="number" value={i.unit_price} disabled={!editable} onSave={(v) => update(i, { unit_price: v })} className="text-right" />
                    {i.recurring !== 'none' && <p className="px-1.5 text-right text-[11px] text-violet-600">{RECURRING_SV[i.recurring]}</p>}</td>
                  <td className="px-1 py-1.5"><Cell type="number" value={i.discount} disabled={!editable} onSave={(v) => update(i, { discount: v })} className="text-right pr-5" suffix="%" /></td>
                  <td className="px-3 py-2.5 text-right font-medium tabular-nums">{kr(i.total)}</td>
                  <td className="py-2">{editable && <button onClick={() => remove(i)} className="p-1 text-slate-300 opacity-0 group-hover:opacity-100 hover:text-rose-500"><Trash2 className="size-4" /></button>}</td>
                </tr>
              ))}
              {!data.items.length && <tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-400">Inga produkter än – lägg till från produktlistan nedan.</td></tr>}
            </tbody>
          </table>
          {editable && (
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-slate-50/60 px-3 py-2">
              <Select value="" onChange={(e) => e.target.value && addProduct(e.target.value)} className="!w-auto !py-1 text-sm">
                <option value="">+ Lägg till produkt…</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name} – {kr(p.price)} kr{RECURRING_SV[p.recurring]}</option>)}
              </Select>
              <Button size="sm" variant="ghost" icon={Plus} onClick={addFree}>Fri rad</Button>
            </div>
          )}
        </div>
        {data.items.length > 0 && (
          <dl className="mt-3 ml-auto max-w-xs space-y-1 text-sm">
            {t.discount > 0 && <div className="flex justify-between text-slate-500"><dt>Rabatt</dt><dd className="tabular-nums">−{kr(t.discount)} kr</dd></div>}
            <div className="flex justify-between text-slate-600"><dt>Summa exkl. moms</dt><dd className="tabular-nums">{kr(t.subtotal)} kr</dd></div>
            {Object.entries(t.vatByRate).map(([rate, v]) => <div key={rate} className="flex justify-between text-slate-500"><dt>Moms {rate} %</dt><dd className="tabular-nums">{kr(v)} kr</dd></div>)}
            <div className="flex justify-between border-t border-slate-200 pt-1 font-semibold text-slate-900"><dt>Totalt inkl. moms</dt><dd className="tabular-nums">{kr(t.total)} kr</dd></div>
            {recurring.length > 0 && <p className="flex items-center gap-1 pt-1 text-xs text-violet-600"><Repeat className="size-3" />Löpande: {recurring.map((i) => `${i.name} ${kr(i.total)} kr${RECURRING_SV[i.recurring]}`).join(', ')}</p>}
            <p className="text-[11px] text-slate-400">Affärens värde följer summan exkl. moms.</p>
          </dl>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Offerter</h3>
          {editable && <Button size="sm" icon={FileText} disabled={!data.items.length} onClick={openCreate}>Skapa offert</Button>}
        </div>
        {!data.quotes.length ? <p className="text-sm text-slate-400">{data.items.length ? 'Ingen offert skapad än.' : 'Lägg till produkter först, sedan kan du skapa en offert.'}</p> : (
          <div className="space-y-2">
            {data.quotes.map((q) => {
              const [label, cls] = QUOTE_STATUS[q.status] || QUOTE_STATUS.draft;
              return (
                <div key={q.id} className="card p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <FileText className="size-4 text-slate-400" />
                    <span className="text-sm font-semibold text-slate-800">{q.number}</span>
                    <Badge className={cls}>{label}</Badge>
                    <span className="ml-auto text-sm font-medium tabular-nums">{sek(q.total)} <span className="text-xs font-normal text-slate-400">exkl. moms</span></span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Till {q.recipient_name || q.recipient_email || 'kund'} · giltig t.o.m. {formatDate(q.valid_until)}
                    {q.sent_at && ` · skickad ${timeAgo(q.sent_at)}`}
                    {q.viewed_at && ` · öppnad ${q.view_count} ${q.view_count === 1 ? 'gång' : 'gånger'}, senast ${timeAgo(q.viewed_at)}`}
                  </p>
                  {q.status === 'accepted' && <p className="mt-1 flex items-center gap-1 text-xs font-medium text-emerald-700"><PenLine className="size-3.5" />Signerad av {q.signer_name}{q.signer_title && `, ${q.signer_title}`} · {formatDateTime(q.signed_at)}</p>}
                  {q.status === 'declined' && <p className="mt-1 flex items-center gap-1 text-xs text-rose-600"><XCircle className="size-3.5" />Avböjd {formatDateTime(q.declined_at)}{q.decline_reason && `: ${q.decline_reason}`}</p>}
                  {q.status === 'expired' && <p className="mt-1 flex items-center gap-1 text-xs text-amber-700"><Clock className="size-3.5" />Giltighetstiden har gått ut – skapa en ny offert om kunden fortfarande är intresserad.</p>}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Button size="sm" variant="secondary" icon={Eye} onClick={() => window.open(`/q/${q.token}`, '_blank')}>Visa</Button>
                    {!['accepted', 'declined', 'expired'].includes(q.status) && editable && <>
                      <Button size="sm" variant="secondary" icon={Send} onClick={() => sendEmail(q)}>Mejla kunden</Button>
                      <Button size="sm" variant="secondary" icon={Copy} onClick={() => copy(q)}>Kopiera länk</Button>
                      {q.status === 'draft' && <Button size="sm" variant="ghost" icon={Check} onClick={() => markSent(q)}>Markera som skickad</Button>}
                    </>}
                    {q.status === 'accepted' && <Button size="sm" variant="ghost" icon={PenLine} onClick={() => showSignature(q)}>Signaturbevis</Button>}
                    {q.status !== 'accepted' && editable && <Button size="sm" variant="ghost" icon={Trash2} className="ml-auto !text-slate-400 hover:!text-rose-600" onClick={() => setDel(q)} />}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <Modal open={!!create} onClose={() => setCreate(null)} wide title="Skapa offert" description={`${data.items.length} rader · ${sek(t.subtotal)} exkl. moms. Kunden får en länk där offerten kan läsas och signeras.`}
        footer={<><Button variant="secondary" onClick={() => setCreate(null)}>Avbryt</Button><Button icon={FileText} onClick={doCreate}>Skapa offert</Button></>}>
        {create && (
          <div className="space-y-4">
            <Field label="Rubrik"><Input value={create.title} onChange={(e) => setCreate({ ...create, title: e.target.value })} /></Field>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Mottagare">
                <Select value={create.recipient_id} onChange={(e) => setCreate({ ...create, recipient_id: e.target.value })}>
                  <option value="">Ingen vald</option>
                  {(deal.contacts?.length ? deal.contacts : deal.lead ? [deal.lead] : []).map((c) => <option key={c.id} value={c.id}>{[c.first_name, c.last_name].filter(Boolean).join(' ') || c.email}{c.title ? ` (${c.title})` : ''}</option>)}
                </Select>
              </Field>
              <Field label="Giltig till och med"><Input type="date" value={create.valid_until} onChange={(e) => setCreate({ ...create, valid_until: e.target.value })} /></Field>
            </div>
            <Field label="Inledning (valfritt)"><Textarea value={create.intro} onChange={(e) => setCreate({ ...create, intro: e.target.value })} placeholder="Tack för ett trevligt möte! Här är vårt förslag enligt det vi pratade om." /></Field>
            <Field label="Villkor" hint="Standardvillkoren ändras under Produkter → Offertinställningar"><Textarea value={create.terms} onChange={(e) => setCreate({ ...create, terms: e.target.value })} /></Field>
          </div>
        )}
      </Modal>
      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={removeQuote} title={`Ta bort offert ${del?.number}?`} text="Länken slutar fungera för kunden." confirmText="Ta bort" />
      <Modal open={!!sig} onClose={() => setSig(null)} title={`Signaturbevis ${sig?.q.number}`}>
        {sig && (
          <div className="space-y-3 text-sm">
            <img src={sig.signature} alt="Signatur" className="h-28 rounded-lg border border-slate-200 bg-white p-2" />
            <dl className="grid grid-cols-[120px_1fr] gap-y-1.5 text-slate-700">
              <dt className="text-slate-500">Signerad av</dt><dd>{sig.q.signer_name}{sig.q.signer_title && `, ${sig.q.signer_title}`}</dd>
              <dt className="text-slate-500">E-post</dt><dd>{sig.q.signer_email}</dd>
              <dt className="text-slate-500">Tidpunkt</dt><dd>{formatDateTime(sig.q.signed_at)}</dd>
              <dt className="text-slate-500">IP-adress</dt><dd className="font-mono text-xs">{sig.signer_ip}</dd>
              <dt className="text-slate-500">Webbläsare</dt><dd className="text-xs break-words">{sig.signer_agent}</dd>
              <dt className="text-slate-500">Kontrollsumma</dt><dd className="font-mono text-[11px] break-all">{sig.content_hash}</dd>
            </dl>
            <p className="text-xs text-slate-500">Enkel elektronisk underskrift. Kontrollsumman visar att offertens innehåll inte ändrats efter att den skickades.</p>
            <a href={`/q/${sig.q.token}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-600 hover:underline">Öppna signerad offert<ExternalLink className="size-3.5" /></a>
          </div>
        )}
      </Modal>
    </div>
  );
}
