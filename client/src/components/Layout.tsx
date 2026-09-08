import { useEffect } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useEvent } from '../lib/queries';
import { LanguageSwitcher, useI18n } from '../i18n';

export default function Layout() {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const { data: event } = useEvent();
  const navigate = useNavigate();

  useEffect(() => {
    if (event?.accentColor) document.documentElement.style.setProperty('--accent', event.accentColor);
  }, [event?.accentColor]);

  const isAdmin = user?.role === 'admin';

  const link = (to: string, label: string) => (
    <NavLink to={to} end className={({ isActive }) => `side-link ${isActive ? 'side-link-active' : ''}`}>
      {label}
    </NavLink>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col" style={{ background: 'linear-gradient(180deg, var(--sidebar-2), var(--sidebar))' }}>
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-4">
          <img src={event?.logoPath || '/canva-logo.png'} alt="logo" className="h-11 w-11 rounded-xl object-contain ring-1 ring-white/15" />
          <div className="min-w-0">
            <div className="text-sm font-bold leading-tight text-white">{event?.title ?? t('app.title')}</div>
            {event?.subtitle && <div className="truncate text-[11px] text-slate-400">{event.subtitle}</div>}
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
          {isAdmin && link('/', t('nav.dashboard'))}
          {(user?.role === 'tatami_editor' || isAdmin) && link('/my-tatami', t('nav.myTatami'))}
          {isAdmin && (
            <>
              <div className="side-section">Roster</div>
              {link('/fighters', t('nav.fighters'))}
              {link('/import', t('nav.import'))}
              {link('/categories', t('nav.categories'))}
              <div className="side-section">Configuration</div>
              {link('/config/branding', t('nav.branding'))}
              {link('/config/tatami', t('nav.tatami'))}
              {link('/config/ranks', t('nav.ranks'))}
              {link('/config/users', t('nav.users'))}
              {link('/config/settings', t('nav.settings'))}
              {link('/config/reset', t('nav.reset'))}
            </>
          )}
          <div className="side-section">View</div>
          <Link to="/projector" target="_blank" className="side-link">
            {t('nav.projector')} ↗
          </Link>
        </nav>

        <div className="space-y-3 border-t border-white/10 px-4 py-3">
          <NavLink to="/about" className={({ isActive }) => `flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/10 hover:text-white ${isActive ? 'bg-white/10 text-white' : ''}`}>
            ℹ {t('nav.about')}
          </NavLink>
          <LanguageSwitcher />
          <div className="flex items-center justify-between">
            <span className="truncate text-xs text-slate-400">{user?.displayName || user?.username}</span>
            <button
              className="rounded-md bg-white/10 px-2.5 py-1 text-xs font-medium text-white hover:bg-white/20"
              onClick={async () => {
                await logout();
                navigate('/login');
              }}
            >
              {t('common.logout')}
            </button>
          </div>
        </div>
      </aside>

      <div className="app-shell flex min-w-0 flex-1 flex-col">
        {/* Top bar: logo on the left, tournament name centred. */}
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-6 py-3 backdrop-blur">
          <img src={event?.logoPath || '/canva-logo.png'} alt="logo" className="h-9 w-9 shrink-0 rounded-lg object-contain" />
          <div className="flex-1 text-center leading-tight">
            <div className="text-lg font-bold text-slate-900">{event?.title ?? t('app.title')}</div>
            {event?.subtitle && <div className="text-xs text-slate-500">{event.subtitle}</div>}
          </div>
          <div className="h-9 w-9 shrink-0" aria-hidden="true" />
        </header>
        <main className="flex-1 overflow-x-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
