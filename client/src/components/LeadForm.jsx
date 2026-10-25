import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../lib/app.jsx';
import { Modal, Button, Field, Input, Select, Textarea, useToast } from './ui.jsx';
import { tr } from '../lib/i18n.js';

const EMPTY = { first_name: '', last_name: '', email: '', phone: '', company: '', title: '', city: '', message: '', source: 'manual', source_detail: '' };

export default function LeadForm({ open, onClose, onSaved }) {
  const { user, team, can } = useApp();
  const toast = useToast();
  const [f, setF] = useState(EMPTY);
  const [owner, setOwner] = useState(user.id);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) { setF(EMPTY); setOwner(user.id); } }, [open]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const lead = await api.post('/leads', { ...f, owner_id: owner ? Number(owner) : null });
      toast(tr("Lead skapad"));
      onSaved?.(lead);
    } catch (err) { toast(err.message, 'error'); } finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={tr("Ny lead")} description={tr("Lägg till en kontakt manuellt. Leads från kanaler hämtas in automatiskt.")}
      footer={<><Button variant="secondary" onClick={onClose}>{tr("Avbryt")}</Button><Button form="leadform" type="submit" loading={saving}>{tr("Skapa lead")}</Button></>}>
      <form id="leadform" onSubmit={save} className="grid grid-cols-2 gap-4">
        <Field label={tr("Förnamn")}><Input value={f.first_name} onChange={set('first_name')} autoFocus /></Field>
        <Field label={tr("Efternamn")}><Input value={f.last_name} onChange={set('last_name')} /></Field>
        <Field label={tr("E-post")}><Input type="email" value={f.email} onChange={set('email')} /></Field>
        <Field label={tr("Telefon")}><Input value={f.phone} onChange={set('phone')} /></Field>
        <Field label={tr("Företag")}><Input value={f.company} onChange={set('company')} /></Field>
        <Field label={tr("Titel")}><Input value={f.title} onChange={set('title')} /></Field>
        <Field label={tr("Källa")}>
          <Select value={f.source} onChange={set('source')}>
            <option value="manual">{tr("Manuell")}</option><option value="email">{tr("E-post")}</option><option value="facebook">{tr("Facebook")}</option>
            <option value="instagram">{tr("Instagram")}</option><option value="webform">{tr("Webbformulär")}</option>
          </Select>
        </Field>
        <Field label={tr("Ansvarig")}>
          <Select value={owner ?? ''} onChange={(e) => setOwner(e.target.value)} disabled={!can('leads.assign')}>
            <option value="">{tr("Ingen (otilldelad)")}</option>
            {team.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
        </Field>
        <Field label={tr("Meddelande / anteckning")} className="col-span-2"><Textarea value={f.message} onChange={set('message')} /></Field>
      </form>
    </Modal>
  );
}
