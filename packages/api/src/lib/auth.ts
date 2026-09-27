import type { FastifyReply, FastifyRequest } from 'fastify'
import type { PrismaClient, User } from '@prisma/client'
import { hashApiKey, hasScope, verifyAccessToken } from './crypto.js'
import { hasRole } from './canonical-roles.js'

export type ActorUser = {
  type: 'user'
  user: User
  roles: string[]
  permissions: string[]
  /** App ids from AppMembership — used by canAccessApp for non-admin users. */
  memberAppIds: string[]
}

export type ActorApiKey = {
  type: 'apiKey'
  apiKeyId: string
  appId: string
  appSlug: string
  ownerId: string
  scopes: string[]
}

export type Actor = ActorUser | ActorApiKey

declare module 'fastify' {
  interface FastifyRequest {
    actor?: Actor
  }
}

export async function loadUserPermissions(
  prisma: PrismaClient,
  userId: string,
): Promise<{ roles: string[]; permissions: string[] }> {
  const rows = await prisma.userRole.findMany({
    where: { userId },
    include: {
      role: {
        include: {
          permissions: { include: { permission: true } },
        },
      },
    },
  })
  const roles = rows.map((r) => r.role.name)
  const permissions = [
    ...new Set(rows.flatMap((r) => r.role.permissions.map((p) => p.permission.name))),
  ]
  return { roles, permissions }
}

export function userHasPermission(actor: ActorUser, permission: string): boolean {
  if (actor.roles.includes('admin')) return true
  return actor.permissions.includes(permission)
}

export async function resolveActor(
  request: FastifyRequest,
  prisma: PrismaClient,
): Promise<Actor | null> {
  const apiKeyHeader = request.headers['x-api-key']
  if (typeof apiKeyHeader === 'string' && apiKeyHeader.length > 0) {
    const keyHash = hashApiKey(apiKeyHeader)
    const key = await prisma.apiKey.findFirst({
      where: { keyHash, revokedAt: null },
      include: { app: true },
    })
    if (!key || key.app.status !== 'active') return null
    await prisma.apiKey.update({
      where: { id: key.id },
      data: { lastUsedAt: new Date() },
    })
    const scopes = Array.isArray(key.scopes) ? (key.scopes as string[]) : []
    return {
      type: 'apiKey',
      apiKeyId: key.id,
      appId: key.appId,
      appSlug: key.app.slug,
      ownerId: key.app.ownerId,
      scopes,
    }
  }

  const auth = request.headers.authorization
  if (auth?.startsWith('Bearer ')) {
    const token = auth.slice('Bearer '.length)
    try {
      const payload = await verifyAccessToken(token)
      const user = await prisma.user.findUnique({ where: { id: payload.sub } })
      if (!user || user.status !== 'active') return null
      const { roles, permissions } = await loadUserPermissions(prisma, user.id)
      const memberships = await prisma.appMembership.findMany({
        where: { userId: user.id },
        select: { appId: true },
      })
      return {
        type: 'user',
        user,
        roles,
        permissions,
        memberAppIds: memberships.map((m) => m.appId),
      }
    } catch {
      return null
    }
  }

  return null
}

export function unauthorized(reply: FastifyReply, message = 'Unauthorized') {
  return reply.status(401).send({ error: message })
}

export function forbidden(reply: FastifyReply, message = 'Forbidden') {
  return reply.status(403).send({ error: message })
}

export async function requireActor(
  request: FastifyRequest,
  reply: FastifyReply,
  prisma: PrismaClient,
): Promise<Actor | null> {
  const actor = await resolveActor(request, prisma)
  if (!actor) {
    unauthorized(reply)
    return null
  }
  request.actor = actor
  return actor
}

export function requireUserPermission(actor: Actor, permission: string): boolean {
  if (actor.type === 'user') return userHasPermission(actor, permission)
  return false
}

export function canAccessApp(actor: Actor, app: { id: string; slug: string; ownerId: string }): boolean {
  if (actor.type === 'user') {
    if (actor.roles.includes('admin')) return true
    if (actor.user.id === app.ownerId) return true
    // Staff/members with AppMembership can call /v1/r/:slug and mint app keys
    if (actor.memberAppIds.includes(app.id)) return true
    return false
  }
  return actor.appId === app.id && hasScope(actor.scopes, `app:${app.slug}:*`)
}

/** App administration is scoped to the app owner or its admin membership. */
export async function canAdministerApp(
  actor: Actor,
  app: { id: string; ownerId: string },
  prisma: PrismaClient,
): Promise<boolean> {
  if (actor.type !== 'user') return false
  if (actor.user.id === app.ownerId) return true

  const membership = await prisma.appMembership.findUnique({
    where: { userId_appId: { userId: actor.user.id, appId: app.id } },
    select: { role: true },
  })
  return Boolean(membership && hasRole([membership.role], 'admin'))
}

export function canUseSystemScope(actor: Actor, scope: string): boolean {
  if (actor.type === 'user') {
    if (actor.roles.includes('admin') || actor.roles.includes('developer')) return true
    if (scope === 'system:readme') return true
    return false
  }
  return hasScope(actor.scopes, scope)
}
