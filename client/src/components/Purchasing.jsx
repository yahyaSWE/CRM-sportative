import { useState } from 'react';
import { ShoppingCart, Pencil, Phone, Mail } from 'lucide-react';
import { Button, Field, Input, cx, useToast } from './ui.jsx';
import { formatDate } from '../lib/meta.jsx';
import { tr } from '../lib/i18n.js';

const name = (l) => [l.first_name, l.last_name].filter(Boolean).join(' ') || tr('(utan namn)');
const daysUntil = (d) => Math.round((new Date(`${d}T00:00:00`) - new Date(new Date().toDateString())) / 864e5);

// Datum som närmar sig (eller har passerat) markeras, så att man hör av sig i tid.
function DateValue({ date }) {
  if (!date) return <span className="text-slate-400">—</span>;
  const n = daysUntil(date);
  const cls = n < 0 ? 'text-rose-600' : n <= 60 ? 'text-amber-600' : 'text-slate-800';
  const rel = n < 0 ? tr('för {n} dagar sedan', { n: -n }) : n === 0 ? tr('idag') : tr('om {n} dagar', { n });
  return <span className={cls}>{formatDate(date)} <span className="text-xs">({rel})</span></span>;
}

function Person({ p }) {
  if (!p) return <span className="text-slate-400">—</span>;
  return (
    <span className="min-w-0">
      <span className="text-slate-800">{p.name}</span>{p.title && <span className="text-slate-500">, {p.title}</span>}
      {(p.phone || p.email) && (
        <span className="ml-1.5 inline-flex gap-1 align-middle">
          {p.phone && <a href={`tel:${p.phone}`} title={p.phone} className="text-slate-400 hover:text-brand-600"><Phone className="size-3.5" /></a>}
          {p.email && <a href={`mailto:${p.email}`} title={p.email} className="text-slate-400 hover:text-brand-600"><Mail className="size-3.5" /></a>}
        </span>
      )}
    </span>
  );
}

// Välj en av företagets kontaktpersoner, eller skriv en annan person som fritext.
function PersonPicker({ label, contacts, id, text, onChange }) {
  const other = !id && text != null;
  return (
    <Field label={label}>
      <select className="input" value={id || (other ? '__other' : '')} onChange={(e) => {
        const v = e.target.value;
        onChange(v === '__other' ? { id: null, text: text || '' } : { id: v ? Number(v) : null, text: null });
      }}>
        <option value="">{tr('Ingen vald')}</option>
        {contacts.map((c) => <option key={c.id} value={c.id}>{name(c)}{c.title ? ` – ${c.title}` : ''}</option>)}
        <option value="__other">{tr('Annan person (skriv namn)')}</option>
      </select>
      {other && <Input className="mt-2" value={text || ''} onChange={(e) => onChange({ id: null, text: e.target.value })} placeholder={tr('Namn och roll, t.ex. Anna Ek, kassör')} autoFocus />}
    </Field>
  );
}

/** Inköpsinformation på ett företag/en förening. `onSave(data)` sparar och returnerar den nya informationen. */
export default function Purchasing({ purchasing: p, contacts = [], canEdit, onSave }) {
  const toast = useToast();
  const [edit, setEdit] = useState(null);
  const [saving, setSaving] = useState(false);
  const start = () => setEdit({
    decision_maker_id: p?.decision_maker_id || null, decision_maker: p?.decision_maker ?? (p?.decision_maker_id ? null : undefined),
    material_id: p?.material_id || null, material: p?.material ?? (p?.material_id ? null : undefined),
    supplier: p?.supplier || '', contract_end: p?.contract_end || '', next_purchase: p?.next_purchase || '', next_purchase_note: p?.next_purchase_note || '', notes: p?.notes || '',
  });
  const save = async () => {
    setSaving(true);
    try { await onSave(edit); setEdit(null); toast(tr('Inköpsinformationen sparades')); }
    catch (e) { toast(e.message, 'error'); } finally { setSaving(false); }
  };

  if (edit) {
    return (
      <div className="space-y-4 rounded-xl border border-slate-200 p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <PersonPicker label={tr('Beslutsfattare')} contacts={contacts} id={edit.decision_maker_id} text={edit.decision_maker}
            onChange={({ id, text }) => setEdit({ ...edit, decision_maker_id: id, decision_maker: text })} />
          <PersonPicker label={tr('Materialansvarig')} contacts={contacts} id={edit.material_id} text={edit.material}
            onChange={({ id, text }) => setEdit({ ...edit, material_id: id, material: text })} />
          <Field label={tr('Befintlig leverantör')} className="sm:col-span-2"><Input value={edit.supplier} onChange={(e) => setEdit({ ...edit, supplier: e.target.value })} placeholder={tr('t.ex. Stadium Team Sales')} /></Field>
          <Field label={tr('Avtalsutgång')}><Input type="date" value={edit.contract_end} onChange={(e) => setEdit({ ...edit, contract_end: e.target.value })} /></Field>
          <Field label={tr('Nästa inköp')}><Input type="date" value={edit.next_purchase} onChange={(e) => setEdit({ ...edit, next_purchase: e.target.value })} /></Field>
          <Field label={tr('Vad som ska köpas')} className="sm:col-span-2"><Input value={edit.next_purchase_note} onChange={(e) => setEdit({ ...edit, next_purchase_note: e.target.value })} placeholder={tr('t.ex. Nya matchställ inför säsongen, ca 40 set')} /></Field>
          <Field label={tr('Anteckning')} className="sm:col-span-2"><textarea className="input min-h-16" rows={2} value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></Field>
        </div>
        <div className="flex gap-2">
          <Button loading={saving} onClick={save}>{tr('Spara')}</Button>
          <Button variant="secondary" onClick={() => setEdit(null)}>{tr('Avbryt')}</Button>
        </div>
      </div>
    );
  }

  if (!p) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-slate-300 p-4">
        <ShoppingCart className="size-5 text-slate-400" />
        <p className="flex-1 text-sm text-slate-500">{tr('Ingen inköpsinformation än – vem som beslutar, vem som köper in, nuvarande leverantör och när avtalet går ut.')}</p>
        {canEdit && <Button size="sm" variant="secondary" onClick={start}>{tr('Lägg till')}</Button>}
      </div>
    );
  }

  const rows = [
    [tr('Beslutsfattare'), <Person p={p.decision_maker_contact} />],
    [tr('Materialansvarig'), <Person p={p.material_contact} />],
    [tr('Befintlig leverantör'), p.supplier || <span className="text-slate-400">—</span>],
    [tr('Avtalsutgång'), <DateValue date={p.contract_end} />],
    [tr('Nästa inköp'), <span><DateValue date={p.next_purchase} />{p.next_purchase_note && <span className="block text-slate-600">{p.next_purchase_note}</span>}</span>],
  ];
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <dl className="grid gap-x-4 gap-y-3 text-sm sm:grid-cols-2">
        {rows.map(([k, v]) => <div key={k} className="min-w-0"><dt className="text-xs text-slate-500">{k}</dt><dd className={cx('mt-0.5')}>{v}</dd></div>)}
        {p.notes && <div className="sm:col-span-2"><dt className="text-xs text-slate-500">{tr('Anteckning')}</dt><dd className="mt-0.5 whitespace-pre-wrap text-slate-700">{p.notes}</dd></div>}
      </dl>
      <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-2 text-xs text-slate-400">
        {p.updated_by && <span>{tr('Uppdaterad av {name}', { name: p.updated_by })}</span>}
        {canEdit && <Button size="sm" variant="ghost" icon={Pencil} className="ml-auto" onClick={start}>{tr('Redigera')}</Button>}
      </div>
    </div>
  );
}
