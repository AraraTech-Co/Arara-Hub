import type { FastifyPluginAsync } from 'fastify'
import type { App, PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { canAccessApp, forbidden, requireActor, type Actor } from '../../lib/auth.js'

const createModuleSchema = z.object({
  name: z
    .string()
    .min(1)
    .regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/),
  description: z.string().optional(),
})

const upsertRouteSchema = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  path: z.string().min(1).startsWith('/'),
  controllerCode: z.string().min(1),
  requiredPermissions: z.array(z.string()).optional(),
  /** actor (default) | webhook_secret — no header auth; validates query/body token vs AppSecret */
  authMode: z.enum(['actor', 'webhook_secret']).optional(),
  /** AppSecret name when authMode=webhook_secret (e.g. avisa_webhook_secret) */
  webhookSecretName: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/)
    .optional()
    .nullable(),
})

const publishSchema = z.object({
  status: z.enum(['draft', 'published']),
})

async function loadAccessibleApp(
  prisma: PrismaClient,
  slug: string,
  actor: Actor,
): Promise<{ app: App } | { error: 'not_found' | 'forbidden' }> {
  const found = await prisma.app.findUnique({ where: { slug } })
  if (!found) return { error: 'not_found' }
  if (!canAccessApp(actor, found)) return { error: 'forbidden' }
  return { app: found }
}

export const moduleRoutes: FastifyPluginAsync = async (app) => {
  app.post('/:slug/modules', async (request, reply) => {
    const actor = await requireActor(request, reply, app.prisma)
    if (!actor) return

    const { slug } = request.params as { slug: string }
    const access = await loadAccessibleApp(app.prisma, slug, actor)
    if ('error' in access) {
      return access.error === 'not_found'
        ? reply.status(404).send({ error: 'App not found' })
        : forbidden(reply)
    }

    const parsed = createModuleSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid body', details: parsed.error.flatten() })
    }

    try {
      const mod = await app.prisma.module.create({
        data: {
          appId: access.app.id,
          name: parsed.data.name,
          description: parsed.data.description ?? null,
        },
      })
      return reply.status(201).send({ module: mod })
    } catch {
      return reply.status(409).send({ error: 'Module name already exists for this app' })
    }
  })

  app.get('/:slug/modules', async (request, reply) => {
    const actor = await requireActor(request, reply, app.prisma)
    if (!actor) return

    const { slug } = request.params as { slug: string }
    const access = await loadAccessibleApp(app.prisma, slug, actor)
    if ('error' in access) {
      return access.error === 'not_found'
        ? reply.status(404).send({ error: 'App not found' })
        : forbidden(reply)
    }

    const modules = await app.prisma.module.findMany({
      where: { appId: access.app.id },
      include: {
        routes: {
          select: {
            id: true,
            method: true,
            path: true,
            requiredPermissions: true,
            updatedAt: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    })
    return { modules }
  })

  app.patch('/:slug/modules/:moduleName', async (request, reply) => {
    const actor = await requireActor(request, reply, app.prisma)
    if (!actor) return

    const { slug, moduleName } = request.params as { slug: string; moduleName: string }
    const access = await loadAccessibleApp(app.prisma, slug, actor)
    if ('error' in access) {
      return access.error === 'not_found'
        ? reply.status(404).send({ error: 'App not found' })
        : forbidden(reply)
    }

    const parsed = publishSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid body', details: parsed.error.flatten() })
    }

    const mod = await app.prisma.module.findUnique({
      where: { appId_name: { appId: access.app.id, name: moduleName } },
    })
    if (!mod) {
      return reply.status(404).send({ error: 'Module not found' })
    }

    const updated = await app.prisma.module.update({
      where: { id: mod.id },
      data: { status: parsed.data.status },
    })
    return { module: updated }
  })

  app.put('/:slug/modules/:moduleName/routes', async (request, reply) => {
    if (process.env.ALLOW_DB_CONTROLLER_PUBLISH !== '1') {
      return reply.status(410).send({
        error: 'DB controller publishing is disabled',
        hint: 'Routes are code-first under packages/api/src/apps/<slug>. Set ALLOW_DB_CONTROLLER_PUBLISH=1 only for legacy tooling.',
      })
    }

    const actor = await requireActor(request, reply, app.prisma)
    if (!actor) return

    const { slug, moduleName } = request.params as { slug: string; moduleName: string }
    const access = await loadAccessibleApp(app.prisma, slug, actor)
    if ('error' in access) {
      return access.error === 'not_found'
        ? reply.status(404).send({ error: 'App not found' })
        : forbidden(reply)
    }

    const parsed = upsertRouteSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid body', details: parsed.error.flatten() })
    }

    const mod = await app.prisma.module.findUnique({
      where: { appId_name: { appId: access.app.id, name: moduleName } },
    })
    if (!mod) {
      return reply.status(404).send({ error: 'Module not found' })
    }

    const authMode = parsed.data.authMode ?? 'actor'
    if (authMode === 'webhook_secret' && !parsed.data.webhookSecretName) {
      return reply.status(400).send({
        error: 'webhookSecretName is required when authMode is webhook_secret',
      })
    }

    const route = await app.prisma.moduleRoute.upsert({
      where: {
        moduleId_method_path: {
          moduleId: mod.id,
          method: parsed.data.method,
          path: parsed.data.path,
        },
      },
      create: {
        moduleId: mod.id,
        method: parsed.data.method,
        path: parsed.data.path,
        controllerCode: parsed.data.controllerCode,
        requiredPermissions: parsed.data.requiredPermissions ?? [],
        authMode,
        webhookSecretName: parsed.data.webhookSecretName ?? null,
      },
      update: {
        controllerCode: parsed.data.controllerCode,
        requiredPermissions: parsed.data.requiredPermissions ?? [],
        authMode,
        webhookSecretName:
          parsed.data.webhookSecretName !== undefined
            ? parsed.data.webhookSecretName
            : undefined,
      },
    })

    return {
      route: {
        id: route.id,
        method: route.method,
        path: route.path,
        requiredPermissions: route.requiredPermissions,
        authMode: route.authMode,
        webhookSecretName: route.webhookSecretName,
        updatedAt: route.updatedAt,
      },
      controllerCodeLength: route.controllerCode.length,
    }
  })

  app.get('/:slug/modules/:moduleName/routes', async (request, reply) => {
    const actor = await requireActor(request, reply, app.prisma)
    if (!actor) return

    const { slug, moduleName } = request.params as { slug: string; moduleName: string }
    const access = await loadAccessibleApp(app.prisma, slug, actor)
    if ('error' in access) {
      return access.error === 'not_found'
        ? reply.status(404).send({ error: 'App not found' })
        : forbidden(reply)
    }

    const mod = await app.prisma.module.findUnique({
      where: { appId_name: { appId: access.app.id, name: moduleName } },
      include: { routes: true },
    })
    if (!mod) {
      return reply.status(404).send({ error: 'Module not found' })
    }

    return {
      module: { id: mod.id, name: mod.name, status: mod.status },
      routes: mod.routes.map((r) => ({
        id: r.id,
        method: r.method,
        path: r.path,
        requiredPermissions: r.requiredPermissions,
        authMode: r.authMode,
        webhookSecretName: r.webhookSecretName,
        controllerCode: r.controllerCode,
        updatedAt: r.updatedAt,
      })),
    }
  })
}
