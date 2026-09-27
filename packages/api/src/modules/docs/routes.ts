import type { FastifyPluginAsync } from 'fastify'
import { canUseSystemScope, requireActor, unauthorized } from '../../lib/auth.js'
import { README_MARKDOWN } from './readme-content.js'
import { openApiDocument } from './openapi.js'

export const docsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/readme', async (request, reply) => {
    // Public for AI discovery; optional auth still accepted
    if (request.headers.authorization || request.headers['x-api-key']) {
      const actor = await requireActor(request, reply, app.prisma)
      if (!actor) return
      if (!canUseSystemScope(actor, 'system:readme')) {
        return unauthorized(reply, 'Missing system:readme scope')
      }
    }

    reply.type('text/markdown; charset=utf-8')
    return README_MARKDOWN
  })

  app.get('/openapi.json', async () => openApiDocument)
}
