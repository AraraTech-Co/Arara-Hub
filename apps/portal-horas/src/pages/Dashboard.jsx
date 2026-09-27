import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock3,
  Users as UsersIcon,
  TrendingUp,
  Plus,
} from 'lucide-react';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, getErrorMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import {
  HOUR_TYPES,
  HOUR_TYPE_ORDER,
  countsTowardApprovedHourTotals,
  getHourTypeTranslationKey,
  getHourTypeUi,
  resolveAllowedHourTypesByUser,
} from '../config/hourTypes.js';
import {
  isReasonHourType,
  reasonGroupsForUser,
  reasonLabelKey,
} from '../config/hourReasons.js';
import {
  HourTypeBadge,
  HourTypeLegendItem,
} from '../components/hour-type/HourTypeBadge.jsx';
import { CONTEST_MESSAGE_MIN_LEN } from '../constants/contest.js';

function shiftMonthString(monthStr, delta) {
  const [y, m] = monthStr.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return format(d, 'yyyy-MM');
}

function formatDuration(min) {
  if (min == null) return '-';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${m.toString().padStart(2, '0')}m`;
}

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

export default function Dashboard() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [month, setMonth] = useState(() => format(new Date(), 'yyyy-MM'));
  const [entries, setEntries] = useState([]);
  const [clients, setClients] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [contestingId, setContestingId] = useState(null);
  const [contestMessage, setContestMessage] = useState('');
  const [actingId, setActingId] = useState(null);
  const [infoMessage, setInfoMessage] = useState('');
  const loadSeq = useRef(0);
  const defaultForm = (dateOverride) => ({
    date: dateOverride || format(new Date(), 'yyyy-MM-dd'),
    startTime: '09:00',
    endTime: '18:00',
    breakMinutes: 60,
    hourType: HOUR_TYPES.NORMAL,
    clientId: '',
    ticket: '',
    description: '',
    forceNormal: false,
    reasons: [],
  });
  const [form, setForm] = useState(() => defaultForm());

  useEffect(() => {
    const openNew = searchParams.get('new') === '1';
    const dateParam = searchParams.get('date');
    if (!openNew) return;
    const dateOk = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : null;
    setError('');
    setInfoMessage('');
    setEditingId(null);
    setForm(defaultForm(dateOk || undefined));
    if (dateOk) setMonth(dateOk.slice(0, 7));
    setFormOpen(true);
    navigate({ pathname: '/', search: '' }, { replace: true });
  }, [searchParams, navigate]);

  const load = async () => {
    const seq = (loadSeq.current += 1);
    setLoading(true);
    setError('');
    try {
      const isAdmin = user?.role === 'admin';
      const entryParams = { limit: 500 };
      if (!isAdmin && user?.id) entryParams.user_id = user.id;
      const reqs = [
        api.get('/api/hour-entries', { params: entryParams }),
        api.get('/api/clients'),
      ];
      if (isAdmin) reqs.push(api.get('/api/users'));
      const [eRes, cRes, uRes] = await Promise.all(reqs);
      if (seq !== loadSeq.current) return;
      let list = Array.isArray(eRes.data) ? eRes.data : [];
      if (month) {
        list = list.filter((e) => String(e.date || '').startsWith(month));
      }
      list = list.slice().sort((a, b) => {
        const da = String(a.date || '');
        const db = String(b.date || '');
        if (da !== db) return db.localeCompare(da);
        return String(b.startTime || '').localeCompare(String(a.startTime || ''));
      });
      setEntries(list);
      setClients(Array.isArray(cRes.data) ? cRes.data : []);
      setUsers(isAdmin && uRes && Array.isArray(uRes.data) ? uRes.data : []);
    } catch (err) {
      if (seq === loadSeq.current) setError(getErrorMessage(err));
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [month, user?.id, user?.role, user?.managerRole]);

  const stats = useMemo(() => {
    const acc = Object.fromEntries(HOUR_TYPE_ORDER.map((type) => [type, 0]));
    for (const en of entries) {
      if (!countsTowardApprovedHourTotals(en.status)) continue;
      if (acc[en.hourType] != null) acc[en.hourType] += en.durationMinutes || 0;
    }
    return acc;
  }, [entries]);

  const pendingStats = useMemo(() => {
    const acc = Object.fromEntries(HOUR_TYPE_ORDER.map((type) => [type, 0]));
    for (const en of entries) {
      if (en.status !== 'PENDING') continue;
      if (acc[en.hourType] != null) acc[en.hourType] += en.durationMinutes || 0;
    }
    return acc;
  }, [entries]);

  // ===== Visão de admin: painel do time (admins excluídos dos relatórios) =====
  const isAdminView = user?.role === 'admin';

  const usersById = useMemo(() => {
    const m = {};
    for (const u of users) m[String(u.id)] = u;
    return m;
  }, [users]);

  const adminIds = useMemo(
    () => new Set(users.filter((u) => u.role === 'admin').map((u) => String(u.id))),
    [users]
  );

  const teamEntries = useMemo(
    () => (isAdminView ? entries.filter((e) => !adminIds.has(String(e.userId))) : entries),
    [isAdminView, entries, adminIds]
  );

  const teamTotals = useMemo(() => {
    let approved = 0;
    let pending = 0;
    const analysts = new Set();
    for (const en of teamEntries) {
      analysts.add(String(en.userId || en.analystEmail || '?'));
      if (countsTowardApprovedHourTotals(en.status)) approved += en.durationMinutes || 0;
      else if (en.status === 'PENDING') pending += en.durationMinutes || 0;
    }
    return { approved, pending, analysts: analysts.size };
  }, [teamEntries]);

  const teamByType = useMemo(() => {
    const acc = Object.fromEntries(HOUR_TYPE_ORDER.map((tp) => [tp, 0]));
    for (const en of teamEntries) {
      if (!countsTowardApprovedHourTotals(en.status)) continue;
      if (acc[en.hourType] != null) acc[en.hourType] += en.durationMinutes || 0;
    }
    return acc;
  }, [teamEntries]);

  const perAnalyst = useMemo(() => {
    const map = new Map();
    for (const en of teamEntries) {
      const key = String(en.userId || en.analystEmail || 'unknown');
      if (!map.has(key)) {
        map.set(key, {
          key,
          name: en.analystName || usersById[key]?.fullName || en.analystEmail || '—',
          approved: 0,
          pending: 0,
        });
      }
      const row = map.get(key);
      if (countsTowardApprovedHourTotals(en.status)) row.approved += en.durationMinutes || 0;
      else if (en.status === 'PENDING') row.pending += en.durationMinutes || 0;
    }
    return Array.from(map.values()).sort(
      (a, b) => b.approved + b.pending - (a.approved + a.pending)
    );
  }, [teamEntries, usersById]);

  const teamMaxType = Math.max(1, ...HOUR_TYPE_ORDER.map((tp) => teamByType[tp] || 0));
  const analystMax = Math.max(1, ...perAnalyst.map((r) => r.approved + r.pending));

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const reasonsPayload = isReasonHourType(form.hourType)
        ? Array.isArray(form.reasons)
          ? form.reasons
          : []
        : [];
      if (editingId) {
        await api.patch(`/api/hour-entries/${editingId}`, {
          date: form.date,
          startTime: form.startTime,
          endTime: form.endTime,
          breakMinutes: form.breakMinutes,
          hourType: form.hourType,
          clientId: form.clientId || undefined,
          ticket: form.ticket || undefined,
          description: form.description,
          reasons: reasonsPayload,
        });
        setInfoMessage('');
      } else {
        const payload = {
          date: form.date,
          startTime: form.startTime,
          endTime: form.endTime,
          breakMinutes: form.breakMinutes,
          hourType: form.hourType,
          clientId: form.clientId || undefined,
          ticket: form.ticket || undefined,
          description: form.description,
          reasons: reasonsPayload,
        };
        if (form.hourType === HOUR_TYPES.NORMAL) {
          payload.forceNormal = Boolean(form.forceNormal);
        }
        const { data } = await api.post('/api/hour-entries', payload);
        const list = Array.isArray(data?.entries) ? data.entries : data ? [data] : [];
        if (list.length > 1) {
          const normalMin = list
            .filter((entry) => entry.hourType === HOUR_TYPES.NORMAL)
            .reduce((s, entry) => s + (entry.durationMinutes || 0), 0);
          const extraMin = list
            .filter((entry) => entry.hourType === HOUR_TYPES.EXTRA)
            .reduce((s, entry) => s + (entry.durationMinutes || 0), 0);
          if (normalMin > 0 && extraMin > 0) {
            setInfoMessage(
              t('dashboard.splitNotice', {
                normal: formatDuration(normalMin),
                extra: formatDuration(extraMin),
              })
            );
          } else {
            setInfoMessage('');
          }
        } else {
          setInfoMessage('');
        }
      }
      setFormOpen(false);
      setEditingId(null);
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  function canActOnEntry(en) {
    // Own entries only, while not approved (managers may still edit their own pending hours).
    if (String(en.userId || '') !== String(user?.id || '')) return false;
    if (en.status === 'APPROVED') return false;
    if (en.rejectionAcceptedAt) return false;
    return true;
  }

  function openEdit(en) {
    setError('');
    setInfoMessage('');
    setEditingId(en.id);
    setForm({
      date: en.date,
      startTime: en.startTime,
      endTime: en.endTime,
      breakMinutes: en.breakMinutes ?? 0,
      hourType: en.hourType,
      clientId: en.clientId || '',
      ticket: en.ticket || '',
      description: en.description || '',
      forceNormal: false,
      reasons: Array.isArray(en.reasons) ? [...en.reasons] : [],
    });
    setFormOpen(true);
  }

  function toggleReason(id) {
    setForm((f) => {
      const cur = Array.isArray(f.reasons) ? f.reasons : [];
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      return { ...f, reasons: next };
    });
  }

  async function handleDelete(en) {
    setError('');
    if (!window.confirm(t('dashboard.confirmDelete'))) return;
    try {
      setActingId(en.id);
      await api.delete(`/api/hour-entries/${en.id}`);
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setActingId(null);
    }
  }

  async function acceptRejection(en) {
    setError('');
    try {
      setActingId(en.id);
      await api.post(`/api/hour-entries/${en.id}/rejection-response`, { action: 'accept' });
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setActingId(null);
    }
  }

  async function submitContest(en) {
    setError('');
    const msg = contestMessage.trim();
    if (msg.length < CONTEST_MESSAGE_MIN_LEN) {
      setError(t('dashboard.contestMinChars', { min: CONTEST_MESSAGE_MIN_LEN }));
      return;
    }
    try {
      setActingId(en.id);
      await api.post(`/api/hour-entries/${en.id}/rejection-response`, {
        action: 'contest',
        message: msg,
      });
      setContestingId(null);
      setContestMessage('');
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setActingId(null);
    }
  }

  const hourTypes = HOUR_TYPE_ORDER.map((type) => ({
    value: type,
    label: t(getHourTypeTranslationKey(type)),
  }));

  const allowedTypeValues = resolveAllowedHourTypesByUser(user);
  const allowedHourTypes = hourTypes.filter((item) =>
    allowedTypeValues.includes(item.value)
  );
  const reasonGroups = useMemo(() => reasonGroupsForUser(user), [user]);
  const showReasons = isReasonHourType(form.hourType);

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">
            {isAdminView ? t('dashboard.titleTeam', { defaultValue: 'Painel do time' }) : t('dashboard.title')}
          </h1>
          <p className="text-sm text-ink-muted">
            {isAdminView
              ? t('dashboard.subtitleTeam', { defaultValue: 'Horas lançadas por analista neste mês' })
              : t('dashboard.subtitle')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-label={t('dashboard.prevMonth')}
            title={t('dashboard.prevMonth')}
            onClick={() => setMonth((m) => shiftMonthString(m, -1))}
            className="inline-flex rounded-lg border border-gray-200 p-2 text-ink hover:bg-gray-50"
          >
            <ChevronLeft size={18} />
          </button>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
          <button
            type="button"
            aria-label={t('dashboard.nextMonth')}
            title={t('dashboard.nextMonth')}
            onClick={() => setMonth((m) => shiftMonthString(m, 1))}
            className="inline-flex rounded-lg border border-gray-200 p-2 text-ink hover:bg-gray-50"
          >
            <ChevronRight size={18} />
          </button>
          {!isAdminView && (
            <button
              type="button"
              onClick={() => {
                setError('');
                setInfoMessage('');
                setEditingId(null);
                setForm(defaultForm());
                setFormOpen(true);
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
            >
              <Plus size={16} />
              {t('dashboard.newEntry')}
            </button>
          )}
        </div>
      </div>

      {infoMessage && (
        <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
          {infoMessage}
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {isAdminView ? (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                  {t('dashboard.kpiApproved', { defaultValue: 'Horas aprovadas' })}
                </span>
                <CheckCircle2 size={16} className="text-emerald-500" />
              </div>
              <div className="mt-2 text-2xl font-semibold tabular-nums text-ink">
                {formatDuration(teamTotals.approved)}
              </div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                  {t('dashboard.kpiPending', { defaultValue: 'Pendentes' })}
                </span>
                <Clock3 size={16} className="text-amber-500" />
              </div>
              <div className="mt-2 text-2xl font-semibold tabular-nums text-ink">
                {formatDuration(teamTotals.pending)}
              </div>
              {teamTotals.pending > 0 && (
                <button
                  type="button"
                  onClick={() => navigate('/approvals')}
                  className="mt-1 text-xs font-medium text-accent hover:underline"
                >
                  {t('dashboard.kpiReview', { defaultValue: 'Revisar aprovações →' })}
                </button>
              )}
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                  {t('dashboard.kpiAnalysts', { defaultValue: 'Analistas' })}
                </span>
                <UsersIcon size={16} className="text-accent" />
              </div>
              <div className="mt-2 text-2xl font-semibold tabular-nums text-ink">{teamTotals.analysts}</div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                  {t('dashboard.kpiAvg', { defaultValue: 'Média / analista' })}
                </span>
                <TrendingUp size={16} className="text-accent" />
              </div>
              <div className="mt-2 text-2xl font-semibold tabular-nums text-ink">
                {formatDuration(
                  teamTotals.analysts ? Math.round(teamTotals.approved / teamTotals.analysts) : 0
                )}
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-ink">
                {t('dashboard.byTypeTitle', { defaultValue: 'Distribuição por tipo' })}
              </h2>
              <div className="mt-4 space-y-3">
                {HOUR_TYPE_ORDER.map((tp) => {
                  const v = teamByType[tp] || 0;
                  return (
                    <div key={tp}>
                      <div className="flex items-center justify-between text-sm">
                        <HourTypeLegendItem type={tp} />
                        <span className="tabular-nums font-medium text-ink">{formatDuration(v)}</span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100">
                        <div
                          className={`h-full rounded-full ${getHourTypeUi(tp).dotClass}`}
                          style={{ width: `${Math.round((v / teamMaxType) * 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white shadow-sm lg:col-span-2">
              <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
                <h2 className="text-sm font-semibold text-ink">
                  {t('dashboard.perAnalystTitle', { defaultValue: 'Por analista' })}
                </h2>
                <span className="text-xs text-ink-muted">{perAnalyst.length}</span>
              </div>
              {loading ? (
                <p className="px-5 py-10 text-center text-sm text-ink-muted">{t('dashboard.loading')}</p>
              ) : perAnalyst.length === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-ink-muted">{t('dashboard.noEntries')}</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {perAnalyst.map((row) => {
                    const total = row.approved + row.pending;
                    return (
                      <div key={row.key} className="flex items-center gap-4 px-5 py-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/10 text-xs font-semibold text-accent">
                          {initials(row.name)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-3">
                            <span className="truncate text-sm font-medium text-ink">{row.name}</span>
                            <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">
                              {formatDuration(row.approved)}
                            </span>
                          </div>
                          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-gray-100">
                            <div
                              className="h-full rounded-full bg-accent"
                              style={{ width: `${Math.round((total / analystMax) * 100)}%` }}
                            />
                          </div>
                        </div>
                        {row.pending > 0 && (
                          <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                            +{formatDuration(row.pending)}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {Object.entries(stats).map(([k, v]) => (
          <div
            key={k}
            className={`rounded-xl border p-4 shadow-sm ${getHourTypeUi(k).cardClass}`}
          >
            <div className="text-xs font-medium uppercase tracking-wide text-ink-muted">
              <HourTypeLegendItem type={k} />
            </div>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-1.5 gap-y-0">
              <span className="text-lg font-semibold">{formatDuration(v)}</span>
              {(pendingStats[k] || 0) > 0 && (
                <span
                  className="text-[0.65rem] font-medium leading-none text-ink-muted opacity-60"
                  title={t('dashboard.pendingInTotalHint')}
                >
                  +{formatDuration(pendingStats[k])}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-ink-muted">
            <tr>
              <th className="px-4 py-3 font-medium">{t('dashboard.date')}</th>
              <th className="px-4 py-3 font-medium">{t('dashboard.type')}</th>
              <th className="px-4 py-3 font-medium">{t('dashboard.time')}</th>
              <th className="px-4 py-3 font-medium">{t('dashboard.duration')}</th>
              <th className="px-4 py-3 font-medium">{t('dashboard.status')}</th>
              <th className="px-4 py-3 font-medium">{t('dashboard.description')}</th>
              <th className="px-4 py-3 font-medium">{t('dashboard.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-ink-muted">
                  {t('dashboard.loading')}
                </td>
              </tr>
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-ink-muted">
                  {t('dashboard.noEntries')}
                </td>
              </tr>
            ) : (
              entries.map((en) => (
                <tr key={en.id} className="border-t border-gray-100 align-top">
                  <td className="px-4 py-3 whitespace-nowrap">{en.date}</td>
                  <td className="px-4 py-3">
                    <HourTypeBadge type={en.hourType} />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {en.startTime} - {en.endTime}
                  </td>
                  <td className="px-4 py-3">{formatDuration(en.durationMinutes)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        en.status === 'APPROVED'
                          ? 'bg-emerald-100 text-emerald-800'
                          : en.status === 'PENDING'
                            ? 'bg-amber-100 text-amber-800'
                            : en.status === 'REJECTED'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {t(`dashboard.entryStatus.${en.status}`, { defaultValue: en.status })}
                    </span>
                  </td>
                  <td className="px-4 py-3 max-w-xs truncate" title={en.description}>
                    {en.description}
                  </td>
                  <td className="px-4 py-3">
                    {en.status === 'REJECTED' && (
                      <div className="mb-2 text-xs text-ink-muted">
                        <div>
                          {t('dashboard.rejectedBy', {
                            name: en.managerName || '-',
                          })}
                        </div>
                        <div>
                          {t('dashboard.rejectionReason', {
                            reason: en.justification || t('dashboard.noRejectionReason'),
                          })}
                        </div>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={!canActOnEntry(en) || actingId === en.id}
                        onClick={() => openEdit(en)}
                        className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs disabled:opacity-50"
                      >
                        {t('dashboard.edit')}
                      </button>
                      <button
                        type="button"
                        disabled={!canActOnEntry(en) || actingId === en.id}
                        onClick={() => handleDelete(en)}
                        className="rounded-lg bg-red-600 px-3 py-1.5 text-xs text-white disabled:opacity-50"
                      >
                        {t('dashboard.delete')}
                      </button>

                      {en.status === 'REJECTED' && !en.rejectionAcceptedAt && (
                        <>
                          <button
                            type="button"
                            disabled={actingId === en.id}
                            onClick={() => acceptRejection(en)}
                            className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs text-white disabled:opacity-50"
                          >
                            {t('dashboard.acceptRejection')}
                          </button>
                          <button
                            type="button"
                            disabled={actingId === en.id}
                            onClick={() => {
                              setError('');
                              setContestingId(contestingId === en.id ? null : en.id);
                              setContestMessage('');
                            }}
                            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs disabled:opacity-50"
                          >
                            {t('dashboard.contest')}
                          </button>
                        </>
                      )}
                    </div>

                    {contestingId === en.id && (
                      <div className="mt-2 space-y-2">
                        <textarea
                          value={contestMessage}
                          onChange={(e) => setContestMessage(e.target.value)}
                          rows={3}
                          placeholder={t('dashboard.contestPlaceholder', {
                            min: CONTEST_MESSAGE_MIN_LEN,
                          })}
                          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs"
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={actingId === en.id}
                            onClick={() => submitContest(en)}
                            className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs text-white disabled:opacity-50"
                          >
                            {t('dashboard.sendContest')}
                          </button>
                          <button
                            type="button"
                            disabled={actingId === en.id}
                            onClick={() => {
                              setContestingId(null);
                              setContestMessage('');
                            }}
                            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs disabled:opacity-50"
                          >
                            {t('dashboard.cancel')}
                          </button>
                        </div>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
        </>
      )}

      {formOpen && (
        <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold">
              {editingId ? t('dashboard.editEntryTitle') : t('dashboard.newEntryTitle')}
            </h2>
            <form onSubmit={handleSubmit} className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm">
                  <span className="text-ink-muted">{t('dashboard.date')}</span>
                  <input
                    type="date"
                    required
                    value={form.date}
                    onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                    className={inputClass}
                  />
                </label>
                <label className="text-sm">
                  <span className="text-ink-muted">{t('dashboard.type')}</span>
                  <select
                    value={form.hourType}
                    onChange={(e) => {
                      const hourType = e.target.value;
                      setForm((f) => ({
                        ...f,
                        hourType,
                        reasons: isReasonHourType(hourType) ? f.reasons || [] : [],
                      }));
                    }}
                    className={inputClass}
                  >
                    {(allowedHourTypes.length ? allowedHourTypes : hourTypes).map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                  <div className="mt-2">
                    <HourTypeBadge type={form.hourType} compact />
                  </div>
                </label>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <label className="text-sm">
                  <span className="text-ink-muted">{t('dashboard.start')}</span>
                  <input
                    type="time"
                    required
                    value={form.startTime}
                    onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                    className={inputClass}
                  />
                </label>
                <label className="text-sm">
                  <span className="text-ink-muted">{t('dashboard.end')}</span>
                  <input
                    type="time"
                    required
                    value={form.endTime}
                    onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
                    className={inputClass}
                  />
                </label>
                <label className="text-sm">
                  <span className="text-ink-muted">{t('dashboard.breakMinutes')}</span>
                  <input
                    type="number"
                    min={0}
                    value={form.breakMinutes}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, breakMinutes: Number(e.target.value) }))
                    }
                    className={inputClass}
                  />
                </label>
              </div>
              <label className="text-sm block">
                <span className="text-ink-muted">{t('dashboard.client')}</span>
                <select
                  value={form.clientId}
                  onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))}
                  className={inputClass}
                >
                  <option value="">{t('dashboard.emptyOption')}</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm block">
                <span className="text-ink-muted">{t('dashboard.ticket')}</span>
                <input
                  value={form.ticket}
                  onChange={(e) => setForm((f) => ({ ...f, ticket: e.target.value }))}
                  className={inputClass}
                />
              </label>
              <label className="text-sm block">
                <span className="text-ink-muted">{t('dashboard.description')}</span>
                <textarea
                  required
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className={inputClass}
                />
              </label>
              {!editingId && form.hourType === HOUR_TYPES.NORMAL && (
                <label className="flex cursor-pointer items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={Boolean(form.forceNormal)}
                    onChange={(e) => setForm((f) => ({ ...f, forceNormal: e.target.checked }))}
                    className="mt-1 rounded border-gray-300"
                  />
                  <span>
                    <span className="font-medium text-ink">{t('dashboard.forceNormal')}</span>
                    <span className="mt-0.5 block text-xs text-ink-muted">
                      {t('dashboard.forceNormalHint')}
                    </span>
                  </span>
                </label>
              )}
              {showReasons && (
                <fieldset className="rounded-xl border border-gray-200 p-3">
                  <legend className="px-1 text-sm font-medium text-ink">
                    {t('dashboard.reasons.title')}
                  </legend>
                  <p className="mb-2 text-xs text-ink-muted">{t('dashboard.reasons.hint')}</p>
                  <div className="space-y-3">
                    {reasonGroups.map((group) => (
                      <div key={group.key}>
                        {reasonGroups.length > 1 && (
                          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                            {t(`dashboard.reasons.groups.${group.key}`)}
                          </p>
                        )}
                        <div className="grid gap-1.5 sm:grid-cols-2">
                          {group.ids.map((id) => {
                            const checked = (form.reasons || []).includes(id);
                            return (
                              <label
                                key={id}
                                className="flex cursor-pointer items-start gap-2 rounded-lg px-1 py-1 text-sm hover:bg-gray-50"
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleReason(id)}
                                  className="mt-0.5 rounded border-gray-300"
                                />
                                <span>{t(reasonLabelKey(id))}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </fieldset>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setFormOpen(false);
                    setInfoMessage('');
                  }}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm"
                >
                  {t('dashboard.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  {saving ? t('dashboard.saving') : t('dashboard.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
