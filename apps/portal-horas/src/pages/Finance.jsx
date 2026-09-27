import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { api, getErrorMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { fetchAdminIds } from '../lib/team.js';

function currentMonthYm() {
  return format(new Date(), 'yyyy-MM');
}

function shiftMonthYm(ym, delta) {
  const [y, m] = String(ym).split('-').map(Number);
  return format(new Date(y, (m || 1) - 1 + delta, 1), 'yyyy-MM');
}

export default function Finance() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [month, setMonth] = useState(currentMonthYm);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [adminIds, setAdminIds] = useState(() => new Set());

  const moneyFmt = useMemo(() => {
    const locale = i18n.language?.toLowerCase().startsWith('pt') ? 'pt-BR' : 'en-US';
    return new Intl.NumberFormat(locale, { style: 'currency', currency: 'BRL' });
  }, [i18n.language]);

  const numFmt = useMemo(() => {
    const locale = i18n.language?.toLowerCase().startsWith('pt') ? 'pt-BR' : 'en-US';
    return new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }, [i18n.language]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const params = { month };
        const [res, ids] = await Promise.all([
          api.get('/api/finance/investment-calculator', { params }),
          isAdmin ? fetchAdminIds() : Promise.resolve(new Set()),
        ]);
        if (!cancelled) {
          setData(res.data);
          setAdminIds(ids);
        }
      } catch (err) {
        if (!cancelled) setError(getErrorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [month, isAdmin]);

  const rows = data?.rows ?? [];
  const totals = data?.totals;

  // Admins não entram no relatório do time; recomputa o rodapé sem eles.
  const visibleRows = useMemo(
    () => (isAdmin ? rows.filter((r) => !adminIds.has(String(r.userId))) : rows),
    [rows, isAdmin, adminIds]
  );

  const visibleTotals = useMemo(() => {
    if (!isAdmin) return totals;
    if (!visibleRows.length) return null;
    const sum = (field) => visibleRows.reduce((s, r) => s + (Number(r[field]) || 0), 0);
    return {
      normalHours: sum('normalHours'),
      extraAndAttendanceHours: sum('extraAndAttendanceHours'),
      extraAndAttendanceValue: sum('extraAndAttendanceValue'),
      standbyAndBackupHours: sum('standbyAndBackupHours'),
      standbyAndBackupValue: sum('standbyAndBackupValue'),
      incrementalHours: sum('incrementalHours'),
      incrementalTotal: sum('incrementalTotal'),
      totalCost: sum('totalCost'),
      pendingIncrementalCost: sum('pendingIncrementalCost'),
    };
  }, [isAdmin, totals, visibleRows]);

  const monthLocale = i18n.language?.toLowerCase().startsWith('pt') ? 'pt-BR' : 'en-US';
  const [monthY, monthM] = String(month).split('-').map(Number);
  const rawMonthLabel = new Date(monthY, (monthM || 1) - 1, 1).toLocaleDateString(monthLocale, {
    month: 'long',
    year: 'numeric',
  });
  const monthLabel = rawMonthLabel.charAt(0).toUpperCase() + rawMonthLabel.slice(1);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">{t('finance.title')}</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {isAdmin ? t('finance.subtitleAdmin') : t('finance.subtitleSelf')}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label={t('finance.month')}
            onClick={() => setMonth((m) => shiftMonthYm(m, -1))}
            className="inline-flex rounded-lg border border-gray-300 p-2 text-ink hover:bg-gray-50"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="min-w-[9.5rem] text-center text-sm font-semibold text-ink">{monthLabel}</span>
          <button
            type="button"
            aria-label={t('finance.month')}
            onClick={() => setMonth((m) => shiftMonthYm(m, 1))}
            className="inline-flex rounded-lg border border-gray-300 p-2 text-ink hover:bg-gray-50"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {data && !loading && (
        <div className="rounded-lg border border-gray-200 bg-gray-50/60 px-4 py-3 text-sm text-ink-muted">
          <p>
            {t('finance.workingDays')}:{' '}
            <span className="font-medium text-ink">{data.workingDaysInMonth}</span>
            {' · '}
            {t('finance.expectedHours')}:{' '}
            <span className="font-medium text-ink">{numFmt.format(data.expectedHoursDefault)}h</span>
          </p>
          <p className="mt-1 text-xs">{t('finance.approvedOnlyHint')}</p>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {loading && <p className="text-sm text-ink-muted">{t('finance.loading')}</p>}

      {!loading && data && visibleRows.length === 0 && (
        <p className="text-sm text-ink-muted">{t('finance.noRows')}</p>
      )}

      {!loading && visibleRows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-[960px] w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/90 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted">
                {isAdmin && <th className="px-3 py-3">{t('finance.col.employee')}</th>}
                <th className="px-3 py-3">{t('finance.col.squad')}</th>
                <th className="px-3 py-3 text-right">{t('finance.col.monthlyRate')}</th>
                <th className="px-3 py-3 text-right">{t('finance.col.hourlyRef')}</th>
                <th className="px-3 py-3 text-right">{t('finance.col.expectedHours')}</th>
                <th className="px-3 py-3 text-right">{t('finance.col.normalHours')}</th>
                <th className="px-3 py-3 text-right">{t('finance.col.extraAttH')}</th>
                <th className="px-3 py-3 text-right">{t('finance.col.extraAttValue')}</th>
                <th className="px-3 py-3 text-right">{t('finance.col.standbyH')}</th>
                <th className="px-3 py-3 text-right">{t('finance.col.standbyValue')}</th>
                <th className="px-3 py-3 text-right">{t('finance.col.incrementalHours')}</th>
                <th className="px-3 py-3 text-right">{t('finance.col.incremental')}</th>
                <th className="px-3 py-3 text-right">{t('finance.col.totalCost')}</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.userId} className="border-b border-gray-100 last:border-0">
                  {isAdmin && (
                    <td className="px-3 py-3">
                      <div className="font-medium text-ink">{row.fullName}</div>
                      <div className="text-xs text-ink-muted">{row.email}</div>
                      {row.hasRateWarning && (
                        <div className="mt-1 text-xs text-amber-700">{t('finance.rateWarning')}</div>
                      )}
                    </td>
                  )}
                  <td className="px-3 py-3 text-ink-muted">{row.squad || t('finance.empty')}</td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {row.monthlyRate != null ? moneyFmt.format(row.monthlyRate) : '—'}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {row.referenceHourlyRate != null
                      ? moneyFmt.format(row.referenceHourlyRate)
                      : '—'}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {numFmt.format(row.expectedHours)}h
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {numFmt.format(row.normalHours)}h
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {numFmt.format(row.extraAndAttendanceHours)}h
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {moneyFmt.format(row.extraAndAttendanceValue)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {numFmt.format(row.standbyAndBackupHours)}h
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {moneyFmt.format(row.standbyAndBackupValue)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums font-medium text-ink">
                    {numFmt.format(row.incrementalHours)}h
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums font-medium text-ink">
                    {moneyFmt.format(row.incrementalTotal)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums font-semibold text-ink">
                    <div>{moneyFmt.format(row.totalCost)}</div>
                    {row.pendingIncrementalCost > 0 && (
                      <div className="mt-0.5 text-xs font-normal text-ink-muted">
                        {t('finance.pendingCostNote', {
                          amount: moneyFmt.format(row.pendingIncrementalCost),
                        })}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            {isAdmin && visibleTotals && visibleRows.length >= 1 && (
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50/90 font-semibold text-ink">
                  <td className="px-3 py-3" colSpan={5}>
                    {t('finance.totals')}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {numFmt.format(visibleTotals.normalHours)}h
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {numFmt.format(visibleTotals.extraAndAttendanceHours)}h
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {moneyFmt.format(visibleTotals.extraAndAttendanceValue)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {numFmt.format(visibleTotals.standbyAndBackupHours)}h
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {moneyFmt.format(visibleTotals.standbyAndBackupValue)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {numFmt.format(visibleTotals.incrementalHours)}h
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{moneyFmt.format(visibleTotals.incrementalTotal)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    <div>{moneyFmt.format(visibleTotals.totalCost)}</div>
                    {visibleTotals.pendingIncrementalCost > 0 && (
                      <div className="mt-0.5 text-xs font-normal text-ink-muted">
                        {t('finance.pendingCostNote', {
                          amount: moneyFmt.format(visibleTotals.pendingIncrementalCost),
                        })}
                      </div>
                    )}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {!isAdmin && !loading && visibleRows.length === 1 && visibleRows[0].hasRateWarning && (
        <p className="text-sm text-amber-800">{t('finance.rateWarningDetail')}</p>
      )}
    </div>
  );
}
