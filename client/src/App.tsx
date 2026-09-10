import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { useI18n } from './i18n';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Branding from './pages/config/Branding';
import TatamiSetup from './pages/config/TatamiSetup';
import Ranks from './pages/config/Ranks';
import Users from './pages/config/Users';
import Settings from './pages/config/Settings';
import Reset from './pages/config/Reset';
import Fighters from './pages/Fighters';
import Import from './pages/Import';
import Categories from './pages/Categories';
import BracketPage from './pages/BracketPage';
import TatamiView from './pages/TatamiView';
import Projector from './pages/Projector';
import Print from './pages/Print';
import About from './pages/About';
import Scores from './pages/Scores';
import type { ReactNode } from 'react';

function Protected({ children, roles }: { children: ReactNode; roles?: string[] }) {
  const { user, loading } = useAuth();
  const { t } = useI18n();
  if (loading) return <div className="p-8 text-slate-500">{t('common.loading')}</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  const { user } = useAuth();
  return (
    <Routes>
      {/* Public projector + print views (no login). */}
      <Route path="/projector" element={<Projector />} />
      <Route path="/projector/:tatamiId" element={<Projector />} />
      <Route path="/print/:categoryId" element={<Print />} />
      <Route path="/login" element={<Login />} />

      <Route
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route index element={user?.role === 'tatami_editor' ? <Navigate to="/my-tatami" replace /> : <Dashboard />} />
        <Route path="fighters" element={<Protected roles={['admin']}><Fighters /></Protected>} />
        <Route path="import" element={<Protected roles={['admin']}><Import /></Protected>} />
        <Route path="categories" element={<Protected roles={['admin']}><Categories /></Protected>} />
        <Route path="config/branding" element={<Protected roles={['admin']}><Branding /></Protected>} />
        <Route path="config/tatami" element={<Protected roles={['admin']}><TatamiSetup /></Protected>} />
        <Route path="config/ranks" element={<Protected roles={['admin']}><Ranks /></Protected>} />
        <Route path="config/users" element={<Protected roles={['admin']}><Users /></Protected>} />
        <Route path="config/settings" element={<Protected roles={['admin']}><Settings /></Protected>} />
        <Route path="config/reset" element={<Protected roles={['admin']}><Reset /></Protected>} />
        <Route path="my-tatami" element={<TatamiView />} />
        <Route path="bracket/:categoryId" element={<BracketPage />} />
        <Route path="scores" element={<Scores />} />
        <Route path="about" element={<About />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
