import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, getErrorMessage } from '../api/client.js';
import { inputClass } from '../lib/ui.js';
import { useAuth } from '../context/AuthContext.jsx';
import i18n, { STORAGE_KEY } from '../i18n/index.js';
import { SCREEN_KEYS } from '../config/screenPermissions.js';

export default function Settings() {
  const { refreshUser, isAdmin } = useAuth();
  const { t } = useTranslation();
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [language, setLanguage] = useState(i18n.language === 'en' ? 'en' : 'pt-BR');
  const [squads, setSquads] = useState([]);
  const [savingSquad, setSavingSquad] = useState(false);
  const [editingSquadId, setEditingSquadId] = useState('');
  const [squadForm, setSquadForm] = useState({
    name: '',
    active: true,
    screenPermissions: [...SCREEN_KEYS],
  });

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/api/user-settings');
        setSettings(data);
      } catch (err) {
        setError(getErrorMessage(err));
      }
    })();
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      try {
        const { data } = await api.get('/api/squads');
        setSquads(data || []);
      } catch (err) {
        setError(getErrorMessage(err));
      }
    })();
  }, [isAdmin]);

  function toggleScreenPermission(screenKey) {
    setSquadForm((current) => {
      const has = current.screenPermissions.includes(screenKey);
      return {
        ...current,
        screenPermissions: has
          ? current.screenPermissions.filter((key) => key !== screenKey)
          : [...current.screenPermissions, screenKey],
      };
    });
  }

  function selectAllScreens() {
    setSquadForm((s) => ({ ...s, screenPermissions: [...SCREEN_KEYS] }));
  }

  function clearScreens() {
    setSquadForm((s) => ({ ...s, screenPermissions: [] }));
  }

  function resetSquadForm() {
    setEditingSquadId('');
    setSquadForm({
      name: '',
      active: true,
      screenPermissions: [...SCREEN_KEYS],
    });
  }

  function editSquad(squad) {
    setEditingSquadId(squad.id);
    setSquadForm({
      name: squad.name || '',
      active: squad.active,
      screenPermissions: Array.isArray(squad.screenPermissions)
        ? squad.screenPermissions
        : [...SCREEN_KEYS],
    });
  }

  async function saveSquad(e) {
    e.preventDefault();
    if (!squadForm.name.trim()) return;
    setSavingSquad(true);
    setError('');
    try {
      const payload = {
        name: squadForm.name.trim(),
        active: squadForm.active,
        screenPermissions: squadForm.screenPermissions,
      };
      if (editingSquadId) {
        await api.patch(`/api/squads/${editingSquadId}`, payload);
      } else {
        await api.post('/api/squads', payload);
      }
      const { data } = await api.get('/api/squads');
      setSquads(data || []);
      resetSquadForm();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSavingSquad(false);
    }
  }

  async function save(e) {
    e.preventDefault();
    if (saving) return;
    setError('');
    setSaved(false);
    setSaving(true);
    try {
      const { data } = await api.put('/api/user-settings', settings);
      setSettings(data);
      setSaved(true);
      await refreshUser();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleLanguageChange(nextLanguage) {
    const normalized = nextLanguage === 'en' ? 'en' : 'pt-BR';
    await i18n.changeLanguage(normalized);
    window.localStorage.setItem(STORAGE_KEY, normalized);
    setLanguage(normalized);
  }

  if (!settings) {
    return <p className="text-ink-muted">{t('settings.loading')}</p>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-ink">{t('settings.title')}</h1>
      <p className="text-sm text-ink-muted">{t('settings.subtitle')}</p>

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}
      {saved && (
        <div className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {t('settings.saved')}
        </div>
      )}

      <form onSubmit={save} className="max-w-lg space-y-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <label className="block text-sm">
          <span className="text-ink-muted">{t('settings.timezone')}</span>
          <input
            value={settings.timezone}
            onChange={(e) => setSettings((s) => ({ ...s, timezone: e.target.value }))}
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          <span className="text-ink-muted">{t('settings.weekStartsOn')}</span>
          <input
            type="number"
            min={0}
            max={6}
            value={settings.weekStartsOn}
            onChange={(e) =>
              setSettings((s) => ({ ...s, weekStartsOn: Number(e.target.value) }))
            }
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          <span className="text-ink-muted">{t('settings.defaultView')}</span>
          <select
            value={settings.defaultView}
            onChange={(e) => setSettings((s) => ({ ...s, defaultView: e.target.value }))}
            className={inputClass}
          >
            <option value="list">{t('settings.viewList')}</option>
            <option value="calendar">{t('settings.viewCalendar')}</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.emailDigest}
            onChange={(e) => setSettings((s) => ({ ...s, emailDigest: e.target.checked }))}
          />
          {t('settings.emailDigest')}
        </label>
        <label className="block text-sm">
          <span className="text-ink-muted">{t('settings.language')}</span>
          <select
            value={language}
            onChange={(e) => handleLanguageChange(e.target.value)}
            className={inputClass}
          >
            <option value="pt-BR">Português (Brasil)</option>
            <option value="en">English</option>
          </select>
        </label>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60"
        >
          {t('settings.save')}
        </button>
      </form>

      {isAdmin && (
        <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div>
            <h2 className="text-lg font-semibold text-ink">{t('settings.squadsTitle')}</h2>
            <p className="text-sm text-ink-muted">{t('settings.squadsSubtitle')}</p>
          </div>

          <form onSubmit={saveSquad} className="grid gap-3 rounded-lg border border-gray-200 p-4">
            <label className="text-sm">
              <span className="text-ink-muted">{t('settings.squadName')}</span>
              <input
                value={squadForm.name}
                onChange={(e) => setSquadForm((s) => ({ ...s, name: e.target.value }))}
                className={inputClass}
                required
              />
            </label>
            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm text-ink-muted">
                  {t('settings.squadScreens')}
                  <span className="ml-2 text-xs text-ink-muted">
                    {squadForm.screenPermissions.length}/{SCREEN_KEYS.length}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <button
                    type="button"
                    onClick={selectAllScreens}
                    disabled={squadForm.screenPermissions.length === SCREEN_KEYS.length}
                    className="font-medium text-accent hover:underline disabled:opacity-40 disabled:no-underline"
                  >
                    {t('common.selectAll', { defaultValue: 'Selecionar todos' })}
                  </button>
                  <span className="text-gray-300">·</span>
                  <button
                    type="button"
                    onClick={clearScreens}
                    disabled={squadForm.screenPermissions.length === 0}
                    className="font-medium text-ink-muted hover:underline disabled:opacity-40 disabled:no-underline"
                  >
                    {t('common.clear', { defaultValue: 'Limpar' })}
                  </button>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {SCREEN_KEYS.map((screenKey) => {
                  const checked = squadForm.screenPermissions.includes(screenKey);
                  return (
                    <label
                      key={screenKey}
                      className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                        checked ? 'border-accent bg-accent/5' : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-indigo-600"
                        checked={checked}
                        onChange={() => toggleScreenPermission(screenKey)}
                      />
                      {t(`settings.screenKeys.${screenKey}`)}
                    </label>
                  );
                })}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={squadForm.active}
                onChange={(e) => setSquadForm((s) => ({ ...s, active: e.target.checked }))}
              />
              {t('settings.squadActive')}
            </label>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={savingSquad}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60"
              >
                {savingSquad
                  ? t('settings.squadSaving')
                  : editingSquadId
                    ? t('settings.squadUpdate')
                    : t('settings.squadCreate')}
              </button>
              {editingSquadId && (
                <button
                  type="button"
                  onClick={resetSquadForm}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm"
                >
                  {t('settings.cancel')}
                </button>
              )}
            </div>
          </form>

          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  <th className="px-3 py-2 font-medium">{t('settings.squadName')}</th>
                  <th className="px-3 py-2 font-medium">{t('settings.squadScreens')}</th>
                  <th className="px-3 py-2 font-medium">{t('settings.squadActive')}</th>
                  <th className="px-3 py-2 font-medium">{t('settings.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {squads.map((squad) => (
                  <tr key={squad.id} className="border-b border-gray-100">
                    <td className="px-3 py-2">{squad.name}</td>
                    <td className="px-3 py-2">
                      {(squad.screenPermissions || [])
                        .map((key) => t(`settings.screenKeys.${key}`))
                        .join(', ')}
                    </td>
                    <td className="px-3 py-2">{squad.active ? t('common.yes') : t('common.no')}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => editSquad(squad)}
                        className="text-accent underline hover:no-underline"
                      >
                        {t('settings.editSquad')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
