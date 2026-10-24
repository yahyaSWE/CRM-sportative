import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Search, Building2, ArrowUpDown, Plus, Star } from 'lucide-react';
import { api, qs } from '../api.js';
import { useApp, useLive } from '../lib/app.jsx';
import { Card, PageHeader, Avatar, Empty, Spinner, Tabs, Select, Button, Modal, Field, Input, useToast, cx } from '../components/ui.jsx';
import CompanyDrawer from '../components/CompanyDrawer.jsx';
import { sek, timeAgo } from '../lib/meta.jsx';

export default function Companies() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { can } = useApp();
  const [sp, setSp] = useSearchParams();
  const view = sp.get('view') || '';
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [owner, setOwner] = useState(can('leads.view_all') ? '' : 'me');
  const [sort, setSort] = useState({ col: view === 'customers' ? 'won_value' : 'name', dir: '' });
  const [data, setData] = useState(null);
  const [create, setCreate] = useState(null);
  const load = () => api.get('/companies' + qs({ q: query, owner, view, sort: sort.col, dir: sort.dir })).then(setData);
  useEffect(() => { load(); }, [query, owner, view, sort]);
  useEffect(() => { const t = setTimeout(() => setQuery(q.trim()), 250); return () => clearTimeout(t); }, [q]);
  useLive(['lead', 'refresh'], () => load());

  const save = async () => {
    try { const r = await api.post('/companies', create); setCreate(null); load(); nav(`/companies/${r.id}${window.location.search}`); }
    catch (e) { if (e.status === 409) toast('Företaget finns redan – öppnar det', 'info'); else toast(e.message, 'error'); }
  };
  const Th = ({ col, children, className }) => (
    <th className={cx('px-4 py-3 font-medium', className)}>
      {col ? <button onClick={() => setSort((s) => ({ col, dir: s.col === col && s.dir !== 'asc' ? 'asc' : s.col === col ? 'desc' : '' }))}
        className={cx('inline-flex items-center gap-1 hover:text-slate-700', sort.col === col && 'text-slate-800')}>{children}<ArrowUpDown className="size-3" /></button> : children}
    </th>
  );
  const c = data?.counts;

  return (
    <div>
      <PageHeader title="Företag" subtitle="Alla organisationer med deras kontaktpersoner och affärer"
        actions={<>
          {can('leads.view_all') && <Select value={owner} onChange={(e) => setOwner(e.target.value)} className="!w-auto"><option value="">Alla företag</option><option value="me">Mina företag</option></Select>}
          {can('leads.edit_own') && <Button icon={Plus} onClick={() => setCreate({ name: '', org_nr: '', website: '', city: '' })}>Nytt företag</Button>}
        </>} />
      <div className="mb-3">
        <Tabs value={view} onChange={(v) => setSp(v ? { view: v } : {}, { replace: true })} tabs={[
          { value: '', label: 'Alla', count: c?.total }, { value: 'customers', label: 'Kunder', count: c?.customers },
          { value: 'open', label: 'Med öppna affärer', count: c?.open }, { value: 'prospects', label: 'Prospekt', count: c?.prospects },
        ]} />
      </div>
      <Card className="overflow-hidden">
        <div className="p-3 border-b border-slate-100">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Sök företag, org.nr, ort, bransch eller kontaktperson…" className="input pl-9" />
          </div>
        </div>
        <div className="overflow-x-auto scroll-thin">
          {!data ? <div className="py-16 grid place-items-center"><Spinner /></div> : !data.rows.length ? (
            <Empty icon={Building2} title={query ? 'Inga företag matchar' : 'Inga företag här'} text="Företag skapas automatiskt när leads med företagsnamn, org.nr eller företagsmejl kommer in." />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50/80 text-left text-xs text-slate-500 border-b border-slate-100">
                <tr><Th col="name">Företag</Th><Th col="contacts">Kontaktpersoner</Th><Th col="won_value" className="text-right">Vunnet</Th><Th col="open_value" className="text-right">Pågående</Th><Th col="last_contact_at">Senaste kontakt</Th><Th>Ansvarig</Th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.rows.map((co) => (
                  <tr key={co.id} onClick={() => nav(`/companies/${co.id}${window.location.search}`)} className={cx('cursor-pointer hover:bg-slate-50/80', Number(id) === co.id && 'bg-brand-50/60')}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className={cx('grid place-items-center size-9 rounded-lg text-xs font-semibold shrink-0', co.won_count ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600')}>{co.name.slice(0, 2).toUpperCase()}</span>
                        <div className="min-w-0">
                          <p className="font-medium text-slate-800 truncate">{co.name}{co.won_count > 0 && <Star className="inline ml-1.5 size-3.5 text-emerald-500" />}</p>
                          <p className="text-xs text-slate-500 truncate">{[co.org_nr, co.city, co.industry].filter(Boolean).join(' · ') || '—'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs"><p className="font-medium text-slate-700">{co.contact_count} st</p><p className="text-slate-500 truncate max-w-56">{co.contact_names}</p></td>
                    <td className="px-4 py-3 text-right tabular-nums">{co.won_value ? <span className="font-semibold">{sek(co.won_value)}</span> : <span className="text-slate-300">—</span>}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{co.open_count ? <><p className="font-medium text-violet-700">{sek(co.open_value)}</p><p className="text-xs text-slate-400">{co.open_count} öppna</p></> : <span className="text-slate-300">—</span>}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{co.last_contact_at ? timeAgo(co.last_contact_at) : 'Ingen kontakt loggad'}</td>
                    <td className="px-4 py-3">{co.owner_name ? <span className="flex items-center gap-2"><Avatar name={co.owner_name} color={co.owner_color} size="xs" /><span className="text-xs text-slate-600">{co.owner_name.split(' ')[0]}</span></span> : <span className="text-slate-300">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
      {id && <CompanyDrawer id={Number(id)} onClose={() => nav(`/companies${window.location.search}`)} onChanged={load} />}
      <Modal open={!!create} onClose={() => setCreate(null)} title="Nytt företag" footer={<><Button variant="secondary" onClick={() => setCreate(null)}>Avbryt</Button><Button onClick={save}>Skapa</Button></>}>
        {create && (
          <div className="grid grid-cols-2 gap-4">
            <Field label="Namn" className="col-span-2"><Input value={create.name} onChange={(e) => setCreate({ ...create, name: e.target.value })} autoFocus /></Field>
            <Field label="Organisationsnummer"><Input value={create.org_nr} onChange={(e) => setCreate({ ...create, org_nr: e.target.value })} placeholder="556xxx-xxxx" /></Field>
            <Field label="Ort"><Input value={create.city} onChange={(e) => setCreate({ ...create, city: e.target.value })} /></Field>
            <Field label="Hemsida" className="col-span-2"><Input value={create.website} onChange={(e) => setCreate({ ...create, website: e.target.value })} placeholder="foretaget.se" /></Field>
          </div>
        )}
      </Modal>
    </div>
  );
}
