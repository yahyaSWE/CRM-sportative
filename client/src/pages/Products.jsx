import { useEffect, useState } from 'react';
import { Package, Plus, Pencil, Archive, RotateCcw, FileText, ImageUp, Trash2, Eye } from 'lucide-react';
import { api } from '../api.js';
import { useApp, useFetch } from '../lib/app.jsx';
import { Card, PageHeader, Button, Modal, Field, Input, Select, Textarea, Badge, Empty, Spinner, Tabs, useToast, cx } from '../components/ui.jsx';
import { RECURRING_SV } from '../components/DealProducts.jsx';
import { tr, locale } from '../lib/i18n.js';

const kr = (n) => new Intl.NumberFormat(locale(), { maximumFractionDigits: 2 }).format(n || 0);
// Loggan skalas ned och sparas som PNG (eller JPEG för foton), så att den fungerar i PDF:en och håller storleken nere.
function readLogo(file) {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpeg|svg\+xml|webp|gif)$/.test(file.type)) return reject(new Error(tr('Välj en bild (PNG, JPG, SVG eller WebP)')));
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 800 / img.width, 300 / img.height);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale)); canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext('2d');
      // Vit bakgrund: offerten är vit, och JPEG (för stora bilder) saknar genomskinlighet.
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      let url = canvas.toDataURL('image/png');
      if (url.length > 600000) url = canvas.toDataURL('image/jpeg', 0.85);
      URL.revokeObjectURL(img.src);
      url.length > 600000 ? reject(new Error(tr('Bilden är för stor'))) : resolve(url);
    };
    img.onerror = () => reject(new Error(tr('Kunde inte läsa bilden')));
    img.src = URL.createObjectURL(file);
  });
}

function BrandingFields({ p, setP, ro }) {
  const toast = useToast();
  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try { setP({ ...p, logo: await readLogo(file) }); } catch (err) { toast(err.message, 'error'); }
  };
  return (
    <div className="space-y-4 rounded-xl border border-slate-200 p-4">
      <div><h3 className="text-sm font-semibold text-slate-900">{tr("Logga och utseende")}</h3><p className="text-xs text-slate-500">{tr("Visas på kundens offertsida och i PDF:en.")}</p></div>
      <div className="flex flex-wrap items-center gap-4">
        <div className="grid h-20 w-48 place-items-center rounded-lg border border-dashed border-slate-300 bg-slate-50 p-2">
          {p.logo ? <img src={p.logo} alt={tr("Logga")} className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-slate-400">{tr("Ingen logga")}</span>}
        </div>
        {!ro && (
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50">
              <ImageUp className="size-4" />{p.logo ? tr("Byt logga") : tr("Ladda upp logga")}
              <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden" onChange={pick} />
            </label>
            {p.logo && <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setP({ ...p, logo: '' })}>{tr("Ta bort")}</Button>}
          </div>
        )}
      </div>
      <div className="grid sm:grid-cols-[auto_1fr] gap-4">
        <Field label={tr("Accentfärg")}>
          <div className="flex items-center gap-2">
            <input type="color" value={p.accent || '#4f46e5'} onChange={(e) => setP({ ...p, accent: e.target.value })} disabled={ro} className="h-9 w-12 cursor-pointer rounded border border-slate-200 bg-white p-0.5" />
            <span className="font-mono text-xs text-slate-500">{p.accent || '#4f46e5'}</span>
          </div>
        </Field>
        <Field label={tr("Sidfot")} hint={tr("T.ex. bankgiro, momsregistreringsnummer och F-skatt. Visas längst ned på varje sida.")}>
          <Input value={p.footer || ''} onChange={(e) => setP({ ...p, footer: e.target.value })} disabled={ro} placeholder={tr("Bankgiro 123-4567 · Momsreg.nr SE559000000001 · Godkänd för F-skatt")} />
        </Field>
      </div>
    </div>
  );
}

const EMPTY = { name: '', sku: '', description: '', unit: 'st', price: '', vat_rate: 25, recurring: 'none', active: true };

function ProfileForm() {
  const toast = useToast();
  const { can } = useApp();
  const [p, setP] = useState(null);
  useEffect(() => { api.get('/sales/profile').then(setP); }, []);
  if (!p) return <Spinner />;
  const set = (k) => (e) => setP({ ...p, [k]: e.target.value });
  const save = async () => { try { setP(await api.patch('/sales/profile', p)); toast(tr("Offertinställningarna sparades")); } catch (e) { toast(e.message, 'error'); } };
  const ro = !can('products.manage');
  return (
    <Card className="p-6 space-y-5 max-w-3xl">
      <div><h2 className="font-semibold text-slate-900">{tr("Ert företag på offerter")}</h2><p className="text-sm text-slate-500">{tr("Visas i sidhuvudet på varje offert som kunden får.")}</p></div>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label={tr("Företagsnamn")}><Input value={p.name} onChange={set('name')} disabled={ro} /></Field>
        <Field label={tr("Organisationsnummer")}><Input value={p.org_nr} onChange={set('org_nr')} disabled={ro} /></Field>
        <Field label={tr("Adress")} className="sm:col-span-2"><Input value={p.address} onChange={set('address')} disabled={ro} /></Field>
        <Field label={tr("E-post")}><Input value={p.email} onChange={set('email')} disabled={ro} /></Field>
        <Field label={tr("Telefon")}><Input value={p.phone} onChange={set('phone')} disabled={ro} /></Field>
        <Field label={tr("Hemsida")}><Input value={p.website} onChange={set('website')} disabled={ro} /></Field>
        <Field label={tr("Offerten gäller (dagar)")}><Input type="number" value={p.validity_days} onChange={set('validity_days')} disabled={ro} /></Field>
        <Field label={tr("Standardvillkor")} className="sm:col-span-2" hint={tr("Kan ändras per offert")}><Textarea value={p.terms} onChange={set('terms')} disabled={ro} /></Field>
      </div>
      <BrandingFields p={p} setP={setP} ro={ro} />
      {!ro && <Button onClick={save}>{tr("Spara")}</Button>}
    </Card>
  );
}

export default function Products() {
  const { can } = useApp();
  const toast = useToast();
  // ?tab=profile öppnar offertinställningarna direkt (länk från Inställningar).
  const [tab, setTab] = useState(() => (new URLSearchParams(window.location.search).get('tab') === 'profile' ? 'profile' : 'products'));
  const { data, reload } = useFetch('/products?all=1');
  const [edit, setEdit] = useState(null);
  const manage = can('products.manage');

  const save = async () => {
    try {
      const body = { ...edit, price: Number(edit.price) || 0, vat_rate: Number(edit.vat_rate) };
      if (edit.id) await api.patch(`/products/${edit.id}`, body); else await api.post('/products', body);
      toast(tr("Produkten sparades")); setEdit(null); reload();
    } catch (e) { toast(e.message, 'error'); }
  };
  const archive = async (p) => { await api.patch(`/products/${p.id}`, { active: !p.active }); reload(); };

  return (
    <div>
      <PageHeader title={tr("Produkter & offerter")} subtitle={tr("Produktlistan säljarna väljer från på affärer och offerter")}
        actions={<>
          <Tabs value={tab} onChange={setTab} tabs={[{ value: 'products', label: tr("Produkter") }, { value: 'profile', label: tr("Offertinställningar") }]} />
          {manage && tab === 'products' && <Button icon={Plus} onClick={() => setEdit({ ...EMPTY })}>{tr("Ny produkt")}</Button>}
        </>} />
      {tab === 'profile' ? <ProfileForm /> : (
        <Card className="overflow-hidden">
          {!data ? <div className="py-16 grid place-items-center"><Spinner /></div> : !data.length ? (
            <Empty icon={Package} title={tr("Inga produkter än")} text={tr("Lägg in era produkter och tjänster så kan säljarna bygga offerter med ett klick.")} action={manage && <Button icon={Plus} onClick={() => setEdit({ ...EMPTY })}>{tr("Ny produkt")}</Button>} />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50/80 text-left text-xs text-slate-500 border-b border-slate-100">
                <tr><th className="px-5 py-3 font-medium">{tr("Produkt")}</th><th className="px-5 py-3 font-medium">{tr("Art.nr")}</th><th className="px-5 py-3 font-medium text-right">{tr("Pris exkl. moms")}</th><th className="px-5 py-3 font-medium">{tr("Moms")}</th><th className="px-5 py-3 font-medium text-right">{tr("Använd på")}</th><th className="px-5 py-3" /></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.map((p) => (
                  <tr key={p.id} className={cx(!p.active && 'opacity-50')}>
                    <td className="px-5 py-3"><p className="font-medium text-slate-800">{p.name}{!p.active && <Badge className="ml-2 bg-slate-100 text-slate-500 ring-slate-400/20">{tr("Arkiverad")}</Badge>}</p>{p.description && <p className="text-xs text-slate-500">{p.description}</p>}</td>
                    <td className="px-5 py-3 text-slate-500 font-mono text-xs">{p.sku || '—'}</td>
                    <td className="px-5 py-3 text-right tabular-nums"><span className="font-medium">{kr(p.price)} {tr("kr")}</span><span className="text-slate-500"> / {p.unit}{RECURRING_SV[p.recurring] && p.unit.includes('/') ? '' : RECURRING_SV[p.recurring]}</span></td>
                    <td className="px-5 py-3 text-slate-500">{p.vat_rate} %</td>
                    <td className="px-5 py-3 text-right text-slate-500">{p.used} {tr("affärer")}</td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      {manage && <><Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEdit({ ...p, active: !!p.active })} />
                        <Button size="sm" variant="ghost" icon={p.active ? Archive : RotateCcw} title={p.active ? tr("Arkivera") : tr("Återställ")} onClick={() => archive(p)} /></>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}
      {tab === 'products' && <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500"><FileText className="size-3.5" />{tr("Säljarna lägger till produkter under fliken \"Produkter & offert\" i en affär och skickar offerten för e-signering därifrån.")}</p>}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? tr("Redigera produkt") : tr("Ny produkt")}
        footer={<><Button variant="secondary" onClick={() => setEdit(null)}>{tr("Avbryt")}</Button><Button onClick={save}>{tr("Spara")}</Button></>}>
        {edit && (
          <div className="grid grid-cols-2 gap-4">
            <Field label={tr("Namn")} className="col-span-2"><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} autoFocus /></Field>
            <Field label={tr("Beskrivning")} className="col-span-2" hint={tr("Visas under produktnamnet på offerten")}><Input value={edit.description || ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
            <Field label={tr("Pris exkl. moms (kr)")}><Input type="number" value={edit.price} onChange={(e) => setEdit({ ...edit, price: e.target.value })} /></Field>
            <Field label={tr("Enhet")}><Input value={edit.unit} onChange={(e) => setEdit({ ...edit, unit: e.target.value })} placeholder={tr("st, tim, användare/mån")} /></Field>
            <Field label={tr("Prismodell")}><Select value={edit.recurring} onChange={(e) => setEdit({ ...edit, recurring: e.target.value })}><option value="none">{tr("Engångskostnad")}</option><option value="monthly">{tr("Per månad")}</option><option value="yearly">{tr("Per år")}</option></Select></Field>
            <Field label={tr("Moms")}><Select value={edit.vat_rate} onChange={(e) => setEdit({ ...edit, vat_rate: e.target.value })}><option value={25}>25 %</option><option value={12}>12 %</option><option value={6}>6 %</option><option value={0}>0 %</option></Select></Field>
            <Field label={tr("Artikelnummer (valfritt)")}><Input value={edit.sku || ''} onChange={(e) => setEdit({ ...edit, sku: e.target.value })} /></Field>
          </div>
        )}
      </Modal>
    </div>
  );
}
