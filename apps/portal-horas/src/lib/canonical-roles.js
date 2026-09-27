/**
 * Canonical person roles (shared with platform). Keep in sync with
 * platform/src/lib/canonical-roles.ts
 */

export const CANONICAL_ROLES = ['user', 'support', 'developer', 'admin']

export const ROLE_RANK = {
  user: 10,
  support: 20,
  developer: 30,
  admin: 40,
}

const ALIASES = {
  user: 'user',
  usuario: 'user',
  vendedor: 'user',
  member: 'support',
  support: 'support',
  suporte: 'support',
  agent: 'support',
  agente: 'support',
  developer: 'developer',
  admin: 'admin',
  master: 'admin',
  owner: 'admin',
  gerente: 'admin',
  manager: 'admin',
}

export function normalizeRole(raw) {
  if (raw == null || raw === '') return null
  return ALIASES[String(raw).trim().toLowerCase()] ?? null
}

export function roleRank(role) {
  const n = normalizeRole(role)
  return n ? ROLE_RANK[n] : 0
}

export function hasRole(roles, role) {
  if (!roles?.length) return false
  return roles.some((r) => normalizeRole(r) === role)
}

export function hasMinRole(roles, min) {
  if (!roles?.length) return false
  const floor = ROLE_RANK[min]
  return roles.some((r) => roleRank(r) >= floor)
}

export function effectiveRole(roles) {
  if (!roles?.length) return 'user'
  let best = 'user'
  let bestRank = ROLE_RANK.user
  for (const r of roles) {
    const n = normalizeRole(r)
    if (!n) continue
    if (ROLE_RANK[n] > bestRank) {
      best = n
      bestRank = ROLE_RANK[n]
    }
  }
  return best
}

export function isStaffRoles(roles) {
  return hasMinRole(roles, 'support')
}

export function isAdminRoles(roles) {
  return hasRole(roles, 'admin')
}
