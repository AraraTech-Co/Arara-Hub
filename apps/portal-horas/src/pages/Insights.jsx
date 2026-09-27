import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, XCircle, Clock3 } from 'lucide-react';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { api, getErrorMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { HOUR_TYPE_ORDER, getHourTypeTranslationKey, getHourTypeUi } from '../config/hourTypes.js';
import { fetchAdminIds } from '../lib/team.js';

function formatDuration(min) {
  if (min == null) return '-';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${m.toString().padStart(2, '0')}m`;
}

function sumByHourType(entries) {
  const acc = Object.fromEntries(HOUR_TYPE_ORDER.map((k) => [k, 0]));
  for (const en of entries) {
    if (acc[en.hourType] != null) acc[en.hourType] += en.durationMinutes || 0;
  }
  return acc;
}

export default function Insights() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isReviewer = user?.role === 'admin' || user?.managerRole;

  const [month, setMonth] = useState(() => format(new Date(), 'yyyy-MM'));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pending, setPending] = useState([]);
  const [approved, setApproved] = useState([]);
  const [rejected, setRejected] = useState([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const isReviewer = user?.role === 'admin' || user?.managerRole;
        const baseParams = { limit: 500, ...(isReviewer || !user?.id ? {} : { user_id: user.id }) };
        const [pRes, aRes, adjRes, rRes, adminIds] = await Promise.all([
          isReviewer
            ? api.get('/api/hour-entries', { params: { ...baseParams, status: 'PENDING' } })
            : Promise.resolve({ data: [] }),
          api.get('/api/hour-entries', { params: { ...baseParams, status: 'APPROVED' } }),
          api.get('/api/hour-entries', { params: { ...baseParams, status: 'ADJUSTED' } }),
          api.get('/api/hour-entries', { params: { ...baseParams, status: 'REJECTED' } }),
          isReviewer ? fetchAdminIds() : Promise.resolve(new Set()),
        ]);
        if (cancelled) return;
        const notAdmin = (rows) =>
          (Array.isArray(rows) ? rows : []).filter((e) => !adminIds.has(String(e.userId)));
        const filterMonth = (rows) =>
          notAdmin(rows).filter((e) => (month ? String(e.date || '').startsWith(month) : true));
        const filterStatus = (rows, status) => notAdmin(rows).filter((e) => e.status === status);
        setPending(filterStatus(pRes.data, 'PENDING'));
        setApproved([
          ...filterMonth(filterStatus(aRes.data, 'APPROVED')),
          ...filterMonth(filterStatus(adjRes.data, 'ADJUSTED')),
        ]);
        setRejected(filterMonth(filterStatus(rRes.data, 'REJECTED')));
      } catch (err) {
        if (cancelled) return;
        setError(getErrorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [month, isReviewer, user?.id]);

  const approvedByType = useMemo(() => sumByHourType(approved), [approved]);
  const rejectedByType = useMemo(() => sumByHourType(rejected), [rejected]);

  const approvedTotal = useMemo(
    () => approved.reduce((acc, en) => acc + (en.durationMinutes || 0), 0),
    [approved]
  );
  const rejectedTotal = useMemo(
    () => rejected.reduce((acc, en) => acc + (en.durationMinutes || 0), 0),
    [rejected]
  );

  const approvedMax = Math.max(1, ...HOUR_TYPE_ORDER.map((k) => approvedByType[k] || 0));
  const rejectedMax = Math.max(1, ...HOUR_TYPE_ORDER.map((k) => rejectedByType[k] || 0));

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">{t('insights.title')}</h1>
          <p className="text-sm text-ink-muted">{t('insights.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            aria-label={t('insights.monthLabel', { defaultValue: 'Mês de referência' })}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {isReviewer && (
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                {t('insights.pendingTotal')}
              </span>
              <Clock3 size={16} className="text-amber-500" />
            </div>
            <div className="mt-2 text-2xl font-semibold tabular-nums text-ink">
              {loading ? '—' : pending.length}
            </div>
          </div>
        )}
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">
              {t('insights.approvedTotal')}
            </span>
            <CheckCircle2 size={16} className="text-emerald-500" />
          </div>
          <div className="mt-2 text-2xl font-semibold tabular-nums text-ink">
            {loading ? '—' : formatDuration(approvedTotal)}
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">
              {t('insights.rejectedTotal')}
            </span>
            <XCircle size={16} className="text-red-500" />
          </div>
          <div className="mt-2 text-2xl font-semibold tabular-nums text-ink">
            {loading ? '—' : formatDuration(rejectedTotal)}
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-ink">{t('insights.approvedByType')}</h2>
          <div className="mt-4 space-y-3">
            {HOUR_TYPE_ORDER.map((k) => {
              const v = approvedByType[k] || 0;
              return (
                <div key={k}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-ink-muted">{t(getHourTypeTranslationKey(k))}</span>
                    <span className="tabular-nums font-medium text-ink">
                      {loading ? '—' : formatDuration(v)}
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className={`h-full rounded-full ${getHourTypeUi(k).dotClass}`}
                      style={{ width: `${Math.round((v / approvedMax) * 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-ink">{t('insights.rejectedByType')}</h2>
          <div className="mt-4 space-y-3">
            {HOUR_TYPE_ORDER.map((k) => {
              const v = rejectedByType[k] || 0;
              return (
                <div key={k}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-ink-muted">{t(getHourTypeTranslationKey(k))}</span>
                    <span className="tabular-nums font-medium text-ink">
                      {loading ? '—' : formatDuration(v)}
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-red-400"
                      style={{ width: `${Math.round((v / rejectedMax) * 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

