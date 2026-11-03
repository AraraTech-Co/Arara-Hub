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

/** Chave de mês "YYYY-MM" a partir da data ISO do lançamento. */
function monthKey(entry) {
  return String(entry?.date || '').slice(0, 7);
}

export default function Approvals() {
  const { t, i18n } = useTranslation();
  const [entries, setEntries] = useState([]);
  const [error, setError] = useState('');
  const [successInfo, setSuccessInfo] = useState('');
  const [actionId, setActionId] = useState(null);
  const [justification, setJustification] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [bulkApprovingUserId, setBulkApprovingUserId] = useState(null);
  const [monthFilter, setMonthFilter] = useState(''); // '' = todos os meses
  const [selected, setSelected] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [failures, setFailures] = useState([]); // lançamentos que falharam na aprovação em lote

  function monthLabel(key) {
    const [y, m] = key.split('-').map(Number);
    if (!y || !m) return key;
    const s = new Date(y, m - 1, 1).toLocaleDateString(i18n.language || 'pt-BR', {
      month: 'long',
      year: 'numeric',
    });
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  // Meses presentes nos pendentes, mais recente primeiro.
  const availableMonths = useMemo(() => {
    const set = new Set();
    for (const en of entries) {
      const k = monthKey(en);
      if (k) set.add(k);
    }
    return Array.from(set).sort().reverse();
  }, [entries]);

  const entriesById = useMemo(() => {
    const m = new Map();
    for (const en of entries) m.set(en.id, en);
    return m;
  }, [entries]);

  // Rótulo legível de um lançamento para a lista de falhas.
  function entryLabel(id) {
    const en = entriesById.get(id);
    if (!en) return String(id);
    const who = en.analystName || en.analystEmail || '';
    const when = en.date || '';
    const span = en.startTime && en.endTime ? ` (${en.startTime}-${en.endTime})` : '';
    return [when, who].filter(Boolean).join(' · ') + span;
  }

  const visibleEntries = useMemo(
    () => (monthFilter ? entries.filter((en) => monthKey(en) === monthFilter) : entries),
    [entries, monthFilter],
  );

  const groups = useMemo(() => {
    const m = new Map();
    for (const en of visibleEntries) {
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
  }, [visibleEntries]);

  const load = async () => {
    try {
      const [{ data }, adminIds] = await Promise.all([
        api.get('/api/hour-entries', { params: { status: 'PENDING' } }),
        fetchAdminIds(),
      ]);
      const list = Array.isArray(data) ? data : [];
      // Admins não entram nos relatórios/aprovações do time.
      setEntries(list.filter((e) => !adminIds.has(String(e.userId))));
      setSelected(new Set());
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Seleção só vale para o que está visível: trocar o mês limpa a seleção.
  function changeMonth(value) {
    setMonthFilter(value);
    setSelected(new Set());
  }

  function toggleOne(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function setGroupSelected(items, on) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const it of items) {
        if (on) next.add(it.id);
        else next.delete(it.id);
      }
      return next;
    });
  }

  function selectAllVisible() {
    setSelected(new Set(visibleEntries.map((e) => e.id)));
  }

  async function approveIds(ids) {
    let ok = 0;
    const failed = [];
    for (const id of ids) {
      try {
        await api.post(`/api/hour-entries/${id}/approve`, { action: 'approve' });
        ok += 1;
      } catch (err) {
        failed.push({ id, label: entryLabel(id), reason: getErrorMessage(err) });
      }
    }
    return { ok, fail: failed.length, failed };
  }

  async function approveSelected() {
    if (bulkBusy || selected.size === 0) return;
    setError('');
    setSuccessInfo('');
    setFailures([]);
    const ids = [...selected];
    if (!window.confirm(t('approvals.approveSelectedConfirm', { count: ids.length }))) return;
    setBulkBusy(true);
    try {
      const { ok, fail, failed } = await approveIds(ids);
      setSuccessInfo(t('approvals.approveSelectedResult', { count: ok, failed: fail }));
      setFailures(failed);
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBulkBusy(false);
    }
  }

  async function decide(id, action) {
    if (busyId) return;
    setError('');
    setSuccessInfo('');
    setFailures([]);
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
    setFailures([]);
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
      if (monthFilter) {
        // Com filtro de mês ativo, aprova só os lançamentos visíveis — a rota
        // bulk-approve por usuário ignoraria o filtro e pegaria outros meses.
        const { ok, fail, failed } = await approveIds(group.items.map((it) => it.id));
        setSuccessInfo(t('approvals.approveSelectedResult', { count: ok, failed: fail }));
        setFailures(failed);
      } else {
        const { data } = await api.post('/api/hour-entries/bulk-approve', {
          userId: group.userId,
        });
        setSuccessInfo(
          t('approvals.bulkApproveSuccess', {
            count: data.approvedCount,
            skipped: data.skipped?.length || 0,
          })
        );
      }
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

      {/* Filtro por mês de referência */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <label className="text-sm text-ink-muted" htmlFor="approvals-month">
          {t('approvals.monthFilter', { defaultValue: 'Mês de referência' })}
        </label>
        <select
          id="approvals-month"
          value={monthFilter}
          onChange={(e) => changeMonth(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-ink"
        >
          <option value="">{t('approvals.allMonths', { defaultValue: 'Todos os meses' })}</option>
          {availableMonths.map((k) => (
            <option key={k} value={k}>
              {monthLabel(k)}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}
      {successInfo && (
        <div className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {successInfo}
        </div>
      )}
      {failures.length > 0 && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <div className="font-medium text-red-900">
            {t('approvals.failuresTitle', {
              defaultValue: 'Não foi possível aprovar {{count}} lançamento(s):',
              count: failures.length,
            })}
          </div>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {failures.map((f) => (
              <li key={f.id}>
                <span className="font-medium">{f.label}</span>
                {f.reason ? <span className="text-red-700"> — {f.reason}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Barra de ação em lote — aparece quando há seleção */}
      {selected.size > 0 && (
        <div className="sticky top-0 z-10 mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
          <span className="text-sm font-medium text-emerald-900">
            {t('approvals.selectionCount', { defaultValue: '{{count}} selecionado(s)', count: selected.size })}
          </span>
          <button
            type="button"
            disabled={bulkBusy}
            onClick={approveSelected}
            className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            {bulkBusy
              ? t('approvals.approvingSelected', { defaultValue: 'Aprovando…' })
              : t('approvals.approveSelected', { defaultValue: 'Aprovar selecionados' })}
          </button>
          <button
            type="button"
            onClick={selectAllVisible}
            className="text-sm text-emerald-800 underline-offset-2 hover:underline"
          >
            {t('approvals.selectAllVisible', { defaultValue: 'Selecionar todos os visíveis' })}
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="text-sm text-emerald-800 underline-offset-2 hover:underline"
          >
            {t('approvals.clearSelection', { defaultValue: 'Limpar seleção' })}
          </button>
        </div>
      )}

      <div className="mt-6 space-y-8">
        {visibleEntries.length === 0 ? (
          <p className="text-ink-muted">
            {entries.length === 0
              ? t('approvals.noPending')
              : t('approvals.noPendingForMonth', {
                  defaultValue: 'Nenhum lançamento pendente neste mês.',
                })}
          </p>
        ) : (
          groups.map((group) => {
            const totalMin = sumMinutes(group.items);
            const hoursLabel = (totalMin / 60).toFixed(1);
            const allSelected =
              group.items.length > 0 && group.items.every((it) => selected.has(it.id));
            const someSelected = group.items.some((it) => selected.has(it.id));
            return (
              <section key={group.userId || group.analystName} className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 pb-2">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected && !allSelected;
                      }}
                      onChange={(e) => setGroupSelected(group.items, e.target.checked)}
                      aria-label={t('approvals.selectAllGroup', {
                        defaultValue: 'Selecionar todos de {{name}}',
                        name: group.analystName,
                      })}
                      className="h-4 w-4"
                    />
                    <div>
                      <h2 className="text-lg font-semibold text-ink">{group.analystName}</h2>
                      <p className="text-xs text-ink-muted">
                        {t('approvals.approveAllSummary', {
                          count: group.items.length,
                          hours: hoursLabel,
                        })}
                      </p>
                    </div>
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
                    const isSelected = selected.has(en.id);
                    return (
                      <div
                        key={en.id}
                        className={`rounded-xl border bg-white p-4 shadow-sm ${
                          isSelected ? 'border-emerald-400 ring-1 ring-emerald-200' : 'border-gray-200'
                        }`}
                      >
                        <div className="flex flex-wrap justify-between gap-2">
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleOne(en.id)}
                              aria-label={t('approvals.selectEntry', {
                                defaultValue: 'Selecionar lançamento',
                              })}
                              className="mt-1 h-4 w-4"
                            />
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
