import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { api, getErrorMessage } from '../api/client.js';
import { inputClass } from '../lib/ui.js';

export default function Reminders() {
  const { t } = useTranslation();
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [remindAt, setRemindAt] = useState('');

  const load = async () => {
    try {
      const { data } = await api.get('/api/reminders');
      setItems(data);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  useEffect(() => {
    load();
  }, []);

  async function add(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/api/reminders', {
        title,
        remindAt: new Date(remindAt).toISOString(),
      });
      setTitle('');
      setRemindAt('');
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function dismiss(r) {
    try {
      await api.patch(`/api/reminders/${r.id}`, { completed: true });
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">{t('reminders.title')}</h1>
      <p className="text-sm text-ink-muted">{t('reminders.subtitle')}</p>

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <form onSubmit={add} className="mt-6 flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:flex-row sm:items-end">
        <label className="flex-1 text-sm">
          <span className="text-ink-muted">{t('reminders.form.title')}</span>
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="text-sm">
          <span className="text-ink-muted">{t('reminders.form.when')}</span>
          <input
            type="datetime-local"
            required
            value={remindAt}
            onChange={(e) => setRemindAt(e.target.value)}
            className={inputClass}
          />
        </label>
        <button
          type="submit"
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
        >
          {t('reminders.form.add')}
        </button>
      </form>

      <ul className="mt-6 space-y-2">
        {items.map((r) => (
          <li
            key={r.id}
            className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm"
          >
            <div>
              <div className={`font-medium ${r.completed ? 'line-through text-ink-muted' : 'text-ink'}`}>
                {r.title}
              </div>
              <div className="text-xs text-ink-muted">
                {format(new Date(r.remindAt), 'PPpp')}
              </div>
            </div>
            {!r.completed && (
              <button
                type="button"
                onClick={() => dismiss(r)}
                className="text-sm text-accent hover:underline"
              >
                {t('reminders.done')}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
