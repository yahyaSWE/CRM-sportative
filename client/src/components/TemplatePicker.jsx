import { useEffect, useMemo, useState } from 'react';
import { Copy, Mail, Search, FileText, StickyNote, Send, PenLine, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useApp } from '../lib/app.jsx';
import { useEmailStatus } from '../lib/email.js';
import { Button, Field, Modal, Spinner, cx, useToast } from './ui.jsx';
import { TEMPLATE_TYPES, fillTemplate, missingFields, copyText } from '../lib/templates.js';
import { tr } from '../lib/i18n.js';

let profileName = null;
const BLANK = { id: null, type: 'email', name: tr('Tomt mejl'), subject: '', body: '' };

// Skriv till ett lead utifrån en mall (eller ett tomt mejl): fälten fylls i med kontaktens och säljarens uppgifter
// och allt går att redigera. Med Gmail kopplat skickas mejlet direkt; annars kopierar man eller öppnar e-postprogrammet.
export default function TemplatePicker({ lead, open, onClose, onLogged, blank, aiEmail }) {
  const { user, workspace } = useApp();
  const toast = useToast();
  const mail = useEmailStatus();
  const [list, setList] = useState(null);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(null);
  const [draft, setDraft] = useState({ to: '', subject: '', body: '' });
  const [company, setCompany] = useState(profileName);
  const [sending, setSending] = useState(false);
  const [aiDraft, setAiDraft] = useState(null);

  useEffect(() => {
    if (!open) return;
    setSel(null);
    // Ett AI-utkast visas först i listan och är förvalt.
    const ai = aiEmail ? { ...BLANK, name: tr('AI-utkast'), subject: aiEmail.subject, body: aiEmail.body, ai: true } : null;
    setAiDraft(ai);
    api.get('/templates').then((l) => { setList(l); setSel(ai || (blank ? BLANK : l.find((t) => t.type === 'email') || l[0] || BLANK)); }).catch(() => { setList([]); setSel(ai || BLANK); });
    if (!profileName) api.get('/sales/profile').then((p) => { profileName = p.name || null; setCompany(profileName); }).catch(() => {});
  }, [open]);

  const ctx = { lead, user, company: company || workspace?.name };
  // Ny mall vald (eller företagsnamnet laddat): utkastet fylls i på nytt.
  useEffect(() => {
    if (sel) setDraft({ to: lead.email || '', subject: fillTemplate(sel.subject, ctx), body: fillTemplate(sel.body, ctx) });
  }, [sel, company]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (list || []).filter((t) => !s || [t.name, t.subject, t.body].some((x) => x?.toLowerCase().includes(s)));
  }, [list, q]);

  const isEmail = sel?.type === 'email';
  const missing = missingFields(`${isEmail ? draft.subject : ''} ${draft.body}`);
  const used = () => sel?.id && api.post(`/templates/${sel.id}/used`).catch(() => {});
  const set = (k) => (e) => setDraft({ ...draft, [k]: e.target.value });

  const copy = async (text, msg) => {
    if (await copyText(text)) { toast(msg); used(); } else toast(tr('Kunde inte kopiera'), 'error');
  };
  const openMail = () => {
    used();
    window.location.href = `mailto:${encodeURIComponent(draft.to)}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`;
  };
  const send = async () => {
    setSending(true);
    try {
      const r = await api.post(`/leads/${lead.id}/email`, { to: draft.to, subject: draft.subject, body: draft.body, template_id: sel.id || undefined });
      toast(tr('Mejlet skickades från {email}', { email: r.from }));
      onLogged?.();
      onClose();
    } catch (e) { toast(e.message, 'error'); } finally { setSending(false); }
  };
  const log = async () => {
    try {
      const type = isEmail ? 'email' : sel.type === 'call' ? 'call' : 'note';
      const content = isEmail ? `${tr('Mejl')}: ${draft.subject}\n\n${draft.body}` : `${TEMPLATE_TYPES[sel.type].label} (${sel.name}):\n${draft.body}`;
      await api.post(`/leads/${lead.id}/activities`, { type, content });
      used();
      toast(tr('Loggat i tidslinjen'));
      onLogged?.();
      onClose();
    } catch (e) { toast(e.message, 'error'); }
  };

  const canSend = isEmail && mail?.canSend;
  const item = (t, key) => {
    const I = t.ai ? Sparkles : t.id ? TEMPLATE_TYPES[t.type]?.icon || FileText : PenLine;
    const active = sel === t || (t.id && sel?.id === t.id);
    return (
      <li key={key}>
        <button onClick={() => setSel(t)} className={cx('flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm', active ? 'bg-brand-50 text-brand-800' : 'text-slate-700 hover:bg-slate-50')}>
          <I className="size-4 shrink-0 text-slate-400" /><span className="truncate">{t.name}</span>
        </button>
      </li>
    );
  };

  return (
    <Modal open={open} onClose={onClose} wide title={tr('Skriv till {name}', { name: [lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.email || lead.company })}
      description={mail?.canSend ? tr('Skickas från din Gmail ({email}) och loggas i tidslinjen.', { email: mail.email }) : tr('Fälten fylls i med kontaktens uppgifter. Koppla Gmail under Inställningar för att skicka direkt från appen.')}>
      {!list || !sel ? <div className="grid place-items-center py-10"><Spinner /></div> : (
        <div className="grid gap-4 md:grid-cols-[220px_1fr]">
          <div className="space-y-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input className="input !py-1.5 !pl-8 text-sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('Sök…')} />
            </div>
            <ul className="max-h-96 space-y-1 overflow-y-auto scroll-thin">
              {!q && aiDraft && item(aiDraft, 'ai')}
              {!q && item(BLANK, 'blank')}
              {filtered.map((t) => item(t, t.id))}
              {!list.length && <li className="px-2.5 py-2 text-xs text-slate-500"><Link to="/templates" onClick={onClose} className="text-brand-600 hover:underline">{tr('Skapa mallar under Mallar')}</Link></li>}
            </ul>
          </div>
          <div className="min-w-0 space-y-3">
            {isEmail && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={tr('Till')}><input className="input" value={draft.to} onChange={set('to')} placeholder={tr('namn@företag.se')} /></Field>
                <Field label={tr('Ämne')}><input className="input" value={draft.subject} onChange={set('subject')} /></Field>
              </div>
            )}
            <Field label={isEmail ? tr('Meddelande') : TEMPLATE_TYPES[sel.type]?.label}>
              <textarea className="input min-h-64 leading-relaxed" value={draft.body} onChange={set('body')} />
            </Field>
            {missing.length > 0 && <p className="rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">{tr('Saknar värde för {fields} – fyll i dem innan du skickar.', { fields: missing.join(', ') })}</p>}
            {isEmail && mail?.needsReconnect && <p className="rounded-md bg-sky-50 px-2.5 py-1.5 text-xs text-sky-800">{tr('Din Google-koppling saknar rätt att skicka e-post.')} <Link to="/settings" onClick={onClose} className="font-medium underline">{tr('Koppla Gmail under Inställningar')}</Link></p>}
            <div className="flex flex-wrap items-center gap-2">
              {canSend && <Button icon={Send} loading={sending} disabled={!draft.to.trim() || !draft.subject.trim() || !draft.body.trim()} onClick={send}>{tr('Skicka')}</Button>}
              <Button size="sm" variant={canSend ? 'secondary' : 'primary'} icon={Copy} onClick={() => copy(draft.body, tr('Texten är kopierad'))}>{tr('Kopiera text')}</Button>
              {isEmail && <Button size="sm" variant="secondary" onClick={() => copy(draft.subject, tr('Ämnesraden är kopierad'))}>{tr('Kopiera ämne')}</Button>}
              {isEmail && !canSend && draft.to && <Button size="sm" variant="secondary" icon={Mail} onClick={openMail}>{tr('Öppna i e-post')}</Button>}
              {!canSend && <Button size="sm" variant="ghost" icon={StickyNote} className="ml-auto" onClick={log}>{tr('Logga i tidslinjen')}</Button>}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
