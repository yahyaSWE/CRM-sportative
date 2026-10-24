import { useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../lib/app.jsx';
import { Card, PageHeader, Field, Input, Button, Avatar, Badge, useToast } from '../components/ui.jsx';

export default function Settings() {
  const { user, permissions } = useApp();
  const toast = useToast();
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [saving, setSaving] = useState(false);

  const change = async (e) => {
    e.preventDefault();
    if (pw.next !== pw.confirm) return toast('Lösenorden matchar inte', 'error');
    setSaving(true);
    try { await api.post('/auth/password', pw); toast('Lösenordet är bytt'); setPw({ current: '', next: '', confirm: '' }); }
    catch (err) { toast(err.message, 'error'); } finally { setSaving(false); }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Inställningar" subtitle="Din profil och säkerhet" />
      <Card className="p-6 flex items-center gap-4">
        <Avatar name={user.name} color={user.color} size="lg" />
        <div className="flex-1"><p className="font-semibold text-slate-900">{user.name}</p><p className="text-sm text-slate-500">{user.email}</p></div>
        <Badge className="bg-brand-50 text-brand-700 ring-brand-600/20">{user.role}</Badge>
      </Card>
      <Card className="p-6">
        <h3 className="font-semibold text-slate-900">Dina behörigheter</h3>
        <p className="text-sm text-slate-500 mb-4">Styrs av din roll. Kontakta en administratör för ändringar.</p>
        <ul className="grid sm:grid-cols-2 gap-2">
          {permissions.map((p) => {
            const on = user.permissions.includes(p.key);
            return <li key={p.key} className={`flex items-center gap-2 text-sm ${on ? 'text-slate-700' : 'text-slate-400 line-through'}`}><span className={`size-1.5 rounded-full ${on ? 'bg-emerald-500' : 'bg-slate-300'}`} />{p.label}</li>;
          })}
        </ul>
      </Card>
      <Card className="p-6">
        <h3 className="font-semibold text-slate-900 mb-4">Byt lösenord</h3>
        <form onSubmit={change} className="grid sm:grid-cols-3 gap-4 items-end">
          <Field label="Nuvarande"><Input type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" /></Field>
          <Field label="Nytt (minst 8 tecken)"><Input type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" /></Field>
          <Field label="Bekräfta"><Input type="password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} autoComplete="new-password" /></Field>
          <div className="sm:col-span-3"><Button type="submit" loading={saving}>Uppdatera lösenord</Button></div>
        </form>
      </Card>
    </div>
  );
}
