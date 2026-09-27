/**
 * Integrates portal-suporte into the Arara platform:
 * - platform user + app + API key
 * - ModelDefs for every production table
 * - Modules/routes for every portal-suporte API endpoint
 * - Imports production JSON dumps into ModelRecords (preserving IDs)
 *
 * Usage (from platform/):
 *   npx tsx scripts/portal-suporte/integrate.ts
 */
import 'dotenv/config'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaClient, type Prisma } from '@prisma/client'
import { hashPassword, appScopes } from '../../src/lib/crypto.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../..')
const DATA = path.join(ROOT, 'data')
const PROD = path.join(DATA, 'portal-suporte-prod')
const MANIFEST_PATH = path.join(DATA, 'portal-suporte-manifest.json')

type Manifest = {
  app: { id: string; slug: string; name: string; description: string; ownerUserId: string }
  user: { id: string; email: string; name: string; password: string }
  apiKey: { id: string; raw: string; prefix: string; hash: string; scopes: string[] }
  models: Array<{ name: string; table: string; schema: Record<string, unknown> }>
  modules: Array<{
    name: string
    routes: Array<{ method: string; path: string; model: string; controllerCode: string }>
  }>
}

const prisma = new PrismaClient()

function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  const s = typeof value === 'string' ? value : JSON.stringify(value)
  return "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "''") + "'"
}

async function main() {
  if (!existsSync(MANIFEST_PATH)) {
    throw new Error(`Missing manifest at ${MANIFEST_PATH}`)
  }
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as Manifest

  const developerRole = await prisma.role.findUnique({ where: { name: 'developer' } })
  if (!developerRole) throw new Error('Run db:seed first (developer role missing)')

  console.log('→ Upserting platform user', manifest.user.email)
  const passwordHash = await hashPassword(manifest.user.password)
  await prisma.user.upsert({
    where: { email: manifest.user.email },
    create: {
      id: manifest.user.id,
      email: manifest.user.email,
      name: manifest.user.name,
      passwordHash,
      roles: { create: [{ roleId: developerRole.id }] },
    },
    update: {
      name: manifest.user.name,
      passwordHash,
    },
  })

  // Ensure role link exists even on update
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: manifest.user.id, roleId: developerRole.id } },
    create: { userId: manifest.user.id, roleId: developerRole.id },
    update: {},
  })

  console.log('→ Upserting app', manifest.app.slug)
  const app = await prisma.app.upsert({
    where: { slug: manifest.app.slug },
    create: {
      id: manifest.app.id,
      slug: manifest.app.slug,
      name: manifest.app.name,
      description: manifest.app.description,
      ownerId: manifest.user.id,
    },
    update: {
      name: manifest.app.name,
      description: manifest.app.description,
      ownerId: manifest.user.id,
      status: 'active',
    },
  })
  const appId = app.id

  const scopes = manifest.apiKey.scopes.length
    ? manifest.apiKey.scopes
    : appScopes(manifest.app.slug)

  // Replace active keys with the known integration key
  await prisma.apiKey.updateMany({
    where: { appId, revokedAt: null },
    data: { revokedAt: new Date() },
  })
  await prisma.apiKey.upsert({
    where: { id: manifest.apiKey.id },
    create: {
      id: manifest.apiKey.id,
      appId,
      name: 'portal-suporte-prod',
      prefix: manifest.apiKey.prefix,
      keyHash: manifest.apiKey.hash,
      scopes,
    },
    update: {
      prefix: manifest.apiKey.prefix,
      keyHash: manifest.apiKey.hash,
      scopes,
      revokedAt: null,
      name: 'portal-suporte-prod',
    },
  })
  console.log('  API key:', manifest.apiKey.raw)

  console.log('→ Registering', manifest.models.length, 'models (namespaced)')
  // Drop old short-name defs so we don't keep Company alongside portal-suporte-Company
  await prisma.modelDef.deleteMany({ where: { appId } })
  for (const model of manifest.models) {
    await prisma.modelDef.create({
      data: {
        appId,
        name: model.name,
        schema: model.schema as Prisma.InputJsonValue,
        version: 1,
      },
    })
  }

  console.log('→ Clearing previous modules for re-register')
  const existingModules = await prisma.module.findMany({
    where: { appId },
    select: { id: true },
  })
  if (existingModules.length) {
    await prisma.moduleRoute.deleteMany({
      where: { moduleId: { in: existingModules.map((m) => m.id) } },
    })
    await prisma.module.deleteMany({ where: { appId } })
  }

  let routeCount = 0
  for (const mod of manifest.modules) {
    const created = await prisma.module.create({
      data: {
        appId,
        name: mod.name,
        description: `portal-suporte module ${mod.name}`,
        status: 'published',
      },
    })
    for (const route of mod.routes) {
      await prisma.moduleRoute.create({
        data: {
          moduleId: created.id,
          method: route.method,
          path: route.path,
          controllerCode: route.controllerCode,
        },
      })
      routeCount++
    }
  }
  console.log('  modules:', manifest.modules.length, 'routes:', routeCount)

  console.log('→ Importing production ModelRecords')
  await prisma.modelRecord.deleteMany({ where: { appId } })

  let imported = 0
  const sqlChunks: string[] = []
  sqlChunks.push('-- Portal Suporte integration (Hostinger-Suporte production dump)')
  sqlChunks.push('-- Modules/routes/models: prefer `npm run integrate:portal-suporte`')
  sqlChunks.push('BEGIN;')

  const pwHash = passwordHash
  const scopesJson = JSON.stringify(scopes).replace(/'/g, "''")
  sqlChunks.push(`
INSERT INTO users (id, email, name, password_hash, status, created_at, updated_at)
VALUES (${sqlLiteral(manifest.user.id)}, ${sqlLiteral(manifest.user.email)}, ${sqlLiteral(manifest.user.name)}, ${sqlLiteral(pwHash)}, 'active', NOW(), NOW())
ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash, updated_at = NOW();

INSERT INTO user_roles (user_id, role_id)
SELECT ${sqlLiteral(manifest.user.id)}, r.id FROM roles r WHERE r.name = 'developer'
ON CONFLICT DO NOTHING;

INSERT INTO apps (id, slug, name, description, status, owner_id, created_at, updated_at)
VALUES (
  ${sqlLiteral(manifest.app.id)},
  ${sqlLiteral(manifest.app.slug)},
  ${sqlLiteral(manifest.app.name)},
  ${sqlLiteral(manifest.app.description)},
  'active',
  ${sqlLiteral(manifest.user.id)},
  NOW(), NOW()
)
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, owner_id = EXCLUDED.owner_id, updated_at = NOW();

INSERT INTO api_keys (id, app_id, name, prefix, key_hash, scopes, created_at)
VALUES (
  ${sqlLiteral(manifest.apiKey.id)},
  ${sqlLiteral(manifest.app.id)},
  'portal-suporte-prod',
  ${sqlLiteral(manifest.apiKey.prefix)},
  ${sqlLiteral(manifest.apiKey.hash)},
  '${scopesJson}'::jsonb,
  NOW()
)
ON CONFLICT (id) DO UPDATE SET key_hash = EXCLUDED.key_hash, prefix = EXCLUDED.prefix, scopes = EXCLUDED.scopes, revoked_at = NULL;
`)

  sqlChunks.push(`DELETE FROM model_records WHERE app_id = ${sqlLiteral(appId)};`)

  for (const model of manifest.models) {
    const file = path.join(PROD, `${model.table}.json`)
    if (!existsSync(file)) {
      console.warn('  skip missing dump', model.table)
      continue
    }
    const rows = JSON.parse(readFileSync(file, 'utf8')) as Array<Record<string, unknown>>
    if (!rows.length) continue

    const batchSize = 200
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize)
      await prisma.modelRecord.createMany({
        data: batch.map((row) => {
          const id = String(row.id ?? createHash('sha1').update(`${model.table}:${JSON.stringify(row)}`).digest('hex'))
          return {
            id,
            appId,
            modelName: model.name,
            data: row as Prisma.InputJsonValue,
          }
        }),
        skipDuplicates: true,
      })
      for (const row of batch) {
        const id = String(row.id ?? createHash('sha1').update(`${model.table}:${JSON.stringify(row)}`).digest('hex'))
        sqlChunks.push(
          `INSERT INTO model_records (id, app_id, model_name, data, created_at, updated_at) VALUES (${sqlLiteral(id)}, ${sqlLiteral(appId)}, ${sqlLiteral(model.name)}, ${sqlLiteral(JSON.stringify(row))}::jsonb, NOW(), NOW()) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW();`,
        )
      }
      imported += batch.length
    }
    console.log(`  ${model.name} (${model.table}): ${rows.length}`)
  }

  sqlChunks.push('COMMIT;')

  const migDir = path.join(
    ROOT,
    'prisma/migrations',
    `${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}_portal_suporte_data`,
  )
  // Use fixed migration name for stability
  const fixedMigDir = path.join(ROOT, 'prisma/migrations', '20260723160000_portal_suporte_data')
  const { mkdirSync } = await import('node:fs')
  mkdirSync(fixedMigDir, { recursive: true })

  // Structural + data SQL (app/user/models/modules must already exist OR we include upserts)
  const structure: string[] = []
  structure.push('-- Portal Suporte integration data migration')
  structure.push('-- NOTE: platform schema (users/apps/...) must already exist.')
  structure.push('-- This migration loads production ModelRecords for app portal-suporte.')
  structure.push('-- Re-run scripts/portal-suporte/integrate.ts to refresh modules/routes/models.')
  structure.push('')
  structure.push(...sqlChunks)

  const sqlPath = path.join(fixedMigDir, 'migration.sql')
  writeFileSync(sqlPath, structure.join('\n') + '\n')
  console.log('→ Wrote SQL migration', sqlPath, `(${imported} rows)`)

  // Credentials summary
  const summary = {
    email: manifest.user.email,
    password: manifest.user.password,
    appSlug: manifest.app.slug,
    apiKey: manifest.apiKey.raw,
    models: manifest.models.length,
    modules: manifest.modules.length,
    routes: routeCount,
    recordsImported: imported,
    runtimeBase: `http://localhost:4100/v1/r/${manifest.app.slug}`,
    readme: 'http://localhost:4100/readme',
  }
  writeFileSync(path.join(DATA, 'portal-suporte-credentials.json'), JSON.stringify(summary, null, 2))
  console.log('✓ Done', summary)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
