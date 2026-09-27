import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import type { Actor } from '../../lib/auth.js'
import { canAccessApp, forbidden, requireActor } from '../../lib/auth.js'
import { decryptSecret, encryptSecret } from '../../lib/app-secrets.js'
import { hasScope, secretsReadScope } from '../../lib/crypto.js'

const secretNameSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/, 'name must be snake_case (e.g. whatsapp_token)')

const upsertSchema = z.object({
  name: secretNameSchema,
  value: z.string().min(1).max(64_000),
  serverOnly: z.boolean().optional(),
})

type AppRef = { id: string; slug: string; ownerId: string }

/** JWT with access to the app may list / manage (create/delete). */
function canManageSecrets(actor: Actor, app: AppRef): boolean {
  if (actor.type !== 'user') return false
  return canAccessApp(actor, app)
}

function canListSecrets(actor: Actor, app: AppRef): boolean {
  return canAccessApp(actor, app)
}

/** Elevated JWT: platform admin or app owner (not generic staff membership). */
function isElevatedJwt(actor: Actor, app: AppRef): boolean {
  if (actor.type !== 'user') return false
  if (actor.roles.includes('admin')) return true
  return actor.user.id === app.ownerId
}

/**
 * Plaintext read:
 * - JWT admin/owner always
 * - ApiKey with exact app:{slug}:secrets:read (NOT implied by app:slug:*)
 * - If !serverOnly: any actor with canAccessApp (UI ApiKey ok)
 */
function canReadSecretValue(
  actor: Actor,
  app: AppRef,
  serverOnly: boolean,
): boolean {
  if (isElevatedJwt(actor, app)) return true
  if (actor.type === 'apiKey') {
    if (actor.appId !== app.id) return false
    if (hasScope(actor.scopes, secretsReadScope(app.slug), { allowAppWildcard: false })) {
      return true
    }
    if (!serverOnly) {
      return canAccessApp(actor, app)
    }
    return false
  }
  // Non-elevated JWT (staff member): only non-serverOnly secrets
  if (!serverOnly && canAccessApp(actor, app)) return true
  return false
}

export const appSecretRoutes: FastifyPluginAsync = async (app) => {
  app.get('/:slug/secrets', async (request, reply) => {
    const actor = await requireActor(request, reply, app.prisma)
    if (!actor) return

    const { slug } = request.params as { slug: string }
    const found = await app.prisma.app.findUnique({ where: { slug } })
    if (!found) {
      return reply.status(404).send({ error: 'App not found' })
    }
    if (!canListSecrets(actor, found)) {
      return forbidden(reply)
    }

    const secrets = await app.prisma.appSecret.findMany({
      where: { appId: found.id },
      select: { id: true, name: true, serverOnly: true, createdAt: true, updatedAt: true },
      orderBy: { name: 'asc' },
    })
    return { secrets }
  })

  app.post('/:slug/secrets', async (request, reply) => {
    const actor = await requireActor(request, reply, app.prisma)
    if (!actor) return
    if (actor.type !== 'user') {
      return forbidden(reply, 'Only user JWT can create or update secrets')
    }

    const { slug } = request.params as { slug: string }
    const parsed = upsertSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid body', details: parsed.error.flatten() })
    }

    const found = await app.prisma.app.findUnique({ where: { slug } })
    if (!found) {
      return reply.status(404).send({ error: 'App not found' })
    }
    if (!canManageSecrets(actor, found)) {
      return forbidden(reply)
    }

    let encrypted
    try {
      encrypted = encryptSecret(parsed.data.value)
    } catch (err) {
      request.log.error({ err: err instanceof Error ? err.message : err }, 'encryptSecret failed')
      return reply.status(503).send({ error: 'Secrets encryption is not configured' })
    }

    const serverOnly = parsed.data.serverOnly ?? true

    const secret = await app.prisma.appSecret.upsert({
      where: {
        appId_name: { appId: found.id, name: parsed.data.name },
      },
      create: {
        appId: found.id,
        name: parsed.data.name,
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        serverOnly,
        createdBy: actor.user.id,
      },
      update: {
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        ...(parsed.data.serverOnly !== undefined ? { serverOnly: parsed.data.serverOnly } : {}),
      },
      select: { id: true, name: true, serverOnly: true, createdAt: true, updatedAt: true },
    })

    return reply.status(201).send({ secret })
  })

  app.get('/:slug/secrets/:name', async (request, reply) => {
    const actor = await requireActor(request, reply, app.prisma)
    if (!actor) return

    const { slug, name } = request.params as { slug: string; name: string }
    const nameParsed = secretNameSchema.safeParse(name)
    if (!nameParsed.success) {
      return reply.status(400).send({ error: 'Invalid secret name' })
    }

    const found = await app.prisma.app.findUnique({ where: { slug } })
    if (!found) {
      return reply.status(404).send({ error: 'App not found' })
    }

    const row = await app.prisma.appSecret.findUnique({
      where: { appId_name: { appId: found.id, name: nameParsed.data } },
    })
    if (!row) {
      return reply.status(404).send({ error: 'Secret not found' })
    }

    if (!canReadSecretValue(actor, found, row.serverOnly)) {
      return forbidden(
        reply,
        row.serverOnly
          ? 'serverOnly secret: requires JWT admin/owner or ApiKey scope app:{slug}:secrets:read (UI app:* keys cannot read)'
          : 'Forbidden',
      )
    }

    let value: string
    try {
      value = decryptSecret({
        ciphertext: row.ciphertext,
        iv: row.iv,
        authTag: row.authTag,
      })
    } catch (err) {
      request.log.error({ err: err instanceof Error ? err.message : err }, 'decryptSecret failed')
      return reply.status(503).send({ error: 'Secrets decryption failed' })
    }

    return { name: row.name, value, serverOnly: row.serverOnly }
  })

  app.delete('/:slug/secrets/:name', async (request, reply) => {
    const actor = await requireActor(request, reply, app.prisma)
    if (!actor) return
    if (actor.type !== 'user') {
      return forbidden(reply, 'Only user JWT can delete secrets')
    }

    const { slug, name } = request.params as { slug: string; name: string }
    const nameParsed = secretNameSchema.safeParse(name)
    if (!nameParsed.success) {
      return reply.status(400).send({ error: 'Invalid secret name' })
    }

    const found = await app.prisma.app.findUnique({ where: { slug } })
    if (!found) {
      return reply.status(404).send({ error: 'App not found' })
    }
    if (!canManageSecrets(actor, found)) {
      return forbidden(reply)
    }

    const existing = await app.prisma.appSecret.findUnique({
      where: { appId_name: { appId: found.id, name: nameParsed.data } },
    })
    if (!existing) {
      return reply.status(404).send({ error: 'Secret not found' })
    }

    await app.prisma.appSecret.delete({ where: { id: existing.id } })
    return reply.status(204).send()
  })
}
