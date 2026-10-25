import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { api } from '../api.js';
import { useToast } from '../components/ui.jsx';
import { SOURCES, leadName } from './meta.jsx';
import { applyLanguage } from './i18n.js';
import { tr } from './i18n.js';

const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

const bus = new EventTarget();
export function useLive(types, handler) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const list = [].concat(types);
    const fn = (e) => ref.current(e.detail, e.type);
    list.forEach((t) => bus.addEventListener(t, fn));
    return () => list.forEach((t) => bus.removeEventListener(t, fn));
  }, [String(types)]);
}

export function AppProvider({ children }) {
  const [state, setState] = useState({ loading: true, user: null, permissions: [], workspace: null, workspaces: [] });
  const [team, setTeam] = useState([]);
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      const me = await api.get('/auth/me');
      // Användarens sparade språk gäller på alla enheter; laddar om sidan om det skiljer sig.
      if (applyLanguage(me.user.language)) return;
      setState({ loading: false, user: me.user, permissions: me.permissions, workspace: me.workspace, workspaces: me.workspaces || [] });
      setTeam(await api.get('/users'));
    } catch {
      setState({ loading: false, user: null, permissions: [] });
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const out = () => setState((s) => ({ ...s, user: null }));
    window.addEventListener('lf:logout', out);
    return () => window.removeEventListener('lf:logout', out);
  }, []);

  // Realtidsström: nya leads dyker upp direkt utan omladdning.
  useEffect(() => {
    if (!state.user) return;
    const es = new EventSource('/api/events');
    const relay = (type) => (e) => {
      const data = JSON.parse(e.data);
      bus.dispatchEvent(new CustomEvent(type, { detail: data }));
      // Egna importer från prospektering behöver ingen notis per lead – importen visar en sammanfattning.
      if (type === 'lead' && data.type === 'created' && data.lead.source !== 'prospecting') {
        const src = SOURCES[data.lead.source]?.label || data.lead.source;
        toast(`${leadName(data.lead)} via ${src}`, 'info', { title: tr("Ny lead inkommen") });
      }
      if (type === 'notification') bus.dispatchEvent(new CustomEvent('notifications', { detail: data }));
    };
    ['lead', 'refresh', 'notification', 'integration', 'prospect', 'prospects', 'meeting'].forEach((t) => es.addEventListener(t, relay(t)));
    return () => es.close();
  }, [state.user?.id]);

  const can = useCallback((p) => !!state.user?.permissions?.includes(p), [state.user]);
  const logout = async () => { await api.post('/auth/logout'); setState((s) => ({ ...s, user: null })); };

  return (
    <AppCtx.Provider value={{ ...state, team, reloadTeam: async () => setTeam(await api.get('/users')), can, reload: load, logout, setUser: (user) => { setState((s) => ({ ...s, user })); load(); } }}>
      {children}
    </AppCtx.Provider>
  );
}

export function useFetch(url, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    if (!url) return;
    setLoading(true);
    try { setData(await api.get(url)); setError(null); } catch (e) { setError(e); } finally { setLoading(false); }
  }, [url]);
  useEffect(() => { reload(); }, [reload, ...deps]);
  return { data, setData, error, loading, reload };
}
