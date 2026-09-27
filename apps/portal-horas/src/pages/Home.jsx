import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Dashboard from './Dashboard.jsx';
import Insights from './Insights.jsx';

export default function Home() {
  const { user, canAccessScreen } = useAuth();
  const { t } = useTranslation();
  const location = useLocation();

  const isAdmin = user?.role === 'admin';
  const isManager = user?.role === 'admin' || user?.managerRole;

  const tabs = useMemo(() => {
    if (isAdmin) {
      // Admin: painel do time (Dashboard team-view), sem abas.
      return [];
    }
    if (isManager) {
      const managerTabs = [{ key: 'hours', label: t('layout.nav.hours') }];
      if (canAccessScreen('insights')) managerTabs.push({ key: 'insights', label: t('layout.nav.insights') });
      return managerTabs;
    }
    return [{ key: 'hours', label: t('layout.nav.hours') }];
  }, [canAccessScreen, isAdmin, isManager, t]);

  const [tab, setTab] = useState(() => tabs[0]?.key || 'hours');

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const wanted = params.get('tab');
    if (wanted && tabs.some((x) => x.key === wanted)) {
      setTab(wanted);
    } else if (params.get('new') === '1' || wanted === 'hours') {
      // Deep-link from calendar may force hours even if admin default tab is insights.
      setTab('hours');
    }
  }, [location.search, tabs]);

  return (
    <div>
      {tabs.length > 1 && (
        <div className="mb-6 flex gap-2">
          {tabs.map((it) => (
            <button
              key={it.key}
              type="button"
              onClick={() => setTab(it.key)}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                tab === it.key
                  ? 'bg-accent text-white'
                  : 'border border-gray-200 text-ink hover:bg-gray-50'
              }`}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}

      {tab === 'insights' && canAccessScreen('insights') ? <Insights /> : <Dashboard />}
    </div>
  );
}

