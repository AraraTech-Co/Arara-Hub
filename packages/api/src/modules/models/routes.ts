import type { FastifyPluginAsync } from 'fastify'
import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { canAccessApp, forbidden, requireActor } from '../../lib/auth.js'
import { namespacedModelName, shortModelName } from '../../lib/models.js'

const modelSchema = z.object({
  name: z
    .string()
    .min(1)
    .regex(
      /^([a-z0-9]+(?:-[a-z0-9]+)*-)?[A-Z][A-Za-z0-9]*$/,
      'Use PascalCase (Company) or namespaced slug-Model (portal-suporte-Company)',
    ),
  schema: z.record(z.unknown()),
})

async function resolveModelDef(
  prisma: import('@prisma/client').PrismaClient,
  appId: string,
  appSlug: string,
  nameParam: string,
) {
  const full = namespacedModelName(appSlug, decodeURIComponent(nameParam))
  const short = shortModelName(appSlug, full)
  return (
    (await prisma.modelDef.findUnique({ where: { appId_name: { appId, name: full } } })) ??
    (await prisma.modelDef.findUnique({ where: { appId_name: { appId, name: short } } })) ??
    (await prisma.modelDef.findUnique({
      where: { appId_name: { appId, name: decodeURIComponent(nameParam) } },
    }))
  )
}

export const modelRoutes: FastifyPluginAsync = async (app) => {
  app.post('/:slug/models', async (request, reply) => {
    const actor = await requireActor(request, reply, app.prisma)
    if (!actor) return

    const { slug } = request.params as { slug: string }
    const found = await app.prisma.app.findUnique({ where: { slug } })
    if (!found) return reply.status(404).send({ error: 'App not found' })
    if (!canAccessApp(actor, found)) return forbidden(reply)

    const parsed = modelSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid body', details: parsed.error.flatten() })
    }

    const fullName = namespacedModelName(found.slug, parsed.data.name)
    const shortName = shortModelName(found.slug, fullName)

    try {
      const model = await app.prisma.modelDef.create({
        data: {
          appId: found.id,
          name: fullName,
          schema: parsed.data.schema as Prisma.InputJsonValue,
          version: 1,
        },
      })
      return reply.status(201).send({
        model,
        alias: shortName,
        note: `Stored as ${fullName}; controllers may use models.${shortName}`,
      })
    } catch {
      return reply.status(409).send({ error: 'Model already exists for this app' })
    }
  })

  app.get('/:slug/models', async (request, reply) => {
    const actor = await requireActor(request, reply, app.prisma)
    if (!actor) return

    const { slug } = request.params as { slug: string }
    const found = await app.prisma.app.findUnique({ where: { slug } })
    if (!found) return reply.status(404).send({ error: 'App not found' })
    if (!canAccessApp(actor, found)) return forbidden(reply)

    const models = await app.prisma.modelDef.findMany({
      where: { appId: found.id },
      orderBy: { name: 'asc' },
    })
    return {
      models: models.map((m) => ({
        ...m,
        alias: shortModelName(found.slug, m.name),
      })),
    }
  })

  app.patch('/:slug/models/:name', async (request, reply) => {
    const actor = await requireActor(request, reply, app.prisma)
    if (!actor) return

    const { slug, name } = request.params as { slug: string; name: string }
    const found = await app.prisma.app.findUnique({ where: { slug } })
    if (!found) return reply.status(404).send({ error: 'App not found' })
    if (!canAccessApp(actor, found)) return forbidden(reply)

    const parsed = z
      .object({ schema: z.record(z.unknown()) })
      .safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid body', details: parsed.error.flatten() })
    }

    const existing = await resolveModelDef(app.prisma, found.id, found.slug, name)
    if (!existing) {
      return reply.status(404).send({ error: 'Model not found' })
    }

    const model = await app.prisma.modelDef.update({
      where: { id: existing.id },
      data: {
        schema: parsed.data.schema as Prisma.InputJsonValue,
        version: existing.version + 1,
      },
    })
    return {
      model,
      alias: shortModelName(found.slug, model.name),
    }
  })
}
