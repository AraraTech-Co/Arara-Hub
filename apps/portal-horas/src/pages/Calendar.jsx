import { useEffect, useMemo, useRef, useState } from 'react';
import {
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  format,
  isToday,
} from 'date-fns';
import { ChevronLeft, ChevronRight, Bell } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api, getErrorMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { fetchAdminIds } from '../lib/team.js';
import {
  countsTowardApprovedHourTotals,
  getHourTypeTranslationKey,
} from '../config/hourTypes.js';
import { HourTypeBadge } from '../components/hour-type/HourTypeBadge.jsx';

function formatDuration(min) {
  if (min == null) return '-';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${m.toString().padStart(2, '0')}m`;
}

export default function Calendar() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [cursor, setCursor] = useState(() => new Date());
  const [entries, setEntries] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [error, setError] = useState('');
  const [menuDay, setMenuDay] = useState(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const [detailsDay, setDetailsDay] = useState(null);
  const menuRef = useRef(null);

  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  useEffect(() => {
    const from = format(monthStart, 'yyyy-MM-dd');
    const to = format(monthEnd, 'yyyy-MM-dd');
    let cancelled = false;
    (async () => {
      try {
        const isReviewer = user?.role === 'admin';
        const entryParams = { limit: 500 };
        if (!isReviewer && user?.id) entryParams.user_id = user.id;

        const [eRes, rRes, adminIds] = await Promise.all([
          api.get('/api/hour-entries', { params: entryParams }),
          api.get('/api/reminders', { params: { limit: 500 } }),
          isReviewer ? fetchAdminIds() : Promise.resolve(new Set()),
        ]);
        if (cancelled) return;
        const list = (Array.isArray(eRes.data) ? eRes.data : []).filter(
          (e) => !adminIds.has(String(e.userId)),
        );
        setEntries(
          list.filter((e) => {
            const d = String(e.date || '');
            return d >= from && d <= to;
          }),
        );
        setReminders(Array.isArray(rRes.data) ? rRes.data : []);
      } catch (err) {
        if (!cancelled) setError(getErrorMessage(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cursor, user?.id, user?.role]);

  useEffect(() => {
    if (!menuDay) return undefined;
    function onDoc(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuDay(null);
      }
    }
    function onKey(e) {
      if (e.key === 'Escape') setMenuDay(null);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuDay]);

  const byDay = useMemo(() => {
    const map = {};
    for (const en of entries) {
      const d = en.date;
      if (!map[d]) {
        map[d] = { approvedMinutes: 0, pendingMinutes: 0, approvedCount: 0, pendingCount: 0 };
      }
      if (countsTowardApprovedHourTotals(en.status)) {
        map[d].approvedMinutes += en.durationMinutes || 0;
        map[d].approvedCount += 1;
      } else if (en.status === 'PENDING') {
        map[d].pendingMinutes += en.durationMinutes || 0;
        map[d].pendingCount += 1;
      }
    }
    return map;
  }, [entries]);

  const entriesByDay = useMemo(() => {
    const map = {};
    for (const en of entries) {
      const d = String(en.date || '');
      if (!map[d]) map[d] = [];
      map[d].push(en);
    }
    for (const d of Object.keys(map)) {
      map[d].sort((a, b) =>
        String(a.startTime || '').localeCompare(String(b.startTime || '')),
      );
    }
    return map;
  }, [entries]);

  const remindersByDay = useMemo(() => {
    const map = {};
    for (const r of reminders) {
      const parsed = r?.remindAt ? new Date(r.remindAt) : null;
      if (!parsed || Number.isNaN(parsed.getTime())) continue;
      const d = format(parsed, 'yyyy-MM-dd');
      if (!map[d]) map[d] = [];
      map[d].push(r);
    }
    return map;
  }, [reminders]);

  const startWeekday = (monthStart.getDay() + 6) % 7;
  const trailingCount = (7 - ((startWeekday + days.length) % 7)) % 7;
  const padCell = (k) => (
    <div key={k} className="min-h-[96px] border-b border-r border-gray-100 bg-gray-50/40" />
  );
  const monthLocale = i18n.language?.toLowerCase().startsWith('pt') ? 'pt-BR' : 'en-US';
  const rawMonthLabel = cursor.toLocaleDateString(monthLocale, { month: 'long', year: 'numeric' });
  const monthLabel = rawMonthLabel.charAt(0).toUpperCase() + rawMonthLabel.slice(1);

  function openDayMenu(dayKey, event) {
    const rect = event.currentTarget.getBoundingClientRect();
    const left = Math.min(rect.left, window.innerWidth - 220);
    const top = Math.min(rect.bottom + 4, window.innerHeight - 120);
    setMenuPos({ top, left });
    setMenuDay(dayKey);
  }

  function goRegister(dayKey) {
    setMenuDay(null);
    navigate(`/?date=${encodeURIComponent(dayKey)}&new=1&tab=hours`);
  }

  function openDetails(dayKey) {
    setMenuDay(null);
    setDetailsDay(dayKey);
  }

  const detailEntries = detailsDay ? entriesByDay[detailsDay] || [] : [];

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">{t('calendar.title')}</h1>
          <p className="text-sm text-ink-muted">{t('calendar.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCursor(new Date())}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-ink hover:bg-gray-50"
          >
            {t('calendar.today', { defaultValue: 'Hoje' })}
          </button>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label={t('calendar.prev')}
              onClick={() => setCursor((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
              className="inline-flex rounded-lg border border-gray-300 p-2 text-ink hover:bg-gray-50"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="min-w-[9.5rem] text-center text-sm font-semibold text-ink">
              {monthLabel}
            </span>
            <button
              type="button"
              aria-label={t('calendar.next')}
              onClick={() => setCursor((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
              className="inline-flex rounded-lg border border-gray-300 p-2 text-ink hover:bg-gray-50"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <div className="mt-6 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50/60 text-center text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
          {[
            t('calendar.weekdays.mon'),
            t('calendar.weekdays.tue'),
            t('calendar.weekdays.wed'),
            t('calendar.weekdays.thu'),
            t('calendar.weekdays.fri'),
            t('calendar.weekdays.sat'),
            t('calendar.weekdays.sun'),
          ].map((d) => (
            <div key={d} className="py-2.5">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {Array.from({ length: startWeekday }, (_, i) => padCell(`lead-${i}`))}
          {days.map((day) => {
            const key = format(day, 'yyyy-MM-dd');
            const cell = byDay[key];
            const approvedHrs = cell ? Math.round((cell.approvedMinutes / 60) * 10) / 10 : 0;
            const pendingHrs = cell ? Math.round((cell.pendingMinutes / 60) * 10) / 10 : 0;
            const rem = remindersByDay[key] || [];
            const today = isToday(day);
            return (
              <button
                key={key}
                type="button"
                onClick={(e) => openDayMenu(key, e)}
                className={`min-h-[96px] border-b border-r border-gray-100 p-2 text-left align-top transition hover:bg-accent/5 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-accent/40 ${
                  menuDay === key ? 'bg-accent/5' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-sm font-semibold ${
                      today ? 'bg-accent text-white' : 'text-ink'
                    }`}
                  >
                    {format(day, 'd')}
                  </span>
                  {rem.length > 0 && (
                    <span
                      className="inline-flex items-center gap-0.5 text-accent"
                      title={t('calendar.remindersCount', { count: rem.length })}
                    >
                      <Bell size={12} />
                      {rem.length > 1 && (
                        <span className="text-[10px] font-medium">{rem.length}</span>
                      )}
                    </span>
                  )}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {approvedHrs > 0 && (
                    <span
                      title={t('calendar.loggedHours', { hours: approvedHrs })}
                      className="inline-flex rounded-md bg-indigo-50 px-1.5 py-0.5 text-[11px] font-medium text-indigo-700"
                    >
                      {approvedHrs}h
                    </span>
                  )}
                  {pendingHrs > 0 && (
                    <span
                      title={t('calendar.pendingHours', { hours: pendingHrs })}
                      className="inline-flex rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700"
                    >
                      +{pendingHrs}h
                    </span>
                  )}
                </div>
              </button>
            );
          })}
          {Array.from({ length: trailingCount }, (_, i) => padCell(`trail-${i}`))}
        </div>
      </div>

      {menuDay && (
        <div
          ref={menuRef}
          className="fixed z-30 min-w-[200px] rounded-xl border border-gray-200 bg-white p-1 shadow-xl"
          style={{ top: menuPos.top, left: menuPos.left }}
        >
          <p className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-muted">
            {menuDay}
          </p>
          <button
            type="button"
            onClick={() => openDetails(menuDay)}
            className="block w-full rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-gray-50"
          >
            {t('calendar.dayMenu.viewDetails')}
          </button>
          <button
            type="button"
            onClick={() => goRegister(menuDay)}
            className="block w-full rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-gray-50"
          >
            {t('calendar.dayMenu.registerHours')}
          </button>
        </div>
      )}

      {detailsDay && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-ink">
                  {t('calendar.dayDetails.title')}
                </h2>
                <p className="text-sm text-ink-muted">{detailsDay}</p>
              </div>
              <button
                type="button"
                onClick={() => setDetailsDay(null)}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm"
              >
                {t('calendar.dayDetails.close')}
              </button>
            </div>

            {detailEntries.length === 0 ? (
              <p className="mt-6 text-sm text-ink-muted">
                {t('calendar.dayDetails.empty')}
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {detailEntries.map((en) => (
                  <li
                    key={en.id}
                    className="rounded-xl border border-gray-200 p-3 text-sm"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <HourTypeBadge type={en.hourType} compact />
                      <span className="font-medium text-ink">
                        {en.startTime} – {en.endTime}
                      </span>
                      <span className="text-ink-muted">
                        {formatDuration(en.durationMinutes)}
                      </span>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-ink-muted">
                        {t(`dashboard.entryStatus.${en.status}`, {
                          defaultValue: en.status,
                        })}
                      </span>
                    </div>
                    <p className="mt-2 text-ink-muted">
                      {en.description || t(`dashboard.hourTypes.${en.hourType}`, {
                        defaultValue: getHourTypeTranslationKey(en.hourType),
                      })}
                    </p>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setDetailsDay(null);
                  goRegister(detailsDay);
                }}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
              >
                {t('calendar.dayMenu.registerHours')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
