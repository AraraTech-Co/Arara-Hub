import fp from 'fastify-plugin'
import type { FastifyPluginAsync } from 'fastify'
import { resolveActor } from '../lib/auth.js'

const authPluginFn: FastifyPluginAsync = async (app) => {
  app.decorateRequest('actor', undefined)
  app.addHook('preHandler', async (request) => {
    // Lazy: routes that need auth call requireActor explicitly.
    // Still attach actor when credentials are present for convenience.
    if (request.headers.authorization || request.headers['x-api-key']) {
      request.actor = (await resolveActor(request, app.prisma)) ?? undefined
    }
  })
}

export const authPlugin = fp(authPluginFn, { name: 'auth', dependencies: ['prisma'] })
