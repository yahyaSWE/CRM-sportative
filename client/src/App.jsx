import { Routes, Route, Navigate } from 'react-router-dom';
import { useApp } from './lib/app.jsx';
import { Spinner } from './components/ui.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Leads from './pages/Leads.jsx';
import Pipeline from './pages/Pipeline.jsx';
import Tasks from './pages/Tasks.jsx';
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
  if (loading) return <div className="h-full grid place-items-center"><Spinner className="size-8" /></div>;
  if (!user) return <Login />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="leads" element={<Leads />} />
        <Route path="leads/:id" element={<Leads />} />
        <Route path="pipeline" element={<Pipeline />} />
        <Route path="pipeline/:id" element={<Pipeline />} />
        <Route path="tasks" element={<Tasks />} />
        <Route path="inflow" element={<Guard perm="integrations.manage"><Inflow /></Guard>} />
        <Route path="integrations" element={<Guard perm="integrations.manage"><Integrations /></Guard>} />
        <Route path="prospecting" element={<Guard perm="prospecting.use"><Prospecting /></Guard>} />
        <Route path="automations" element={<Automations />} />
        <Route path="team" element={<Team />} />
        <Route path="audit" element={<Guard perm="audit.view"><Audit /></Guard>} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
