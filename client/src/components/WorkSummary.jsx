import { Link } from 'react-router-dom';
import { PhoneCall, Mail, StickyNote, Send, BadgeCheck, CheckSquare, CalendarPlus, CalendarCheck, UserPlus, Trophy, Activity as ActivityIcon } from 'lucide-react';
import { Card, Avatar, cx } from './ui.jsx';
import { num, leadName } from '../lib/meta.jsx';
import { tr, translateStored, locale } from '../lib/i18n.js';

// Det säljaren gjort under perioden. Siffrorna kommer från tidslinjen: loggade samtal och mejl, statusbyten,
// avbockade uppgifter, möten och nya leads.
const TILES = [
  { key: 'calls', label: 'Samtal', icon: PhoneCall, sub: (w) => tr('{n} svarade', { n: w.calls_answered }) },
  { key: 'emails', label: 'Mejl', icon: Mail },
  { key: 'notes', label: 'Anteckningar', icon: StickyNote },
  { key: 'contacted', label: 'Kontaktade leads', icon: Send },
  { key: 'qualified', label: 'Kvalificerade', icon: BadgeCheck },
  { key: 'tasks_done', label: 'Uppgifter klara', icon: CheckSquare },
  { key: 'meetings_booked', label: 'Möten bokade', icon: CalendarPlus },
  { key: 'meetings_held', label: 'Möten hållna', icon: CalendarCheck },
  { key: 'leads_created', label: 'Nya leads', icon: UserPlus },
  { key: 'deals_won', label: 'Vunna affärer', icon: Trophy },
];
const COLUMNS = ['calls', 'emails', 'contacted', 'qualified', 'tasks_done', 'meetings_booked', 'leads_created'];
const LOG_ICON = { call: PhoneCall, email: Mail, note: StickyNote, task: CheckSquare, meeting: CalendarCheck };

const clock = (s) => new Date(String(s).replace(' ', 'T') + 'Z').toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });

function logText(a) {
  if (a.type === 'task') return tr('Klar: {t}', { t: a.content });
  if (a.type === 'call') return a.content || tr('Samtal');
  if (a.type === 'email') return a.content?.split('\n')[0] || tr('Mejl');
  return ['system', 'meeting'].includes(a.type) ? translateStored(a.content) : a.content;
}

export default function WorkSummary({ data, days }) {
  const today = days === 'today';
  const w = data.mine;
  const total = TILES.reduce((n, t) => n + (w[t.key] || 0), 0);
  const shown = TILES.filter((t) => w[t.key] > 0);
  const zero = TILES.filter((t) => !w[t.key]);

  return (
    <Card className="p-5">
      <div className="mb-4">
        <h3 className="font-semibold text-slate-900">{today ? tr('Ditt arbete idag') : tr('Ditt arbete senaste {days} dagarna', { days })}</h3>
        <p className="text-xs text-slate-500">{tr('Det du loggat, bockat av och bokat')}</p>
      </div>

      <div className={cx('grid gap-5', today && 'xl:grid-cols-[2fr_1fr]')}>
        <div className="min-w-0 content-start">
          {total === 0 ? (
            <p className="rounded-lg bg-slate-50 px-4 py-6 text-sm text-slate-600">{today ? tr('Inget loggat än idag. Ring, mejla eller bocka av en uppgift så syns det här.') : tr('Inget loggat under perioden.')}</p>
          ) : (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-5">
              {shown.map(({ key, label, icon: Icon, sub }) => (
                <div key={key}>
                  <dt className="flex items-center gap-1.5 text-xs text-slate-600"><Icon className="size-3.5 text-brand-600" aria-hidden="true" />{tr(label)}</dt>
                  <dd className="mt-0.5 text-2xl font-semibold tabular-nums text-slate-900">{num(w[key])}</dd>
                  {sub && <dd className="text-xs text-slate-500">{sub(w)}</dd>}
                </div>
              ))}
            </dl>
          )}
          {total > 0 && zero.length > 0 && <p className="mt-4 text-xs text-slate-500">{tr('Inget ännu:')} {zero.map((t) => tr(t.label).toLowerCase()).join(', ')}</p>}
        </div>

        {today && (
          <div className="min-w-0">
            <h4 className="mb-1 px-2 text-sm font-medium text-slate-700">{tr('Dagens logg')}</h4>
            {!data.log.length ? (
              <p className="px-2 text-sm text-slate-500">{tr('Här listas det du gör under dagen.')}</p>
            ) : (
              <ul className="max-h-72 space-y-0.5 overflow-y-auto overflow-x-hidden">
                {data.log.map((a) => {
                  const Icon = LOG_ICON[a.type] || ActivityIcon;
                  const name = a.lead_id ? leadName(a) : null;
                  const row = (
                    <>
                      <span className="w-11 shrink-0 pt-0.5 text-xs tabular-nums text-slate-500">{clock(a.at)}</span>
                      <Icon className={cx('mt-0.5 size-4 shrink-0', a.outcome === 'answered' ? 'text-emerald-600' : 'text-slate-500')} aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-slate-700">{logText(a)}</span>
                        {name && <span className="block truncate text-xs text-slate-500">{[name, a.company && a.company !== name ? a.company : null].filter(Boolean).join(' · ')}</span>}
                      </span>
                    </>
                  );
                  return (
                    <li key={a.id}>
                      {a.lead_id
                        ? <Link to={`/leads/${a.lead_id}`} className="flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-slate-50">{row}</Link>
                        : <div className="flex items-start gap-2 px-2 py-1.5">{row}</div>}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>

      {data.perUser.length > 0 && (
        <details className="group mt-5 border-t border-slate-100 pt-3">
          <summary className="cursor-pointer select-none rounded-md py-1 text-sm font-medium text-brand-700 hover:text-brand-800">{tr('Visa per säljare ({n})', { n: data.perUser.length })}</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                <th className="py-2 pr-3 font-medium">{tr('Säljare')}</th>
                {COLUMNS.map((c) => <th key={c} className="px-3 py-2 text-right font-medium whitespace-nowrap">{tr(TILES.find((t) => t.key === c).label)}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.perUser.map((u) => (
                <tr key={u.id}>
                  <td className="py-2.5 pr-3"><div className="flex items-center gap-2"><Avatar name={u.name} color={u.color} size="sm" /><span className="font-medium text-slate-800 whitespace-nowrap">{u.name}</span></div></td>
                  {COLUMNS.map((c) => <td key={c} className={cx('px-3 py-2.5 text-right tabular-nums', u[c] ? 'text-slate-800' : 'text-slate-500')}>{u[c]}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </details>
      )}
    </Card>
  );
}
