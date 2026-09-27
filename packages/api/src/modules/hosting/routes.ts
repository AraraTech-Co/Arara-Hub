import type { FastifyPluginAsync, FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import fsp from 'node:fs/promises'
import { request as undiciRequest } from 'undici'
import { canAccessApp, forbidden, requireActor } from '../../lib/auth.js'
import {
  artifactDirForSlug,
  extractArtifactZip,
  serializeHosting,
  startHostProcess,
  stopHostProcess,
} from '../../lib/hosting.js'

async function loadApp(prisma: import('@prisma/client').PrismaClient, slug: string) {
  return prisma.app.findUnique({ where: { slug }, include: { hosting: true } })
}

export const hostingRoutes: FastifyPluginAsync = async (app) => {
  if (process.env.DISABLE_APP_HOSTING === '1') {
    const gone = async (_request: FastifyRequest, reply: FastifyReply) =>
      reply.status(410).send({
        error: 'Embedded app hosting is disabled',
        hint: 'Frontends run as separate Docker containers on arara_net (see deploy/frontends.compose.yml)',
      })
    app.all('/:slug/hosting', gone)
    app.all('/:slug/hosting/start', gone)
    app.all('/:slug/hosting/stop', gone)
    return
  }

  app.post('/:slug/hosting', async (request, reply) => {
    const actor = await requireActor(request, reply, app.prisma)
    if (!actor) return

    const { slug } = request.params as { slug: string }
    const found = await loadApp(app.prisma, slug)
    if (!found) return reply.status(404).send({ error: 'App not found' })
    if (!canAccessApp(actor, found)) return forbidden(reply)

    const file = await request.file()
    if (!file) {
      return reply.status(400).send({ error: 'Expected multipart file field (zip)' })
    }

    const chunks: Buffer[] = []
    for await (const chunk of file.file) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    const zipBuffer = Buffer.concat(chunks)
    if (zipBuffer.length < 4) {
      return reply.status(400).send({ error: 'Empty upload' })
    }

    const targetDir = artifactDirForSlug(found.slug)
    try {
      await extractArtifactZip(zipBuffer, targetDir)
    } catch (err) {
      return reply.status(400).send({ error: (err as Error).message })
    }

    // One host per app: stop existing (kills orphans) and keep sticky port.
    const preferPort = found.hosting?.port ?? null
    if (found.hosting) {
      await stopHostProcess(app.prisma, found.hosting)
    }

    const row = found.hosting
      ? await app.prisma.appHosting.update({
          where: { id: found.hosting.id },
          data: {
            artifactPath: targetDir,
            entryFile: 'index.html',
            uploadedAt: new Date(),
            status: 'stopped',
            pid: null,
            lastError: null,
          },
        })
      : await app.prisma.appHosting.create({
          data: {
            appId: found.id,
            artifactPath: targetDir,
            entryFile: 'index.html',
            status: 'stopped',
          },
        })

    const started = await startHostProcess(app.prisma, row, preferPort)
    const payload = serializeHosting(started)
    payload.proxyPath = `/h/${found.slug}/`

    if (started.status === 'error') {
      return reply.status(500).send({ hosting: payload })
    }
    return reply.status(201).send({ hosting: payload })
  })

  app.get('/:slug/hosting', async (request, reply) => {
    const actor = await requireActor(request, reply, app.prisma)
    if (!actor) return

    const { slug } = request.params as { slug: string }
    const found = await loadApp(app.prisma, slug)
    if (!found) return reply.status(404).send({ error: 'App not found' })
    if (!canAccessApp(actor, found)) return forbidden(reply)
    if (!found.hosting) {
      return reply.status(404).send({ error: 'No hosting artifact for this app' })
    }

    const payload = serializeHosting(found.hosting)
    payload.proxyPath = `/h/${found.slug}/`
    return { hosting: payload }
  })

  app.post('/:slug/hosting/start', async (request, reply) => {
    const actor = await requireActor(request, reply, app.prisma)
    if (!actor) return

    const { slug } = request.params as { slug: string }
    const found = await loadApp(app.prisma, slug)
    if (!found) return reply.status(404).send({ error: 'App not found' })
    if (!canAccessApp(actor, found)) return forbidden(reply)
    if (!found.hosting) {
      return reply.status(404).send({ error: 'No hosting artifact for this app' })
    }

    const started = await startHostProcess(app.prisma, found.hosting)
    const payload = serializeHosting(started)
    payload.proxyPath = `/h/${found.slug}/`
    if (started.status === 'error') {
      return reply.status(500).send({ hosting: payload })
    }
    return { hosting: payload }
  })

  app.post('/:slug/hosting/stop', async (request, reply) => {
    const actor = await requireActor(request, reply, app.prisma)
    if (!actor) return

    const { slug } = request.params as { slug: string }
    const found = await loadApp(app.prisma, slug)
    if (!found) return reply.status(404).send({ error: 'App not found' })
    if (!canAccessApp(actor, found)) return forbidden(reply)
    if (!found.hosting) {
      return reply.status(404).send({ error: 'No hosting artifact for this app' })
    }

    const stopped = await stopHostProcess(app.prisma, found.hosting)
    const payload = serializeHosting(stopped)
    payload.proxyPath = `/h/${found.slug}/`
    return { hosting: payload }
  })

  app.delete('/:slug/hosting', async (request, reply) => {
    const actor = await requireActor(request, reply, app.prisma)
    if (!actor) return

    const { slug } = request.params as { slug: string }
    const found = await loadApp(app.prisma, slug)
    if (!found) return reply.status(404).send({ error: 'App not found' })
    if (!canAccessApp(actor, found)) return forbidden(reply)
    if (!found.hosting) {
      return reply.status(404).send({ error: 'No hosting artifact for this app' })
    }

    await stopHostProcess(app.prisma, found.hosting)
    const dir = found.hosting.artifactPath
    await app.prisma.appHosting.delete({ where: { id: found.hosting.id } })
    await fsp.rm(dir, { recursive: true, force: true })
    return reply.status(204).send()
  })
}

/** Public proxy: /h/:slug/* → localhost:port (no auth — SPA assets). */
export const hostingProxyRoutes: FastifyPluginAsync = async (app) => {
  if (process.env.DISABLE_APP_HOSTING === '1') {
    const gone = async (_request: FastifyRequest, reply: FastifyReply) =>
      reply.status(410).send({
        error: 'Embedded app hosting proxy is disabled',
        hint: 'Use per-app frontend containers (deploy/frontends.compose.yml)',
      })
    app.all('/:slug', gone)
    app.all('/:slug/*', gone)
    return
  }

  app.all('/:slug', async (request, reply) => {
    return proxyToHost(app, request, reply, '/')
  })

  app.all('/:slug/*', async (request, reply) => {
    const rest = '/' + ((request.params as { '*': string })['*'] ?? '')
    return proxyToHost(app, request, reply, rest)
  })
}

async function proxyToHost(
  app: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
  restPath: string,
) {
  const { slug } = request.params as { slug: string }
  const found = await app.prisma.app.findUnique({
    where: { slug },
    include: { hosting: true },
  })
  if (!found?.hosting || found.hosting.status !== 'running' || !found.hosting.port) {
    return reply.status(404).send({ error: 'Hosting not running for this app' })
  }

  const qs = request.url.includes('?') ? request.url.slice(request.url.indexOf('?')) : ''
  const target = `http://127.0.0.1:${found.hosting.port}${restPath === '/' ? '/' : restPath}${qs}`

  try {
    const headers: Record<string, string> = {}
    for (const [k, v] of Object.entries(request.headers)) {
      if (v == null) continue
      const lower = k.toLowerCase()
      if (lower === 'host' || lower === 'connection' || lower === 'content-length') continue
      headers[k] = Array.isArray(v) ? v.join(',') : v
    }

    const upstream = await undiciRequest(target, {
      method: request.method,
      headers,
      body:
        request.method === 'GET' || request.method === 'HEAD'
          ? undefined
          : request.body != null
            ? typeof request.body === 'string' || Buffer.isBuffer(request.body)
              ? (request.body as string | Buffer)
              : JSON.stringify(request.body)
            : undefined,
    })

    reply.status(upstream.statusCode)
    for (const [key, value] of Object.entries(upstream.headers)) {
      if (!value || key === 'transfer-encoding') continue
      reply.header(key, Array.isArray(value) ? value.join(',') : value)
    }
    const buf = Buffer.from(await upstream.body.arrayBuffer())
    return reply.send(buf)
  } catch (err) {
    return reply.status(502).send({ error: 'Upstream hosting error', detail: (err as Error).message })
  }
}
