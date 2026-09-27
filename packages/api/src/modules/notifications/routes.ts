import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { forbidden, requireActor, type Actor } from '../../lib/auth.js'
import { hasScope } from '../../lib/crypto.js'
import { isStaffRoles } from '../../lib/canonical-roles.js'
import {
  NOTIFICATION_SEVERITIES,
  createNotification,
  deleteNotification,
  getNotification,
  listForUser,
  markAllRead,
  markRead,
  serializeNotification,
  updateNotification,
} from '../../lib/notifications.js'

const createSchema = z.object({
  userId: z.string().min(1),
  title: z.string().min(1),
  body: z.string().min(1),
  severity: z.enum(NOTIFICATION_SEVERITIES).optional(),
  href: z.string().url().optional().nullable(),
  sourceApp: z.string().optional().nullable(),
})

const patchSchema = z.object({
  title: z.string().min(1).optional(),
  body: z.string().min(1).optional(),
  severity: z.enum(NOTIFICATION_SEVERITIES).optional(),
  href: z.string().url().optional().nullable(),
  sourceApp: z.string().optional().nullable(),
  read: z.boolean().optional(),
})

function isAdmin(actor: Actor): boolean {
  return actor.type === 'user' && (actor.roles.includes('admin') || actor.roles.includes('master'))
}

function canCreate(actor: Actor): boolean {
  if (actor.type === 'user') return isStaffRoles(actor.roles)
  if (hasScope(actor.scopes, 'notifications:write')) return true
  return actor.scopes.some((s) => /^app:[^:]+:\*$/.test(s))
}

function canAccessRow(actor: Actor, userId: string): boolean {
  if (actor.type === 'user') {
    if (actor.user.id === userId) return true
    return isAdmin(actor)
  }
  return false
}

export const notificationRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async (request, reply) => {
    const actor = await requireActor(request, reply, app.prisma)
    if (!actor) return
    if (actor.type !== 'user') {
      return forbidden(reply, 'JWT required for notification inbox')
    }

    const q = request.query as Record<string, unknown>
    let userId = actor.user.id
    if (typeof q.userId === 'string' && q.userId && q.userId !== actor.user.id) {
      if (!isAdmin(actor)) return forbidden(reply, 'Only admin can list other users')
      userId = q.userId
    }

    const unread =
      q.unread === true || q.unread === 'true' || q.unreadOnly === true || q.unreadOnly === 'true'
    const result = await listForUser(app.prisma, {
      userId,
      unreadOnly: unread,
      limit: q.limit != null ? Number(q.limit) : 20,
      offset: q.offset != null ? Number(q.offset) : 0,
    })
    return result
  })

  app.post('/read-all', async (request, reply) => {
    const actor = await requireActor(request, reply, app.prisma)
    if (!actor) return
    if (actor.type !== 'user') return forbidden(reply, 'JWT required')
    const result = await markAllRead(app.prisma, actor.user.id)
    return { ok: true, ...result }
  })

  app.post('/', async (request, reply) => {
    const actor = await requireActor(request, reply, app.prisma)
    if (!actor) return
    if (!canCreate(actor)) {
      return forbidden(reply, 'Requires staff JWT or API key with notifications:write / app:*')
    }

    const parsed = createSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid body', details: parsed.error.flatten() })
    }

    const createdBy = actor.type === 'user' ? actor.user.id : `apiKey:${actor.apiKeyId}`
    const sourceApp =
      parsed.data.sourceApp ?? (actor.type === 'apiKey' ? actor.appSlug : null)

    try {
      const row = await createNotification(app.prisma, {
        ...parsed.data,
        sourceApp,
        createdBy,
      })
      return reply.status(201).send({ notification: serializeNotification(row) })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg === 'user not found') return reply.status(404).send({ error: msg })
      return reply.status(400).send({ error: msg })
    }
  })

  app.get('/:id', async (request, reply) => {
    const actor = await requireActor(request, reply, app.prisma)
    if (!actor) return
    if (actor.type !== 'user') return forbidden(reply, 'JWT required')

    const { id } = request.params as { id: string }
    const row = await getNotification(app.prisma, id)
    if (!row) return reply.status(404).send({ error: 'Notification not found' })
    if (!canAccessRow(actor, row.userId)) return forbidden(reply)
    return { notification: serializeNotification(row) }
  })

  app.patch('/:id', async (request, reply) => {
    const actor = await requireActor(request, reply, app.prisma)
    if (!actor) return
    if (actor.type !== 'user') return forbidden(reply, 'JWT required')

    const { id } = request.params as { id: string }
    const row = await getNotification(app.prisma, id)
    if (!row) return reply.status(404).send({ error: 'Notification not found' })
    if (!canAccessRow(actor, row.userId)) return forbidden(reply)

    const parsed = patchSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid body', details: parsed.error.flatten() })
    }

    const isOwner = actor.user.id === row.userId
    const admin = isAdmin(actor)
    if (!admin) {
      const keys = Object.keys(parsed.data).filter(
        (k) => parsed.data[k as keyof typeof parsed.data] !== undefined,
      )
      if (keys.some((k) => k !== 'read')) {
        return forbidden(reply, 'Only admin can edit notification content')
      }
      if (!isOwner) return forbidden(reply)
    }

    const updated = await updateNotification(app.prisma, id, parsed.data)
    return { notification: serializeNotification(updated) }
  })

  app.post('/:id/read', async (request, reply) => {
    const actor = await requireActor(request, reply, app.prisma)
    if (!actor) return
    if (actor.type !== 'user') return forbidden(reply, 'JWT required')

    const { id } = request.params as { id: string }
    const row = await getNotification(app.prisma, id)
    if (!row) return reply.status(404).send({ error: 'Notification not found' })
    if (!canAccessRow(actor, row.userId)) return forbidden(reply)

    const updated = await markRead(app.prisma, id)
    return { notification: serializeNotification(updated) }
  })

  app.delete('/:id', async (request, reply) => {
    const actor = await requireActor(request, reply, app.prisma)
    if (!actor) return
    if (actor.type !== 'user') return forbidden(reply, 'JWT required')

    const { id } = request.params as { id: string }
    const row = await getNotification(app.prisma, id)
    if (!row) return reply.status(404).send({ error: 'Notification not found' })
    if (!canAccessRow(actor, row.userId)) return forbidden(reply)

    await deleteNotification(app.prisma, id)
    return reply.status(204).send()
  })
}
