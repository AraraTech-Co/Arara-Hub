import {
  canAccessPath,
  canApiKeyAccessPath,
  getEffectiveMinLevel,
  hasMinLevel,
  isKnownLevel,
} from './access-control'
import type { AccessLevel, AuthContext } from './types'

/**
 * Permission = nível hierárquico (ex: "developer", "admin") ou rota (ex: "/admin/kanban").
 * Rotas resolvem minLevel via config/access-control.json.
 */
export type Permission = string

export type Actor = {
  accessLevel?: AccessLevel
  role?: AccessLevel
}

export function resolveAccessLevel(actor: Actor): AccessLevel | null {
  return actor.accessLevel ?? actor.role ?? null
}

/**
 * Verifica se o ator possui a permissão.
 * - Nível: rank(actor) >= rank(permission)
 * - Rota: rank(actor) >= effectiveMinLevel(rota) no JSON
 */
export function verify(permission: Permission, actor: Actor): boolean {
  const level = resolveAccessLevel(actor)
  if (!level) return false

  if (permission.startsWith('/')) {
    return canAccessPath(level, permission)
  }

  if (!isKnownLevel(permission)) {
    return false
  }

  return hasMinLevel(level, permission)
}

export function verifyApiKey(
  permission: Permission,
  accessLevel: AccessLevel,
  routeGrants: string[],
  routeDenials: string[]
): boolean {
  if (permission.startsWith('/')) {
    return canApiKeyAccessPath(accessLevel, permission, routeGrants, routeDenials)
  }
  return hasMinLevel(accessLevel, permission)
}

export function resolveRequiredLevel(permission: Permission): AccessLevel | null {
  if (permission.startsWith('/')) {
    return getEffectiveMinLevel(permission)
  }
  return isKnownLevel(permission) ? permission : null
}

export type { AccessLevel, AuthContext }
