import { Mail, Globe, UserPlus, Upload, Crosshair } from 'lucide-react';
import { tr, locale } from './i18n.js';

// Etiketterna översätts när modulen laddas; språket är redan bestämt då (ett byte laddar om sidan).
const label = (sv) => ({ label: tr(sv) });

export const FacebookIcon = ({ className = 'size-4' }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
    <path d="M24 12.07C24 5.41 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.04V9.41c0-3.02 1.8-4.7 4.54-4.7 1.31 0 2.68.24 2.68.24v2.97h-1.5c-1.5 0-1.96.93-1.96 1.89v2.26h3.32l-.53 3.5h-2.8V24C19.62 23.1 24 18.1 24 12.07" />
  </svg>
);

export const InstagramIcon = ({ className = 'size-4' }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <rect x="2" y="2" width="20" height="20" rx="5.5" />
    <circle cx="12" cy="12" r="4.2" />
    <circle cx="17.6" cy="6.4" r="1.1" fill="currentColor" stroke="none" />
  </svg>
);

export const SOURCES = {
  facebook: { ...label('Facebook'), icon: FacebookIcon, color: '#1877F2', bg: 'bg-blue-50 text-[#1877F2]' },
  instagram: { ...label('Instagram'), icon: InstagramIcon, color: '#E1306C', bg: 'bg-pink-50 text-[#E1306C]' },
  email: { ...label('E-post'), icon: Mail, color: '#f59e0b', bg: 'bg-amber-50 text-amber-600' },
  webform: { ...label('Webbformulär'), icon: Globe, color: '#10b981', bg: 'bg-emerald-50 text-emerald-600' },
  prospecting: { ...label('Prospektering'), icon: Crosshair, color: '#0891b2', bg: 'bg-cyan-50 text-cyan-700' },
  manual: { ...label('Manuell'), icon: UserPlus, color: '#64748b', bg: 'bg-slate-100 text-slate-600' },
  import: { ...label('Import'), icon: Upload, color: '#8b5cf6', bg: 'bg-violet-50 text-violet-600' },
};

export const STATUSES = {
  new: { ...label('Ny'), cls: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20' },
  contacted: { ...label('Kontaktad'), cls: 'bg-sky-50 text-sky-700 ring-sky-600/20' },
  qualified: { ...label('Kvalificerad'), cls: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' },
  unqualified: { ...label('Ej aktuell'), cls: 'bg-slate-100 text-slate-600 ring-slate-500/20' },
  converted: { ...label('Konverterad'), cls: 'bg-violet-50 text-violet-700 ring-violet-600/20' },
};

export const STAGES = [
  { key: 'qualified', ...label('Kvalificerad'), prob: 0.1, color: '#94a3b8' },
  { key: 'contact', ...label('Möte bokat'), prob: 0.3, color: '#38bdf8' },
  { key: 'proposal', ...label('Offert skickad'), prob: 0.5, color: '#818cf8' },
  { key: 'negotiation', ...label('Förhandling'), prob: 0.75, color: '#f59e0b' },
  { key: 'won', ...label('Vunnen'), prob: 1, color: '#10b981' },
  { key: 'lost', ...label('Förlorad'), prob: 0, color: '#f43f5e' },
];

// Förlustorsakerna sparas på svenska i databasen; visa dem med tr(reason).
export const LOST_REASONS = ['Pris', 'Valde en konkurrent', 'Ingen respons', 'Fel målgrupp', 'Fel tidpunkt', 'Annat'];

export const daysSince = (s) => (s ? Math.floor((Date.now() - new Date(String(s).replace(' ', 'T') + 'Z').getTime()) / 864e5) : 0);

export const leadName = (l) => [l.first_name, l.last_name].filter(Boolean).join(' ') || l.company || l.email || l.phone || tr('Okänd kontakt');

export const sek = (v) => new Intl.NumberFormat(locale(), { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(v || 0);
export const num = (v) => new Intl.NumberFormat(locale()).format(v || 0);
export const pct = (v) => `${Math.round((v || 0) * 100)} %`;

const toDate = (s) => (s instanceof Date ? s : new Date(String(s).includes('T') ? s : s.replace(' ', 'T') + 'Z'));

export function timeAgo(s) {
  if (!s) return '';
  const diff = (Date.now() - toDate(s).getTime()) / 1000;
  if (diff < 60) return tr('nyss');
  if (diff < 3600) return tr('{0} min sedan', { 0: Math.floor(diff / 60) });
  if (diff < 86400) return tr('{0} tim sedan', { 0: Math.floor(diff / 3600) });
  if (diff < 86400 * 7) return tr('{0} d sedan', { 0: Math.floor(diff / 86400) });
  return formatDate(s);
}

export const formatDate = (s, opts = { day: 'numeric', month: 'short', year: 'numeric' }) => (s ? toDate(s).toLocaleDateString(locale(), opts) : '');
export const formatDateTime = (s) => (s ? toDate(s).toLocaleString(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

// text = full etikett, short = utan 'försenad'-tillägget (för smala ytor).
export function dueLabel(s) {
  if (!s) return { text: tr('Inget datum'), short: tr('Inget datum'), cls: 'text-slate-400' };
  const d = toDate(s);
  const days = Math.floor((new Date(d).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 864e5);
  const time = d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
  const dayMonth = formatDate(s, { day: 'numeric', month: 'short' });
  if (d < new Date()) {
    return days === 0
      ? { text: tr('Idag {0} · försenad', { 0: time }), short: tr('Idag {0}', { 0: time }), cls: 'text-rose-600' }
      : { text: tr('Försenad · {0}', { 0: dayMonth }), short: tr('Försenad · {0}', { 0: dayMonth }), cls: 'text-rose-600' };
  }
  if (days === 0) return { text: tr('Idag {0}', { 0: time }), short: tr('Idag {0}', { 0: time }), cls: 'text-amber-600' };
  if (days === 1) return { text: tr('Imorgon {0}', { 0: time }), short: tr('Imorgon {0}', { 0: time }), cls: 'text-slate-600' };
  const other = formatDate(s, { weekday: 'short', day: 'numeric', month: 'short' });
  return { text: other, short: other, cls: 'text-slate-500' };
}

// SQLite-datum (UTC) från lokal datetime-local-input
export const toSqlDate = (local) => (local ? new Date(local).toISOString().slice(0, 19).replace('T', ' ') : null);
