import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, Star, Briefcase, Users, Building2 } from 'lucide-react';
import { api } from '../api.js';
import { Card, PageHeader, SourceBadge, StatusBadge, Avatar, Empty, Spinner } from '../components/ui.jsx';
import { useRecordDrawers } from '../components/Records.jsx';
import { SEARCH_HINT } from '../components/GlobalSearch.jsx';
import { leadName, sek, STAGES } from '../lib/meta.jsx';

function Section({ icon: Icon, title, count, children }) {
  if (!count) return null;
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100"><Icon className="size-4 text-slate-400" /><h2 className="font-semibold text-slate-900">{title}</h2><span className="text-sm text-slate-400">{count}</span></div>
      <div className="divide-y divide-slate-100">{children}</div>
    </Card>
  );
}

export default function SearchResults() {
  const [sp, setSp] = useSearchParams();
  const q = sp.get('q') || '';
  const [input, setInput] = useState(q);
  const [res, setRes] = useState(null);
  const load = () => (q.length >= 2 ? api.get(`/search?all=1&q=${encodeURIComponent(q)}`).then(setRes) : setRes(null));
  const { openLead, openDeal, openCompany, drawers } = useRecordDrawers(load);
  useEffect(() => { setInput(q); setRes(null); load(); }, [q]);

  const LeadRow = ({ l }) => (
    <button onClick={() => openLead(l.id)} className="flex w-full items-center gap-4 px-5 py-3 text-left hover:bg-slate-50">
      <SourceBadge source={l.source} compact />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-slate-800 truncate">{leadName(l)}</span>
        <span className="block text-xs text-slate-500 truncate">{[l.company !== leadName(l) && l.company, l.email, l.phone, l.city].filter(Boolean).join(' · ')}</span>
      </span>
      <StatusBadge status={l.status} />
      {l.owner_name ? <Avatar name={l.owner_name} color={l.owner_color} size="sm" /> : <span className="size-7" />}
    </button>
  );

  const total = res ? res.counts.companies + res.counts.leads + res.counts.deals : 0;
  return (
    <div className="max-w-4xl space-y-5">
      <PageHeader title="Sök" subtitle={SEARCH_HINT} />
      <form onSubmit={(e) => { e.preventDefault(); setSp({ q: input.trim() }); }} className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-5 text-slate-400" />
        <input autoFocus value={input} onChange={(e) => setInput(e.target.value)} className="input !py-3 !pl-11 text-base" placeholder="Sök kund, lead eller affär…" />
      </form>
      {q.length >= 2 && !res && <Spinner />}
      {res && !total && <Card><Empty icon={Search} title={`Inga träffar på "${q}"`} text="Prova en del av namnet, ett telefonnummer eller företagets ort." /></Card>}
      {res && (
        <>
          <Section icon={Building2} title="Företag" count={res.counts.companies}>
            {res.companies.map((c) => (
              <button key={c.id} onClick={() => openCompany(c.id)} className="flex w-full items-center gap-4 px-5 py-3 text-left hover:bg-slate-50">
                <span className={`grid place-items-center size-7 rounded-md ${c.is_customer ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"}`}>{c.is_customer ? <Star className="size-4" /> : <Building2 className="size-4" />}</span>
                <span className="min-w-0 flex-1"><span className="block text-sm font-medium text-slate-800 truncate">{c.name}</span>
                  <span className="block text-xs text-slate-500 truncate">{[c.org_nr, c.city, `${c.contact_count} kontakter`].filter(Boolean).join(" · ")}</span></span>
                {c.is_customer ? <span className="text-xs font-medium text-emerald-600">Kund</span> : null}
              </button>
            ))}
          </Section>
          <Section icon={Users} title="Kontakter" count={res.counts.leads}>{res.leads.map((l) => <LeadRow key={l.id} l={l} />)}</Section>
          <Section icon={Briefcase} title="Affärer" count={res.counts.deals}>
            {res.deals.map((d) => {
              const st = STAGES.find((s) => s.key === d.stage);
              return (
                <button key={d.id} onClick={() => openDeal(d.id)} className="flex w-full items-center gap-4 px-5 py-3 text-left hover:bg-slate-50">
                  <span className="grid place-items-center size-7 rounded-md bg-violet-50 text-violet-600"><Briefcase className="size-4" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-slate-800 truncate">{d.title}</span>
                    <span className="block text-xs text-slate-500 truncate">{[[d.first_name, d.last_name].filter(Boolean).join(' '), d.owner_name].filter(Boolean).join(' · ')}</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-xs text-slate-600"><span className="size-2 rounded-full" style={{ background: st?.color }} />{st?.label}</span>
                  <span className="w-24 text-right text-sm font-medium tabular-nums">{sek(d.value)}</span>
                </button>
              );
            })}
          </Section>
        </>
      )}
      {drawers}
    </div>
  );
}
