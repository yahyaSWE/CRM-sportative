import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, KanbanSquare, CheckSquare, Plug, Zap, Shield, ScrollText, Settings, Bell, Search, LogOut,
  Menu, X, Radio, Plus, ChevronDown, Crosshair,
} from 'lucide-react';
import { useApp, useLive } from '../lib/app.jsx';
import { api } from '../api.js';
import { Avatar, cx, SourceBadge } from './ui.jsx';
import { leadName, timeAgo, sek } from '../lib/meta.jsx';
import LeadForm from './LeadForm.jsx';

const NAV = [
  { group: 'Försäljning', items: [
    { to: '/', label: 'Översikt', icon: LayoutDashboard, end: true },
    { to: '/leads', label: 'Leads', icon: Users },
    { to: '/pipeline', label: 'Pipeline', icon: KanbanSquare },
    { to: '/tasks', label: 'Uppgifter', icon: CheckSquare },
  ] },
  { group: 'Leadinsamling', items: [
    { to: '/integrations', label: 'Integrationer', icon: Plug, perm: 'integrations.manage' },
    { to: '/inflow', label: 'Lead-inflöde', icon: Radio, perm: 'integrations.manage' },
    { to: '/prospecting', label: 'Prospektering', icon: Crosshair, perm: 'prospecting.use' },
    { to: '/automations', label: 'Automatisering', icon: Zap },
  ] },
  { group: 'Administration', items: [
    { to: '/team', label: 'Team & behörigheter', icon: Shield },
    { to: '/audit', label: 'Aktivitetslogg', icon: ScrollText, perm: 'audit.view' },
    { to: '/settings', label: 'Inställningar', icon: Settings },
  ] },
];

function Sidebar({ onNavigate }) {
  const { can } = useApp();
  return (
    <div className="flex h-full flex-col bg-slate-950 text-slate-300">
      <div className="flex items-center gap-2.5 px-5 h-16 shrink-0">
        <div className="grid place-items-center size-8 rounded-lg bg-gradient-to-br from-brand-500 to-violet-500 shadow-lg shadow-brand-600/30">
          <svg viewBox="0 0 32 32" className="size-5"><path d="M7 22l6-7 4 3 8-9" stroke="white" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
        <span className="text-[15px] font-semibold text-white tracking-tight">LeadFlow</span>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-6 scroll-thin">
        {NAV.map((g) => {
          const items = g.items.filter((i) => !i.perm || can(i.perm));
          if (!items.length) return null;
          return (
            <div key={g.group}>
              <p className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{g.group}</p>
              {items.map(({ to, label, icon: Icon, end }) => (
                <NavLink key={to} to={to} end={end} onClick={onNavigate}
                  className={({ isActive }) => cx('group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
                    isActive ? 'bg-white/10 text-white' : 'hover:bg-white/5 hover:text-white')}>
                  {({ isActive }) => <><Icon className={cx('size-[18px]', isActive ? 'text-brand-400' : 'text-slate-500 group-hover:text-slate-300')} />{label}</>}
                </NavLink>
              ))}
            </div>
          );
        })}
      </nav>
      <LiveIndicator />
    </div>
  );
}

function LiveIndicator() {
  const [count, setCount] = useState(0);
  useLive('lead', (d) => d.type === 'created' && setCount((c) => c + 1));
  return (
    <div className="m-3 rounded-xl bg-white/5 p-3.5">
      <div className="flex items-center gap-2 text-xs font-medium text-slate-200">
        <span className="relative flex size-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex size-2 rounded-full bg-emerald-400" /></span>
        Automatisk insamling aktiv
      </div>
      <p className="mt-1 text-xs text-slate-500">{count ? `${count} nya leads sedan du loggade in` : 'Nya leads visas i realtid'}</p>
    </div>
  );
}

function GlobalSearch() {
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);
  const [open, setOpen] = useState(false);
  const ref = useRef();
  const nav = useNavigate();
  useEffect(() => {
    const onKey = (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); ref.current?.focus(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    if (q.length < 2) return setRes(null);
    const t = setTimeout(() => api.get(`/search?q=${encodeURIComponent(q)}`).then(setRes).catch(() => {}), 180);
    return () => clearTimeout(t);
  }, [q]);
  const go = (path) => { setOpen(false); setQ(''); nav(path); };
  return (
    <div className="relative w-full max-w-md">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
      <input ref={ref} value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Sök leads, företag, affärer…" className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-14 text-sm outline-none focus:bg-white focus:border-brand-500 focus:ring-4 focus:ring-brand-100" />
      <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-slate-200 bg-white px-1.5 text-[10px] font-medium text-slate-400">Ctrl K</kbd>
      {open && res && (
        <div className="absolute z-40 mt-2 w-full card shadow-xl py-2 animate-fade-in">
          {!res.leads.length && !res.deals.length && <p className="px-4 py-3 text-sm text-slate-500">Inga träffar</p>}
          {res.leads.length > 0 && <p className="px-4 pt-1 pb-1 text-[11px] font-semibold uppercase text-slate-400">Leads</p>}
          {res.leads.map((l) => (
            <button key={l.id} onMouseDown={() => go(`/leads/${l.id}`)} className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-slate-50">
              <SourceBadge source={l.source} compact />
              <span className="min-w-0"><span className="block text-sm font-medium text-slate-800 truncate">{leadName(l)}</span><span className="block text-xs text-slate-500 truncate">{l.company || l.email}</span></span>
            </button>
          ))}
          {res.deals.length > 0 && <p className="px-4 pt-2 pb-1 text-[11px] font-semibold uppercase text-slate-400">Affärer</p>}
          {res.deals.map((d) => (
            <button key={d.id} onMouseDown={() => go(`/pipeline/${d.id}`)} className="flex w-full items-center justify-between px-4 py-2 text-left hover:bg-slate-50">
              <span className="text-sm text-slate-800 truncate">{d.title}</span><span className="text-xs text-slate-500">{sek(d.value)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Notifications() {
  const [data, setData] = useState({ items: [], unread: 0 });
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  const load = () => api.get('/notifications').then(setData).catch(() => {});
  useEffect(() => { load(); }, []);
  useLive('notifications', load);
  const toggle = async () => {
    setOpen(!open);
    if (!open && data.unread) { await api.post('/notifications/read'); setData((d) => ({ ...d, unread: 0 })); }
  };
  return (
    <div className="relative">
      <button onClick={toggle} className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100">
        <Bell className="size-5" />
        {data.unread > 0 && <span className="absolute top-1 right-1 grid place-items-center min-w-4 h-4 px-1 rounded-full bg-rose-500 text-[10px] font-semibold text-white">{data.unread}</span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-2 w-80 card shadow-xl animate-fade-in">
            <p className="px-4 py-3 text-sm font-semibold border-b border-slate-100">Notiser</p>
            <div className="max-h-96 overflow-y-auto scroll-thin">
              {!data.items.length && <p className="px-4 py-6 text-sm text-center text-slate-500">Inga notiser ännu</p>}
              {data.items.map((n) => (
                <button key={n.id} onClick={() => { setOpen(false); n.link && nav(n.link); }} className="block w-full text-left px-4 py-3 hover:bg-slate-50 border-b border-slate-50">
                  <p className="text-sm text-slate-700">{n.text}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{timeAgo(n.created_at)}</p>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function UserMenu() {
  const { user, logout } = useApp();
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2.5 rounded-lg py-1 pl-1 pr-2 hover:bg-slate-100">
        <Avatar name={user.name} color={user.color} />
        <span className="hidden md:block text-left">
          <span className="block text-sm font-medium text-slate-800 leading-tight">{user.name}</span>
          <span className="block text-xs text-slate-500 leading-tight">{user.role}</span>
        </span>
        <ChevronDown className="size-4 text-slate-400" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-2 w-56 card shadow-xl py-1 animate-fade-in">
            <div className="px-4 py-2.5 border-b border-slate-100"><p className="text-sm font-medium truncate">{user.name}</p><p className="text-xs text-slate-500 truncate">{user.email}</p></div>
            <button onClick={() => { setOpen(false); nav('/settings'); }} className="flex w-full items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"><Settings className="size-4" />Inställningar</button>
            <button onClick={logout} className="flex w-full items-center gap-2 px-4 py-2 text-sm text-rose-600 hover:bg-rose-50"><LogOut className="size-4" />Logga ut</button>
          </div>
        </>
      )}
    </div>
  );
}

export default function Layout() {
  const [mobile, setMobile] = useState(false);
  const [newLead, setNewLead] = useState(false);
  const { can } = useApp();
  const loc = useLocation();
  const nav = useNavigate();
  useEffect(() => setMobile(false), [loc.pathname]);
  return (
    <div className="flex h-full">
      <aside className="hidden lg:block w-64 shrink-0"><div className="fixed inset-y-0 w-64"><Sidebar /></div></aside>
      {mobile && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setMobile(false)} />
          <div className="absolute inset-y-0 left-0 w-64 animate-fade-in"><Sidebar onNavigate={() => setMobile(false)} /></div>
          <button className="absolute top-4 left-64 ml-2 text-white" onClick={() => setMobile(false)}><X /></button>
        </div>
      )}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/85 backdrop-blur px-4 sm:px-6">
          <button className="lg:hidden rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={() => setMobile(true)}><Menu className="size-5" /></button>
          <GlobalSearch />
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            {can('leads.edit_own') && (
              <button onClick={() => setNewLead(true)} className="hidden sm:inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700">
                <Plus className="size-4" />Ny lead
              </button>
            )}
            <Notifications />
            <UserMenu />
          </div>
        </header>
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-[1600px] w-full mx-auto">
          <Outlet />
        </main>
      </div>
      <LeadForm open={newLead} onClose={() => setNewLead(false)} onSaved={(l) => { setNewLead(false); nav(`/leads/${l.id}`); }} />
    </div>
  );
}
