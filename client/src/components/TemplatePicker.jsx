import { useEffect, useMemo, useState } from 'react';
import { Copy, Mail, Search, FileText, StickyNote } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useApp } from '../lib/app.jsx';
import { Button, Modal, Spinner, cx, useToast } from './ui.jsx';
import { TEMPLATE_TYPES, fillTemplate, missingFields, copyText } from '../lib/templates.js';
import { tr } from '../lib/i18n.js';

let profileName = null;

// Välj en mall för ett lead: fälten fylls i med kontaktens och säljarens uppgifter, sedan kopierar man
// texten eller öppnar e-postprogrammet. Användningen kan loggas i tidslinjen.
export default function TemplatePicker({ lead, open, onClose, onLogged }) {
  const { user, workspace } = useApp();
  const toast = useToast();
  const [list, setList] = useState(null);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(null);
  const [company, setCompany] = useState(profileName);

  useEffect(() => {
    if (!open) return;
    api.get('/templates').then((l) => { setList(l); setSel((s) => s || l[0] || null); }).catch(() => setList([]));
    if (!profileName) api.get('/sales/profile').then((p) => { profileName = p.name || null; setCompany(profileName); }).catch(() => {});
  }, [open]);

  const ctx = { lead, user, company: company || workspace?.name };
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (list || []).filter((t) => !s || [t.name, t.subject, t.body].some((x) => x?.toLowerCase().includes(s)));
  }, [list, q]);

  const subject = sel ? fillTemplate(sel.subject, ctx) : '';
  const body = sel ? fillTemplate(sel.body, ctx) : '';
  const missing = missingFields(`${subject} ${body}`);
  const used = () => api.post(`/templates/${sel.id}/used`).catch(() => {});

  const copy = async (text, msg) => {
    if (await copyText(text)) { toast(msg); used(); } else toast(tr('Kunde inte kopiera'), 'error');
  };
  const openMail = () => {
    used();
    window.location.href = `mailto:${encodeURIComponent(lead.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };
  const log = async () => {
    try {
      const type = sel.type === 'email' ? 'email' : sel.type === 'call' ? 'call' : 'note';
      const content = sel.type === 'email' ? `${tr('Mejl')}: ${subject}\n\n${body}` : `${TEMPLATE_TYPES[sel.type].label} (${sel.name}):\n${body}`;
      await api.post(`/leads/${lead.id}/activities`, { type, content });
      toast(tr('Loggat i tidslinjen'));
      onLogged?.();
      onClose();
    } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <Modal open={open} onClose={onClose} wide title={tr('Använd mall')} description={tr('Fälten fylls i med uppgifterna för {name}.', { name: [lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.email || lead.company })}>
      {!list ? <div className="grid place-items-center py-10"><Spinner /></div> : !list.length ? (
        <div className="py-8 text-center text-sm text-slate-500">{tr('Inga mallar än.')} <Link to="/templates" onClick={onClose} className="font-medium text-brand-600 hover:underline">{tr('Skapa en under Mallar')}</Link></div>
      ) : (
        <div className="grid gap-4 md:grid-cols-[220px_1fr]">
          <div className="space-y-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input className="input !py-1.5 !pl-8 text-sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('Sök…')} />
            </div>
            <ul className="max-h-80 space-y-1 overflow-y-auto scroll-thin">
              {filtered.map((t) => {
                const I = TEMPLATE_TYPES[t.type]?.icon || FileText;
                return (
                  <li key={t.id}>
                    <button onClick={() => setSel(t)} className={cx('flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm', sel?.id === t.id ? 'bg-brand-50 text-brand-800' : 'text-slate-700 hover:bg-slate-50')}>
                      <I className="size-4 shrink-0 text-slate-400" /><span className="truncate">{t.name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
          {sel && (
            <div className="min-w-0 rounded-lg border border-slate-200 p-4">
              {sel.type === 'email' && <p className="mb-3 text-sm"><span className="text-slate-500">{tr('Ämne')}:</span> <span className="font-medium text-slate-900">{subject}</span></p>}
              <p className="max-h-72 overflow-y-auto whitespace-pre-line text-sm leading-relaxed text-slate-700 scroll-thin">{body}</p>
              {missing.length > 0 && <p className="mt-3 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">{tr('Saknar värde för {fields} – fyll i dem innan du skickar.', { fields: missing.join(', ') })}</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" icon={Copy} onClick={() => copy(body, tr('Texten är kopierad'))}>{tr('Kopiera text')}</Button>
                {sel.type === 'email' && <Button size="sm" variant="secondary" onClick={() => copy(subject, tr('Ämnesraden är kopierad'))}>{tr('Kopiera ämne')}</Button>}
                {sel.type === 'email' && lead.email && <Button size="sm" variant="secondary" icon={Mail} onClick={openMail}>{tr('Öppna i e-post')}</Button>}
                <Button size="sm" variant="ghost" icon={StickyNote} className="ml-auto" onClick={log}>{tr('Logga i tidslinjen')}</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
