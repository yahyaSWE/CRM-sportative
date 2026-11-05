import { useEffect, useState, useRef, createContext, useContext, useCallback } from 'react';
import { X, Loader2, CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { SOURCES, STATUSES } from '../lib/meta.jsx';
import { tr } from '../lib/i18n.js';

export const cx = (...c) => c.filter(Boolean).join(' ');

const BTN = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm shadow-brand-600/20',
  secondary: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 shadow-sm',
  ghost: 'text-slate-600 hover:bg-slate-100',
  danger: 'bg-rose-600 text-white hover:bg-rose-700',
  soft: 'bg-brand-50 text-brand-700 hover:bg-brand-100',
};

// Med href blir knappen en länk (t.ex. nedladdning) i stället för en knapp inuti en länk.
export function Button({ variant = 'primary', size = 'md', loading, icon: Icon, className, children, href, ...props }) {
  const Tag = href ? 'a' : 'button';
  return (
    <Tag href={href}
      className={cx('inline-flex items-center justify-center gap-2 rounded-lg font-medium transition disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap',
        size === 'sm' ? 'px-2.5 py-1.5 text-xs max-sm:min-h-9' : 'px-3.5 py-2 text-sm max-sm:min-h-10', BTN[variant], className)}
      {...(href ? {} : { disabled: loading || props.disabled })} {...props}>
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : Icon && <Icon className={size === 'sm' ? 'size-3.5' : 'size-4'} aria-hidden="true" />}
      {children}
    </Tag>
  );
}

export function Card({ className, children, ...p }) {
  return <div className={cx('card', className)} {...p}>{children}</div>;
}

export function Badge({ className, children }) {
  return <span className={cx('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset', className)}>{children}</span>;
}

export const StatusBadge = ({ status }) => {
  const s = STATUSES[status] || STATUSES.new;
  return <Badge className={s.cls}>{s.label}</Badge>;
};

export function SourceBadge({ source, detail, compact }) {
  const s = SOURCES[source] || SOURCES.manual;
  const Icon = s.icon;
  return (
    <span className="inline-flex items-center gap-2 min-w-0">
      <span className={cx('grid place-items-center rounded-md shrink-0', compact ? 'size-6' : 'size-7', s.bg)}><Icon className="size-3.5" /></span>
      {!compact && (
        <span className="min-w-0">
          <span className="block text-sm text-slate-700 leading-tight">{s.label}</span>
          {detail && <span className="block text-xs text-slate-500 truncate max-w-48">{detail}</span>}
        </span>
      )}
    </span>
  );
}

const luminance = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return 0.3;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
// Mörk text (#0f172a, luminans ~0.009) när den ger bättre kontrast än vit.
const initialsColor = (bg) => { const l = luminance(bg); return (l + 0.05) / 0.059 > 1.05 / (l + 0.05) ? '#0f172a' : '#fff'; };
// Mellantoner där ingen textfärg når 4,5:1 mörkas lite, så att vita initialer blir läsbara.
const avatarBg = (bg) => {
  const l = luminance(bg);
  if (Math.max(1.05 / (l + 0.05), (l + 0.05) / 0.059) >= 4.5 || !/^#[0-9a-f]{6}$/i.test(bg || '')) return bg;
  const k = Math.sqrt(0.18 / l);
  return '#' + [1, 3, 5].map((i) => Math.round(parseInt(bg.slice(i, i + 2), 16) * k).toString(16).padStart(2, '0')).join('');
};

export function Avatar({ name = '?', color = '#94a3b8', size = 'md' }) {
  const initials = name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  const sz = { xs: 'size-5 text-[10px]', sm: 'size-7 text-[11px]', md: 'size-8 text-xs', lg: 'size-11 text-sm' }[size];
  return <span className={cx('inline-grid place-items-center rounded-full font-semibold shrink-0', sz)} style={{ background: avatarBg(color), color: initialsColor(avatarBg(color)) }} title={name}>{initials}</span>;
}

export function ScoreBar({ score }) {
  const color = score >= 70 ? 'bg-emerald-500' : score >= 40 ? 'bg-amber-400' : 'bg-slate-300';
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-14 rounded-full bg-slate-100 overflow-hidden"><div className={cx('h-full rounded-full', color)} style={{ width: `${score}%` }} /></div>
      <span className="text-xs tabular-nums text-slate-500 w-6">{score}</span>
    </div>
  );
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Fokus för dialoger och sidopaneler: flyttar in fokus när den öppnas, håller Tab inom panelen
// och lämnar tillbaka fokus till knappen som öppnade den när den stängs.
export function useDialogFocus(open) {
  const ref = useRef(null);
  // Knappen som öppnade dialogen läses under renderingen, innan ett fält med autoFocus hunnit ta fokus.
  const openerRef = useRef(null);
  if (open && !openerRef.current) openerRef.current = document.activeElement;
  if (!open) openerRef.current = null;
  useEffect(() => {
    if (!open || !ref.current) return;
    const panel = ref.current;
    const opener = openerRef.current;
    // Har ett fält redan tagit fokus (autoFocus) får det behålla det; annars får dialogen själv fokus,
    // så att skärmläsaren läser upp rubriken i stället för att hamna på stängknappen.
    if (!panel.contains(document.activeElement)) panel.focus({ preventScroll: true });
    const onKey = (e) => {
      if (e.key !== 'Tab') return;
      const items = [...panel.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const [a, b] = [items[0], items[items.length - 1]];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); b.focus(); }
      else if (!e.shiftKey && document.activeElement === b) { e.preventDefault(); a.focus(); }
    };
    panel.addEventListener('keydown', onKey);
    return () => { panel.removeEventListener('keydown', onKey); if (opener?.isConnected) opener.focus({ preventScroll: true }); };
  }, [open]);
  return ref;
}

// Samma sak för sidopanelerna (lead, affär, företag), som ref-callback: panelen finns så länge den är öppen.
export function drawerRef(panel) {
  if (!panel) return;
  const opener = document.activeElement;
  panel.focus({ preventScroll: true });
  const onKey = (e) => {
    if (e.key !== 'Tab') return;
    const items = [...panel.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    const [a, b] = [items[0], items[items.length - 1]];
    if (e.shiftKey && (document.activeElement === a || document.activeElement === panel)) { e.preventDefault(); b.focus(); }
    else if (!e.shiftKey && document.activeElement === b) { e.preventDefault(); a.focus(); }
  };
  panel.addEventListener('keydown', onKey);
  return () => { panel.removeEventListener('keydown', onKey); if (opener?.isConnected && opener !== document.body) opener.focus({ preventScroll: true }); };
}

let dialogSeq = 0;
export function Modal({ open, onClose, title, description, children, footer, wide }) {
  const ref = useDialogFocus(open);
  const [titleId] = useState(() => `dlg-${++dialogSeq}`);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 backdrop-blur-[2px] p-4 sm:p-8" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className={cx('card w-full animate-fade-in shadow-xl my-auto outline-none', wide ? 'max-w-3xl' : 'max-w-lg')}>
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-slate-100">
          <div>
            <h2 id={titleId} className="text-base font-semibold text-slate-900">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
          </div>
          <button onClick={onClose} aria-label={tr('Stäng')} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"><X className="size-5" /></button>
        </div>
        <div className="px-6 py-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-100 bg-slate-50/60 rounded-b-xl">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, hint, children, className }) {
  return (
    <label className={cx('block', className)}>
      {label && <span className="label">{label}</span>}
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export const Input = (p) => <input className="input" {...p} />;
export const Select = ({ children, className, ...p }) => <select className={cx('input pr-8', className)} {...p}>{children}</select>;
export const Textarea = (p) => <textarea className="input min-h-24" {...p} />;

export function Toggle({ checked, onChange, label, description }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer select-none">
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
        className={cx('relative mt-0.5 inline-flex h-5 w-9 shrink-0 rounded-full transition', checked ? 'bg-brand-600' : 'bg-slate-300')}>
        <span className={cx('absolute top-0.5 size-4 rounded-full bg-white shadow transition', checked ? 'left-[18px]' : 'left-0.5')} />
      </button>
      {(label || description) && (
        <span>
          <span className="block text-sm font-medium text-slate-700">{label}</span>
          {description && <span className="block text-xs text-slate-500">{description}</span>}
        </span>
      )}
    </label>
  );
}

export function Empty({ icon: Icon, title, text, action }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6">
      {Icon && <div className="grid place-items-center size-12 rounded-xl bg-slate-100 text-slate-600 mb-3"><Icon className="size-6" /></div>}
      <p className="font-medium text-slate-700">{title}</p>
      {text && <p className="mt-1 text-sm text-slate-500 max-w-sm">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export const Spinner = ({ className }) => <Loader2 className={cx('size-5 animate-spin text-slate-500', className)} />;

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="inline-flex max-w-full overflow-x-auto rounded-lg bg-slate-100 p-1 gap-1 no-scrollbar" role="group">
      {tabs.map((t) => (
        <button key={t.value} onClick={() => onChange(t.value)} aria-pressed={value === t.value}
          className={cx('shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition', value === t.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900')}>
          {t.label}{t.count != null && <span className="ml-1.5 text-xs text-slate-600">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

// ---------- Toasts ----------
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const remove = useCallback((id) => setItems((x) => x.filter((t) => t.id !== id)), []);
  const push = useCallback((text, type = 'success', opts = {}) => {
    const id = Math.random();
    setItems((x) => [...x, { id, text, type, ...opts }]);
    setTimeout(() => remove(id), opts.duration || (opts.action ? 7000 : 4000));
  }, [remove]);
  const ICON = { success: CheckCircle2, error: AlertCircle, info: Info };
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed inset-x-4 top-4 sm:inset-x-auto sm:top-auto sm:bottom-4 sm:right-4 z-[60] flex flex-col gap-2 sm:w-80" role="status" aria-live="polite">
        {items.map((t) => {
          const I = ICON[t.type] || Info;
          return (
            <div key={t.id} className="card animate-fade-in flex items-start gap-3 px-4 py-3 shadow-lg" role={t.type === 'error' ? 'alert' : undefined}>
              <I className={cx('size-5 shrink-0 mt-0.5', t.type === 'error' ? 'text-rose-500' : t.type === 'info' ? 'text-brand-500' : 'text-emerald-500')} aria-hidden="true" />
              <div className="flex-1 text-sm text-slate-700 min-w-0">
                {t.title && <p className="font-medium text-slate-900">{t.title}</p>}
                <p>{t.text}</p>
              </div>
              {t.action && <button onClick={() => { remove(t.id); t.action.onClick(); }} className="shrink-0 rounded-md px-2 py-1 -my-1 text-sm font-semibold text-brand-700 hover:bg-brand-50">{t.action.label}</button>}
              <button onClick={() => remove(t.id)} aria-label={tr('Stäng')} className="shrink-0 rounded-md p-1 -m-1 text-slate-500 hover:bg-slate-100 hover:text-slate-600"><X className="size-4" /></button>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}

export function Confirm({ open, onClose, onConfirm, title, text, confirmText = tr("Radera"), loading, tone = 'danger' }) {
  return (
    <Modal open={open} onClose={onClose} title={title}
      footer={<><Button variant="secondary" onClick={onClose}>{tr("Avbryt")}</Button><Button variant={tone} loading={loading} onClick={onConfirm}>{confirmText}</Button></>}>
      <p className="text-sm text-slate-600">{text}</p>
    </Modal>
  );
}
