import { useEffect, useMemo, useState } from 'react';
import { Download, FileSpreadsheet, RefreshCw, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api, getErrorMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import {
  SUMMARY_GROUPS,
  applySummaryGroups,
  buildCsv,
  downloadCsvText,
  sumFields,
} from '../lib/csv-export.js';

function currentMonthYm() {
  return new Date().toISOString().slice(0, 7);
}

/** Número com 2 casas e vírgula decimal; vazio quando não for número. */
function num2(value) {
  if (value === null || value === undefined || value === '') return '';
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  return n.toFixed(2).replace('.', ',');
}

const SUM_FIELDS = [
  'normalHours',
  'extraAndAttendanceHours',
  'extraAndAttendanceValue',
  'standbyAndBackupHours',
  'standbyAndBackupValue',
  'incrementalHours',
  'incrementalTotal',
  'totalCost',
];

export default function CsvExports() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState({
    month: currentMonthYm(),
    employeeIds: [],
    groups: [...SUMMARY_GROUPS],
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

  function monthLabel(ym) {
    const [y, m] = String(ym || '').split('-').map(Number);
    if (!y || !m) return ym || '';
    const locale = i18n.language?.toLowerCase().startsWith('pt') ? 'pt-BR' : 'en-US';
    const s = new Date(y, m - 1, 1).toLocaleDateString(locale, { month: 'long', year: 'numeric' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  const groupLabels = {
    normal: t('csvExports.group.normal', { defaultValue: 'Normal' }),
    extraAtt: t('csvExports.group.extraAtt', { defaultValue: 'Extras + Atendimento' }),
    standbyBackup: t('csvExports.group.standbyBackup', { defaultValue: 'Prontidão + Backup' }),
  };

  // Colunas do resumo — mesmas do Financeiro, reaproveitando as traduções finance.col.*.
  // As colunas de cada grupo de tipo de hora só entram se o grupo estiver marcado.
  function summaryColumns(groups) {
    const has = new Set(groups || SUMMARY_GROUPS);
    return [
      { header: t('finance.col.employee'), value: (r) => r.fullName || '' },
      { header: t('csvExports.colEmail', { defaultValue: 'E-mail' }), value: (r) => r.email || '' },
      { header: t('finance.col.squad'), value: (r) => r.squad || '' },
      { header: t('finance.col.monthlyRate'), value: (r) => num2(r.monthlyRate) },
      { header: t('finance.col.hourlyRef'), value: (r) => num2(r.referenceHourlyRate) },
      { header: t('finance.col.expectedHours'), value: (r) => num2(r.expectedHours) },
      has.has('normal') && {
        header: t('finance.col.normalHours'),
        value: (r) => num2(r.normalHours),
      },
      has.has('extraAtt') && {
        header: t('finance.col.extraAttH'),
        value: (r) => num2(r.extraAndAttendanceHours),
      },
      has.has('extraAtt') && {
        header: t('finance.col.extraAttValue'),
        value: (r) => num2(r.extraAndAttendanceValue),
      },
      has.has('standbyBackup') && {
        header: t('finance.col.standbyH'),
        value: (r) => num2(r.standbyAndBackupHours),
      },
      has.has('standbyBackup') && {
        header: t('finance.col.standbyValue'),
        value: (r) => num2(r.standbyAndBackupValue),
      },
      { header: t('finance.col.incrementalHours'), value: (r) => num2(r.incrementalHours) },
      { header: t('finance.col.incremental'), value: (r) => num2(r.incrementalTotal) },
      { header: t('finance.col.totalCost'), value: (r) => num2(r.totalCost) },
    ].filter(Boolean);
  }

  // Busca o resumo de custos do mês (mesmo endpoint da tela Financeiro), aplica
  // a seleção de colaboradores (vazia = todos) e os grupos de tipo de hora, e
  // acrescenta a linha Totais.
  async function buildSummaryForMonth(month, employeeIds, groups) {
    const res = await api.get('/api/finance/investment-calculator', { params: { month } });
    const allRows = Array.isArray(res.data?.rows) ? res.data.rows : [];
    const sel = Array.isArray(employeeIds) && employeeIds.length
      ? new Set(employeeIds.map((x) => String(x)))
      : null;
    const rows = (sel ? allRows.filter((r) => sel.has(String(r.userId))) : allRows).map((r) =>
      applySummaryGroups(r, groups)
    );
    const totals = { fullName: t('finance.totals'), email: '', squad: '', ...sumFields(rows, SUM_FIELDS) };
    const exportRows = rows.length ? [...rows, totals] : rows;
    return { rows, exportRows, meta: res.data };
  }

  function toggleGroup(group) {
    setForm((f) => ({
      ...f,
      groups: f.groups.includes(group)
        ? f.groups.filter((g) => g !== group)
        : SUMMARY_GROUPS.filter((g) => g === group || f.groups.includes(g)),
    }));
  }

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [listRes, usersRes] = await Promise.all([api.get('/api/csv-exports'), api.get('/api/users')]);
      setItems(Array.isArray(listRes.data) ? listRes.data : []);
      // Admins não entram no seletor (o resumo do Financeiro já os trata à parte).
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
    if (!form.month) {
      setError(t('csvExports.noMonth', { defaultValue: 'Selecione o mês de referência.' }));
      return;
    }
    if (form.groups.length === 0) {
      setError(t('csvExports.noHourTypes', { defaultValue: 'Selecione ao menos um tipo de hora.' }));
      return;
    }
    setGenerating(true);
    try {
      const { rows, exportRows } = await buildSummaryForMonth(
        form.month,
        form.employeeIds,
        form.groups
      );
      if (!rows.length) {
        setError(t('csvExports.noSummaryRows', { defaultValue: 'Nenhum colaborador no resumo deste mês.' }));
        return;
      }
      const fileName = `resumo_custos_${form.month}.csv`;
      // Baixa primeiro: o download não pode depender do registro no histórico.
      downloadCsvText(fileName, buildCsv(exportRows, summaryColumns(form.groups)));
      setSuccess(t('csvExports.generatedSuccess'));
      try {
        await api.post('/api/csv-exports', {
          month: form.month,
          employeeIds: form.employeeIds,
          groups: form.groups,
          fileName,
          rowCount: rows.length,
          status: 'READY',
          generatedById: user?.id || '',
          generatedByName: user?.fullName || '',
          createdAt: new Date().toISOString(),
        });
        await load();
      } catch {
        /* histórico é secundário; o CSV já foi baixado */
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setGenerating(false);
    }
  }

  // Re-baixa um item do histórico regerando o resumo a partir do mês/seleção salvos.
  async function downloadExport(item) {
    setError('');
    try {
      const month = item.month || String(item.fromDate || '').slice(0, 7) || currentMonthYm();
      // Itens antigos não têm grupos salvos: valem todos.
      const groups =
        Array.isArray(item.groups) && item.groups.length ? item.groups : [...SUMMARY_GROUPS];
      const { exportRows } = await buildSummaryForMonth(month, item.employeeIds || [], groups);
      downloadCsvText(
        item.fileName || `resumo_custos_${month}.csv`,
        buildCsv(exportRows, summaryColumns(groups))
      );
    } catch (err) {
      setError(getErrorMessage(err));
    }
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
            <span className="text-ink-muted">
              {t('csvExports.month', { defaultValue: 'Mês de referência' })}
            </span>
            <input
              type="month"
              value={form.month}
              onChange={(e) => setForm((f) => ({ ...f, month: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2"
            />
            <span className="mt-1 block text-xs text-ink-muted">{monthLabel(form.month)}</span>
          </label>
        </div>

        <div className="space-y-2 border-t border-gray-100 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-medium text-ink">
              {t('csvExports.employees')}
              <span className="ml-2 text-xs font-normal text-ink-muted">
                {form.employeeIds.length === 0
                  ? t('csvExports.allEmployees', { defaultValue: 'Todos' })
                  : `${form.employeeIds.length}/${users.length}`}
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
          <p className="text-xs text-ink-muted">
            {t('csvExports.employeesHint', {
              defaultValue: 'Sem seleção = todos os colaboradores do resumo.',
            })}
          </p>
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
                {form.groups.length}/{SUMMARY_GROUPS.length}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, groups: [...SUMMARY_GROUPS] }))}
                disabled={form.groups.length === SUMMARY_GROUPS.length}
                className="font-medium text-accent hover:underline disabled:opacity-40 disabled:no-underline"
              >
                {t('csvExports.selectAll', { defaultValue: 'Selecionar todos' })}
              </button>
              <span className="text-gray-300">·</span>
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, groups: [] }))}
                disabled={form.groups.length === 0}
                className="font-medium text-ink-muted hover:underline disabled:opacity-40 disabled:no-underline"
              >
                {t('csvExports.clear', { defaultValue: 'Limpar' })}
              </button>
            </div>
          </div>
          <p className="text-xs text-ink-muted">
            {t('csvExports.groupsHint', {
              defaultValue:
                'Tipos desmarcados saem do arquivo e não entram no custo incremental nem no custo total.',
            })}
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            {SUMMARY_GROUPS.map((group) => {
              const checked = form.groups.includes(group);
              return (
                <label
                  key={group}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors ${
                    checked ? 'border-accent bg-accent/5' : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-indigo-600"
                    checked={checked}
                    onChange={() => toggleGroup(group)}
                  />
                  <span className="text-ink">{groupLabels[group]}</span>
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
          {generating
            ? t('csvExports.generating', { defaultValue: 'Gerando…' })
            : t('csvExports.generateButton')}
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
                      {item.month
                        ? monthLabel(item.month)
                        : (item.fromDate || '-') + ' - ' + (item.toDate || '-')}
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
