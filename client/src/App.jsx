import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useApp } from './lib/app.jsx';
import { Spinner } from './components/ui.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import MyDay from './pages/MyDay.jsx';

// Övriga sidor laddas först när man går till dem, så att första laddningen blir liten.
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Companies = lazy(() => import('./pages/Companies.jsx'));
const PublicQuote = lazy(() => import('./pages/PublicQuote.jsx'));
const OAuthConsent = lazy(() => import('./pages/OAuthConsent.jsx'));
const Products = lazy(() => import('./pages/Products.jsx'));
const Templates = lazy(() => import('./pages/Templates.jsx'));
const SearchResults = lazy(() => import('./pages/SearchResults.jsx'));
const Leads = lazy(() => import('./pages/Leads.jsx'));
const Pipeline = lazy(() => import('./pages/Pipeline.jsx'));
const Tasks = lazy(() => import('./pages/Tasks.jsx'));
const Calendar = lazy(() => import('./pages/Calendar.jsx'));
const Inflow = lazy(() => import('./pages/Inflow.jsx'));
const Integrations = lazy(() => import('./pages/Integrations.jsx'));
const Automations = lazy(() => import('./pages/Automations.jsx'));
const Prospecting = lazy(() => import('./pages/Prospecting.jsx'));
const Team = lazy(() => import('./pages/Team.jsx'));
const Audit = lazy(() => import('./pages/Audit.jsx'));
const Settings = lazy(() => import('./pages/Settings.jsx'));
const PageSpinner = () => <div className="h-full grid place-items-center"><Spinner className="size-8" /></div>;

function Guard({ perm, children }) {
  const { can } = useApp();
  return can(perm) ? children : <Navigate to="/" replace />;
}

export default function App() {
  const { loading, user } = useApp();
  const location = useLocation();
  // Kundens offertsida är publik och visas utan inloggning och utan appens meny.
  if (location.pathname.startsWith('/q/')) return <Suspense fallback={<PageSpinner />}><Routes><Route path="/q/:token" element={<PublicQuote />} /></Routes></Suspense>;
  if (loading) return <div className="h-full grid place-items-center"><Spinner className="size-8" /></div>;
  if (!user) return <Login />;
  // Godkännande av en AI-koppling (MCP) visas utan appens meny, efter inloggning.
  if (location.pathname === '/oauth/consent') return <Suspense fallback={<PageSpinner />}><OAuthConsent /></Suspense>;
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
