import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Globe, Plus, RefreshCw, Plug, Copy, Check, FlaskConical, Settings2, Trash2, AlertTriangle, CheckCircle2, Loader2, ExternalLink, Radio } from 'lucide-react';
import { api } from '../api.js';
import { useFetch, useLive } from '../lib/app.jsx';
import { Button, Card, PageHeader, Modal, Field, Input, Select, Toggle, Badge, Confirm, Spinner, useToast, cx } from '../components/ui.jsx';
import { FacebookIcon, InstagramIcon, timeAgo } from '../lib/meta.jsx';

const CATALOG = {
  facebook: { name: 'Facebook', icon: FacebookIcon, color: 'bg-[#1877F2] text-white', desc: 'Hämta leads från Facebook Lead Ads och nya konversationer i Messenger.', features: ['Lead Ads i realtid', 'Messenger-förfrågningar', 'Automatisk reservhämtning'] },
  instagram: { name: 'Instagram', icon: InstagramIcon, color: 'bg-gradient-to-br from-[#F58529] via-[#DD2A7B] to-[#8134AF] text-white', desc: 'Leads från Instagram-annonser (Lead Ads) och direktmeddelanden till ert konto.', features: ['Instagram Lead Ads', 'Direktmeddelanden (DM)', 'Profilnamn hämtas automatiskt'] },
  email: { name: 'E-post', icon: Mail, color: 'bg-amber-500 text-white', desc: 'Läs en inkorg (t.ex. info@) via IMAP, eller vidarebefordra mejl till en unik adress.', features: ['Gmail, Outlook, One.com m.fl.', 'Tolkar kontaktformulär-mejl', 'Filtrerar bort autosvar'] },
  webform: { name: 'Webbformulär', icon: Globe, color: 'bg-emerald-500 text-white', desc: 'Skicka formulär från din hemsida direkt in i CRM:et – eller koppla Zapier/Make.', features: ['Fungerar med alla formulär', 'Spamskydd (honeypot)', 'JSON-API för Zapier/Make'] },
};

const IMAP_PRESETS = [
  ['Gmail / Google Workspace', 'imap.gmail.com'], ['Outlook / Microsoft 365', 'outlook.office365.com'], ['One.com', 'imap.one.com'],
  ['Loopia', 'mailcluster.loopia.se'], ['Binero', 'imap.binero.se'], ['iCloud', 'imap.mail.me.com'],
];

function CopyField({ label, value, hint }) {
  const [ok, setOk] = useState(false);
  return (
    <Field label={label} hint={hint}>
      <div className="flex gap-2">
        <input readOnly value={value} className="input font-mono text-xs bg-slate-50" onFocus={(e) => e.target.select()} />
        <Button type="button" variant="secondary" icon={ok ? Check : Copy} onClick={() => { navigator.clipboard.writeText(value); setOk(true); setTimeout(() => setOk(false), 1500); }} />
      </div>
    </Field>
  );
}

function Steps({ items }) {
  return (
    <ol className="space-y-2.5 text-sm text-slate-600">
      {items.map((s, i) => (
        <li key={i} className="flex gap-3"><span className="grid place-items-center size-5 shrink-0 rounded-full bg-brand-100 text-[11px] font-semibold text-brand-700 mt-0.5">{i + 1}</span><span>{s}</span></li>
      ))}
    </ol>
  );
}

function ConfigForm({ integ, cfg, setCfg, base }) {
  const set = (k) => (e) => setCfg({ ...cfg, [k]: e?.target ? (e.target.type === 'number' ? Number(e.target.value) : e.target.value) : e });
  const webhookMeta = `${base}/api/webhooks/meta`;

  if (integ.type === 'facebook' || integ.type === 'instagram') {
    const ig = integ.type === 'instagram';
    return (
      <div className="space-y-6">
        <div className="rounded-xl bg-slate-50 p-4">
          <p className="text-sm font-medium text-slate-800 mb-3">Så kopplar du {ig ? 'Instagram' : 'Facebook'}</p>
          <Steps items={[
            <>Skapa en app på <a className="text-brand-600 underline" href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer">developers.facebook.com</a> (typ "Business") och lägg till produkten <b>Webhooks</b>{ig ? <> och <b>Instagram</b></> : <> och <b>Messenger</b></>}.</>,
            <>Under Webhooks → <b>Page</b>{ig && <> och <b>Instagram</b></>}: ange callback-URL och verifieringstoken nedan, och prenumerera på <code className="text-xs bg-white px-1 rounded">leadgen</code>{' '}och <code className="text-xs bg-white px-1 rounded">messages</code>.</>,
            <>Generera en <b>sidåtkomsttoken</b> (långlivad) med behörigheterna <code className="text-xs bg-white px-1 rounded">leads_retrieval, pages_manage_metadata, pages_show_list{ig ? ', instagram_basic, instagram_manage_messages' : ', pages_messaging'}</code>.</>,
            <>Klistra in sid-ID, token och appens hemlighet (App Secret) här och klicka <b>Testa anslutning</b>.</>,
          ]} />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <CopyField label="Callback-URL" value={webhookMeta} hint={base.includes('localhost') ? 'Meta kräver en publik https-adress – sätt PUBLIC_URL eller använd t.ex. ngrok.' : undefined} />
          <CopyField label="Verifieringstoken" value={cfg.verifyToken || ''} />
          <Field label="Facebook-sidans ID"><Input value={cfg.pageId || ''} onChange={set('pageId')} placeholder="t.ex. 104857261234567" /></Field>
          {ig && <Field label="Instagram-kontots ID" hint="Instagram Business-konto kopplat till sidan"><Input value={cfg.instagramAccountId || ''} onChange={set('instagramAccountId')} placeholder="t.ex. 17841400000000000" /></Field>}
          <Field label="Sidåtkomsttoken" className={ig ? '' : 'sm:col-span-2'}><Input type="password" value={cfg.pageAccessToken || ''} onChange={set('pageAccessToken')} placeholder="EAAG…" /></Field>
          <Field label="App Secret" hint="Används för att verifiera att webhooks kommer från Meta"><Input type="password" value={cfg.appSecret || ''} onChange={set('appSecret')} /></Field>
        </div>
        <div className="space-y-4 border-t border-slate-100 pt-5">
          <Toggle checked={cfg.captureLeadAds !== false} onChange={set('captureLeadAds')} label="Lead Ads" description={`Skapa leads automatiskt när någon fyller i ett ${ig ? 'Instagram' : 'Facebook'}-annonsformulär.`} />
          <Toggle checked={!!cfg.captureMessages} onChange={set('captureMessages')} label={ig ? 'Direktmeddelanden' : 'Messenger'} description="Ny person som skriver till er blir ett lead. Följande meddelanden loggas i tidslinjen." />
          <Toggle checked={!!cfg.pollEnabled} onChange={set('pollEnabled')} label="Reservhämtning" description="Hämtar även leads direkt från formulären med jämna mellanrum, ifall en webhook missas." />
          {cfg.pollEnabled && <Field label="Intervall (minuter)" className="max-w-40"><Input type="number" min="1" value={cfg.intervalMinutes || 15} onChange={set('intervalMinutes')} /></Field>}
        </div>
      </div>
    );
  }

  if (integ.type === 'email') {
    const forwardUrl = `${base}/api/webhooks/email/${integ.token}`;
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-2">
          {[['imap', 'Läs inkorg (IMAP)', 'LeadFlow loggar in och hämtar nya mejl automatiskt.'], ['forward', 'Vidarebefordran', 'Mejl skickas till LeadFlow via en webhook-tjänst.']].map(([m, t, d]) => (
            <button type="button" key={m} onClick={() => setCfg({ ...cfg, mode: m })} className={cx('rounded-xl border p-3 text-left transition', cfg.mode === m ? 'border-brand-500 ring-4 ring-brand-100' : 'border-slate-200 hover:border-slate-300')}>
              <p className="text-sm font-medium text-slate-800">{t}</p><p className="text-xs text-slate-500 mt-0.5">{d}</p>
            </button>
          ))}
        </div>
        {cfg.mode === 'imap' ? (
          <>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="E-postleverantör">
                <Select value={IMAP_PRESETS.find((p) => p[1] === cfg.host)?.[1] || ''} onChange={(e) => e.target.value && setCfg({ ...cfg, host: e.target.value, port: 993, secure: true })}>
                  <option value="">Annan / egen server</option>{IMAP_PRESETS.map(([n, h]) => <option key={h} value={h}>{n}</option>)}
                </Select>
              </Field>
              <Field label="IMAP-server"><Input value={cfg.host || ''} onChange={set('host')} placeholder="imap.exempel.se" /></Field>
              <Field label="E-postadress / användarnamn"><Input value={cfg.user || ''} onChange={set('user')} placeholder="info@dittforetag.se" /></Field>
              <Field label="Lösenord" hint={cfg.host === 'imap.gmail.com' ? 'Gmail kräver ett app-lösenord (Google-konto → Säkerhet).' : undefined}><Input type="password" value={cfg.password || ''} onChange={set('password')} /></Field>
              <Field label="Port"><Input type="number" value={cfg.port || 993} onChange={set('port')} /></Field>
              <Field label="Mapp"><Input value={cfg.mailbox || 'INBOX'} onChange={set('mailbox')} /></Field>
            </div>
            <div className="grid sm:grid-cols-3 gap-4">
              <Field label="Hämta var (minut)"><Input type="number" min="1" value={cfg.intervalMinutes || 2} onChange={set('intervalMinutes')} /></Field>
              <Field label="Vid start, hämta senaste (dagar)"><Input type="number" min="0" value={cfg.backfillDays ?? 3} onChange={set('backfillDays')} /></Field>
              <Field label="Ämnesfilter" hint="Endast mejl vars ämne innehåller…"><Input value={cfg.subjectFilter || ''} onChange={set('subjectFilter')} placeholder="(valfritt)" /></Field>
            </div>
            <Field label="Ignorera avsändare" hint="Kommaseparerat, t.ex. nyhetsbrev@, faktura@"><Input value={cfg.ignoreFrom || ''} onChange={set('ignoreFrom')} /></Field>
            <div className="space-y-3">
              <Toggle checked={cfg.secure !== false} onChange={set('secure')} label="Krypterad anslutning (TLS)" />
              <Toggle checked={!!cfg.markSeen} onChange={set('markSeen')} label="Markera importerade mejl som lästa" />
            </div>
          </>
        ) : (
          <>
            <CopyField label="Webhook-adress för inkommande e-post" value={forwardUrl} hint="Hemlig adress – dela den inte publikt." />
            <div className="rounded-xl bg-slate-50 p-4">
              <Steps items={[
                <>Använd en tjänst som gör om e-post till webhooks: <b>Mailgun Routes</b>, <b>SendGrid Inbound Parse</b>, <b>Postmark Inbound</b>, <b>CloudMailin</b> eller <b>Zapier Email Parser</b>.</>,
                <>Peka tjänstens webhook mot adressen ovan (POST, JSON eller formulärdata).</>,
                <>Sätt upp vidarebefordran från t.ex. info@dittforetag.se till tjänstens adress. Varje mejl blir ett lead.</>,
              ]} />
            </div>
          </>
        )}
      </div>
    );
  }

  const formUrl = `${base}/api/webhooks/form/${integ.token}`;
  const snippet = `<form action="${formUrl}" method="POST">
  <input name="namn" placeholder="Namn" required>
  <input name="epost" type="email" placeholder="E-post" required>
  <input name="telefon" placeholder="Telefon">
  <input name="foretag" placeholder="Företag">
  <textarea name="meddelande" placeholder="Meddelande"></textarea>
  <input name="_gotcha" style="display:none">
  <button type="submit">Skicka</button>
</form>`;
  return (
    <div className="space-y-5">
      <CopyField label="Formulärets mottagaradress" value={formUrl} hint="Ta emot POST som formulärdata eller JSON. Fungerar även med Zapier, Make och n8n." />
      <Field label="Tack-sida efter inskick (valfritt)"><Input value={cfg.redirectUrl || ''} onChange={set('redirectUrl')} placeholder="https://dittforetag.se/tack" /></Field>
      <div>
        <div className="flex items-center justify-between mb-1"><span className="label !mb-0">HTML att klistra in på hemsidan</span>
          <button type="button" className="text-xs text-brand-600 font-medium" onClick={() => navigator.clipboard.writeText(snippet)}>Kopiera</button></div>
        <pre className="rounded-lg bg-slate-900 text-slate-100 text-xs p-4 overflow-x-auto scroll-thin">{snippet}</pre>
      </div>
    </div>
  );
}

function StatusPill({ integ }) {
  if (!integ.enabled) return <Badge className="bg-slate-100 text-slate-500 ring-slate-500/20">Pausad</Badge>;
  if (integ.status === 'syncing') return <Badge className="bg-sky-50 text-sky-700 ring-sky-600/20"><Loader2 className="size-3 animate-spin" />Hämtar…</Badge>;
  if (integ.status === 'error') return <Badge className="bg-rose-50 text-rose-700 ring-rose-600/20"><AlertTriangle className="size-3" />Fel</Badge>;
  if (integ.status === 'ok') return <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-600/20"><span className="size-1.5 rounded-full bg-emerald-500" />Ansluten</Badge>;
  return <Badge className="bg-amber-50 text-amber-700 ring-amber-600/20">Ej konfigurerad</Badge>;
}

export default function Integrations() {
  const toast = useToast();
  const { data, reload } = useFetch('/integrations');
  const [edit, setEdit] = useState(null);
  const [cfg, setCfg] = useState({});
  const [name, setName] = useState('');
  const [busy, setBusy] = useState({});
  const [del, setDel] = useState(null);
  useLive(['integration', 'lead'], () => reload());

  const base = data?.publicUrl || window.location.origin;
  const openEdit = (integ) => { setEdit(integ); setCfg({ ...integ.config }); setName(integ.name); };
  const create = async (type) => {
    try { const integ = await api.post('/integrations', { type }); await reload(); openEdit(integ); }
    catch (e) { toast(e.message, 'error'); }
  };
  const save = async (andTest) => {
    try {
      const updated = await api.patch(`/integrations/${edit.id}`, { name, config: cfg });
      setEdit(null); await reload();
      toast('Inställningarna sparades');
      if (andTest) test(updated);
    } catch (e) { toast(e.message, 'error'); }
  };
  const action = async (integ, kind) => {
    setBusy((b) => ({ ...b, [integ.id]: kind }));
    try {
      if (kind === 'test') {
        const r = await api.post(`/integrations/${integ.id}/test`);
        toast(Object.values(r.info).join(' · '), 'success', { title: 'Anslutningen fungerar' });
      } else if (kind === 'sync') {
        const r = await api.post(`/integrations/${integ.id}/sync`);
        toast(r.skipped ? 'Hämtning pågår redan' : `${r.imported} nya leads hämtade`, 'success', { title: 'Hämtning klar' });
      } else if (kind === 'simulate') {
        const r = await api.post(`/integrations/${integ.id}/simulate`);
        toast(r.summary, 'success', { title: 'Testlead skickad' });
      }
    } catch (e) { toast(e.message, 'error'); } finally { setBusy((b) => ({ ...b, [integ.id]: null })); reload(); }
  };
  const test = (integ) => action(integ, 'test');
  const toggle = async (integ) => { await api.patch(`/integrations/${integ.id}`, { enabled: !integ.enabled }); reload(); };
  const remove = async () => { await api.del(`/integrations/${del.id}`); setDel(null); reload(); toast('Integrationen togs bort'); };

  if (!data) return <div className="grid place-items-center h-64"><Spinner /></div>;
  const items = data.items;

  return (
    <div className="space-y-8">
      <PageHeader title="Integrationer" subtitle="Koppla in kanalerna där dina kunder hör av sig – leads hämtas in och fördelas automatiskt."
        actions={<Link to="/inflow"><Button variant="secondary" icon={Radio}>Visa lead-inflöde</Button></Link>} />

      {items.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-slate-900 mb-3">Anslutna kanaler</h2>
          <Card className="divide-y divide-slate-100">
            {items.map((integ) => {
              const c = CATALOG[integ.type];
              const I = c.icon;
              return (
                <div key={integ.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                  <span className={cx('grid place-items-center size-10 rounded-xl shrink-0', c.color)}><I className="size-5" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2"><p className="font-medium text-slate-900 truncate">{integ.name}</p><StatusPill integ={integ} /></div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {c.name}{integ.type === 'email' && ` · ${integ.config.mode === 'imap' ? `IMAP ${integ.config.user || ''}` : 'vidarebefordran'}`}
                      {' · '}{integ.leads_count} leads{integ.last_sync_at && ` · senast ${timeAgo(integ.last_sync_at)}`}
                    </p>
                    {integ.status === 'error' && integ.last_error && <p className="text-xs text-rose-600 mt-1 truncate max-w-xl">{integ.last_error}</p>}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button size="sm" variant="ghost" icon={FlaskConical} loading={busy[integ.id] === 'simulate'} onClick={() => action(integ, 'simulate')} title="Skicka en testlead genom flödet">Testlead</Button>
                    {integ.type !== 'webform' && <Button size="sm" variant="ghost" icon={CheckCircle2} loading={busy[integ.id] === 'test'} onClick={() => test(integ)}>Testa</Button>}
                    {integ.pollable && <Button size="sm" variant="ghost" icon={RefreshCw} loading={busy[integ.id] === 'sync'} onClick={() => action(integ, 'sync')}>Hämta nu</Button>}
                    <Button size="sm" variant="secondary" icon={Settings2} onClick={() => openEdit(integ)}>Inställningar</Button>
                    <Toggle checked={integ.enabled} onChange={() => toggle(integ)} />
                  </div>
                </div>
              );
            })}
          </Card>
        </section>
      )}

      <section>
        <h2 className="text-sm font-semibold text-slate-900 mb-3">Lägg till kanal</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Object.entries(CATALOG).map(([type, c]) => {
            const I = c.icon;
            const n = items.filter((i) => i.type === type).length;
            return (
              <Card key={type} className="p-5 flex flex-col hover:shadow-md transition">
                <div className="flex items-start justify-between">
                  <span className={cx('grid place-items-center size-11 rounded-xl', c.color)}><I className="size-6" /></span>
                  {n > 0 && <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-600/20">{n} ansluten</Badge>}
                </div>
                <h3 className="mt-4 font-semibold text-slate-900">{c.name}</h3>
                <p className="mt-1 text-sm text-slate-500 flex-1">{c.desc}</p>
                <ul className="mt-3 space-y-1">{c.features.map((f) => <li key={f} className="flex items-center gap-2 text-xs text-slate-600"><Check className="size-3.5 text-emerald-500" />{f}</li>)}</ul>
                <Button variant={n ? 'secondary' : 'primary'} icon={Plus} className="mt-5" onClick={() => create(type)}>{n ? 'Lägg till fler' : 'Anslut'}</Button>
              </Card>
            );
          })}
        </div>
      </section>

      <Card className="p-5 flex flex-wrap items-center gap-4 bg-gradient-to-r from-brand-50 to-white">
        <span className="grid place-items-center size-10 rounded-xl bg-white shadow-sm"><Plug className="size-5 text-brand-600" /></span>
        <div className="flex-1 min-w-60">
          <p className="font-medium text-slate-900">Vad händer med ett nytt lead?</p>
          <p className="text-sm text-slate-600">Uppgifterna tolkas → dubbletter slås ihop → poäng sätts → dina <Link to="/automations" className="text-brand-600 underline">automatiseringsregler</Link> fördelar och taggar → ansvarig säljare får en notis direkt.</p>
        </div>
      </Card>

      <Modal open={!!edit} onClose={() => setEdit(null)} wide title={edit && `${CATALOG[edit.type].name} – inställningar`}
        description="Uppgifter som lösenord och token lagras krypterat."
        footer={<>
          <Button variant="ghost" icon={Trash2} className="mr-auto !text-rose-600" onClick={() => { setDel(edit); setEdit(null); }}>Ta bort</Button>
          <Button variant="secondary" onClick={() => save(false)}>Spara</Button>
          {edit?.type !== 'webform' && !(edit?.type === 'email' && cfg.mode === 'forward') && <Button onClick={() => save(true)}>Spara och testa</Button>}
        </>}>
        {edit && (
          <div className="space-y-5">
            <Field label="Namn"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <ConfigForm integ={edit} cfg={cfg} setCfg={setCfg} base={base} />
            <a href="https://developers.facebook.com/docs/marketing-api/guides/lead-ads" target="_blank" rel="noreferrer" className={cx('inline-flex items-center gap-1 text-xs text-slate-500 hover:text-brand-600', !['facebook', 'instagram'].includes(edit.type) && 'hidden')}>Metas dokumentation för Lead Ads<ExternalLink className="size-3" /></a>
          </div>
        )}
      </Modal>
      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={remove} title="Ta bort integration?" text="Inga fler leads hämtas från kanalen. Redan inhämtade leads finns kvar." confirmText="Ta bort" />
    </div>
  );
}
