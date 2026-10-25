import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Search, Download, Upload, Users, Trash2, UserCheck, Tag, Filter, ChevronLeft, ChevronRight, ArrowUpDown, X } from 'lucide-react';
import { api, qs } from '../api.js';
import { useApp, useLive } from '../lib/app.jsx';
import { Button, Card, PageHeader, SourceBadge, StatusBadge, Avatar, ScoreBar, Empty, Spinner, Select, Modal, Tabs, useToast, Confirm, cx } from '../components/ui.jsx';
import { SOURCES, STATUSES, leadName, timeAgo } from '../lib/meta.jsx';
import LeadDrawer from '../components/LeadDrawer.jsx';
import { NextStepCell } from '../components/Records.jsx';
import { tr } from '../lib/i18n.js';

function parseCsv(text) {
  const sep = (text.split('\n')[0].match(/;/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows.filter((r) => r.some((x) => x.trim()));
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.replace(/^﻿/, '').trim(), r[i]?.trim()])));
}

export default function Leads() {
  const { id } = useParams();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const { team, can } = useApp();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [q, setQ] = useState(sp.get('q') || '');
  const [flash, setFlash] = useState(new Set());
  const [assignOpen, setAssignOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [importRows, setImportRows] = useState(null);
  const fileRef = useRef();

  const filters = useMemo(() => ({
    status: sp.get('status') || '', source: sp.get('source') || '', owner: sp.get('owner') || '', tag: sp.get('tag') || '', view: sp.get('view') || '',
    sort: sp.get('sort') || 'created_at', dir: sp.get('dir') || 'desc', page: sp.get('page') || '1', q: sp.get('q') || '',
  }), [sp]);
  const setFilter = (k, v) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); if (k !== 'page') n.delete('page'); setSp(n, { replace: true }); };

  const load = () => api.get('/leads' + qs({ ...filters, limit: 25 })).then(setData).catch((e) => toast(e.message, 'error'));
  useEffect(() => { load(); setSelected(new Set()); }, [filters]);
  useEffect(() => { const t = setTimeout(() => q !== filters.q && setFilter('q', q), 250); return () => clearTimeout(t); }, [q]);
  useLive(['lead', 'refresh'], (d, type) => {
    load();
    if (type === 'lead' && d.type === 'created') { setFlash((s) => new Set(s).add(d.lead.id)); setTimeout(() => setFlash(new Set()), 2500); }
  });

  const toggle = (lid) => setSelected((s) => { const n = new Set(s); n.has(lid) ? n.delete(lid) : n.add(lid); return n; });
  const allOnPage = data?.rows.length > 0 && data.rows.every((r) => selected.has(r.id));
  const bulk = async (action, value) => {
    try {
      const r = await api.post('/leads/bulk', { ids: [...selected], action, value });
      toast(tr("{0} leads uppdaterade", { 0: r.updated })); setSelected(new Set()); load();
    } catch (e) { toast(e.message, 'error'); }
  };
  const sortBy = (col) => { const n = new URLSearchParams(sp); n.set('sort', col); n.set('dir', filters.sort === col && filters.dir === 'desc' ? 'asc' : 'desc'); setSp(n, { replace: true }); };
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
  const activeFilters = ['status', 'source', 'owner', 'tag'].filter((k) => filters[k]).length;

  const onFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const rows = parseCsv(await file.text());
    e.target.value = '';
    if (!rows.length) return toast(tr("Hittade inga rader i filen"), 'error');
    setImportRows(rows);
  };
  const doImport = async () => {
    try { const r = await api.post('/leads/import', { rows: importRows }); toast(tr("{0} leads importerade, {1} hoppades över", { 0: r.created, 1: r.skipped })); setImportRows(null); load(); }
    catch (e) { toast(e.message, 'error'); }
  };

  const Th = ({ col, children, className }) => (
    <th className={cx('px-4 py-3 font-medium', className)}>
      {col ? <button onClick={() => sortBy(col)} className={cx('inline-flex items-center gap-1 hover:text-slate-700', filters.sort === col && 'text-slate-800')}>{children}<ArrowUpDown className="size-3" /></button> : children}
    </th>
  );

  return (
    <div>
      <PageHeader title={tr("Leads")} subtitle={data ? `${data.total} leads${activeFilters || filters.q ? tr(" matchar filtret") : ' totalt'}` : tr("Laddar…")}
        actions={<>
          {can('leads.edit_own') && <><input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} /><Button variant="secondary" icon={Upload} onClick={() => fileRef.current.click()}>{tr("Importera")}</Button></>}
          {can('leads.export') && <a href="/api/leads/export.csv"><Button variant="secondary" icon={Download}>{tr("Exportera")}</Button></a>}
        </>} />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Tabs value={filters.view} onChange={(v) => setFilter('view', v)} tabs={[
          { value: '', label: tr("Alla"), count: data?.counts?.total },
          { value: 'new', label: tr("Nya att ringa"), count: data?.counts?.new },
          { value: 'followup', label: tr("Behöver uppföljning"), count: data?.counts?.followup },
          { value: 'customers', label: tr("Kunder"), count: data?.counts?.customers },
        ]} />
        {filters.view === 'followup' && <span className="text-xs text-slate-500">{tr("Kontaktade leads utan uppgift eller bokat möte – risk att de glöms bort.")}</span>}
      </div>
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 p-3 border-b border-slate-100">
          <div className="relative flex-1 min-w-52">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("Sök namn, företag, telefon, e-post, ort, org.nr eller tagg…")} className="input pl-9" />
          </div>
          <Select value={filters.status} onChange={(e) => setFilter('status', e.target.value)} className="w-auto">
            <option value="">{tr("Alla statusar")}</option>{Object.entries(STATUSES).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
          </Select>
          <Select value={filters.source} onChange={(e) => setFilter('source', e.target.value)} className="w-auto">
            <option value="">{tr("Alla källor")}</option>{Object.entries(SOURCES).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
          </Select>
          <Select value={filters.owner} onChange={(e) => setFilter('owner', e.target.value)} className="w-auto">
            <option value="">{tr("Alla ansvariga")}</option><option value="me">{tr("Mina leads")}</option><option value="none">{tr("Otilldelade")}</option>
            {can('leads.view_all') && team.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
          {(activeFilters > 0 || filters.q) && <Button variant="ghost" size="sm" icon={X} onClick={() => { setQ(''); setSp({}, { replace: true }); }}>{tr("Rensa")}</Button>}
          {filters.tag && <span className="inline-flex items-center gap-1 rounded-md bg-brand-50 px-2 py-1 text-xs text-brand-700"><Tag className="size-3" />{filters.tag}</span>}
        </div>

        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 bg-brand-50/70 border-b border-brand-100 animate-fade-in">
            <span className="text-sm font-medium text-brand-800 mr-2">{selected.size} {tr("valda")}</span>
            {can('leads.assign') && <Button size="sm" variant="secondary" icon={UserCheck} onClick={() => setAssignOpen(true)}>{tr("Tilldela")}</Button>}
            <Select className="w-auto !py-1 text-xs" value="" onChange={(e) => e.target.value && bulk('status', e.target.value)}>
              <option value="">{tr("Ändra status…")}</option>{Object.entries(STATUSES).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
            </Select>
            <Button size="sm" variant="secondary" icon={Tag} onClick={() => { const t = prompt(tr("Tagg att lägga till")); t && bulk('tag', t.trim()); }}>{tr("Tagga")}</Button>
            {can('leads.delete') && <Button size="sm" variant="secondary" icon={Trash2} className="!text-rose-600" onClick={() => setConfirmDel(true)}>{tr("Radera")}</Button>}
            <button onClick={() => setSelected(new Set())} className="ml-auto text-xs text-slate-500 hover:text-slate-700">{tr("Avmarkera")}</button>
          </div>
        )}

        <div className="overflow-x-auto scroll-thin">
          <table className="w-full text-sm">
            <thead className="bg-slate-50/80 text-left text-xs text-slate-500 border-b border-slate-100">
              <tr>
                <th className="w-10 pl-4"><input type="checkbox" checked={allOnPage} onChange={() => setSelected(allOnPage ? new Set() : new Set(data.rows.map((r) => r.id)))} className="rounded accent-brand-600" /></th>
                <Th col="name">{tr("Namn")}</Th><Th col="company">{tr("Företag")}</Th><Th>{tr("Källa")}</Th><Th col="status">{tr("Status")}</Th><Th col="last_contact_at">{tr("Nästa steg")}</Th><Th>{tr("Ansvarig")}</Th><Th col="created_at" className="text-right">{tr("Inkom")}</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {!data && <tr><td colSpan={8} className="py-16 text-center"><Spinner className="mx-auto" /></td></tr>}
              {data?.rows.map((l) => (
                <tr key={l.id} onClick={() => nav(`/leads/${l.id}${window.location.search}`)}
                  className={cx('cursor-pointer hover:bg-slate-50/80 transition', selected.has(l.id) && 'bg-brand-50/40', flash.has(l.id) && 'row-flash', Number(id) === l.id && 'bg-brand-50/60')}>
                  <td className="pl-4" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selected.has(l.id)} onChange={() => toggle(l.id)} className="rounded accent-brand-600" /></td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{leadName(l)}</p>
                    <p className="text-xs text-slate-500">{l.email || l.phone}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    <p>{l.company || <span className="text-slate-300">—</span>}</p>
                    {l.tags.length > 0 && <div className="mt-1 flex gap-1">{l.tags.slice(0, 3).map((t) => <span key={t} className="rounded bg-slate-100 px-1.5 py-px text-[10px] font-medium text-slate-600">{t}</span>)}</div>}
                  </td>
                  <td className="px-4 py-3"><SourceBadge source={l.source} detail={l.source_detail} /></td>
                  <td className="px-4 py-3"><StatusBadge status={l.status} /><div className="mt-1.5" title={tr("Poäng")}><ScoreBar score={l.score} /></div></td>
                  <td className="px-4 py-3 max-w-56"><NextStepCell step={l.next_step} lastContact={l.last_contact_at} status={l.status} /></td>
                  <td className="px-4 py-3">{l.owner_name ? <span className="flex items-center gap-2"><Avatar name={l.owner_name} color={l.owner_color} size="xs" /><span className="text-slate-600 truncate">{l.owner_name.split(' ')[0]}</span></span> : <span className="text-xs text-amber-600 font-medium">{tr("Otilldelad")}</span>}</td>
                  <td className="px-4 py-3 text-right text-xs text-slate-500 whitespace-nowrap">{timeAgo(l.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && !data.rows.length && <Empty icon={activeFilters ? Filter : Users} title={activeFilters || filters.q ? tr("Inga leads matchar") : tr("Inga leads än")} text={activeFilters || filters.q ? tr("Prova att ändra eller rensa filtret.") : tr("Koppla in e-post, Facebook eller Instagram så hämtas leads automatiskt.")} />}
        </div>

        {data && data.total > data.limit && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-sm text-slate-500">
            <span>{tr("Sida")} {data.page} {tr("av")} {pages}</span>
            <div className="flex gap-1">
              <Button size="sm" variant="secondary" icon={ChevronLeft} disabled={data.page <= 1} onClick={() => setFilter('page', String(data.page - 1))} />
              <Button size="sm" variant="secondary" icon={ChevronRight} disabled={data.page >= pages} onClick={() => setFilter('page', String(data.page + 1))} />
            </div>
          </div>
        )}
      </Card>

      {id && <LeadDrawer id={Number(id)} onClose={() => nav(`/leads${window.location.search}`)} onChanged={load} />}

      <Modal open={assignOpen} onClose={() => setAssignOpen(false)} title={tr("Tilldela {0} leads", { 0: selected.size })}>
        <div className="space-y-1">
          {team.map((u) => (
            <button key={u.id} onClick={() => { bulk('assign', u.id); setAssignOpen(false); }} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-slate-50 text-left">
              <Avatar name={u.name} color={u.color} size="sm" /><span className="text-sm font-medium text-slate-800">{u.name}</span><span className="ml-auto text-xs text-slate-400">{tr(u.role)}</span>
            </button>
          ))}
          <button onClick={() => { bulk('assign', null); setAssignOpen(false); }} className="w-full rounded-lg px-3 py-2.5 text-left text-sm text-slate-500 hover:bg-slate-50">{tr("Ta bort tilldelning")}</button>
        </div>
      </Modal>
      <Confirm open={confirmDel} onClose={() => setConfirmDel(false)} title={tr("Radera leads?")} text={tr("{0} leads och deras historik raderas permanent.", { 0: selected.size })}
        onConfirm={() => { bulk('delete'); setConfirmDel(false); }} />
      <Modal open={!!importRows} onClose={() => setImportRows(null)} title={tr("Importera leads")} description={tr("{0} rader hittades. Kolumner som namn, e-post, telefon och företag känns igen automatiskt.", { 0: importRows?.length })}
        footer={<><Button variant="secondary" onClick={() => setImportRows(null)}>{tr("Avbryt")}</Button><Button onClick={doImport}>{tr("Importera")} {importRows?.length} {tr("leads")}</Button></>} wide>
        {importRows && (
          <div className="overflow-x-auto scroll-thin border border-slate-200 rounded-lg">
            <table className="text-xs w-full">
              <thead className="bg-slate-50"><tr>{Object.keys(importRows[0]).map((h) => <th key={h} className="px-3 py-2 text-left font-medium text-slate-600 whitespace-nowrap">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">{importRows.slice(0, 5).map((r, i) => <tr key={i}>{Object.values(r).map((v, j) => <td key={j} className="px-3 py-2 whitespace-nowrap text-slate-600">{v}</td>)}</tr>)}</tbody>
            </table>
          </div>
        )}
      </Modal>
    </div>
  );
}
