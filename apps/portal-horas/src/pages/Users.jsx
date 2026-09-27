import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Search, UserPlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api, getErrorMessage } from '../api/client.js';

const defaultForm = () => ({
  email: '',
  password: '',
  fullName: '',
  role: 'user',
  managerRole: false,
  active: true,
  squadId: '',
  rateType: '',
  hourlyRate: '',
  monthlyRate: '',
  canLogProject: true,
  canLogSupport: false,
  canLogBip: false,
  canLogBackup: false,
  emailNotifications: true,
});

function userToEditForm(u) {
  return {
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    role: u.role,
    managerRole: !!u.managerRole,
    active: !!u.active,
    squadId: u.squadId || '',
    rateType: u.rateType || '',
    hourlyRate: u.hourlyRate != null && u.hourlyRate !== '' ? String(u.hourlyRate) : '',
    monthlyRate: u.monthlyRate != null && u.monthlyRate !== '' ? String(u.monthlyRate) : '',
    canLogProject: !!u.canLogProject,
    canLogSupport: !!u.canLogSupport,
    canLogBip: !!u.canLogBip,
    canLogBackup: !!u.canLogBackup,
    emailNotifications: !!u.emailNotifications,
    newPassword: '',
    confirmPassword: '',
  };
}

const LOG_PERMISSION_KEYS = ['canLogProject', 'canLogSupport', 'canLogBip', 'canLogBackup'];
const logSelectedCount = (obj) => LOG_PERMISSION_KEYS.filter((k) => obj?.[k]).length;

const inputClass =
  'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-ink transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30';

function initials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export default function Users() {
  const { t } = useTranslation();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [squads, setSquads] = useState([]);
  const [showInactiveUsers, setShowInactiveUsers] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [userSearch, setUserSearch] = useState('');

  const visibleUsers = useMemo(
    () => (showInactiveUsers ? users : users.filter((u) => u.active)),
    [users, showInactiveUsers]
  );

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return visibleUsers;
    return visibleUsers.filter(
      (u) =>
        String(u.fullName || '').toLowerCase().includes(q) ||
        String(u.email || '').toLowerCase().includes(q)
    );
  }, [visibleUsers, userSearch]);

  const load = useCallback(async () => {
    setError('');
    try {
      const { data } = await api.get('/api/users');
      setUsers(Array.isArray(data) ? data : data ? [data] : []);
      try {
        const squadsRes = await api.get('/api/squads');
        const sq = squadsRes.data;
        setSquads((Array.isArray(sq) ? sq : []).filter((s) => s.active !== false));
      } catch {
        setSquads([]);
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function updateField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function updateEditField(key, value) {
    setEditForm((f) => (f ? { ...f, [key]: value } : f));
  }

  function setAllLog(value) {
    setForm((f) => ({
      ...f,
      ...Object.fromEntries(LOG_PERMISSION_KEYS.map((k) => [k, value])),
    }));
  }

  function setAllEditLog(value) {
    setEditForm((f) =>
      f ? { ...f, ...Object.fromEntries(LOG_PERMISSION_KEYS.map((k) => [k, value])) } : f
    );
  }

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSubmitting(true);
    try {
      const payload = {
        email: form.email.trim(),
        password: form.password,
        fullName: form.fullName.trim(),
        role: form.role,
        managerRole: form.managerRole,
        active: form.active,
        squadId: form.squadId || undefined,
        rateType: form.rateType || undefined,
        hourlyRate: form.hourlyRate === '' ? undefined : Number(form.hourlyRate),
        monthlyRate: form.monthlyRate === '' ? undefined : Number(form.monthlyRate),
        canLogProject: form.canLogProject,
        canLogSupport: form.canLogSupport,
        canLogBip: form.canLogBip,
        canLogBackup: form.canLogBackup,
        emailNotifications: form.emailNotifications,
      };
      await api.post('/api/users', payload);
      setSuccess(t('users.created'));
      setForm(defaultForm());
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSaveEdit(e) {
    e.preventDefault();
    if (!editForm) return;
    setError('');
    setSuccess('');
    const newPassword = editForm.newPassword.trim();
    const confirmPassword = editForm.confirmPassword.trim();
    const wantsPasswordChange = newPassword !== '' || confirmPassword !== '';
    if (wantsPasswordChange) {
      if (newPassword.length < 8) {
        setError(t('auth.passwordTooShort'));
        return;
      }
      if (newPassword !== confirmPassword) {
        setError(t('users.passwordMismatch'));
        return;
      }
    }
    setSavingEdit(true);
    try {
      const payload = {
        fullName: editForm.fullName.trim(),
        role: editForm.role,
        managerRole: editForm.managerRole,
        active: editForm.active,
        squadId: editForm.squadId === '' ? null : editForm.squadId,
        rateType: editForm.rateType || null,
        hourlyRate: editForm.hourlyRate === '' ? null : Number(editForm.hourlyRate),
        monthlyRate: editForm.monthlyRate === '' ? null : Number(editForm.monthlyRate),
        canLogProject: editForm.canLogProject,
        canLogSupport: editForm.canLogSupport,
        canLogBip: editForm.canLogBip,
        canLogBackup: editForm.canLogBackup,
        emailNotifications: editForm.emailNotifications,
      };
      if (newPassword !== '') {
        payload.password = newPassword;
      }
      await api.patch(`/api/users/${editForm.id}`, payload);
      setSuccess(wantsPasswordChange ? t('users.passwordReset') : t('users.userUpdated'));
      setEditForm(null);
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSavingEdit(false);
    }
  }

  async function toggleActive(u) {
    setError('');
    try {
      await api.patch(`/api/users/${u.id}`, { active: !u.active });
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  if (loading) {
    return <p className="text-ink-muted">{t('users.loading')}</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">{t('users.title')}</h1>
          <p className="text-sm text-ink-muted">{t('users.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate((v) => !v)}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            showCreate
              ? 'border border-gray-300 text-ink hover:bg-gray-50'
              : 'bg-accent text-white hover:bg-accent-hover'
          }`}
        >
          {showCreate ? (
            t('dashboard.cancel')
          ) : (
            <>
              <UserPlus size={16} />
              {t('users.newUserCta', { defaultValue: 'Novo usuário' })}
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}
      {success && (
        <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{success}</div>
      )}

      {showCreate && (
      <form
        onSubmit={handleCreate}
        className="space-y-5 rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
      >
        <h2 className="text-base font-semibold text-ink">{t('users.formTitle')}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm sm:col-span-2">
            <span className="text-ink-muted">{t('auth.email')}</span>
            <input
              type="email"
              required
              autoComplete="off"
              value={form.email}
              onChange={(e) => updateField('email', e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="text-ink-muted">{t('users.initialPassword')}</span>
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => updateField('password', e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="text-ink-muted">{t('auth.fullName')}</span>
            <input
              required
              value={form.fullName}
              onChange={(e) => updateField('fullName', e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block text-sm">
            <span className="text-ink-muted">{t('users.role')}</span>
            <select
              value={form.role}
              onChange={(e) => updateField('role', e.target.value)}
              className={inputClass}
            >
              <option value="user">{t('users.roleUser')}</option>
              <option value="admin">{t('users.roleAdmin')}</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-ink-muted">{t('users.squad')}</span>
            <select
              value={form.squadId}
              onChange={(e) => updateField('squadId', e.target.value)}
              className={inputClass}
            >
              <option value="">{t('users.squadUnset')}</option>
              {squads.map((squad) => (
                <option key={squad.id} value={squad.id}>
                  {squad.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={form.managerRole}
              onChange={(e) => updateField('managerRole', e.target.checked)}
            />
            {t('users.managerRole')}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => updateField('active', e.target.checked)}
            />
            {t('users.active')}
          </label>
          <label className="block text-sm">
            <span className="text-ink-muted">{t('users.rateType')}</span>
            <select
              value={form.rateType}
              onChange={(e) => updateField('rateType', e.target.value)}
              className={inputClass}
            >
              <option value="">{t('users.rateTypeUnset')}</option>
              <option value="hourly">{t('users.rateHourly')}</option>
              <option value="monthly">{t('users.rateMonthly')}</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-ink-muted">{t('users.hourlyRate')}</span>
            <input
              type="number"
              step="0.01"
              value={form.hourlyRate}
              onChange={(e) => updateField('hourlyRate', e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block text-sm">
            <span className="text-ink-muted">{t('users.monthlyRate')}</span>
            <input
              type="number"
              step="0.01"
              value={form.monthlyRate}
              onChange={(e) => updateField('monthlyRate', e.target.value)}
              className={inputClass}
            />
          </label>
        </div>
        <div className="space-y-2 rounded-lg border border-gray-100 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-medium text-ink">
              {t('users.logPermissions')}
              <span className="ml-2 text-xs font-normal text-ink-muted">
                {logSelectedCount(form)}/{LOG_PERMISSION_KEYS.length}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <button
                type="button"
                onClick={() => setAllLog(true)}
                disabled={logSelectedCount(form) === LOG_PERMISSION_KEYS.length}
                className="font-medium text-accent hover:underline disabled:opacity-40 disabled:no-underline"
              >
                {t('common.selectAll', { defaultValue: 'Selecionar todos' })}
              </button>
              <span className="text-gray-300">·</span>
              <button
                type="button"
                onClick={() => setAllLog(false)}
                disabled={logSelectedCount(form) === 0}
                className="font-medium text-ink-muted hover:underline disabled:opacity-40 disabled:no-underline"
              >
                {t('common.clear', { defaultValue: 'Limpar' })}
              </button>
            </div>
          </div>
          {LOG_PERMISSION_KEYS.map((key) => (
            <label
              key={key}
              className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-sm hover:bg-gray-50"
            >
              <input
                type="checkbox"
                className="h-4 w-4 accent-indigo-600"
                checked={form[key]}
                onChange={(e) => updateField(key, e.target.checked)}
              />
              {t(`users.${key}`)}
            </label>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.emailNotifications}
            onChange={(e) => updateField('emailNotifications', e.target.checked)}
          />
          {t('users.emailNotifications')}
        </label>
        <div className="flex gap-2 border-t border-gray-100 pt-4">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60"
          >
            {submitting ? t('users.creating') : t('users.create')}
          </button>
          <button
            type="button"
            onClick={() => setShowCreate(false)}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-ink hover:bg-gray-50"
          >
            {t('dashboard.cancel')}
          </button>
        </div>
      </form>
      )}

      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-baseline gap-2">
            <h2 className="text-base font-semibold text-ink">{t('users.listTitle')}</h2>
            <span className="text-xs text-ink-muted">{filteredUsers.length}</span>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative">
              <Search
                size={15}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted"
              />
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder={t('users.searchPlaceholder', { defaultValue: 'Buscar por nome ou e-mail…' })}
                className="w-full rounded-lg border border-gray-300 py-2 pl-8 pr-3 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 sm:w-64"
              />
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-muted sm:shrink-0">
              <input
                type="checkbox"
                className="h-4 w-4 accent-indigo-600"
                checked={showInactiveUsers}
                onChange={(e) => setShowInactiveUsers(e.target.checked)}
              />
              {t('users.showInactiveUsers')}
            </label>
          </div>
        </div>
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-3 font-medium">{t('users.colUser', { defaultValue: 'Usuário' })}</th>
                <th className="px-4 py-3 font-medium">{t('users.role')}</th>
                <th className="px-4 py-3 font-medium">{t('users.squad')}</th>
                <th className="px-4 py-3 font-medium">{t('users.managerShort')}</th>
                <th className="px-4 py-3 font-medium">{t('users.statusCol', { defaultValue: 'Status' })}</th>
                <th className="px-4 py-3 text-right font-medium">{t('csvExports.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-ink-muted">
                    {t('users.emptyList', { defaultValue: 'Nenhum usuário encontrado.' })}
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => (
                  <tr key={u.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/60">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/10 text-xs font-semibold text-accent">
                          {initials(u.fullName)}
                        </span>
                        <div className="min-w-0">
                          <div className="truncate font-medium text-ink">{u.fullName}</div>
                          <div className="truncate text-xs text-ink-muted">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          u.role === 'admin'
                            ? 'bg-indigo-50 text-indigo-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {u.role === 'admin' ? t('users.roleAdmin') : t('users.roleUser')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-ink-muted">{u.squadConfig?.name || u.squad || '—'}</td>
                    <td className="px-4 py-3">
                      {u.managerRole ? (
                        <span className="inline-flex rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                          {t('common.yes')}
                        </span>
                      ) : (
                        <span className="text-xs text-ink-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
                          u.active ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            u.active ? 'bg-emerald-500' : 'bg-gray-400'
                          }`}
                        />
                        {u.active
                          ? t('users.statusActive', { defaultValue: 'Ativo' })
                          : t('users.statusInactive', { defaultValue: 'Inativo' })}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-3">
                        <button
                          type="button"
                          onClick={() => setEditForm(userToEditForm(u))}
                          className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline"
                        >
                          <Pencil size={13} />
                          {t('users.edit', { defaultValue: 'Editar' })}
                        </button>
                        <span className="text-gray-300">·</span>
                        <button
                          type="button"
                          onClick={() => toggleActive(u)}
                          className={`text-sm font-medium hover:underline ${
                            u.active ? 'text-red-600' : 'text-emerald-700'
                          }`}
                        >
                          {u.active ? t('users.deactivate') : t('users.activate')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editForm && (
        <div
          className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditForm(null);
          }}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
            role="dialog"
            aria-labelledby="edit-user-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="edit-user-title" className="text-lg font-semibold text-ink">
              {t('users.editUserTitle')}
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              <span className="text-ink-muted">{t('auth.email')}: </span>
              {editForm.email}
            </p>
            <form onSubmit={handleSaveEdit} className="mt-4 space-y-4">
              <fieldset className="space-y-3 rounded-lg border border-gray-100 p-3">
                <legend className="text-sm font-medium text-ink">{t('auth.password')}</legend>
                <p className="text-xs text-ink-muted">{t('users.passwordHint')}</p>
                <label className="block text-sm">
                  <span className="text-ink-muted">{t('users.newPassword')}</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={editForm.newPassword}
                    onChange={(e) => updateEditField('newPassword', e.target.value)}
                    className={inputClass}
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-ink-muted">{t('users.confirmPassword')}</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={editForm.confirmPassword}
                    onChange={(e) => updateEditField('confirmPassword', e.target.value)}
                    className={inputClass}
                  />
                </label>
              </fieldset>
              <label className="block text-sm">
                <span className="text-ink-muted">{t('auth.fullName')}</span>
                <input
                  required
                  value={editForm.fullName}
                  onChange={(e) => updateEditField('fullName', e.target.value)}
                  className={inputClass}
                />
              </label>
              <label className="block text-sm">
                <span className="text-ink-muted">{t('users.role')}</span>
                <select
                  value={editForm.role}
                  onChange={(e) => updateEditField('role', e.target.value)}
                  className={inputClass}
                >
                  <option value="user">{t('users.roleUser')}</option>
                  <option value="admin">{t('users.roleAdmin')}</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-ink-muted">{t('users.squad')}</span>
                <select
                  value={editForm.squadId}
                  onChange={(e) => updateEditField('squadId', e.target.value)}
                  className={inputClass}
                >
                  <option value="">{t('users.squadUnset')}</option>
                  {editForm.squadId && !squads.some((s) => s.id === editForm.squadId) && (
                    <option value={editForm.squadId}>
                      {t('users.currentSquadInactive', { defaultValue: 'Squad atual (inativo)' })}
                    </option>
                  )}
                  {squads.map((squad) => (
                    <option key={squad.id} value={squad.id}>
                      {squad.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editForm.managerRole}
                  onChange={(e) => updateEditField('managerRole', e.target.checked)}
                />
                {t('users.managerRole')}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editForm.active}
                  onChange={(e) => updateEditField('active', e.target.checked)}
                />
                {t('users.active')}
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm sm:col-span-2">
                  <span className="text-ink-muted">{t('users.rateType')}</span>
                  <select
                    value={editForm.rateType}
                    onChange={(e) => updateEditField('rateType', e.target.value)}
                    className={inputClass}
                  >
                    <option value="">{t('users.rateTypeUnset')}</option>
                    <option value="hourly">{t('users.rateHourly')}</option>
                    <option value="monthly">{t('users.rateMonthly')}</option>
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="text-ink-muted">{t('users.hourlyRate')}</span>
                  <input
                    type="number"
                    step="0.01"
                    value={editForm.hourlyRate}
                    onChange={(e) => updateEditField('hourlyRate', e.target.value)}
                    className={inputClass}
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-ink-muted">{t('users.monthlyRate')}</span>
                  <input
                    type="number"
                    step="0.01"
                    value={editForm.monthlyRate}
                    onChange={(e) => updateEditField('monthlyRate', e.target.value)}
                    className={inputClass}
                  />
                </label>
              </div>
              <div className="space-y-2 rounded-lg border border-gray-100 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-medium text-ink">
                    {t('users.logPermissions')}
                    <span className="ml-2 text-xs font-normal text-ink-muted">
                      {logSelectedCount(editForm)}/{LOG_PERMISSION_KEYS.length}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <button
                      type="button"
                      onClick={() => setAllEditLog(true)}
                      disabled={logSelectedCount(editForm) === LOG_PERMISSION_KEYS.length}
                      className="font-medium text-accent hover:underline disabled:opacity-40 disabled:no-underline"
                    >
                      {t('common.selectAll', { defaultValue: 'Selecionar todos' })}
                    </button>
                    <span className="text-gray-300">·</span>
                    <button
                      type="button"
                      onClick={() => setAllEditLog(false)}
                      disabled={logSelectedCount(editForm) === 0}
                      className="font-medium text-ink-muted hover:underline disabled:opacity-40 disabled:no-underline"
                    >
                      {t('common.clear', { defaultValue: 'Limpar' })}
                    </button>
                  </div>
                </div>
                {LOG_PERMISSION_KEYS.map((key) => (
                  <label
                    key={key}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-sm hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-indigo-600"
                      checked={editForm[key]}
                      onChange={(e) => updateEditField(key, e.target.checked)}
                    />
                    {t(`users.${key}`)}
                  </label>
                ))}
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editForm.emailNotifications}
                  onChange={(e) => updateEditField('emailNotifications', e.target.checked)}
                />
                {t('users.emailNotifications')}
              </label>
              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditForm(null)}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-ink hover:bg-gray-50"
                >
                  {t('dashboard.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-95 disabled:opacity-60"
                >
                  {savingEdit ? t('dashboard.saving') : t('users.saveUser')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
