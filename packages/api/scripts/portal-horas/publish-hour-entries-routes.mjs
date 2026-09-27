/**
 * Publish hour-entries create/list/patch/delete controllers for time-management.
 * node scripts/time-management/publish-hour-entries-routes.mjs
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '@prisma/client'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const prisma = new PrismaClient()

function load(name) {
  return readFileSync(path.join(__dirname, name), 'utf8')
}

async function upsertRoute(appId, moduleId, method, routePath, controllerCode) {
  // Prefer updating any existing route on this app (generic CRUD from integrate)
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

async function main() {
  const app = await prisma.app.findUnique({ where: { slug: 'time-management' } })
  if (!app) throw new Error('App time-management not found')

  let mod = await prisma.module.findFirst({ where: { appId: app.id, name: 'hour-entries' } })
  if (!mod) {
    mod = await prisma.module.create({
      data: {
        appId: app.id,
        name: 'hour-entries',
        description: 'Lançamentos de horas (JWT + user_id)',
        status: 'published',
      },
    })
    console.log('→ Created module hour-entries')
  } else {
    await prisma.module.update({ where: { id: mod.id }, data: { status: 'published' } })
  }

  await upsertRoute(app.id, mod.id, 'POST', '/hour-entries', load('hour-entries-create-controller.js'))
  await upsertRoute(app.id, mod.id, 'GET', '/hour-entries', load('hour-entries-list-controller.js'))
  await upsertRoute(app.id, mod.id, 'PATCH', '/hour-entries/:id', load('hour-entries-patch-controller.js'))
  await upsertRoute(app.id, mod.id, 'DELETE', '/hour-entries/:id', load('hour-entries-delete-controller.js'))

  console.log('✓ Hour-entries routes published')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
