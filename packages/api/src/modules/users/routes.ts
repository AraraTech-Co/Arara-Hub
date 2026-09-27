import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { hashPassword } from '../../lib/crypto.js'
import { forbidden, requireActor } from '../../lib/auth.js'

const setPasswordSchema = z.object({
  password: z.string().min(8),
})

/**
 * Platform users (shared). Password updates for Arara accounts.
 * - API key (any active app): set password for any users.id (portal recovery / admin reset).
 * - JWT: only the authenticated user may change their own password.
 * Existing JWTs remain valid until expiry (stateless tokens; no server-side revocation).
 */
export const userRoutes: FastifyPluginAsync = async (app) => {
  app.post('/:id/password', async (request, reply) => {
    const actor = await requireActor(request, reply, app.prisma)
    if (!actor) return

    const { id } = request.params as { id: string }
    const parsed = setPasswordSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid body',
        details: parsed.error.flatten(),
        hint: 'password must be a string with at least 8 characters',
      })
    }

    if (actor.type === 'user') {
      const isSelf = actor.user.id === id
      const isPlatformAdmin =
        actor.roles.includes('admin') || actor.roles.includes('master')
      if (!isSelf && !isPlatformAdmin) {
        return forbidden(reply, 'Users may only change their own password')
      }
    }
    // apiKey: allowed for any users.id (portal controller after OTP / admin reset)
    // JWT admin/master: admin reset from app UIs (Horas, portal, …)

    const user = await app.prisma.user.findUnique({ where: { id } })
    if (!user) {
      return reply.status(404).send({ error: 'User not found' })
    }

    await app.prisma.user.update({
      where: { id },
      data: { passwordHash: await hashPassword(parsed.data.password) },
    })

    return { success: true }
  })
}
