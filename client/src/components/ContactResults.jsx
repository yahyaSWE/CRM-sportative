import { PhoneCall, Mail, CheckCircle2, PhoneMissed, Clock, Send } from 'lucide-react';
import { Card, Avatar, cx } from './ui.jsx';
import { num, pct } from '../lib/meta.jsx';
import { tr } from '../lib/i18n.js';

const rate = (a, b) => (b ? a / b : 0);

// Kontaktresultat för perioden: tratten kontaktade → svarade → kvalificerade, svarsfrekvens per kanal och per säljare.
// Tratten är ett mått (antal) i en färgskala – ljus till mörk – och siffrorna står alltid i text bredvid stapeln.
export default function ContactResults({ data, days }) {
  const steps = [
    { key: 'contacted', label: tr('Kontaktade'), value: data.contacted, bar: 'bg-indigo-300', note: tr('leads med status Kontaktad eller längre') },
    { key: 'answered', label: tr('Svarade'), value: data.answered, bar: 'bg-indigo-500', note: tr('{p} av kontaktade', { p: pct(rate(data.answered, data.contacted)) }) },
    { key: 'qualified', label: tr('Kvalificerade'), value: data.qualified, bar: 'bg-indigo-700', note: tr('{p} av de som svarade', { p: pct(rate(data.qualified, data.answered)) }) },
  ];
  const channel = (k) => data.channels.find((c) => c.channel === k) || { attempts: 0, answered: 0, no_answer: 0, leads: 0 };
  const empty = !data.contacted;

  return (
    <Card className="p-5">
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="font-semibold text-slate-900">{tr('Kontaktresultat')}</h3>
          <p className="text-xs text-slate-500">{tr('Leads som kontaktats senaste {days} dagarna – hur många svarade och gick vidare', { days })}</p>
        </div>
        {!empty && <p className="text-sm text-slate-600">{tr('Från kontakt till kvalificerad:')} <span className="font-semibold tabular-nums text-slate-900">{pct(rate(data.qualified, data.contacted))}</span></p>}
      </div>

      {empty ? (
        <p className="rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">{tr('Inga kontaktade leads under perioden. Sätt status Kontaktad eller logga samtal och mejl så fylls statistiken på.')}</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
          {/* Tratten */}
          <div className="space-y-4">
            {steps.map((s) => (
              <div key={s.key} className="grid grid-cols-[110px_1fr_auto] items-center gap-3" title={`${s.label}: ${s.value} (${s.note})`}>
                <span className="text-sm text-slate-700">{s.label}</span>
                <div className="h-8 overflow-hidden rounded-md bg-slate-50">
                  <div className={cx('h-full rounded-r-[4px]', s.bar)} style={{ width: `${Math.max(2, rate(s.value, data.contacted) * 100)}%` }} />
                </div>
                <span className="w-28 text-right">
                  <span className="block text-lg font-semibold leading-tight tabular-nums text-slate-900">{num(s.value)}</span>
                  <span className="block text-[11px] text-slate-500">{s.note}</span>
                </span>
              </div>
            ))}
          </div>

          {/* Per kanal */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            {[['call', PhoneCall, tr('Telefon'), tr('samtal')], ['email', Mail, tr('Mejl'), tr('mejl')]].map(([k, Icon, label, unit]) => {
              const c = channel(k);
              const pending = c.attempts - c.answered - c.no_answer;
              return (
                <div key={k} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center gap-2">
                    <span className="grid size-7 place-items-center rounded-md bg-slate-100 text-slate-600"><Icon className="size-4" /></span>
                    <span className="text-sm font-medium text-slate-800">{label}</span>
                    <span className="ml-auto text-right">
                      <span className="block text-lg font-semibold leading-tight tabular-nums text-slate-900">{pct(rate(c.answered, c.attempts))}</span>
                      <span className="block text-[11px] text-slate-500">{tr('svarsfrekvens')}</span>
                    </span>
                  </div>
                  {/* Fördelning av försöken: svarade / inget svar / inväntar (med etiketter, inte bara färg) */}
                  <div className="mt-2.5 flex h-2 gap-0.5 overflow-hidden rounded-full bg-slate-100" title={`${c.answered} ${tr('svarade')} · ${c.no_answer} ${tr('inget svar')}${pending ? ` · ${pending} ${tr('inväntar/ej angivet')}` : ''}`}>
                    {c.answered > 0 && <div className="bg-emerald-500" style={{ width: `${rate(c.answered, c.attempts) * 100}%` }} />}
                    {c.no_answer > 0 && <div className="bg-slate-400" style={{ width: `${rate(c.no_answer, c.attempts) * 100}%` }} />}
                  </div>
                  <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
                    <span className="inline-flex items-center gap-1"><Send className="size-3" />{num(c.attempts)} {unit} · {num(c.leads)} {tr('leads')}</span>
                    <span className="inline-flex items-center gap-1"><CheckCircle2 className="size-3 text-emerald-600" />{num(c.answered)} {tr('svarade')}</span>
                    <span className="inline-flex items-center gap-1"><PhoneMissed className="size-3" />{num(c.no_answer)} {tr('inget svar')}</span>
                    {pending > 0 && <span className="inline-flex items-center gap-1"><Clock className="size-3 text-amber-600" />{num(pending)} {tr('inväntar/ej angivet')}</span>}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {data.unlogged > 0 && <p className="mt-4 text-xs text-slate-500">{tr('{n} av de kontaktade saknar loggat samtal eller mejl och syns därför inte per kanal.', { n: data.unlogged })}</p>}

      {/* Per säljare (för den som ser teamets siffror) */}
      {data.perUser.length > 0 && (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 text-left text-xs text-slate-500">
              <tr>
                <th className="py-2 pr-3 font-medium">{tr('Säljare')}</th>
                <th className="py-2 px-3 text-right font-medium">{tr('Kontaktade')}</th>
                <th className="py-2 px-3 text-right font-medium">{tr('Svarade')}</th>
                <th className="py-2 px-3 text-right font-medium">{tr('Svarsfrekvens')}</th>
                <th className="py-2 px-3 text-right font-medium">{tr('Kvalificerade')}</th>
                <th className="py-2 pl-3 text-right font-medium">{tr('Av svarade')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {data.perUser.map((u) => (
                <tr key={u.id}>
                  <td className="py-2 pr-3"><span className="flex items-center gap-2"><Avatar name={u.name} color={u.color} size="xs" />{u.name}</span></td>
                  <td className="py-2 px-3 text-right tabular-nums">{num(u.contacted)}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{num(u.answered)}</td>
                  <td className="py-2 px-3 text-right tabular-nums font-medium">{pct(rate(u.answered, u.contacted))}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{num(u.qualified)}</td>
                  <td className="py-2 pl-3 text-right tabular-nums font-medium">{pct(rate(u.qualified, u.answered))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
