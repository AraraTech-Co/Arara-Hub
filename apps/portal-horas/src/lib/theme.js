const KEY = 'horas-theme';

export function applyTheme(theme) {
  const dark =
    theme === 'dark' ||
    (theme !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  return dark;
}

export function initTheme() {
  try {
    return applyTheme(localStorage.getItem(KEY) || 'system');
  } catch {
    return applyTheme('system');
  }
}

export function isDarkActive() {
  return document.documentElement.classList.contains('dark');
}

export function toggleTheme() {
  const next = isDarkActive() ? 'light' : 'dark';
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* ignore */
  }
  return applyTheme(next);
}
