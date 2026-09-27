import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { api, getErrorMessage } from '../api/client.js';
import { inputClass } from '../lib/ui.js';

export default function Tasks() {
  const { t } = useTranslation();
  const [tasks, setTasks] = useState([]);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState('medium');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get('/api/tasks');
      setTasks(data);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  useEffect(() => {
    load();
  }, []);

  async function addTask(e) {
    e.preventDefault();
    if (saving) return;
    setError('');
    setSaving(true);
    try {
      await api.post('/api/tasks', {
        title,
        dueDate: dueDate || undefined,
        priority,
      });
      setTitle('');
      setDueDate('');
      setPriority('medium');
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function toggle(t) {
    try {
      await api.patch(`/api/tasks/${t.id}`, { completed: !t.completed });
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">{t('tasks.title')}</h1>
      <p className="text-sm text-ink-muted">{t('tasks.subtitle')}</p>

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <form onSubmit={addTask} className="mt-6 flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:flex-row sm:items-end">
        <label className="flex-1 text-sm">
          <span className="text-ink-muted">{t('tasks.form.title')}</span>
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="text-sm">
          <span className="text-ink-muted">{t('tasks.form.due')}</span>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="text-sm">
          <span className="text-ink-muted">{t('tasks.form.priority')}</span>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className={inputClass}
          >
            <option value="low">{t('tasks.priority.low')}</option>
            <option value="medium">{t('tasks.priority.medium')}</option>
            <option value="high">{t('tasks.priority.high')}</option>
          </select>
        </label>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60"
        >
          {t('tasks.form.add')}
        </button>
      </form>

      <ul className="mt-6 space-y-2">
        {tasks.map((task) => (
          <li
            key={task.id}
            className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm"
          >
            <div>
              <button
                type="button"
                onClick={() => toggle(task)}
                className={`text-left font-medium ${task.completed ? 'line-through text-ink-muted' : 'text-ink'}`}
              >
                {task.title}
              </button>
              {task.dueDate && (
                <div className="text-xs text-ink-muted">
                  {t('tasks.duePrefix')} {format(new Date(task.dueDate), 'MMM d, yyyy')}
                </div>
              )}
            </div>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                task.priority === 'high'
                  ? 'bg-red-50 text-red-700'
                  : task.priority === 'medium'
                    ? 'bg-amber-50 text-amber-700'
                    : 'bg-gray-100 text-gray-600'
              }`}
            >
              {t(`tasks.priority.${task.priority}`, { defaultValue: task.priority })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
