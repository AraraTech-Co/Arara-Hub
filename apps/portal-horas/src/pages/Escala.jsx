import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { api, getErrorMessage } from '../api/client.js';
import { inputClass } from '../lib/ui.js';
import { HOUR_TYPES } from '../config/hourTypes.js';
import { HourTypeBadge } from '../components/hour-type/HourTypeBadge.jsx';

const DAYS = [
  { value: 'monday', key: 'monday' },
  { value: 'tuesday', key: 'tuesday' },
  { value: 'wednesday', key: 'wednesday' },
  { value: 'thursday', key: 'thursday' },
  { value: 'friday', key: 'friday' },
  { value: 'saturday', key: 'saturday' },
  { value: 'sunday', key: 'sunday' },
];

const ROLES = [
  { value: 'BIP_STANDBY', hourType: HOUR_TYPES.BIP_STANDBY, key: 'standby' },
  { value: 'BIP_BACKUP', hourType: HOUR_TYPES.BIP_BACKUP, key: 'backup' },
  { value: 'BIP_ATTENDANCE', hourType: HOUR_TYPES.BIP_ATTENDANCE, key: 'attendance' },
];

function scheduleRoleToHourType(role) {
  const r = ROLES.find((x) => x.value === role);
  return r?.hourType || role;
}

export default function Escala() {
  const { t } = useTranslation();
  const [schedules, setSchedules] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actingId, setActingId] = useState(null);
  const [form, setForm] = useState({
    userId: '',
    role: 'BIP_STANDBY',
    dayOfWeek: 'monday',
    startTime: '08:00',
    endTime: '18:00',
    startDate: format(new Date(), 'yyyy-MM-dd'),
    endDate: '',
    active: true,
  });

  const load = useCallback(async () => {
    setError('');
    try {
      const [sRes, uRes] = await Promise.all([
        api.get('/api/bip-schedule'),
        api.get('/api/users'),
      ]);
      setSchedules(sRes.data || []);
      setUsers((uRes.data || []).filter((u) => u.active && u.role !== 'admin'));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (form.endDate?.trim() && form.endDate.trim() < form.startDate) {
      setError(
        t('escala.endBeforeStart', {
          defaultValue: 'A data final não pode ser anterior à inicial.',
        })
      );
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        userId: form.userId,
        role: form.role,
        dayOfWeek: form.dayOfWeek,
        startTime: form.startTime,
        endTime: form.endTime,
        startDate: form.startDate,
        active: form.active,
      };
      if (form.endDate?.trim()) payload.endDate = form.endDate.trim();
      const { data } = await api.post('/api/bip-schedule', payload);
      setSuccess(
        t('escala.created', {
          count: data.entriesCreated ?? 0,
        })
      );
      setForm({
        userId: '',
        role: 'BIP_STANDBY',
        dayOfWeek: 'monday',
        startTime: '08:00',
        endTime: '18:00',
        startDate: format(new Date(), 'yyyy-MM-dd'),
        endDate: '',
        active: true,
      });
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function removeSchedule(id) {
    if (!window.confirm(t('escala.confirmDelete'))) return;
    setError('');
    setSuccess('');
    try {
      setActingId(id);
      await api.delete(`/api/bip-schedule/${id}`);
      setSuccess(t('escala.removed'));
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setActingId(null);
    }
  }

  async function toggleActive(row) {
    setError('');
    setSuccess('');
    try {
      setActingId(row.id);
      await api.patch(`/api/bip-schedule/${row.id}`, { active: !row.active });
      setSuccess(t('escala.updated'));
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setActingId(null);
    }
  }

  if (loading) {
    return <p className="text-ink-muted">{t('escala.loading')}</p>;
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">{t('escala.title')}</h1>
      <p className="mt-1 text-sm text-ink-muted">{t('escala.subtitle')}</p>

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}
      {success && (
        <div className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {success}
        </div>
      )}

      <section className="mt-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-medium text-ink">{t('escala.newPlan')}</h2>
        <p className="mt-1 text-sm text-ink-muted">{t('escala.newPlanHint')}</p>
        <form onSubmit={handleSubmit} className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium text-ink">{t('escala.employee')}</span>
            <select
              required
              className={inputClass}
              value={form.userId}
              onChange={(e) => setForm((f) => ({ ...f, userId: e.target.value }))}
            >
              <option value="">{t('escala.selectEmployee')}</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName} ({u.email})
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-ink">{t('escala.role')}</span>
            <select
              className={inputClass}
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {t(`escala.roles.${r.key}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-ink">{t('escala.weekday')}</span>
            <select
              className={inputClass}
              value={form.dayOfWeek}
              onChange={(e) => setForm((f) => ({ ...f, dayOfWeek: e.target.value }))}
            >
              {DAYS.map((d) => (
                <option key={d.value} value={d.value}>
                  {t(`escala.weekdays.${d.key}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-ink">{t('escala.startTime')}</span>
            <input
              type="time"
              required
              className={inputClass}
              value={form.startTime}
              onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-ink">{t('escala.endTime')}</span>
            <input
              type="time"
              required
              className={inputClass}
              value={form.endTime}
              onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-ink">{t('escala.startDate')}</span>
            <input
              type="date"
              required
              className={inputClass}
              value={form.startDate}
              onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-ink">{t('escala.endDate')}</span>
            <input
              type="date"
              className={inputClass}
              value={form.endDate}
              onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
            />
            <span className="mt-1 block text-xs text-ink-muted">{t('escala.endDateHint')}</span>
          </label>
          <label className="flex items-center gap-2 sm:col-span-2">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
            />
            <span className="text-sm text-ink">{t('escala.active')}</span>
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={submitting || !form.userId}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {submitting ? t('escala.saving') : t('escala.save')}
            </button>
          </div>
        </form>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-medium text-ink">{t('escala.listTitle')}</h2>
        {schedules.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">{t('escala.empty')}</p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50/80">
                <tr>
                  <th className="px-4 py-3 font-medium text-ink">{t('escala.employee')}</th>
                  <th className="px-4 py-3 font-medium text-ink">{t('escala.role')}</th>
                  <th className="px-4 py-3 font-medium text-ink">{t('escala.weekday')}</th>
                  <th className="px-4 py-3 font-medium text-ink">{t('escala.hours')}</th>
                  <th className="px-4 py-3 font-medium text-ink">{t('escala.period')}</th>
                  <th className="px-4 py-3 font-medium text-ink">{t('escala.statusCol')}</th>
                  <th className="px-4 py-3 font-medium text-ink">{t('escala.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {schedules.map((row) => {
                  const rk = ROLES.find((x) => x.value === row.role)?.key || 'standby';
                  return (
                    <tr key={row.id} className="border-b border-gray-100 last:border-0">
                      <td className="px-4 py-3 text-ink">
                        <div className="font-medium">{row.analystName}</div>
                        <div className="text-xs text-ink-muted">{row.analystEmail}</div>
                      </td>
                      <td className="px-4 py-3">
                        <HourTypeBadge type={scheduleRoleToHourType(row.role)} compact />
                        <span className="ml-2 text-ink-muted">{t(`escala.roles.${rk}`)}</span>
                      </td>
                      <td className="px-4 py-3 text-ink">{t(`escala.weekdays.${row.dayOfWeek}`)}</td>
                      <td className="px-4 py-3 text-ink">
                        {row.startTime} – {row.endTime}
                      </td>
                      <td className="px-4 py-3 text-ink-muted">
                        {row.startDate}
                        {row.endDate ? ` → ${row.endDate}` : ` (${t('escala.openEnded')})`}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          disabled={actingId === row.id}
                          onClick={() => toggleActive(row)}
                          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            row.active
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {row.active ? t('escala.statusOn') : t('escala.statusOff')}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          disabled={actingId === row.id}
                          onClick={() => removeSchedule(row.id)}
                          className="text-sm text-red-600 hover:underline disabled:opacity-50"
                        >
                          {t('escala.remove')}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
