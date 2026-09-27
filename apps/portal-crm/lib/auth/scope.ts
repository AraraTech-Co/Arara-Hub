/**
 * Escopo de ownership — admin vê tudo; demais veem só o próprio.
 * (legado gerente→admin na migração de papéis canônicos)
 */
import type { Actor } from "./verify"
import { normalizeRole } from "@/lib/canonical-roles"

/** Fragmento de where Prisma para filtrar registros por dono, conforme o papel. */
export function ownerScope(actor: NonNullable<Actor>): Record<string, unknown> {
  const role = normalizeRole(actor.role) || "user"
  if (role === "admin") return {}
  return { ownerId: actor.id }
}

/** Um ator pode acessar um registro cujo dono tem (ownerId, ownerTeamId)? */
export function canAccessOwned(
  actor: NonNullable<Actor>,
  owner: { ownerId: string | null; ownerTeamId: string | null }
): boolean {
  if (owner.ownerId === null) return true
  const role = normalizeRole(actor.role) || "user"
  if (role === "admin") return true
  return owner.ownerId === actor.id
}
