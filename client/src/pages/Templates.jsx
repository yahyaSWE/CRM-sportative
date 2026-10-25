import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Copy, Pencil, Plus, Search, Trash2, CopyPlus, FileText, Braces } from 'lucide-react';
import { api } from '../api.js';
import { useApp, useFetch } from '../lib/app.jsx';
import { Button, Card, Confirm, Empty, Field, Input, Modal, PageHeader, Select, Spinner, Tabs, Textarea, cx, useToast } from '../components/ui.jsx';
import { TEMPLATE_TYPES, VARIABLES, copyText } from '../lib/templates.js';
import { timeAgo } from '../lib/meta.jsx';
import { tr } from '../lib/i18n.js';

const EMPTY = { type: 'email', name: '', subject: '', body: '' };

// Fältknappar som infogar {fält} där markören står i texten.
function VariableBar({ onInsert }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="inline-flex items-center gap-1 text-xs text-slate-500"><Braces className="size-3.5" />{tr('Infoga fält:')}</span>
      {VARIABLES.map((v) => (
        <button key={v.key} type="button" onClick={() => onInsert(`{${v.key}}`)} title={v.label}
          className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 hover:bg-brand-50 hover:text-brand-700">{v.label}</button>
      ))}
    </div>
  );
}

function TemplateModal({ template, onClose, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState(template);
  const [saving, setSaving] = useState(false);
  const [focus, setFocus] = useState('body');
  const refs = { subject: useRef(null), body: useRef(null) };
  const caret = useRef(null);
  // Markören placeras efter det infogade fältet först när React har skrivit in det nya värdet.
  useLayoutEffect(() => {
    if (!caret.current) return;
    const { field, pos } = caret.current;
    caret.current = null;
    refs[field].current?.focus();
    refs[field].current?.setSelectionRange(pos, pos);
  }, [f]);
  const insert = (token) => {
    const field = f.type === 'email' ? focus : 'body';
    const el = refs[field].current;
    const value = f[field] || '';
    const start = el?.selectionStart ?? value.length, end = el?.selectionEnd ?? value.length;
    caret.current = { field, pos: start + token.length };
    setF({ ...f, [field]: value.slice(0, start) + token + value.slice(end) });
  };
  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const saved = f.id ? await api.patch(`/templates/${f.id}`, f) : await api.post('/templates', f);
      toast(f.id ? tr('Mallen sparades') : tr('Mallen skapades'));
      onSaved(saved);
    } catch (err) { toast(err.message, 'error'); } finally { setSaving(false); }
  };
  return (
    <Modal open wide onClose={onClose} title={f.id ? tr('Redigera mall') : tr('Ny mall')}
      footer={<><Button variant="secondary" onClick={onClose}>{tr('Avbryt')}</Button><Button type="submit" form="template-form" loading={saving}>{tr('Spara')}</Button></>}>
      <form id="template-form" onSubmit={save} className="space-y-4">
        <div className="grid sm:grid-cols-3 gap-4">
          <Field label={tr('Typ')}>
            <Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
              {Object.entries(TEMPLATE_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Select>
          </Field>
          <Field label={tr('Namn')} className="sm:col-span-2"><Input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={tr('t.ex. Uppföljning efter demo')} /></Field>
        </div>
        {f.type === 'email' && (
          <Field label={tr('Ämnesrad')}>
            <input ref={refs.subject} className="input" value={f.subject || ''} onFocus={() => setFocus('subject')} onChange={(e) => setF({ ...f, subject: e.target.value })} />
          </Field>
        )}
        <Field label={f.type === 'call' ? tr('Manus') : tr('Text')}>
          <textarea ref={refs.body} className="input min-h-64 font-[inherit] leading-relaxed" value={f.body} onFocus={() => setFocus('body')} onChange={(e) => setF({ ...f, body: e.target.value })} />
        </Field>
        <VariableBar onInsert={insert} />
        <p className="text-xs text-slate-500">{tr('Fälten fylls i automatiskt när du använder mallen från ett lead. Kopierar du mallen härifrån följer de med som de är.')}</p>
      </form>
    </Modal>
  );
}

function TemplateCard({ t, onEdit, onDuplicate, onDelete, onCopied }) {
  const toast = useToast();
  const meta = TEMPLATE_TYPES[t.type] || TEMPLATE_TYPES.email;
  const Icon = meta.icon;
  const copy = async (text, what) => {
    if (await copyText(text)) { toast(what); onCopied(t); } else toast(tr('Kunde inte kopiera'), 'error');
  };
  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-start gap-3">
        <span className={cx('grid place-items-center size-9 shrink-0 rounded-lg', meta.cls)}><Icon className="size-4" /></span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-slate-900 truncate">{t.name}</h3>
          <p className="text-xs text-slate-500">{meta.label}{t.use_count > 0 && ` · ${tr('använd {n} gånger', { n: t.use_count })}`}</p>
        </div>
        {t.canEdit && (
          <div className="flex shrink-0 gap-0.5">
            <button onClick={onEdit} title={tr('Redigera')} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Pencil className="size-4" /></button>
            <button onClick={onDelete} title={tr('Radera')} className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="size-4" /></button>
          </div>
        )}
      </div>
      {t.subject && <p className="mt-4 text-sm font-medium text-slate-800">{t.subject}</p>}
      <p className={cx('text-sm text-slate-600 whitespace-pre-line line-clamp-6 flex-1', t.subject ? 'mt-1' : 'mt-4')}>{t.body}</p>
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
        <Button size="sm" icon={Copy} onClick={() => copy(t.body, tr('Texten är kopierad'))}>{tr('Kopiera text')}</Button>
        {t.subject && <Button size="sm" variant="secondary" onClick={() => copy(t.subject, tr('Ämnesraden är kopierad'))}>{tr('Kopiera ämne')}</Button>}
        {onDuplicate && <button onClick={onDuplicate} title={tr('Duplicera')} className="ml-auto rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><CopyPlus className="size-4" /></button>}
      </div>
      <p className="mt-2 text-[11px] text-slate-400">{t.updated_by_name || t.created_by_name ? tr('Uppdaterad {when} av {name}', { when: timeAgo(t.updated_at), name: t.updated_by_name || t.created_by_name }) : tr('Exempelmall')}</p>
    </Card>
  );
}

export default function Templates() {
  const { can } = useApp();
  const toast = useToast();
  const { data, setData } = useFetch('/templates');
  const [type, setType] = useState('all');
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data || []).filter((t) => (type === 'all' || t.type === type)
      && (!s || [t.name, t.subject, t.body].some((x) => x?.toLowerCase().includes(s))));
  }, [data, type, q]);
  const count = (k) => (data || []).filter((t) => t.type === k).length;

  const saved = (t) => { setData((d) => (d.some((x) => x.id === t.id) ? d.map((x) => (x.id === t.id ? t : x)) : [t, ...d])); setEdit(null); };
  const remove = async () => {
    try { await api.del(`/templates/${del.id}`); setData((d) => d.filter((x) => x.id !== del.id)); toast(tr('Mallen raderades')); }
    catch (e) { toast(e.message, 'error'); } finally { setDel(null); }
  };
  const used = (t) => {
    api.post(`/templates/${t.id}/used`).catch(() => {});
    setData((d) => d.map((x) => (x.id === t.id ? { ...x, use_count: x.use_count + 1 } : x)));
  };

  return (
    <div>
      <PageHeader title={tr('Mallar')} subtitle={tr('E-post, meddelanden och samtalsmanus som hela teamet delar. Kopiera med ett klick eller använd dem direkt från ett lead.')}
        actions={can('leads.edit_own') && <Button icon={Plus} onClick={() => setEdit({ ...EMPTY, type: type === 'all' ? 'email' : type })}>{tr('Ny mall')}</Button>} />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Tabs value={type} onChange={setType} tabs={[
          { value: 'all', label: tr('Alla'), count: data?.length },
          ...Object.entries(TEMPLATE_TYPES).map(([k, v]) => ({ value: k, label: v.label, count: count(k) })),
        ]} />
        <div className="relative w-full sm:w-72 sm:ml-auto">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input className="input !pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('Sök mallar…')} />
        </div>
      </div>
      {!data ? <div className="grid place-items-center py-16"><Spinner /></div> : !list.length ? (
        <Card><Empty icon={FileText} title={q ? tr('Inga mallar matchar sökningen') : tr('Inga mallar än')}
          text={tr('Spara texter ni skickar ofta – uppföljningar, offertmejl, SMS och samtalsmanus – så att alla i teamet kan använda dem.')}
          action={!q && can('leads.edit_own') && <Button icon={Plus} onClick={() => setEdit({ ...EMPTY })}>{tr('Ny mall')}</Button>} /></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {list.map((t) => (
            <TemplateCard key={t.id} t={t} onCopied={used} onEdit={() => setEdit(t)} onDelete={() => setDel(t)}
              onDuplicate={can('leads.edit_own') ? () => setEdit({ type: t.type, name: `${t.name} (${tr('kopia')})`, subject: t.subject || '', body: t.body }) : null} />
          ))}
        </div>
      )}
      {edit && <TemplateModal template={edit} onClose={() => setEdit(null)} onSaved={saved} />}
      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={remove} title={tr('Radera mallen?')} text={del && tr('"{name}" tas bort för hela teamet.', { name: del.name })} />
    </div>
  );
}
