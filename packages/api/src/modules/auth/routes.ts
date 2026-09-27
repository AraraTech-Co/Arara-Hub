import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import {
  hashPassword,
  issueRefreshToken,
  rotateRefreshToken,
  signAccessToken,
  verifyPassword,
} from '../../lib/crypto.js'
import { loadUserPermissions, requireActor, unauthorized } from '../../lib/auth.js'
import { canonicalEmail } from '../../lib/email-aliases.js'

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).optional(),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
})

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post('/register', async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid body', details: parsed.error.flatten() })
    }

    const { email, password, name } = parsed.data
    const existing = await app.prisma.user.findUnique({ where: { email: email.toLowerCase() } })
    if (existing) {
      return reply.status(409).send({ error: 'Email already registered' })
    }

    const developerRole = await app.prisma.role.findUnique({ where: { name: 'developer' } })
    if (!developerRole) {
      return reply.status(500).send({ error: 'Roles not seeded' })
    }

    const user = await app.prisma.user.create({
      data: {
        email: email.toLowerCase(),
        name: name ?? null,
        passwordHash: await hashPassword(password),
        roles: { create: [{ roleId: developerRole.id }] },
      },
    })

    const token = await signAccessToken({ sub: user.id, email: user.email })
    const refreshToken = await issueRefreshToken(app.prisma, user.id)
    const { roles, permissions } = await loadUserPermissions(app.prisma, user.id)

    return reply.status(201).send({
      token,
      refreshToken,
      user: { id: user.id, email: user.email, name: user.name, roles, permissions },
    })
  })

  app.post('/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid body', details: parsed.error.flatten() })
    }

    const loginEmail = parsed.data.email.toLowerCase()
    const resolvedEmail = canonicalEmail(loginEmail)
    const user =
      (await app.prisma.user.findUnique({ where: { email: resolvedEmail } })) ??
      (resolvedEmail !== loginEmail
        ? await app.prisma.user.findUnique({ where: { email: loginEmail } })
        : null)
    if (!user || user.status !== 'active') {
      return unauthorized(reply, 'Invalid credentials')
    }

    const ok = await verifyPassword(parsed.data.password, user.passwordHash)
    if (!ok) {
      return unauthorized(reply, 'Invalid credentials')
    }

    const token = await signAccessToken({ sub: user.id, email: user.email })
    const refreshToken = await issueRefreshToken(app.prisma, user.id)
    const { roles, permissions } = await loadUserPermissions(app.prisma, user.id)
    const memberships = await app.prisma.appMembership.findMany({
      where: { userId: user.id },
      select: {
        role: true,
        app: { select: { slug: true, name: true } },
      },
    })

    return {
      token,
      refreshToken,
      user: { id: user.id, email: user.email, name: user.name, roles, permissions },
      memberships,
    }
  })

  app.post('/refresh', async (request, reply) => {
    const parsed = refreshSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid body', details: parsed.error.flatten() })
    }

    const rotated = await rotateRefreshToken(app.prisma, parsed.data.refreshToken)
    if (!rotated) {
      return unauthorized(reply, 'Invalid or expired refresh token')
    }

    return {
      token: rotated.accessToken,
      refreshToken: rotated.refreshToken,
    }
  })

  app.get('/me', async (request, reply) => {
    const actor = await requireActor(request, reply, app.prisma)
    if (!actor) return

    if (actor.type === 'apiKey') {
      if (!actor.scopes.includes('system:auth') && !actor.scopes.some((s) => s.startsWith('app:'))) {
        return unauthorized(reply)
      }
      return {
        type: 'apiKey',
        appId: actor.appId,
        appSlug: actor.appSlug,
        scopes: actor.scopes,
      }
    }

    return {
      type: 'user',
      user: {
        id: actor.user.id,
        email: actor.user.email,
        name: actor.user.name,
        roles: actor.roles,
        permissions: actor.permissions,
      },
      memberships: await app.prisma.appMembership.findMany({
        where: { userId: actor.user.id },
        select: {
          role: true,
          app: { select: { slug: true, name: true } },
        },
      }),
    }
  })
}
