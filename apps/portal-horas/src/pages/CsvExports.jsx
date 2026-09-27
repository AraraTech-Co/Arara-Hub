import { useEffect, useMemo, useState } from 'react';
import { Download, FileSpreadsheet, RefreshCw, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api, getErrorMessage } from '../api/client.js';
import { HOUR_TYPE_ORDER, getHourTypeTranslationKey } from '../config/hourTypes.js';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function monthStartIso() {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

export default function CsvExports() {
  const { t } = useTranslation();
  const [items, setItems] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState({
    fromDate: monthStartIso(),
    toDate: todayIso(),
    employeeIds: [],
    hourTypes: [...HOUR_TYPE_ORDER],
  });
  const [filters, setFilters] = useState({
    fromDate: '',
    toDate: '',
    employee: '',
  });
  const [employeeSearch, setEmployeeSearch] = useState('');

  const filteredUsers = useMemo(() => {
    const q = employeeSearch.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => String(u.fullName || '').toLowerCase().includes(q));
  }, [users, employeeSearch]);

  const filteredItems = useMemo(() => {
    const emp = filters.employee.trim().toLowerCase();
    return items.filter((item) => {
      if (filters.fromDate && String(item.createdAt).slice(0, 10) < filters.fromDate) return false;
      if (filters.toDate && String(item.createdAt).slice(0, 10) > filters.toDate) return false;
      if (emp && !String(item.generatedByName || '').toLowerCase().includes(emp)) return false;
      return true;
    });
  }, [items, filters]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [listRes, usersRes] = await Promise.all([api.get('/api/csv-exports'), api.get('/api/users')]);
      setItems(Array.isArray(listRes.data) ? listRes.data : []);
      // Admins não entram em relatórios: fora do seletor de colaboradores.
      setUsers(
        (Array.isArray(usersRes.data) ? usersRes.data : []).filter((u) => u.role !== 'admin')
      );
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function generateExport(e) {
    e.preventDefault();
    if (generating) return;
    setError('');
    setSuccess('');
    if (form.fromDate && form.toDate && form.fromDate > form.toDate) {
      setError(
        t('csvExports.invalidRange', {
          defaultValue: 'A data inicial não pode ser maior que a final.',
        })
      );
      return;
    }
    if (form.hourTypes.length === 0) {
      setError(
        t('csvExports.noHourTypes', {
          defaultValue: 'Selecione ao menos um tipo de hora.',
        })
      );
      return;
    }
    setGenerating(true);
    try {
      await api.post('/api/csv-exports', form);
      setSuccess(t('csvExports.generatedSuccess'));
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setGenerating(false);
    }
  }

  async function downloadExport(item) {
    setError('');
    try {
      const response = await api.get(`/api/csv-exports/${item.id}/download`, { responseType: 'blob' });
      const blobUrl = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = item.fileName || 'hours-export.csv';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  function toggleHourType(type) {
    setForm((f) => ({
      ...f,
      hourTypes: f.hourTypes.includes(type)
        ? f.hourTypes.filter((x) => x !== type)
        : [...f.hourTypes, type],
    }));
  }

  function toggleEmployee(id) {
    setForm((f) => ({
      ...f,
      employeeIds: f.employeeIds.includes(id)
        ? f.employeeIds.filter((x) => x !== id)
        : [...f.employeeIds, id],
    }));
  }

  function selectAllEmployees() {
    setForm((f) => ({ ...f, employeeIds: users.map((u) => u.id) }));
  }

  function clearEmployees() {
    setForm((f) => ({ ...f, employeeIds: [] }));
  }

  function selectAllHourTypes() {
    setForm((f) => ({ ...f, hourTypes: [...HOUR_TYPE_ORDER] }));
  }

  function clearHourTypes() {
    setForm((f) => ({ ...f, hourTypes: [] }));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">{t('csvExports.title')}</h1>
          <p className="text-sm text-ink-muted">{t('csvExports.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50"
        >
          <RefreshCw size={14} />
          {t('csvExports.refresh')}
        </button>
      </div>

      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {success && <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</div>}

      <form onSubmit={generateExport} className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-ink">{t('csvExports.generate')}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="text-ink-muted">{t('csvExports.fromDate')}</span>
            <input
              type="date"
              value={form.fromDate}
              onChange={(e) => setForm((f) => ({ ...f, fromDate: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="text-ink-muted">{t('csvExports.toDate')}</span>
            <input
              type="date"
              value={form.toDate}
              onChange={(e) => setForm((f) => ({ ...f, toDate: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2"
            />
          </label>
        </div>

        <div className="space-y-2 border-t border-gray-100 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-medium text-ink">
              {t('csvExports.employees')}
              <span className="ml-2 text-xs font-normal text-ink-muted">
                {form.employeeIds.length}/{users.length}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <button
                type="button"
                onClick={selectAllEmployees}
                disabled={users.length === 0 || form.employeeIds.length === users.length}
                className="font-medium text-accent hover:underline disabled:opacity-40 disabled:no-underline"
              >
                {t('csvExports.selectAll', { defaultValue: 'Selecionar todos' })}
              </button>
              <span className="text-gray-300">·</span>
              <button
                type="button"
                onClick={clearEmployees}
                disabled={form.employeeIds.length === 0}
                className="font-medium text-ink-muted hover:underline disabled:opacity-40 disabled:no-underline"
              >
                {t('csvExports.clear', { defaultValue: 'Limpar' })}
              </button>
            </div>
          </div>
          <div className="relative">
            <Search
              size={15}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted"
            />
            <input
              type="text"
              value={employeeSearch}
              onChange={(e) => setEmployeeSearch(e.target.value)}
              placeholder={t('csvExports.searchEmployee', { defaultValue: 'Buscar colaborador…' })}
              className="w-full rounded-lg border border-gray-200 py-2 pl-8 pr-3 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          </div>
          <div className="max-h-48 space-y-0.5 overflow-auto rounded-lg border border-gray-200 p-1">
            {filteredUsers.length === 0 ? (
              <p className="px-2 py-4 text-center text-xs text-ink-muted">
                {t('csvExports.noEmployeesFound', { defaultValue: 'Nenhum colaborador encontrado.' })}
              </p>
            ) : (
              filteredUsers.map((u) => (
                <label
                  key={u.id}
                  className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-gray-50"
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-indigo-600"
                    checked={form.employeeIds.includes(u.id)}
                    onChange={() => toggleEmployee(u.id)}
                  />
                  <span className="text-ink">{u.fullName}</span>
                </label>
              ))
            )}
          </div>
        </div>

        <div className="space-y-2 border-t border-gray-100 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-medium text-ink">
              {t('csvExports.hourTypes')}
              <span className="ml-2 text-xs font-normal text-ink-muted">
                {form.hourTypes.length}/{HOUR_TYPE_ORDER.length}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <button
                type="button"
                onClick={selectAllHourTypes}
                disabled={form.hourTypes.length === HOUR_TYPE_ORDER.length}
                className="font-medium text-accent hover:underline disabled:opacity-40 disabled:no-underline"
              >
                {t('csvExports.selectAll', { defaultValue: 'Selecionar todos' })}
              </button>
              <span className="text-gray-300">·</span>
              <button
                type="button"
                onClick={clearHourTypes}
                disabled={form.hourTypes.length === 0}
                className="font-medium text-ink-muted hover:underline disabled:opacity-40 disabled:no-underline"
              >
                {t('csvExports.clear', { defaultValue: 'Limpar' })}
              </button>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {HOUR_TYPE_ORDER.map((type) => {
              const checked = form.hourTypes.includes(type);
              return (
                <label
                  key={type}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors ${
                    checked ? 'border-accent bg-accent/5' : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-indigo-600"
                    checked={checked}
                    onChange={() => toggleHourType(type)}
                  />
                  <span className="text-ink">
                    {t(getHourTypeTranslationKey(type), { defaultValue: type })}
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        <button
          type="submit"
          disabled={generating}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60"
        >
          <FileSpreadsheet size={16} />
          {t('csvExports.generateButton')}
        </button>
      </form>

      <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-ink">{t('csvExports.history')}</h2>
        <div className="grid gap-2 sm:grid-cols-3">
          <input
            type="date"
            value={filters.fromDate}
            onChange={(e) => setFilters((f) => ({ ...f, fromDate: e.target.value }))}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
          <input
            type="date"
            value={filters.toDate}
            onChange={(e) => setFilters((f) => ({ ...f, toDate: e.target.value }))}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
          <input
            placeholder={t('csvExports.filterByGenerator')}
            value={filters.employee}
            onChange={(e) => setFilters((f) => ({ ...f, employee: e.target.value }))}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-ink-muted">
              <tr>
                <th className="px-3 py-2">{t('csvExports.file')}</th>
                <th className="px-3 py-2">{t('csvExports.period')}</th>
                <th className="px-3 py-2">{t('csvExports.generatedBy')}</th>
                <th className="px-3 py-2">{t('csvExports.rows')}</th>
                <th className="px-3 py-2">{t('csvExports.status')}</th>
                <th className="px-3 py-2">{t('csvExports.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-3 py-5 text-center text-ink-muted">
                    {t('csvExports.loading')}
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-5 text-center text-ink-muted">
                    {t('csvExports.empty')}
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => (
                  <tr key={item.id} className="border-t border-gray-100">
                    <td className="px-3 py-2">{item.fileName}</td>
                    <td className="px-3 py-2">
                      {(item.fromDate || '-') + ' - ' + (item.toDate || '-')}
                    </td>
                    <td className="px-3 py-2">{item.generatedByName}</td>
                    <td className="px-3 py-2">{item.rowCount}</td>
                    <td className="px-3 py-2">{item.status}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => downloadExport(item)}
                        className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs hover:bg-gray-50"
                      >
                        <Download size={12} />
                        {t('csvExports.download')}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
