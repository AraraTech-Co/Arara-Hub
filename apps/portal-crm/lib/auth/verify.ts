/**
 * verify(permission, actor) — checagem única de autorização, no estilo portal-suporte.
 * `permission` pode ser um NÍVEL ("admin") ou uma ROTA ("/api/admin/users").
 */
import { hasMinLevel, canAccessPath, type Level } from "./access-control"

export type Actor = { id: string; role: string; teamId?: string | null } | null | undefined

export function verify(permission: string, actor: Actor): boolean {
  if (!actor) return false
  // rota (começa com "/") → checa contra access-control; senão trata como nível
  if (permission.startsWith("/")) return canAccessPath(permission, actor.role)
  return hasMinLevel(permission, actor.role)
}

export function isAdmin(actor: Actor): boolean {
  return verify("admin", actor)
}

export function isManagerOrAbove(actor: Actor): boolean {
  return verify("admin", actor)
}

export type { Level }
