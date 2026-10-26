import { Link } from 'react-router-dom';
import { Sparkles, RefreshCw, ExternalLink, Target, MessageSquareQuote, Building2, Copy } from 'lucide-react';
import { useApp } from '../lib/app.jsx';
import { Button, useToast } from './ui.jsx';
import { copyText } from '../lib/templates.js';
import { timeAgo } from '../lib/meta.jsx';
import { tr } from '../lib/i18n.js';

// Företagsinfo från "Berika": sammanfattning, säljvinkel, fakta och källor. Används i leadet och på företaget.
export default function CompanyInsight({ enrichment: e, companyName, configured, canEnrich, busy, onEnrich, companyLink }) {
  const { can } = useApp();
  const toast = useToast();
  if (!e) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center">
        <span className="mx-auto grid size-10 place-items-center rounded-xl bg-violet-50 text-violet-600"><Sparkles className="size-5" /></span>
        <p className="mt-3 font-medium text-slate-800">{tr('Ingen företagsinfo än')}</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">{tr('Berika hämtar uppgifter från Bolagsverket och företagets hemsida och sammanfattar vad {name} gör – med en säljvinkel för ditt första samtal.', { name: companyName || tr('företaget') })}</p>
        {configured ? (
          canEnrich && <Button className="mt-4" icon={Sparkles} loading={busy} onClick={onEnrich}>{busy ? tr('Hämtar…') : tr('Berika')}</Button>
        ) : (
          <p className="mt-4 text-xs text-slate-500">{can('integrations.manage')
            ? <>{tr('AI-berikning är inte uppsatt.')} <Link to="/settings" className="font-medium text-brand-600 hover:underline">{tr('Lägg in en OpenRouter-nyckel under Inställningar')}</Link></>
            : tr('AI-berikning är inte uppsatt. Be en administratör lägga in en OpenRouter-nyckel.')}</p>
        )}
      </div>
    );
  }
  const facts = [
    [tr('Bransch'), e.industry], [tr('Erbjudande'), e.offering], [tr('Kunder'), e.customers], [tr('Storlek'), e.size],
    [tr('Bolagsform'), e.facts?.form], [tr('Registrerat'), e.facts?.registered], [tr('Org.nr'), e.facts?.org_nr], [tr('Adress'), e.facts?.address],
  ].filter(([, v]) => v);
  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-gradient-to-br from-violet-50 to-brand-50/60 p-4">
        <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-violet-700"><Building2 className="size-3.5" />{tr('Om företaget')}</p>
        <p className="text-sm leading-relaxed text-slate-800">{e.summary}</p>
        {e.news && <p className="mt-2 text-sm text-slate-700"><span className="font-medium">{tr('Aktuellt:')}</span> {e.news}</p>}
      </div>
      {e.sales_angle && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-emerald-700"><Target className="size-3.5" />{tr('Säljvinkel')}</p>
          <p className="text-sm leading-relaxed text-slate-800">{e.sales_angle}</p>
          {e.opening_line && (
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-white/80 p-2.5">
              <MessageSquareQuote className="mt-0.5 size-4 shrink-0 text-emerald-600" />
              <p className="flex-1 text-sm italic text-slate-700">"{e.opening_line}"</p>
              <button title={tr('Kopiera')} onClick={async () => { if (await copyText(e.opening_line)) toast(tr('Texten är kopierad')); }} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Copy className="size-3.5" /></button>
            </div>
          )}
        </div>
      )}
      {facts.length > 0 && (
        <dl className="grid gap-x-4 gap-y-2 rounded-xl border border-slate-200 p-4 text-sm sm:grid-cols-2">
          {facts.map(([k, v]) => <div key={k} className="min-w-0"><dt className="text-xs text-slate-500">{k}</dt><dd className="text-slate-800">{v}</dd></div>)}
        </dl>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
        <span>{tr('Hämtad {when}', { when: timeAgo(e.enriched_at) })}{e.enriched_by && ` ${tr('av {name}', { name: e.enriched_by })}`}{e.via === 'claude' && ` · ${tr('via Claude')}`}</span>
        {(e.sources || []).filter((s) => !s.error).map((s, i) => s.url
          ? <a key={i} href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-brand-600 hover:underline">{s.label}<ExternalLink className="size-3" /></a>
          : <span key={i}>{s.label}</span>)}
        {companyLink && <Link to={companyLink} className="text-brand-600 hover:underline">{tr('Visa företaget')}</Link>}
        {configured && canEnrich && <Button size="sm" variant="ghost" icon={RefreshCw} loading={busy} className="ml-auto" onClick={onEnrich}>{tr('Uppdatera')}</Button>}
      </div>
      <p className="text-[11px] text-slate-400">{tr('Sammanfattat av AI utifrån källorna ovan – kontrollera viktiga uppgifter innan du använder dem.')}</p>
    </div>
  );
}
