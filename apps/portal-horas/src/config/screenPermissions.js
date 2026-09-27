export const SCREEN_KEYS = [
  'hours',
  'insights',
  'calendar',
  'approvals',
  'csvExports',
  'users',
  'settings',
  'finance',
  'escala',
];

/** Ceiling by canonical role (managerRole removed — approvals = admin). */
export const ROLE_SCREEN_CEILING = {
  admin: SCREEN_KEYS,
  developer: ['hours', 'insights', 'calendar', 'csvExports', 'settings', 'finance', 'escala'],
  support: ['hours', 'calendar', 'settings', 'finance'],
  user: ['hours', 'calendar', 'settings', 'finance'],
};

export function roleKeyFromUser(user) {
  const role = String(user?.role || 'user').toLowerCase();
  if (role === 'admin' || role === 'master' || user?.managerRole) return 'admin';
  if (role === 'developer') return 'developer';
  if (role === 'support' || role === 'member' || role === 'agent') return 'support';
  return 'user';
}

export function normalizeScreenPermissions(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return [...SCREEN_KEYS];
  const allowed = new Set(SCREEN_KEYS);
  return [...new Set(raw.filter((screen) => allowed.has(screen)))];
}

export function resolveEffectiveScreenPermissions(user) {
  if (Array.isArray(user?.screenPermissions) && user.screenPermissions.length > 0) {
    return normalizeScreenPermissions(user.screenPermissions);
  }
  const key = roleKeyFromUser(user);
  const roleAllowed = new Set(ROLE_SCREEN_CEILING[key] || ROLE_SCREEN_CEILING.user);
  if (key === 'admin') {
    return [...roleAllowed];
  }
  const squadAllowed = new Set(normalizeScreenPermissions(user?.squadConfig?.screenPermissions));
  if (squadAllowed.size === 0) return [...roleAllowed];
  return [...roleAllowed].filter((k) => squadAllowed.has(k));
}
