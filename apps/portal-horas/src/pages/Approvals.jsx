import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, getErrorMessage } from '../api/client.js';
import { fetchAdminIds } from '../lib/team.js';
import { HourTypeBadge } from '../components/hour-type/HourTypeBadge.jsx';

function getLastContestMessage(reviewHistory) {
  if (!Array.isArray(reviewHistory)) return null;
  const contests = reviewHistory.filter((e) => e.action === 'CONTEST');
  if (!contests.length) return null;
  const last = contests[contests.length - 1];
  return last?.message?.trim() ? last.message.trim() : null;
}

function sumMinutes(items) {
  return items.reduce((acc, en) => acc + (en.durationMinutes || 0), 0);
}

export default function Approvals() {
  const { t } = useTranslation();
  const [entries, setEntries] = useState([]);
  const [error, setError] = useState('');
  const [successInfo, setSuccessInfo] = useState('');
  const [actionId, setActionId] = useState(null);
  const [justification, setJustification] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [bulkApprovingUserId, setBulkApprovingUserId] = useState(null);

  const groups = useMemo(() => {
    const m = new Map();
    for (const en of entries) {
      const key = en.userId || en.analystEmail || 'unknown';
      if (!m.has(key)) {
        m.set(key, {
          userId: en.userId,
          analystName: en.analystName || en.analystEmail || '-',
          items: [],
        });
      }
      m.get(key).items.push(en);
    }
    return Array.from(m.values()).sort((a, b) =>
      (a.analystName || '').localeCompare(b.analystName || '', undefined, {
        sensitivity: 'base',
      })
    );
  }, [entries]);

  const load = async () => {
    try {
      const [{ data }, adminIds] = await Promise.all([
        api.get('/api/hour-entries', { params: { status: 'PENDING' } }),
        fetchAdminIds(),
      ]);
      const list = Array.isArray(data) ? data : [];
      // Admins não entram nos relatórios/aprovações do time.
      setEntries(list.filter((e) => !adminIds.has(String(e.userId))));
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  useEffect(() => {
    load();
  }, []);

  async function decide(id, action) {
    if (busyId) return;
    setError('');
    setSuccessInfo('');
    if (action === 'adjust' && !justification.trim()) {
      setError(t('approvals.justificationRequired'));
      return;
    }
    setBusyId(id);
    try {
      await api.post(`/api/hour-entries/${id}/approve`, {
        action: action === 'approve' ? 'approve' : action === 'adjust' ? 'adjust' : 'reject',
        justification:
          (action === 'adjust' || action === 'reject') && justification.trim()
            ? justification
            : undefined,
      });
      setJustification('');
      setActionId(null);
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function approveAllForGroup(group) {
    setError('');
    setSuccessInfo('');
    const totalMin = sumMinutes(group.items);
    const hoursLabel = (totalMin / 60).toFixed(1);
    if (
      !window.confirm(
        t('approvals.approveAllConfirm', {
          name: group.analystName,
          count: group.items.length,
          hours: hoursLabel,
        })
      )
    ) {
      return;
    }
    if (!group.userId) {
      setError(t('approvals.approveAllMissingUserId'));
      return;
    }
    try {
      setBulkApprovingUserId(group.userId);
      const { data } = await api.post('/api/hour-entries/bulk-approve', {
        userId: group.userId,
      });
      setSuccessInfo(
        t('approvals.bulkApproveSuccess', {
          count: data.approvedCount,
          skipped: data.skipped?.length || 0,
        })
      );
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBulkApprovingUserId(null);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">{t('approvals.title')}</h1>
      <p className="text-sm text-ink-muted">{t('approvals.subtitle')}</p>

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}
      {successInfo && (
        <div className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {successInfo}
        </div>
      )}

      <div className="mt-6 space-y-8">
        {entries.length === 0 ? (
          <p className="text-ink-muted">{t('approvals.noPending')}</p>
        ) : (
          groups.map((group) => {
            const totalMin = sumMinutes(group.items);
            const hoursLabel = (totalMin / 60).toFixed(1);
            return (
              <section key={group.userId || group.analystName} className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 pb-2">
                  <div>
                    <h2 className="text-lg font-semibold text-ink">{group.analystName}</h2>
                    <p className="text-xs text-ink-muted">
                      {t('approvals.approveAllSummary', {
                        count: group.items.length,
                        hours: hoursLabel,
                      })}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={!group.userId || bulkApprovingUserId === group.userId}
                    onClick={() => approveAllForGroup(group)}
                    className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
                  >
                    {t('approvals.approveAllForAnalyst')}
                  </button>
                </div>
                <div className="space-y-4">
                  {group.items.map((en) => {
                    const contestMsg = getLastContestMessage(en.reviewHistory);
                    return (
                      <div
                        key={en.id}
                        className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
                      >
                        <div className="flex flex-wrap justify-between gap-2">
                          <div>
                            <div className="font-medium text-ink">{en.date}</div>
                            <div className="text-sm text-ink-muted">
                              <HourTypeBadge
                                type={en.hourType}
                                compact
                                className="mr-2 align-middle"
                              />
                              <span className="align-middle">
                                {en.startTime}-{en.endTime}
                              </span>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={busyId === en.id}
                              onClick={() => decide(en.id, 'approve')}
                              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-700 disabled:opacity-50"
                            >
                              {t('approvals.approve')}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setActionId(en.id === actionId ? null : en.id);
                                setJustification('');
                              }}
                              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm"
                            >
                              {t('approvals.rejectAdjust')}
                            </button>
                          </div>
                        </div>
                        <p className="mt-2 text-sm text-ink">{en.description}</p>
                        {contestMsg && (
                          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                            <div className="font-medium text-amber-900">
                              {t('approvals.contestMessage')}
                            </div>
                            <p className="mt-1 whitespace-pre-wrap">{contestMsg}</p>
                          </div>
                        )}
                        {actionId === en.id && (
                          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                            <label className="flex-1 text-sm">
                              <span className="text-ink-muted">{t('approvals.justification')}</span>
                              <textarea
                                value={justification}
                                onChange={(e) => setJustification(e.target.value)}
                                rows={2}
                                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2"
                              />
                            </label>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                disabled={busyId === en.id}
                                onClick={() => decide(en.id, 'adjust')}
                                className="rounded-lg bg-amber-600 px-3 py-2 text-sm text-white disabled:opacity-50"
                              >
                                {t('approvals.adjust')}
                              </button>
                              <button
                                type="button"
                                disabled={busyId === en.id}
                                onClick={() => decide(en.id, 'reject')}
                                className="rounded-lg bg-red-600 px-3 py-2 text-sm text-white disabled:opacity-50"
                              >
                                {t('approvals.reject')}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}
