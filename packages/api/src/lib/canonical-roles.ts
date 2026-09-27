/**
 * Canonical person roles for Arara Platform + all apps.
 * Multi-role via UserRole M:N; effectiveRole = highest rank.
 *
 * Labels (PT): user=Usuário, support=Suporte, developer=Developer, admin=Admin
 */

export const CANONICAL_ROLES = ['user', 'support', 'developer', 'admin'] as const
export type CanonicalRole = (typeof CANONICAL_ROLES)[number]

export const ROLE_RANK: Record<CanonicalRole, number> = {
  user: 10,
  support: 20,
  developer: 30,
  admin: 40,
}

export const ROLE_LABEL_PT: Record<CanonicalRole, string> = {
  user: 'Usuário',
  support: 'Suporte',
  developer: 'Developer',
  admin: 'Admin',
}

/** Legacy / app-specific strings → canonical id */
const ALIASES: Record<string, CanonicalRole> = {
  user: 'user',
  usuario: 'user',
  vendedor: 'user',
  member: 'support',
  support: 'support',
  suporte: 'support',
  agent: 'support',
  agente: 'support',
  developer: 'developer',
  dev: 'developer',
  admin: 'admin',
  master: 'admin',
  owner: 'admin',
  gerente: 'admin',
  manager: 'admin',
}

export function normalizeRole(raw: unknown): CanonicalRole | null {
  if (raw == null || raw === '') return null
  const key = String(raw).trim().toLowerCase()
  return ALIASES[key] ?? null
}

export function roleRank(role: string | null | undefined): number {
  const n = normalizeRole(role)
  return n ? ROLE_RANK[n] : 0
}

export function hasRole(roles: string[] | null | undefined, role: CanonicalRole): boolean {
  if (!roles?.length) return false
  return roles.some((r) => normalizeRole(r) === role)
}

export function hasMinRole(
  roles: string[] | null | undefined,
  min: CanonicalRole,
): boolean {
  if (!roles?.length) return false
  const floor = ROLE_RANK[min]
  return roles.some((r) => roleRank(r) >= floor)
}

/** Highest-rank canonical role among a list (defaults to user). */
export function effectiveRole(roles: string[] | null | undefined): CanonicalRole {
  if (!roles?.length) return 'user'
  let best: CanonicalRole = 'user'
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

/** Staff = support or above (not plain end-user clients). */
export function isStaffRoles(roles: string[] | null | undefined): boolean {
  return hasMinRole(roles, 'support')
}

export function isAdminRoles(roles: string[] | null | undefined): boolean {
  return hasRole(roles, 'admin')
}
