/**
 * Generic app integrator: models + CRUD routes + ModelRecords from JSON dumps.
 *
 *   npx tsx scripts/integrate-app.ts --slug portal-crm --name "Portal CRM" --prod data/portal-crm-prod
 *   npx tsx scripts/integrate-app.ts --slug time-management --name "Time Management" --prod data/time-management-prod
 *   npx tsx scripts/integrate-app.ts --slug portal-araratech --name "Portal AraraTech" --prod data/portal-araratech-prod --schema-only
 */
import 'dotenv/config'
import { createHash, randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaClient, type Prisma } from '@prisma/client'
import { hashPassword, hashApiKey, appScopes } from '../src/lib/crypto.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DATA = path.join(ROOT, 'data')
const prisma = new PrismaClient()

function arg(name: string, fallback = ''): string {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] || fallback : fallback
}
function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`)
}

function toPascal(table: string): string {
  return table
    .replace(/\.json$/i, '')
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('')
}

function crudController(modelShort: string, method: string, kind: 'list' | 'get' | 'create' | 'update' | 'delete'): string {
  if (kind === 'list') {
    return `async function handler(ctx) {
  const model = ctx.models.${modelShort};
  if (!model) return ctx.reply.status(500).send({ error: "Model ${modelShort} missing" });
  const rows = await model.findMany(ctx.query || {});
  return ctx.reply.send({ data: rows, count: rows.length });
}
module.exports = { handler };`
  }
  if (kind === 'get') {
    return `async function handler(ctx) {
  const model = ctx.models.${modelShort};
  if (!model) return ctx.reply.status(500).send({ error: "Model ${modelShort} missing" });
  const row = await model.findById(String(ctx.params.id));
  if (!row) return ctx.reply.status(404).send({ error: "not found" });
  return ctx.reply.send({ data: row });
}
module.exports = { handler };`
  }
  if (kind === 'create') {
    return `async function handler(ctx) {
  const model = ctx.models.${modelShort};
  if (!model) return ctx.reply.status(500).send({ error: "Model ${modelShort} missing" });
  const row = await model.create(Object.assign({}, ctx.body || {}));
  return ctx.reply.status(201).send({ data: row });
}
module.exports = { handler };`
  }
  if (kind === 'update') {
    return `async function handler(ctx) {
  const model = ctx.models.${modelShort};
  if (!model) return ctx.reply.status(500).send({ error: "Model ${modelShort} missing" });
  try {
    const row = await model.update(String(ctx.params.id), Object.assign({}, ctx.body || {}));
    return ctx.reply.send({ data: row });
  } catch (e) {
    return ctx.reply.status(404).send({ error: String(e.message || e) });
  }
}
module.exports = { handler };`
  }
  return `async function handler(ctx) {
  const model = ctx.models.${modelShort};
  if (!model) return ctx.reply.status(500).send({ error: "Model ${modelShort} missing" });
  try {
    await model.delete(String(ctx.params.id));
    return ctx.reply.send({ ok: true });
  } catch (e) {
    return ctx.reply.status(404).send({ error: String(e.message || e) });
  }
}
module.exports = { handler };`
}

function inferSchema(rows: Record<string, unknown>[]): Record<string, unknown> {
  const props: Record<string, { type: string }> = {}
  const seenKeys = new Set<string>()

  for (const row of rows.slice(0, 50)) {
    for (const k of Object.keys(row)) seenKeys.add(k)
  }

  for (const row of rows.slice(0, 50)) {
    for (const [k, v] of Object.entries(row)) {
      if (props[k]) continue
      if (v === null || v === undefined) continue
      if (typeof v === 'number') props[k] = { type: 'number' }
      else if (typeof v === 'boolean') props[k] = { type: 'boolean' }
      else if (Array.isArray(v)) props[k] = { type: 'array' }
      else if (typeof v === 'object') props[k] = { type: 'object' }
      else props[k] = { type: 'string' }
    }
  }

  for (const k of seenKeys) {
    if (!props[k]) props[k] = { type: 'string' }
  }
  if (!props.id) props.id = { type: 'string' }
  return { type: 'object', properties: props }
}

async function main() {
  const slug = arg('slug')
  const name = arg('name', slug)
  const prodRel = arg('prod', `data/${slug}-prod`)
  const schemaOnly = hasFlag('schema-only')
  if (!slug) throw new Error('--slug required')

  const prodDir = path.isAbsolute(prodRel) ? prodRel : path.join(ROOT, prodRel)
  mkdirSync(prodDir, { recursive: true })

  const developer = await prisma.role.findUnique({ where: { name: 'developer' } })
  if (!developer) throw new Error('Run db:seed first')

  const serviceEmail = `${slug}@arara.local`
  const servicePassword = `${slug}123`
  const serviceUserId = `svc_${slug.replace(/-/g, '_')}`.slice(0, 30)
  const passwordHash = await hashPassword(servicePassword)

  console.log('→ Service user', serviceEmail)
  const owner = await prisma.user.upsert({
    where: { email: serviceEmail },
    create: {
      id: serviceUserId,
      email: serviceEmail,
      name: `${name} Service`,
      passwordHash,
      roles: { create: [{ roleId: developer.id }] },
    },
    update: { name: `${name} Service`, passwordHash },
  })
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: owner.id, roleId: developer.id } },
    create: { userId: owner.id, roleId: developer.id },
    update: {},
  })

  console.log('→ App', slug)
  const app = await prisma.app.upsert({
    where: { slug },
    create: { slug, name, description: `${name} integrated from Hostinger-Suporte`, ownerId: owner.id },
    update: { name, ownerId: owner.id, status: 'active' },
  })

  const credPath = path.join(DATA, `${slug}-credentials.json`)
  let apiRaw = ''
  let apiPrefix = ''
  let apiHash = ''
  let apiId = `key_${slug.replace(/-/g, '_')}`.slice(0, 28)
  if (existsSync(credPath)) {
    try {
      const old = JSON.parse(readFileSync(credPath, 'utf8'))
      if (old.apiKey) {
        apiRaw = old.apiKey
        apiPrefix = apiRaw.slice(0, 16)
        apiHash = hashApiKey(apiRaw)
      }
    } catch {
      /* ignore */
    }
  }
  if (!apiRaw) {
    const secret = randomBytes(24).toString('base64url')
    apiRaw = `sk_live_${secret}`
    apiPrefix = apiRaw.slice(0, 16)
    apiHash = hashApiKey(apiRaw)
  }

  await prisma.apiKey.updateMany({ where: { appId: app.id, revokedAt: null }, data: { revokedAt: new Date() } })
  await prisma.apiKey.upsert({
    where: { id: apiId },
    create: {
      id: apiId,
      appId: app.id,
      name: `${slug}-prod`,
      prefix: apiPrefix,
      keyHash: apiHash,
      scopes: appScopes(slug),
    },
    update: { prefix: apiPrefix, keyHash: apiHash, scopes: appScopes(slug), revokedAt: null },
  })
  writeFileSync(path.join(DATA, `${slug}-api-key.txt`), apiRaw + '\n')

  // Discover tables from dump files
  const files = existsSync(prodDir)
    ? readdirSync(prodDir).filter((f) => f.endsWith('.json') && !f.startsWith('_'))
    : []

  type ModelSpec = { short: string; storage: string; table: string; schema: Record<string, unknown>; rows: Record<string, unknown>[] }
  const models: ModelSpec[] = []

  if (schemaOnly && files.length === 0) {
    // portal-araratech fallback models from known domain
    const defaults = ['Account', 'User', 'AccountUser', 'Plan', 'Event', 'Log']
    for (const short of defaults) {
      models.push({
        short,
        storage: `${slug}-${short}`,
        table: short.toLowerCase(),
        schema: { type: 'object', properties: { id: { type: 'string' } } },
        rows: [],
      })
    }
  } else {
    for (const file of files) {
      const table = file.replace(/\.json$/i, '')
      const short = toPascal(table)
      const rows = JSON.parse(readFileSync(path.join(prodDir, file), 'utf8')) as Record<string, unknown>[]
      const list = Array.isArray(rows) ? rows : []
      models.push({
        short,
        storage: `${slug}-${short}`,
        table,
        schema: inferSchema(list),
        rows: list,
      })
    }
  }

  console.log('→ Models', models.length)
  await prisma.modelDef.deleteMany({ where: { appId: app.id } })
  for (const m of models) {
    await prisma.modelDef.create({
      data: { appId: app.id, name: m.storage, schema: m.schema as Prisma.InputJsonValue, version: 1 },
    })
  }

  console.log('→ Modules/routes')
  const existing = await prisma.module.findMany({ where: { appId: app.id }, select: { id: true } })
  if (existing.length) {
    await prisma.moduleRoute.deleteMany({ where: { moduleId: { in: existing.map((m) => m.id) } } })
    await prisma.module.deleteMany({ where: { appId: app.id } })
  }

  let routeCount = 0
  for (const m of models) {
    const base = `/${m.table.replace(/_/g, '-')}`
    const mod = await prisma.module.create({
      data: {
        appId: app.id,
        name: m.short.toLowerCase(),
        description: `${slug} ${m.short}`,
        status: 'published',
      },
    })
    const routes: Array<{ method: string; path: string; kind: 'list' | 'get' | 'create' | 'update' | 'delete' }> = [
      { method: 'GET', path: base, kind: 'list' },
      { method: 'POST', path: base, kind: 'create' },
      { method: 'GET', path: `${base}/:id`, kind: 'get' },
      { method: 'PATCH', path: `${base}/:id`, kind: 'update' },
      { method: 'PUT', path: `${base}/:id`, kind: 'update' },
      { method: 'DELETE', path: `${base}/:id`, kind: 'delete' },
    ]
    for (const r of routes) {
      await prisma.moduleRoute.create({
        data: {
          moduleId: mod.id,
          method: r.method,
          path: r.path,
          controllerCode: crudController(m.short, r.method, r.kind),
        },
      })
      routeCount++
    }
  }

  console.log('→ Import records')
  await prisma.modelRecord.deleteMany({ where: { appId: app.id } })
  let imported = 0
  for (const m of models) {
    if (!m.rows.length) continue
    const batchSize = 200
    for (let i = 0; i < m.rows.length; i += batchSize) {
      const batch = m.rows.slice(i, i + batchSize)
      await prisma.modelRecord.createMany({
        data: batch.map((row) => {
          const id = String(
            row.id ?? createHash('sha1').update(`${m.table}:${JSON.stringify(row)}`).digest('hex'),
          )
          return {
            id: `${slug.slice(0, 8)}_${id}`.slice(0, 64),
            appId: app.id,
            modelName: m.storage,
            data: row as Prisma.InputJsonValue,
          }
        }),
        skipDuplicates: true,
      })
      imported += batch.length
    }
    console.log(`  ${m.storage}: ${m.rows.length}`)
  }

  const summary = {
    email: serviceEmail,
    password: servicePassword,
    appSlug: slug,
    apiKey: apiRaw,
    models: models.length,
    routes: routeCount,
    recordsImported: imported,
    runtimeBase: `http://localhost:4100/v1/r/${slug}`,
  }
  writeFileSync(credPath, JSON.stringify(summary, null, 2))
  console.log('✓ Done', summary)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
