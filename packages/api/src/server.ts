import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import formbody from '@fastify/formbody'
import multipart from '@fastify/multipart'
import { prismaPlugin } from './plugins/prisma.js'
import { authPlugin } from './plugins/auth.js'
import { rawBodyPlugin } from './plugins/raw-body.js'
import { authRoutes } from './modules/auth/routes.js'
import { userRoutes } from './modules/users/routes.js'
import { appRoutes } from './modules/apps/routes.js'
import { appSecretRoutes } from './modules/app-secrets/routes.js'
import { moduleRoutes } from './modules/modules/routes.js'
import { modelRoutes } from './modules/models/routes.js'
import { runtimeRoutes } from './modules/runtime/routes.js'
import { docsRoutes } from './modules/docs/routes.js'
import { hostingProxyRoutes, hostingRoutes } from './modules/hosting/routes.js'
import { notificationRoutes } from './modules/notifications/routes.js'
import { assertAppSecretsKeyConfigured } from './lib/app-secrets.js'
import { restoreAllHosts } from './lib/hosting.js'
import { BODY_LIMIT_BYTES } from './plugins/raw-body.js'
import { registerAllStaticApps } from './apps/register-all.js'
import { listRegisteredSlugs } from './lib/static-registry.js'

const port = Number(process.env.PORT ?? 4100)
const host = process.env.HOST ?? '0.0.0.0'

async function main() {
  try {
    assertAppSecretsKeyConfigured()
  } catch (err) {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  }

  registerAllStaticApps()

  const app = Fastify({
    logger: true,
    // Default Fastify limit is 1MB — attachment uploads send base64 JSON.
    bodyLimit: BODY_LIMIT_BYTES,
  })

  // Capture raw bytes before JSON / form parsers (webhooks, signatures).
  await app.register(rawBodyPlugin)
  // Browsers preflight PATCH/DELETE; default @fastify/cors methods are GET,HEAD,POST only.
  await app.register(cors, {
    origin: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  })
  await app.register(formbody)
  await app.register(multipart, {
    limits: { fileSize: 100 * 1024 * 1024 },
  })
  await app.register(prismaPlugin)
  await app.register(authPlugin)

  app.get('/health', async () => ({ ok: true, service: 'arara-api-platform' }))

  await app.register(docsRoutes)
  await app.register(authRoutes, { prefix: '/v1/auth' })
  await app.register(userRoutes, { prefix: '/v1/users' })
  await app.register(notificationRoutes, { prefix: '/v1/notifications' })
  await app.register(appRoutes, { prefix: '/v1/apps' })
  await app.register(appSecretRoutes, { prefix: '/v1/apps' })
  await app.register(moduleRoutes, { prefix: '/v1/apps' })
  await app.register(modelRoutes, { prefix: '/v1/apps' })
  await app.register(hostingRoutes, { prefix: '/v1/apps' })
  await app.register(runtimeRoutes, { prefix: '/v1/r' })
  await app.register(hostingProxyRoutes, { prefix: '/h' })

  await app.listen({ port, host })
  app.log.info(
    { staticApps: listRegisteredSlugs() },
    'Static app route registries loaded',
  )

  try {
    if (process.env.DISABLE_HOSTING_RESTORE === '1') {
      app.log.info('Hosting restore skipped (DISABLE_HOSTING_RESTORE=1)')
    } else {
      await restoreAllHosts(app.prisma)
      app.log.info('Hosting restore complete')
    }
  } catch (err) {
    app.log.error({ err }, 'Hosting restore failed')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
