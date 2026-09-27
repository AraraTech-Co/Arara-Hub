import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import {
  canAdministerApp,
  canAccessApp,
  forbidden,
  requireActor,
  requireUserPermission,
} from '../../lib/auth.js'
import { CANONICAL_ROLES } from '../../lib/canonical-roles.js'
import { appScopes, generateApiKey, machineAppScopes, slugify } from '../../lib/crypto.js'
import { resolveStorageSlug } from '../../lib/app-slugs.js'

const createAppSchema = z.object({
  name: z.string().min(1),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .optional(),
  description: z.string().optional(),
})

const membershipSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(CANONICAL_ROLES),
})

const membershipUserSelect = {
  id: true,
  email: true,
  name: true,
} as const

export const appRoutes: FastifyPluginAsync = async (app) => {
  app.post('/', async (request, reply) => {
    const actor = await requireActor(request, reply, app.prisma)
    if (!actor) return
    if (actor.type !== 'user' || !requireUserPermission(actor, 'apps:create')) {
      return forbidden(reply, 'Requires developer role with apps:create')
    }

    const parsed = createAppSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid body', details: parsed.error.flatten() })
    }

    const slug = parsed.data.slug ?? slugify(parsed.data.name)
    if (!slug) {
      return reply.status(400).send({ error: 'Invalid slug' })
    }

    const exists = await app.prisma.app.findUnique({ where: { slug } })
    if (exists) {
      return reply.status(409).send({ error: 'Slug already taken' })
    }

    const key = generateApiKey()
    const created = await app.prisma.app.create({
      data: {
        name: parsed.data.name,
        slug,
        description: parsed.data.description ?? null,
        ownerId: actor.user.id,
        apiKeys: {
          create: {
            name: 'default',
            prefix: key.prefix,
            keyHash: key.hash,
            scopes: appScopes(slug),
          },
        },
      },
      include: { apiKeys: true },
    })

    return reply.status(201).send({
      app: {
        id: created.id,
        slug: created.slug,
        name: created.name,
        description: created.description,
        status: created.status,
        ownerId: created.ownerId,
        createdAt: created.createdAt,
      },
      apiKey: {
        id: created.apiKeys[0]?.id,
        prefix: key.prefix,
        key: key.raw,
        scopes: appScopes(slug),
        warning: 'Store this key now. It will not be shown again.',
      },
    })
  })

  app.get('/', async (request, reply) => {
    const actor = await requireActor(request, reply, app.prisma)
    if (!actor) return

    if (actor.type === 'apiKey') {
      const one = await app.prisma.app.findUnique({ where: { id: actor.appId } })
      return { apps: one ? [one] : [] }
    }

    const apps = await app.prisma.app.findMany({
      where: actor.roles.includes('admin') ? undefined : { ownerId: actor.user.id },
      orderBy: { createdAt: 'desc' },
    })
    return { apps }
  })

  app.get('/:slug', async (request, reply) => {
    const actor = await requireActor(request, reply, app.prisma)
    if (!actor) return

    const { slug } = request.params as { slug: string }
    const found = await app.prisma.app.findUnique({
      where: { slug },
      include: {
        modules: { select: { id: true, name: true, status: true, description: true } },
        models: { select: { id: true, name: true, version: true } },
        apiKeys: {
          where: { revokedAt: null },
          select: { id: true, name: true, prefix: true, scopes: true, lastUsedAt: true, createdAt: true },
        },
      },
    })
    if (!found) {
      return reply.status(404).send({ error: 'App not found' })
    }
    if (!canAccessApp(actor, found)) {
      return forbidden(reply)
    }
    return { app: found }
  })

  app.get('/:slug/keys', async (request, reply) => {
    const actor = await requireActor(request, reply, app.prisma)
    if (!actor) return
    if (actor.type !== 'user') {
      return forbidden(reply, 'Only user JWT can list API keys')
    }

    const { slug: requestSlug } = request.params as { slug: string }
    const slug = resolveStorageSlug(requestSlug)
    const found = await app.prisma.app.findUnique({ where: { slug } })
    if (!found) {
      return reply.status(404).send({ error: 'App not found' })
    }
    if (!canAccessApp(actor, found)) {
      return forbidden(reply)
    }

    const keys = await app.prisma.apiKey.findMany({
      where: { appId: found.id, revokedAt: null },
      select: {
        id: true,
        name: true,
        prefix: true,
        scopes: true,
        lastUsedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })
    return { keys, note: 'Users are shared across apps; keys are scoped per app.' }
  })

  app.get('/:slug/members', async (request, reply) => {
    const actor = await requireActor(request, reply, app.prisma)
    if (!actor) return
    if (actor.type !== 'user') {
      return forbidden(reply, 'Only user JWT can administer app memberships')
    }

    const { slug: requestSlug } = request.params as { slug: string }
    const slug = resolveStorageSlug(requestSlug)
    const found = await app.prisma.app.findUnique({ where: { slug } })
    if (!found) {
      return reply.status(404).send({ error: 'App not found' })
    }
    if (!(await canAdministerApp(actor, found, app.prisma))) {
      return forbidden(reply, 'Requires app owner or admin membership')
    }

    const memberships = await app.prisma.appMembership.findMany({
      where: { appId: found.id },
      include: { user: { select: membershipUserSelect } },
      orderBy: { user: { email: 'asc' } },
    })

    return {
      members: memberships.map((membership) => ({
        userId: membership.user.id,
        email: membership.user.email,
        name: membership.user.name,
        role: membership.role,
      })),
    }
  })

  app.post('/:slug/members', async (request, reply) => {
    const actor = await requireActor(request, reply, app.prisma)
    if (!actor) return
    if (actor.type !== 'user') {
      return forbidden(reply, 'Only user JWT can administer app memberships')
    }

    const parsed = membershipSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid body', details: parsed.error.flatten() })
    }

    const { slug: requestSlug } = request.params as { slug: string }
    const slug = resolveStorageSlug(requestSlug)
    const found = await app.prisma.app.findUnique({ where: { slug } })
    if (!found) {
      return reply.status(404).send({ error: 'App not found' })
    }
    if (!(await canAdministerApp(actor, found, app.prisma))) {
      return forbidden(reply, 'Requires app owner or admin membership')
    }

    const user = await app.prisma.user.findUnique({
      where: { id: parsed.data.userId },
      select: membershipUserSelect,
    })
    if (!user) {
      return reply.status(404).send({ error: 'User not found' })
    }

    const membership = await app.prisma.appMembership.upsert({
      where: {
        userId_appId: {
          userId: user.id,
          appId: found.id,
        },
      },
      create: {
        userId: user.id,
        appId: found.id,
        role: parsed.data.role,
      },
      update: { role: parsed.data.role },
      include: { user: { select: membershipUserSelect } },
    })

    return {
      member: {
        userId: membership.user.id,
        email: membership.user.email,
        name: membership.user.name,
        role: membership.role,
      },
    }
  })

  app.delete('/:slug/members/:userId', async (request, reply) => {
    const actor = await requireActor(request, reply, app.prisma)
    if (!actor) return
    if (actor.type !== 'user') {
      return forbidden(reply, 'Only user JWT can administer app memberships')
    }

    const { slug: requestSlug, userId } = request.params as { slug: string; userId: string }
    const slug = resolveStorageSlug(requestSlug)
    const found = await app.prisma.app.findUnique({ where: { slug } })
    if (!found) {
      return reply.status(404).send({ error: 'App not found' })
    }
    if (!(await canAdministerApp(actor, found, app.prisma))) {
      return forbidden(reply, 'Requires app owner or admin membership')
    }

    const membership = await app.prisma.appMembership.findUnique({
      where: { userId_appId: { userId, appId: found.id } },
      select: { id: true },
    })
    if (!membership) {
      return reply.status(404).send({ error: 'Membership not found' })
    }

    await app.prisma.appMembership.delete({ where: { id: membership.id } })
    return { success: true }
  })

  app.post('/:slug/keys', async (request, reply) => {
    const actor = await requireActor(request, reply, app.prisma)
    if (!actor) return
    if (actor.type !== 'user') {
      return forbidden(reply, 'Only user JWT can rotate API keys')
    }

    const { slug: requestSlug } = request.params as { slug: string }
    const slug = resolveStorageSlug(requestSlug)
    const body = z
      .object({
        name: z.string().min(1).optional(),
        revokeOthers: z.boolean().optional(),
        /** When true, includes app:{slug}:secrets:read (machine/server key). Admin or owner only. */
        machine: z.boolean().optional(),
        scopes: z.array(z.string().min(1)).optional(),
      })
      .safeParse(request.body ?? {})
    if (!body.success) {
      return reply.status(400).send({ error: 'Invalid body', details: body.error.flatten() })
    }

    const found = await app.prisma.app.findUnique({ where: { slug } })
    if (!found) {
      return reply.status(404).send({ error: 'App not found' })
    }
    if (!canAccessApp(actor, found)) {
      return forbidden(reply)
    }

    const elevated =
      actor.roles.includes('admin') || actor.user.id === found.ownerId
    if ((body.data.machine || body.data.scopes) && !elevated) {
      return forbidden(reply, 'Only admin or app owner can mint machine keys / custom scopes')
    }

    let scopes = appScopes(found.slug)
    if (body.data.machine) {
      scopes = machineAppScopes(found.slug)
    } else if (body.data.scopes?.length) {
      const allowedPrefix = `app:${found.slug}:`
      const invalid = body.data.scopes.filter(
        (s) =>
          !s.startsWith('system:') &&
          !s.startsWith(allowedPrefix) &&
          s !== `app:${found.slug}:*`,
      )
      if (invalid.length) {
        return reply.status(400).send({
          error: 'Invalid scopes',
          details: { invalid, allowed: [`system:*`, `app:${found.slug}:*`, `app:${found.slug}:…`] },
        })
      }
      scopes = [...new Set(body.data.scopes)]
    }

    if (body.data.revokeOthers) {
      await app.prisma.apiKey.updateMany({
        where: { appId: found.id, revokedAt: null },
        data: { revokedAt: new Date() },
      })
    }

    const key = generateApiKey()
    const created = await app.prisma.apiKey.create({
      data: {
        appId: found.id,
        name: body.data.name ?? (body.data.machine ? 'machine' : 'rotated'),
        prefix: key.prefix,
        keyHash: key.hash,
        scopes,
      },
    })

    return reply.status(201).send({
      apiKey: {
        id: created.id,
        prefix: key.prefix,
        key: key.raw,
        scopes,
        warning:
          body.data.machine || scopes.some((s) => s.endsWith(':secrets:read'))
            ? 'Machine key: store only on the server (env). Never put in localStorage or NEXT_PUBLIC_*.'
            : 'Store this key now. It will not be shown again.',
      },
    })
  })

  app.delete('/:slug/keys/:id', async (request, reply) => {
    const actor = await requireActor(request, reply, app.prisma)
    if (!actor) return
    if (actor.type !== 'user') {
      return forbidden(reply, 'Only user JWT can revoke API keys')
    }

    const { slug: requestSlug, id } = request.params as { slug: string; id: string }
    const slug = resolveStorageSlug(requestSlug)
    const found = await app.prisma.app.findUnique({ where: { slug } })
    if (!found) {
      return reply.status(404).send({ error: 'App not found' })
    }
    if (!(await canAdministerApp(actor, found, app.prisma))) {
      return forbidden(reply, 'Requires app owner or admin membership')
    }

    const key = await app.prisma.apiKey.findFirst({
      where: { id, appId: found.id, revokedAt: null },
      select: { id: true },
    })
    if (!key) {
      return reply.status(404).send({ error: 'API key not found' })
    }

    await app.prisma.apiKey.update({
      where: { id: key.id },
      data: { revokedAt: new Date() },
    })

    return { success: true }
  })
}
