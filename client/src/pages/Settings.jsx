import { useEffect, useState } from 'react';
import { Download, DatabaseBackup, Languages, Bot, Copy, Unplug } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../lib/app.jsx';
import { Card, PageHeader, Field, Input, Button, Avatar, Badge, useToast, cx } from '../components/ui.jsx';
import { tr, LANGUAGES, getLanguage, applyLanguage } from '../lib/i18n.js';
import { timeAgo } from '../lib/meta.jsx';

// Säkerhetskopior: automatiska dagliga kopior i produktion och nedladdning av en färsk kopia.
function BackupCard() {
  const [data, setData] = useState(null);
  useEffect(() => { api.get('/admin/backups').then(setData).catch(() => {}); }, []);
  if (!data) return null;
  return (
    <Card className="p-6">
      <h3 className="flex items-center gap-2 font-semibold text-slate-900"><DatabaseBackup className="size-4 text-slate-400" />{tr("Säkerhetskopior")}</h3>
      <p className="text-sm text-slate-500 mb-4">{data.auto ? tr("En kopia av databasen sparas automatiskt varje dag (de senaste 14 behålls). Ladda gärna ned en kopia ibland och spara den utanför servern.") : tr("Automatiska kopior körs bara i produktion. Du kan alltid ladda ned en kopia.")}</p>
      <a href="/api/admin/backup"><Button variant="secondary" icon={Download}>{tr("Ladda ned säkerhetskopia nu")}</Button></a>
      {data.items.length > 0 && <p className="mt-3 text-xs text-slate-500">{tr("Senaste automatiska kopior:")} {data.items.slice(0, 3).map((b) => b.name.replace(/^(crm|ws\d+)-/, '').replace('.db', '')).join(', ')}</p>}
    </Card>
  );
}

// Claude och andra AI-assistenter som kopplats in via MCP. Administratörer ser och kan koppla bort allas.
function AiCard() {
  const { can, user } = useApp();
  const toast = useToast();
  const admin = can('users.manage');
  const [items, setItems] = useState(null);
  const load = () => api.get(`/oauth/connections${admin ? '?all=1' : ''}`).then(setItems).catch(() => setItems([]));
  useEffect(() => { load(); }, []);
  const url = `${window.location.origin}/mcp`;
  const copy = () => navigator.clipboard?.writeText(url).then(() => toast(tr('Adressen är kopierad')));
  const remove = async (c) => {
    try { await api.del(`/oauth/connections/${c.id}`); toast(tr('Kopplingen är borttagen')); load(); }
    catch (e) { toast(e.message, 'error'); }
  };
  return (
    <Card className="p-6">
      <h3 className="flex items-center gap-2 font-semibold text-slate-900"><Bot className="size-4 text-slate-400" />{tr('Claude och AI-assistenter')}</h3>
      <p className="text-sm text-slate-500 mb-4">{tr('Låt Claude läsa och uppdatera CRM:et åt dig, med samma behörigheter som du har. I Claude: Inställningar → Connectors → Lägg till anpassad connector, och klistra in adressen nedan.')}</p>
      {can('ai.connect') ? (
        <div className="flex gap-2 max-w-lg">
          <Input readOnly value={url} onFocus={(e) => e.target.select()} />
          <Button variant="secondary" icon={Copy} onClick={copy}>{tr('Kopiera')}</Button>
        </div>
      ) : <p className="text-sm text-amber-700">{tr('Din roll har inte behörighet att koppla AI-assistenter.')}</p>}
      {items?.length > 0 && (
        <ul className="mt-5 divide-y divide-slate-100 rounded-lg border border-slate-200">
          {items.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-4 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-800">{c.client_name}<span className="font-normal text-slate-500"> · {c.workspace_name}{admin && c.user_id !== user.id && ` · ${c.user_name}`}</span></p>
                <p className="text-xs text-slate-500">{tr('Kopplad {when}', { when: timeAgo(c.created_at) })}{c.last_used_at && ` · ${tr('senast använd {when}', { when: timeAgo(c.last_used_at) })}`}</p>
              </div>
              <Button size="sm" variant="secondary" icon={Unplug} onClick={() => remove(c)}>{tr('Koppla bort')}</Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// Språk: sparas på användaren och gäller på alla enheter. Sidan laddas om på det nya språket.
function LanguageCard() {
  const toast = useToast();
  const [busy, setBusy] = useState(null);
  const current = getLanguage();
  const choose = async (code) => {
    if (code === current) return;
    setBusy(code);
    try { await api.patch('/auth/profile', { language: code }); applyLanguage(code); }
    catch (e) { toast(e.message, 'error'); setBusy(null); }
  };
  return (
    <Card className="p-6">
      <h3 className="flex items-center gap-2 font-semibold text-slate-900"><Languages className="size-4 text-slate-400" />{tr('Språk')}</h3>
      <p className="text-sm text-slate-500 mb-4">{tr('Gäller för ditt konto på alla enheter.')}</p>
      <div className="grid grid-cols-2 gap-2 max-w-sm">
        {LANGUAGES.map((l) => (
          <button key={l.code} onClick={() => choose(l.code)} disabled={!!busy}
            className={cx('rounded-lg border px-4 py-3 text-left text-sm font-medium transition', l.code === current ? 'border-brand-500 bg-brand-50 text-brand-700 ring-4 ring-brand-100' : 'border-slate-200 text-slate-700 hover:border-slate-300')}>
            {l.label}{busy === l.code && '…'}
          </button>
        ))}
      </div>
    </Card>
  );
}

export default function Settings() {
  const { user, permissions, can } = useApp();
  const toast = useToast();
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [saving, setSaving] = useState(false);

  const change = async (e) => {
    e.preventDefault();
    if (pw.next !== pw.confirm) return toast(tr("Lösenorden matchar inte"), 'error');
    setSaving(true);
    try { await api.post('/auth/password', pw); toast(tr("Lösenordet är bytt")); setPw({ current: '', next: '', confirm: '' }); }
    catch (err) { toast(err.message, 'error'); } finally { setSaving(false); }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title={tr("Inställningar")} subtitle={tr("Din profil och säkerhet")} />
      <Card className="p-6 flex items-center gap-4">
        <Avatar name={user.name} color={user.color} size="lg" />
        <div className="flex-1"><p className="font-semibold text-slate-900">{user.name}</p><p className="text-sm text-slate-500">{user.email}</p></div>
        <Badge className="bg-brand-50 text-brand-700 ring-brand-600/20">{tr(user.role)}</Badge>
      </Card>
      <LanguageCard />
      <AiCard />
      <Card className="p-6">
        <h3 className="font-semibold text-slate-900">{tr("Dina behörigheter")}</h3>
        <p className="text-sm text-slate-500 mb-4">{tr("Styrs av din roll. Kontakta en administratör för ändringar.")}</p>
        <ul className="grid sm:grid-cols-2 gap-2">
          {permissions.map((p) => {
            const on = user.permissions.includes(p.key);
            return <li key={p.key} className={`flex items-center gap-2 text-sm ${on ? 'text-slate-700' : 'text-slate-400 line-through'}`}><span className={`size-1.5 rounded-full ${on ? 'bg-emerald-500' : 'bg-slate-300'}`} />{tr(p.label)}</li>;
          })}
        </ul>
      </Card>
      <Card className="p-6">
        <h3 className="font-semibold text-slate-900 mb-4">{tr("Byt lösenord")}</h3>
        <form onSubmit={change} className="grid sm:grid-cols-3 gap-4 items-end">
          <Field label={tr("Nuvarande")}><Input type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" /></Field>
          <Field label={tr("Nytt (minst 8 tecken)")}><Input type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" /></Field>
          <Field label={tr("Bekräfta")}><Input type="password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} autoComplete="new-password" /></Field>
          <div className="sm:col-span-3"><Button type="submit" loading={saving}>{tr("Uppdatera lösenord")}</Button></div>
        </form>
      </Card>
      {can('users.manage') && <BackupCard />}
    </div>
  );
}
