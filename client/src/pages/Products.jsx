import { useEffect, useState } from 'react';
import { Package, Plus, Pencil, Archive, RotateCcw, FileText } from 'lucide-react';
import { api } from '../api.js';
import { useApp, useFetch } from '../lib/app.jsx';
import { Card, PageHeader, Button, Modal, Field, Input, Select, Textarea, Badge, Empty, Spinner, Tabs, useToast, cx } from '../components/ui.jsx';
import { RECURRING_SV } from '../components/DealProducts.jsx';

const kr = (n) => new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 2 }).format(n || 0);
const EMPTY = { name: '', sku: '', description: '', unit: 'st', price: '', vat_rate: 25, recurring: 'none', active: true };

function ProfileForm() {
  const toast = useToast();
  const { can } = useApp();
  const [p, setP] = useState(null);
  useEffect(() => { api.get('/sales/profile').then(setP); }, []);
  if (!p) return <Spinner />;
  const set = (k) => (e) => setP({ ...p, [k]: e.target.value });
  const save = async () => { try { setP(await api.patch('/sales/profile', p)); toast('Offertinställningarna sparades'); } catch (e) { toast(e.message, 'error'); } };
  const ro = !can('products.manage');
  return (
    <Card className="p-6 space-y-5 max-w-3xl">
      <div><h2 className="font-semibold text-slate-900">Ert företag på offerter</h2><p className="text-sm text-slate-500">Visas i sidhuvudet på varje offert som kunden får.</p></div>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Företagsnamn"><Input value={p.name} onChange={set('name')} disabled={ro} /></Field>
        <Field label="Organisationsnummer"><Input value={p.org_nr} onChange={set('org_nr')} disabled={ro} /></Field>
        <Field label="Adress" className="sm:col-span-2"><Input value={p.address} onChange={set('address')} disabled={ro} /></Field>
        <Field label="E-post"><Input value={p.email} onChange={set('email')} disabled={ro} /></Field>
        <Field label="Telefon"><Input value={p.phone} onChange={set('phone')} disabled={ro} /></Field>
        <Field label="Hemsida"><Input value={p.website} onChange={set('website')} disabled={ro} /></Field>
        <Field label="Offerten gäller (dagar)"><Input type="number" value={p.validity_days} onChange={set('validity_days')} disabled={ro} /></Field>
        <Field label="Standardvillkor" className="sm:col-span-2" hint="Kan ändras per offert"><Textarea value={p.terms} onChange={set('terms')} disabled={ro} /></Field>
      </div>
      {!ro && <Button onClick={save}>Spara</Button>}
    </Card>
  );
}

export default function Products() {
  const { can } = useApp();
  const toast = useToast();
  const [tab, setTab] = useState('products');
  const { data, reload } = useFetch('/products?all=1');
  const [edit, setEdit] = useState(null);
  const manage = can('products.manage');

  const save = async () => {
    try {
      const body = { ...edit, price: Number(edit.price) || 0, vat_rate: Number(edit.vat_rate) };
      if (edit.id) await api.patch(`/products/${edit.id}`, body); else await api.post('/products', body);
      toast('Produkten sparades'); setEdit(null); reload();
    } catch (e) { toast(e.message, 'error'); }
  };
  const archive = async (p) => { await api.patch(`/products/${p.id}`, { active: !p.active }); reload(); };

  return (
    <div>
      <PageHeader title="Produkter & offerter" subtitle="Produktlistan säljarna väljer från på affärer och offerter"
        actions={<>
          <Tabs value={tab} onChange={setTab} tabs={[{ value: 'products', label: 'Produkter' }, { value: 'profile', label: 'Offertinställningar' }]} />
          {manage && tab === 'products' && <Button icon={Plus} onClick={() => setEdit({ ...EMPTY })}>Ny produkt</Button>}
        </>} />
      {tab === 'profile' ? <ProfileForm /> : (
        <Card className="overflow-hidden">
          {!data ? <div className="py-16 grid place-items-center"><Spinner /></div> : !data.length ? (
            <Empty icon={Package} title="Inga produkter än" text="Lägg in era produkter och tjänster så kan säljarna bygga offerter med ett klick." action={manage && <Button icon={Plus} onClick={() => setEdit({ ...EMPTY })}>Ny produkt</Button>} />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50/80 text-left text-xs text-slate-500 border-b border-slate-100">
                <tr><th className="px-5 py-3 font-medium">Produkt</th><th className="px-5 py-3 font-medium">Art.nr</th><th className="px-5 py-3 font-medium text-right">Pris exkl. moms</th><th className="px-5 py-3 font-medium">Moms</th><th className="px-5 py-3 font-medium text-right">Använd på</th><th className="px-5 py-3" /></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.map((p) => (
                  <tr key={p.id} className={cx(!p.active && 'opacity-50')}>
                    <td className="px-5 py-3"><p className="font-medium text-slate-800">{p.name}{!p.active && <Badge className="ml-2 bg-slate-100 text-slate-500 ring-slate-400/20">Arkiverad</Badge>}</p>{p.description && <p className="text-xs text-slate-500">{p.description}</p>}</td>
                    <td className="px-5 py-3 text-slate-500 font-mono text-xs">{p.sku || '—'}</td>
                    <td className="px-5 py-3 text-right tabular-nums"><span className="font-medium">{kr(p.price)} kr</span><span className="text-slate-500"> / {p.unit}{RECURRING_SV[p.recurring] && p.unit.includes('/') ? '' : RECURRING_SV[p.recurring]}</span></td>
                    <td className="px-5 py-3 text-slate-500">{p.vat_rate} %</td>
                    <td className="px-5 py-3 text-right text-slate-500">{p.used} affärer</td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      {manage && <><Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEdit({ ...p, active: !!p.active })} />
                        <Button size="sm" variant="ghost" icon={p.active ? Archive : RotateCcw} title={p.active ? 'Arkivera' : 'Återställ'} onClick={() => archive(p)} /></>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}
      {tab === 'products' && <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500"><FileText className="size-3.5" />Säljarna lägger till produkter under fliken "Produkter & offert" i en affär och skickar offerten för e-signering därifrån.</p>}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Redigera produkt' : 'Ny produkt'}
        footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Avbryt</Button><Button onClick={save}>Spara</Button></>}>
        {edit && (
          <div className="grid grid-cols-2 gap-4">
            <Field label="Namn" className="col-span-2"><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} autoFocus /></Field>
            <Field label="Beskrivning" className="col-span-2" hint="Visas under produktnamnet på offerten"><Input value={edit.description || ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
            <Field label="Pris exkl. moms (kr)"><Input type="number" value={edit.price} onChange={(e) => setEdit({ ...edit, price: e.target.value })} /></Field>
            <Field label="Enhet"><Input value={edit.unit} onChange={(e) => setEdit({ ...edit, unit: e.target.value })} placeholder="st, tim, användare/mån" /></Field>
            <Field label="Prismodell"><Select value={edit.recurring} onChange={(e) => setEdit({ ...edit, recurring: e.target.value })}><option value="none">Engångskostnad</option><option value="monthly">Per månad</option><option value="yearly">Per år</option></Select></Field>
            <Field label="Moms"><Select value={edit.vat_rate} onChange={(e) => setEdit({ ...edit, vat_rate: e.target.value })}><option value={25}>25 %</option><option value={12}>12 %</option><option value={6}>6 %</option><option value={0}>0 %</option></Select></Field>
            <Field label="Artikelnummer (valfritt)"><Input value={edit.sku || ''} onChange={(e) => setEdit({ ...edit, sku: e.target.value })} /></Field>
          </div>
        )}
      </Modal>
    </div>
  );
}
