import { useEffect, useState, createContext, useContext, useCallback } from 'react';
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

export function Button({ variant = 'primary', size = 'md', loading, icon: Icon, className, children, ...props }) {
  return (
    <button
      className={cx('inline-flex items-center justify-center gap-2 rounded-lg font-medium transition disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap',
        size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2 text-sm', BTN[variant], className)}
      disabled={loading || props.disabled} {...props}>
      {loading ? <Loader2 className="size-4 animate-spin" /> : Icon && <Icon className={size === 'sm' ? 'size-3.5' : 'size-4'} />}
      {children}
    </button>
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
          {detail && <span className="block text-xs text-slate-400 truncate max-w-48">{detail}</span>}
        </span>
      )}
    </span>
  );
}

export function Avatar({ name = '?', color = '#94a3b8', size = 'md' }) {
  const initials = name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  const sz = { xs: 'size-5 text-[9px]', sm: 'size-7 text-[11px]', md: 'size-8 text-xs', lg: 'size-11 text-sm' }[size];
  return <span className={cx('inline-grid place-items-center rounded-full font-semibold text-white shrink-0', sz)} style={{ background: color }} title={name}>{initials}</span>;
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

export function Modal({ open, onClose, title, description, children, footer, wide }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 backdrop-blur-[2px] p-4 sm:p-8" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cx('card w-full animate-fade-in shadow-xl my-auto', wide ? 'max-w-3xl' : 'max-w-lg')}>
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"><X className="size-5" /></button>
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
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
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
      {Icon && <div className="grid place-items-center size-12 rounded-xl bg-slate-100 text-slate-400 mb-3"><Icon className="size-6" /></div>}
      <p className="font-medium text-slate-700">{title}</p>
      {text && <p className="mt-1 text-sm text-slate-500 max-w-sm">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export const Spinner = ({ className }) => <Loader2 className={cx('size-5 animate-spin text-slate-400', className)} />;

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
    <div className="inline-flex rounded-lg bg-slate-100 p-1 gap-1">
      {tabs.map((t) => (
        <button key={t.value} onClick={() => onChange(t.value)}
          className={cx('rounded-md px-3 py-1.5 text-sm font-medium transition', value === t.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
          {t.label}{t.count != null && <span className="ml-1.5 text-xs text-slate-400">{t.count}</span>}
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
  const push = useCallback((text, type = 'success', opts = {}) => {
    const id = Math.random();
    setItems((x) => [...x, { id, text, type, ...opts }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), opts.duration || 4000);
  }, []);
  const ICON = { success: CheckCircle2, error: AlertCircle, info: Info };
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 w-80">
        {items.map((t) => {
          const I = ICON[t.type] || Info;
          return (
            <div key={t.id} className="card animate-fade-in flex items-start gap-3 px-4 py-3 shadow-lg">
              <I className={cx('size-5 shrink-0 mt-0.5', t.type === 'error' ? 'text-rose-500' : t.type === 'info' ? 'text-brand-500' : 'text-emerald-500')} />
              <div className="text-sm text-slate-700 min-w-0">
                {t.title && <p className="font-medium text-slate-900">{t.title}</p>}
                <p>{t.text}</p>
              </div>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}

export function Confirm({ open, onClose, onConfirm, title, text, confirmText = tr("Radera"), loading }) {
  return (
    <Modal open={open} onClose={onClose} title={title}
      footer={<><Button variant="secondary" onClick={onClose}>{tr("Avbryt")}</Button><Button variant="danger" loading={loading} onClick={onConfirm}>{confirmText}</Button></>}>
      <p className="text-sm text-slate-600">{text}</p>
    </Modal>
  );
}
