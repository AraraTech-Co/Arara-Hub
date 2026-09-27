import { useEffect, useMemo, useState } from 'react';
import {
  Menu,
  X,
  LogOut,
  Clock,
  LayoutDashboard,
  BarChart3,
  CalendarDays,
  Wallet,
  CheckSquare,
  Download,
  Users as UsersIcon,
  CalendarClock,
  Settings as SettingsIcon,
  Sun,
  Moon,
  LayoutGrid,
} from 'lucide-react';

const HUB_URL = 'https://hub.arara-tech.com';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext.jsx';
import { isDarkActive, toggleTheme } from '../lib/theme.js';

export function Layout() {
  const { user, logout, isManager, canAccessScreen } = useAuth();
  const { t } = useTranslation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [dark, setDark] = useState(() => isDarkActive());
  const location = useLocation();

  const navItems = useMemo(() => {
    const isAdmin = user?.role === 'admin';
    const isManagerOnly = !isAdmin && !!user?.managerRole;
    const showInsightsHome = isAdmin && canAccessScreen('insights');
    const homeLabel = showInsightsHome ? t('layout.nav.insights') : t('layout.nav.hours');
    const homeIcon = showInsightsHome ? BarChart3 : LayoutDashboard;
    const items = [
      { to: '/', label: homeLabel, end: true, icon: homeIcon },
      ...(isManagerOnly && canAccessScreen('insights')
        ? [{ to: '/?tab=insights', label: t('layout.nav.insights'), icon: BarChart3 }]
        : []),
      ...(canAccessScreen('calendar') ? [{ to: '/calendar', label: t('layout.nav.calendar'), icon: CalendarDays }] : []),
      ...(canAccessScreen('finance') ? [{ to: '/finance', label: t('layout.nav.finance'), icon: Wallet }] : []),
      ...(isManager && canAccessScreen('approvals')
        ? [{ to: '/approvals', label: t('layout.nav.approvals'), icon: CheckSquare }]
        : []),
      ...(isManager && canAccessScreen('csvExports')
        ? [{ to: '/csv-exports', label: t('layout.nav.csvExports'), icon: Download }]
        : []),
      ...(isAdmin && canAccessScreen('users') ? [{ to: '/users', label: t('layout.nav.users'), icon: UsersIcon }] : []),
      ...(isAdmin && canAccessScreen('escala') ? [{ to: '/escala', label: t('layout.nav.escala'), icon: CalendarClock }] : []),
      ...(canAccessScreen('settings') ? [{ to: '/settings', label: t('layout.nav.settings'), icon: SettingsIcon }] : []),
    ];
    return items;
  }, [canAccessScreen, isManager, t, user]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') setMobileMenuOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileMenuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileMenuOpen]);

  const isItemActive = (item) => {
    const [path, query] = item.to.split('?');
    if (query) {
      return location.pathname === path && location.search === `?${query}`;
    }
    if (item.end) {
      // raiz não fica ativa quando o irmão de query-tab (insights) está selecionado
      return location.pathname === path && !(path === '/' && location.search === '?tab=insights');
    }
    return location.pathname === path || location.pathname.startsWith(`${path}/`);
  };

  const displayName = user?.fullName || user?.email || '?';
  const roleLabel =
    user?.role === 'admin'
      ? t('layout.role.admin', { defaultValue: 'Administrador' })
      : user?.managerRole
        ? t('layout.role.manager', { defaultValue: 'Gestor' })
        : t('layout.role.user', { defaultValue: 'Usuário' });

  const sidebarStyle = { background: 'var(--sidebar)', borderRight: '1px solid var(--sidebar-border)' };

  const navContent = (onNavigate) => (
    <>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-5"
        style={{ borderBottom: '1px solid var(--sidebar-border)' }}
      >
        <Link to="/" onClick={onNavigate} className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-white">
            <Clock size={18} />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-white">{t('layout.appName')}</span>
            <span className="block truncate text-xs" style={{ color: 'var(--sidebar-muted)' }}>
              {t('layout.appTagline', { defaultValue: 'Gestão de horas' })}
            </span>
          </span>
        </Link>
        {onNavigate && (
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="p-1 text-slate-400 hover:text-white lg:hidden"
            aria-label={t('layout.closeMenu', { defaultValue: 'Fechar menu' })}
          >
            <X size={20} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
        {/* Voltar ao Hub — troca de sistema sem usar o voltar do navegador */}
        <a
          href={HUB_URL}
          className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
        >
          <LayoutGrid size={16} className="shrink-0 opacity-90" />
          {t('layout.backToHub', { defaultValue: 'Voltar ao Hub' })}
        </a>
        <div className="my-1.5 border-t" style={{ borderColor: 'var(--sidebar-border)' }} />
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isItemActive(item);
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
                active ? 'bg-accent text-white shadow-sm' : 'text-slate-300 hover:bg-white/10 hover:text-white'
              }`}
            >
              <Icon size={16} className="shrink-0 opacity-90" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-3 py-3" style={{ borderTop: '1px solid var(--sidebar-border)' }}>
        <div className="mb-1 flex items-center gap-3 px-3 py-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white">
            {displayName[0]?.toUpperCase() ?? '?'}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-white">{displayName}</span>
            <span className="block truncate text-xs" style={{ color: 'var(--sidebar-muted)' }}>
              {roleLabel}
            </span>
          </span>
        </div>
        <button
          type="button"
          onClick={() => setDark(toggleTheme())}
          className="mb-1 flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-sm text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
        >
          {dark ? <Sun size={14} /> : <Moon size={14} />}
          {dark
            ? t('layout.themeLight', { defaultValue: 'Tema claro' })
            : t('layout.themeDark', { defaultValue: 'Tema escuro' })}
        </button>
        <button
          type="button"
          onClick={() => logout()}
          className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-sm text-slate-400 transition-colors hover:bg-white/5 hover:text-red-400"
        >
          <LogOut size={14} />
          {t('layout.logout')}
        </button>
      </div>
    </>
  );

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar fixa — desktop */}
      <aside className="hidden h-full w-64 shrink-0 flex-col lg:flex" style={sidebarStyle}>
        {navContent(undefined)}
      </aside>

      {/* Topbar mobile */}
      <div
        className="fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-3 px-4 lg:hidden"
        style={{ background: 'var(--sidebar)', borderBottom: '1px solid var(--sidebar-border)' }}
      >
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          className="-ml-2 p-2 text-white"
          aria-label={t('layout.openMenu', { defaultValue: 'Abrir menu' })}
          aria-expanded={mobileMenuOpen}
          aria-controls="horas-mobile-drawer"
        >
          <Menu size={22} />
        </button>
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-white">
            <Clock size={15} />
          </span>
          <span className="text-sm font-semibold text-white">{t('layout.appName')}</span>
        </div>
      </div>

      {/* Overlay + drawer mobile */}
      <div
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity lg:hidden ${
          mobileMenuOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={() => setMobileMenuOpen(false)}
        aria-hidden="true"
      />
      <aside
        id="horas-mobile-drawer"
        className={`fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85%] flex-col transition-transform duration-200 ease-out lg:hidden ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={sidebarStyle}
      >
        {navContent(() => setMobileMenuOpen(false))}
      </aside>

      {/* Conteúdo */}
      <main className="flex-1 overflow-y-auto bg-surface p-4 pt-[4.5rem] sm:p-6 lg:pt-6">
        <Outlet />
      </main>
    </div>
  );
}
