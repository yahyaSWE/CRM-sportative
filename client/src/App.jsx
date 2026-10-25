import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useApp } from './lib/app.jsx';
import { Spinner } from './components/ui.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import MyDay from './pages/MyDay.jsx';
import Companies from './pages/Companies.jsx';
import PublicQuote from './pages/PublicQuote.jsx';
import OAuthConsent from './pages/OAuthConsent.jsx';
import Products from './pages/Products.jsx';
import Templates from './pages/Templates.jsx';
import SearchResults from './pages/SearchResults.jsx';
import Leads from './pages/Leads.jsx';
import Pipeline from './pages/Pipeline.jsx';
import Tasks from './pages/Tasks.jsx';
import Calendar from './pages/Calendar.jsx';
import Inflow from './pages/Inflow.jsx';
import Integrations from './pages/Integrations.jsx';
import Automations from './pages/Automations.jsx';
import Prospecting from './pages/Prospecting.jsx';
import Team from './pages/Team.jsx';
import Audit from './pages/Audit.jsx';
import Settings from './pages/Settings.jsx';

function Guard({ perm, children }) {
  const { can } = useApp();
  return can(perm) ? children : <Navigate to="/" replace />;
}

export default function App() {
  const { loading, user } = useApp();
  const location = useLocation();
  // Kundens offertsida är publik och visas utan inloggning och utan appens meny.
  if (location.pathname.startsWith('/q/')) return <Routes><Route path="/q/:token" element={<PublicQuote />} /></Routes>;
  if (loading) return <div className="h-full grid place-items-center"><Spinner className="size-8" /></div>;
  if (!user) return <Login />;
  // Godkännande av en AI-koppling (MCP) visas utan appens meny, efter inloggning.
  if (location.pathname === '/oauth/consent') return <OAuthConsent />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<MyDay />} />
        <Route path="overview" element={<Dashboard />} />
        <Route path="companies" element={<Companies />} />
        <Route path="companies/:id" element={<Companies />} />
        <Route path="customers" element={<Navigate to="/companies?view=customers" replace />} />
        <Route path="search" element={<SearchResults />} />
        <Route path="leads" element={<Leads />} />
        <Route path="leads/:id" element={<Leads />} />
        <Route path="pipeline" element={<Pipeline />} />
        <Route path="pipeline/:id" element={<Pipeline />} />
        <Route path="tasks" element={<Tasks />} />
        <Route path="templates" element={<Templates />} />
        <Route path="calendar" element={<Calendar />} />
        <Route path="inflow" element={<Guard perm="integrations.manage"><Inflow /></Guard>} />
        <Route path="integrations" element={<Guard perm="integrations.manage"><Integrations /></Guard>} />
        <Route path="prospecting" element={<Guard perm="prospecting.use"><Prospecting /></Guard>} />
        <Route path="automations" element={<Automations />} />
        <Route path="products" element={<Products />} />
        <Route path="team" element={<Team />} />
        <Route path="audit" element={<Guard perm="audit.view"><Audit /></Guard>} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
