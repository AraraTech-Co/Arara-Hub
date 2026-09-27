import type { FastifyPluginAsync } from 'fastify'
import { match } from 'path-to-regexp'
import {
  canAccessApp,
  forbidden,
  requireActor,
  unauthorized,
  userHasPermission,
} from '../../lib/auth.js'
import { buildModelsApi } from '../../lib/models.js'
import { requestHeadersForSandbox } from '../../plugins/raw-body.js'
import { extractWebhookToken, verifyWebhookSecret } from '../../lib/webhook-auth.js'
import { isMultipartRequest, parseRuntimeMultipart } from '../../lib/multipart-runtime.js'
import { getAppRoutes } from '../../lib/static-registry.js'
import { buildHandlerCtx } from '../../lib/build-handler-ctx.js'
import type { StaticRoute } from '../../lib/handler-ctx.js'
import { resolveStorageSlug } from '../../lib/app-slugs.js'

type MatchedStatic = {
  route: StaticRoute
  params: Record<string, string>
  score: number
}

/**
 * Code-first runtime: handlers live in packages/api/src/apps/<slug>.
 * Sandbox / DB controllerCode execution has been removed.
 */
export const runtimeRoutes: FastifyPluginAsync = async (app) => {
  app.all('/:appSlug/*', async (request, reply) => {
    const { appSlug: requestSlug } = request.params as { appSlug: string; '*': string }
    const restPath = '/' + ((request.params as { '*': string })['*'] ?? '').replace(/^\/+/, '')
    const storageSlug = resolveStorageSlug(requestSlug)

    const found = await app.prisma.app.findUnique({ where: { slug: storageSlug } })
    if (!found || found.status !== 'active') {
      return reply.status(404).send({ error: 'App not found' })
    }

    const method = request.method.toUpperCase()
    let matched: MatchedStatic | null = null

    // Match static handlers registered under the public request slug (e.g. portal-horas)
    // and also under the storage slug for backwards compatibility.
    const routePool = [
      ...getAppRoutes(requestSlug),
      ...(requestSlug !== storageSlug ? getAppRoutes(storageSlug) : []),
    ]
    for (const route of routePool) {
      if (route.method !== method) continue
      const matcher = match(route.path, { decode: decodeURIComponent })
      const result = matcher(restPath)
      if (!result) continue
      const score = (route.path.match(/:/g) || []).length
      const candidate: MatchedStatic = {
        route,
        params: result.params as Record<string, string>,
        score,
      }
      if (!matched || candidate.score < matched.score) matched = candidate
    }

    if (!matched) {
      return reply.status(404).send({
        error: 'No static route matched',
        method,
        path: restPath,
        hint: 'Add or regenerate handlers under packages/api/src/apps/:slug (npm run codegen:routes)',
      })
    }

    let body: unknown = request.body
    let rawBody: string | null = request.rawBody ?? null
    let files: Array<{
      field: string
      filename: string
      contentType: string
      size: number
      data?: string
    }> | null = null
    let filesTruncated = false

    if (isMultipartRequest(request)) {
      const parsed = await parseRuntimeMultipart(request)
      body = parsed.body
      rawBody = null
      files = parsed.files
      filesTruncated = parsed.filesTruncated
    }

    const authMode = matched.route.authMode || 'actor'
    let userInfo: unknown

    if (authMode === 'webhook_secret') {
      const secretName = matched.route.webhookSecretName
      if (!secretName) {
        return reply.status(503).send({
          error: 'Route authMode=webhook_secret requires webhookSecretName',
        })
      }
      const provided = extractWebhookToken(
        request.query as Record<string, unknown>,
        body,
      )
      const check = await verifyWebhookSecret({
        prisma: app.prisma,
        appId: found.id,
        secretName,
        providedToken: provided,
      })
      if (!check.ok) {
        return unauthorized(reply, check.reason)
      }
      userInfo = { type: 'webhook', appSlug: requestSlug, secretName }
    } else {
      const actor = await requireActor(request, reply, app.prisma)
      if (!actor) return
      if (!canAccessApp(actor, found)) {
        return forbidden(reply, 'API key or user cannot access this app')
      }
      for (const perm of matched.route.requiredPermissions) {
        if (actor.type === 'user') {
          if (!userHasPermission(actor, perm) && !actor.roles.includes('admin')) {
            return forbidden(reply, `Missing permission: ${perm}`)
          }
        }
      }
      userInfo =
        actor.type === 'user'
          ? { id: actor.user.id, email: actor.user.email, roles: actor.roles }
          : { type: 'apiKey', appSlug: actor.appSlug, scopes: actor.scopes }
    }

    // Model storage still uses the DB/storage slug (time-management-*), not the public alias.
    const models = await buildModelsApi(app.prisma, found.id, storageSlug)
    const headers = requestHeadersForSandbox(request)
    const ctx = await buildHandlerCtx({
      method,
      params: matched.params,
      query: request.query as Record<string, unknown>,
      body,
      rawBody,
      files,
      filesTruncated,
      headers,
      user: userInfo,
      app: { id: found.id, slug: requestSlug, name: found.name },
      models,
      prisma: app.prisma,
    })

    try {
      const result = await matched.route.handler(ctx)
      if (result && typeof result === 'object' && 'body' in (result as object)) {
        const r = result as { status?: number; body: unknown }
        return reply.status(r.status || 200).send(r.body)
      }
      return reply.status(200).send(result == null ? null : result)
    } catch (err) {
      const message = (err as Error).message || String(err)
      return reply.status(500).send({ error: `Controller runtime error: ${message}` })
    }
  })
}
