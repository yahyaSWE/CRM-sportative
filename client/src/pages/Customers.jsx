import { useEffect, useState } from 'react';
import { Search, Star, ArrowUpDown, Phone, Mail } from 'lucide-react';
import { api, qs } from '../api.js';
import { useApp, useLive } from '../lib/app.jsx';
import { Card, PageHeader, Avatar, Empty, Spinner, Select, SourceBadge, cx } from '../components/ui.jsx';
import { NextStepCell, useRecordDrawers } from '../components/Records.jsx';
import { leadName, sek, formatDate } from '../lib/meta.jsx';

export default function Customers() {
  const { can, team, user } = useApp();
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [owner, setOwner] = useState(can('leads.view_all') ? '' : 'me');
  const [sort, setSort] = useState({ col: 'won_value', dir: 'desc' });
  const [data, setData] = useState(null);
  const load = () => api.get('/customers' + qs({ q: query, owner, sort: sort.col, dir: sort.dir })).then(setData);
  const { openLead, drawers } = useRecordDrawers(load);
  useEffect(() => { load(); }, [query, owner, sort]);
  useEffect(() => { const t = setTimeout(() => setQuery(q.trim()), 250); return () => clearTimeout(t); }, [q]);
  useLive(['lead', 'refresh'], () => load());

  const Th = ({ col, children, className }) => (
    <th className={cx('px-4 py-3 font-medium', className)}>
      {col ? <button onClick={() => setSort((s) => ({ col, dir: s.col === col && s.dir === 'desc' ? 'asc' : 'desc' }))}
        className={cx('inline-flex items-center gap-1 hover:text-slate-700', sort.col === col && 'text-slate-800')}>{children}<ArrowUpDown className="size-3" /></button> : children}
    </th>
  );

  return (
    <div>
      <PageHeader title="Kunder" subtitle={data ? `${data.total} kunder · ${sek(data.totalValue)} i vunna affärer` : 'Laddar…'}
        actions={can('leads.view_all') && (
          <Select value={owner} onChange={(e) => setOwner(e.target.value)} className="!w-auto">
            <option value="">Alla kunder</option><option value="me">Mina kunder</option>
            {team.filter((u) => u.id !== user.id).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
        )} />
      <Card className="overflow-hidden">
        <div className="p-3 border-b border-slate-100">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Sök kund på namn, företag, telefon, ort…" className="input pl-9" />
          </div>
        </div>
        <div className="overflow-x-auto scroll-thin">
          {!data ? <div className="py-16 grid place-items-center"><Spinner /></div> : !data.rows.length ? (
            <Empty icon={Star} title={query ? 'Inga kunder matchar' : 'Inga kunder än'} text="En kontakt blir kund när en affär markeras som vunnen." />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50/80 text-left text-xs text-slate-500 border-b border-slate-100">
                <tr><Th col="name">Kund</Th><Th>Kontakt</Th><Th col="won_value" className="text-right">Vunnet</Th><Th col="open_value" className="text-right">Pågående</Th><Th col="last_contact_at">Nästa steg</Th><Th>Ansvarig</Th><Th col="customer_since" className="text-right">Kund sedan</Th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.rows.map((c) => (
                  <tr key={c.id} onClick={() => openLead(c.id)} className="cursor-pointer hover:bg-slate-50/80">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="grid place-items-center size-9 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-semibold shrink-0">{(c.company || leadName(c)).slice(0, 2).toUpperCase()}</span>
                        <div className="min-w-0"><p className="font-medium text-slate-800 truncate">{c.company || leadName(c)}</p><p className="text-xs text-slate-500 flex items-center gap-1.5"><SourceBadge source={c.source} compact />{c.city}</p></div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <p className="text-slate-700">{[c.first_name, c.last_name].filter(Boolean).join(' ') || '—'}</p>
                      <div className="mt-0.5 flex gap-2 text-slate-500" onClick={(e) => e.stopPropagation()}>
                        {c.phone && <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 hover:text-brand-600"><Phone className="size-3" />{c.phone}</a>}
                        {c.email && <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 hover:text-brand-600" title={c.email}><Mail className="size-3" /></a>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right"><p className="font-semibold tabular-nums">{sek(c.won_value)}</p><p className="text-xs text-slate-400">{c.won_count} {c.won_count === 1 ? 'affär' : 'affärer'}</p></td>
                    <td className="px-4 py-3 text-right tabular-nums">{c.open_count ? <><p className="font-medium text-violet-700">{sek(c.open_value)}</p><p className="text-xs text-slate-400">{c.open_count} öppna</p></> : <span className="text-slate-300">—</span>}</td>
                    <td className="px-4 py-3 max-w-56"><NextStepCell step={c.next_step} lastContact={c.last_contact_at} status="customer" /></td>
                    <td className="px-4 py-3">{c.owner_name ? <span className="flex items-center gap-2"><Avatar name={c.owner_name} color={c.owner_color} size="xs" /><span className="text-slate-600">{c.owner_name.split(' ')[0]}</span></span> : '—'}</td>
                    <td className="px-4 py-3 text-right text-xs text-slate-500 whitespace-nowrap">{formatDate(c.customer_since)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
      {drawers}
    </div>
  );
}
