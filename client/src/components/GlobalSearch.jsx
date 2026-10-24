import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Briefcase, Star, ArrowRight } from 'lucide-react';
import { api } from '../api.js';
import { SourceBadge, cx } from './ui.jsx';
import { leadName, sek, STAGES } from '../lib/meta.jsx';

export const SEARCH_HINT = 'Namn, företag, telefon, e-post, ort, org.nr eller tagg';

// Sökfältet i toppen: grupperade träffar (kunder, leads, affärer), piltangenter och Enter för alla resultat.
export default function GlobalSearch() {
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const ref = useRef();
  const nav = useNavigate();

  useEffect(() => {
    const onKey = (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); ref.current?.focus(); ref.current?.select(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    setActive(-1);
    if (q.trim().length < 2) return setRes(null);
    const t = setTimeout(() => api.get(`/search?q=${encodeURIComponent(q.trim())}`).then(setRes).catch(() => {}), 160);
    return () => clearTimeout(t);
  }, [q]);

  const items = useMemo(() => !res ? [] : [
    ...res.customers.map((x) => ({ group: 'Kunder', path: `/leads/${x.id}`, x, kind: 'lead' })),
    ...res.leads.map((x) => ({ group: 'Leads', path: `/leads/${x.id}`, x, kind: 'lead' })),
    ...res.deals.map((x) => ({ group: 'Affärer', path: `/pipeline/${x.id}`, x, kind: 'deal' })),
  ], [res]);
  const total = res ? res.counts.customers + res.counts.leads + res.counts.deals : 0;
  const showAll = () => { setOpen(false); nav(`/search?q=${encodeURIComponent(q.trim())}`); ref.current?.blur(); };
  const go = (path) => { setOpen(false); setQ(''); nav(path); ref.current?.blur(); };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(items.length, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(-1, a - 1)); }
    else if (e.key === 'Enter' && q.trim().length >= 2) { e.preventDefault(); if (active >= 0 && active < items.length) go(items[active].path); else showAll(); }
    else if (e.key === 'Escape') { setOpen(false); ref.current?.blur(); }
  };

  let lastGroup = null;
  return (
    <div className="relative w-full max-w-lg">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
      <input ref={ref} value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKeyDown} placeholder="Sök kund, lead eller affär…"
        className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-14 text-sm outline-none focus:bg-white focus:border-brand-500 focus:ring-4 focus:ring-brand-100" />
      <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-slate-200 bg-white px-1.5 text-[10px] font-medium text-slate-400">Ctrl K</kbd>
      {open && q.trim().length < 2 && (
        <div className="absolute z-40 mt-2 w-full card shadow-xl px-4 py-3 text-xs text-slate-500 animate-fade-in">Sök på {SEARCH_HINT.toLowerCase()}.</div>
      )}
      {open && res && (
        <div className="absolute z-40 mt-2 w-full card shadow-xl py-2 animate-fade-in max-h-[70vh] overflow-y-auto scroll-thin">
          {!items.length && <p className="px-4 py-3 text-sm text-slate-500">Inga träffar på "{q}"</p>}
          {items.map((it, i) => {
            const header = it.group !== lastGroup;
            lastGroup = it.group;
            const n = { Kunder: res.counts.customers, Leads: res.counts.leads, Affärer: res.counts.deals }[it.group];
            const x = it.x;
            const stage = it.kind === 'deal' && STAGES.find((s) => s.key === x.stage);
            return (
              <div key={`${it.kind}-${x.id}`}>
                {header && <p className="flex justify-between px-4 pt-2 pb-1 text-[11px] font-semibold uppercase text-slate-400"><span>{it.group}</span><span className="font-normal normal-case">{n} st</span></p>}
                <button onMouseDown={() => go(it.path)} onMouseEnter={() => setActive(i)}
                  className={cx('flex w-full items-center gap-3 px-4 py-2 text-left', active === i ? 'bg-brand-50' : 'hover:bg-slate-50')}>
                  {it.kind === 'deal'
                    ? <span className="grid place-items-center size-6 rounded-md bg-violet-50 text-violet-600"><Briefcase className="size-3.5" /></span>
                    : it.group === 'Kunder' ? <span className="grid place-items-center size-6 rounded-md bg-emerald-50 text-emerald-600"><Star className="size-3.5" /></span>
                      : <SourceBadge source={x.source} compact />}
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-slate-800 truncate">{it.kind === 'deal' ? x.title : leadName(x)}</span>
                    <span className="block text-xs text-slate-500 truncate">
                      {it.kind === 'deal'
                        ? [[x.first_name, x.last_name].filter(Boolean).join(' '), x.owner_name].filter(Boolean).join(' · ')
                        : [x.company !== leadName(x) && x.company, x.phone, x.city].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  {it.kind === 'deal' && <span className="text-right text-xs"><span className="block font-medium text-slate-700">{sek(x.value)}</span><span className="text-slate-400">{stage?.label}</span></span>}
                </button>
              </div>
            );
          })}
          {total > 0 && (
            <button onMouseDown={showAll} onMouseEnter={() => setActive(items.length)}
              className={cx('mt-1 flex w-full items-center justify-between border-t border-slate-100 px-4 py-2.5 text-sm font-medium text-brand-600', active === items.length ? 'bg-brand-50' : 'hover:bg-slate-50')}>
              Visa alla {total} resultat<span className="flex items-center gap-1 text-xs text-slate-400">Enter<ArrowRight className="size-3.5" /></span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
