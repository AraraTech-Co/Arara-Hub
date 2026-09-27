/**
 * Publish hour-entries + approve + squads + users write routes for time-management.
 * node scripts/time-management/publish-horas-fix-routes.mjs
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '@prisma/client'
import { buildPlatformUserMap } from './publish-helpers.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const prisma = new PrismaClient()

function load(name) {
  const raw = readFileSync(path.join(__dirname, name), 'utf8')
  if (name === 'users-write-controller.js') {
    return raw.replace('__PLATFORM_USER_MAP__', JSON.stringify(buildPlatformUserMap()))
  }
  return raw
}

async function upsertRoute(appId, moduleId, method, routePath, controllerCode) {
  const existing = await prisma.moduleRoute.findFirst({
    where: { method, path: routePath, module: { appId } },
  })
  if (existing) {
    await prisma.moduleRoute.update({
      where: { id: existing.id },
      data: { controllerCode, moduleId },
    })
    console.log('→ Updated', method, routePath)
  } else {
    await prisma.moduleRoute.create({
      data: { moduleId, method, path: routePath, controllerCode },
    })
    console.log('→ Created', method, routePath)
  }
}

async function ensureModule(appId, name, description) {
  let mod = await prisma.module.findFirst({ where: { appId, name } })
  if (!mod) {
    mod = await prisma.module.create({
      data: { appId, name, description, status: 'published' },
    })
    console.log('→ Created module', name)
  } else {
    await prisma.module.update({ where: { id: mod.id }, data: { status: 'published' } })
  }
  return mod
}

async function main() {
  const app = await prisma.app.findUnique({ where: { slug: 'time-management' } })
  if (!app) throw new Error('App time-management not found')

  const hours = await ensureModule(app.id, 'hour-entries', 'Lançamentos de horas')
  await upsertRoute(app.id, hours.id, 'POST', '/hour-entries', load('hour-entries-create-controller.js'))
  await upsertRoute(app.id, hours.id, 'GET', '/hour-entries', load('hour-entries-list-controller.js'))
  await upsertRoute(app.id, hours.id, 'PATCH', '/hour-entries/:id', load('hour-entries-patch-controller.js'))
  await upsertRoute(app.id, hours.id, 'DELETE', '/hour-entries/:id', load('hour-entries-delete-controller.js'))
  await upsertRoute(
    app.id,
    hours.id,
    'POST',
    '/hour-entries/:id/approve',
    load('hour-entries-approve-controller.js'),
  )
  await upsertRoute(
    app.id,
    hours.id,
    'POST',
    '/hour-entries/bulk-approve',
    load('hour-entries-bulk-approve-controller.js'),
  )

  const users = await ensureModule(app.id, 'users', 'StaffProfile users')
  await upsertRoute(app.id, users.id, 'GET', '/users', load('users-controller.js'))
  await upsertRoute(app.id, users.id, 'GET', '/users/me', load('users-me-controller.js'))
  await upsertRoute(app.id, users.id, 'GET', '/users/:id', load('users-controller.js'))
  await upsertRoute(app.id, users.id, 'POST', '/users', load('users-write-controller.js'))
  await upsertRoute(app.id, users.id, 'PATCH', '/users/:id', load('users-write-controller.js'))

  const squads = await ensureModule(app.id, 'squads', 'Squads / equipes')
  await upsertRoute(app.id, squads.id, 'GET', '/squads', load('squads-controller.js'))
  await upsertRoute(app.id, squads.id, 'POST', '/squads', load('squads-controller.js'))
  await upsertRoute(app.id, squads.id, 'PATCH', '/squads/:id', load('squads-controller.js'))
  await upsertRoute(app.id, squads.id, 'GET', '/squads/screen-keys', load('squads-controller.js'))

  // Ensure Squad model exists
  const squadModel = 'time-management-Squad'
  await prisma.modelDef.upsert({
    where: { appId_name: { appId: app.id, name: squadModel } },
    create: {
      appId: app.id,
      name: squadModel,
      schema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          active: { type: 'boolean' },
          screen_permissions: { type: 'array' },
          created_at: { type: 'string' },
          updated_at: { type: 'string' },
        },
      },
    },
    update: {},
  })

  // Ensure StaffProfile rate fields stay numeric (avoid null-inferred string schema)
  const staffModel = 'time-management-StaffProfile'
  const staffDef = await prisma.modelDef.findFirst({
    where: { appId: app.id, name: staffModel },
  })
  if (staffDef) {
    const schema =
      staffDef.schema && typeof staffDef.schema === 'object' && !Array.isArray(staffDef.schema)
        ? structuredClone(staffDef.schema)
        : { type: 'object', properties: {} }
    if (!schema.properties || typeof schema.properties !== 'object') {
      schema.properties = {}
    }
    schema.type = schema.type || 'object'
    schema.properties.hourly_rate = { type: 'number' }
    schema.properties.monthly_rate = { type: 'number' }
    await prisma.modelDef.update({
      where: { id: staffDef.id },
      data: { schema },
    })
    console.log('→ StaffProfile hourly_rate/monthly_rate → number')
  }

  console.log('✓ Horas fix routes published')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
