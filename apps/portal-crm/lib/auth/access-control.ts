/**
 * Motor de controle de acesso baseado em ranks — papéis canônicos.
 * Fonte: config/access-control.json.
 */
import accessControl from "@/config/access-control.json"
import { normalizeRole, ROLE_RANK, type CanonicalRole } from "@/lib/canonical-roles"

export type Level = CanonicalRole

const levels = accessControl.levels as Record<string, { rank: number }>
const contexts = accessControl.contexts as { prefix: string; floorLevel: string }[]
const routes = accessControl.routes as { pattern: string; minLevel: string }[]

/** Rank numérico de um nível (0 se desconhecido). Aceita aliases legados. */
export function rankOf(level: string | null | undefined): number {
  if (!level) return 0
  const n = normalizeRole(level)
  if (n) return ROLE_RANK[n]
  return levels[level]?.rank ?? 0
}

/** actorLevel satisfaz minLevel? (hierarquia inclusiva) */
export function hasMinLevel(minLevel: string, actorLevel: string): boolean {
  return rankOf(actorLevel) >= rankOf(minLevel)
}

function patternToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "§DOUBLE§")
    .replace(/\*/g, "[^/]*")
    .replace(/§DOUBLE§/g, ".*")
  return new RegExp(`^${escaped}$`)
}

export function getEffectiveMinLevel(pathname: string): string | null {
  let best: { pattern: string; minLevel: string } | null = null
  for (const r of routes) {
    if (patternToRegExp(r.pattern).test(pathname)) {
      if (!best || r.pattern.length > best.pattern.length) best = r
    }
  }
  if (best) return best.minLevel

  let floor: { prefix: string; floorLevel: string } | null = null
  for (const c of contexts) {
    if (pathname === c.prefix || pathname.startsWith(c.prefix + "/")) {
      if (!floor || c.prefix.length > floor.prefix.length) floor = c
    }
  }
  return floor?.floorLevel ?? null
}

export function canAccessPath(pathname: string, actorLevel: string): boolean {
  const min = getEffectiveMinLevel(pathname)
  if (min === null) return true
  return hasMinLevel(min, actorLevel)
}
