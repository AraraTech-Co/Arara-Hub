/**
 * Publish GET /users, /users/me, /users/:id for StaffProfile.
 * node scripts/time-management/publish-users-route.mjs
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

async function upsertRoute(moduleId, method, routePath, controllerCode) {
  const existing = await prisma.moduleRoute.findFirst({
    where: { moduleId, method, path: routePath },
  })
  if (existing) {
    await prisma.moduleRoute.update({ where: { id: existing.id }, data: { controllerCode } })
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

  let mod = await prisma.module.findFirst({ where: { appId: app.id, name: 'users' } })
  if (!mod) {
    mod = await prisma.module.create({
      data: {
        appId: app.id,
        name: 'users',
        description: 'Horas StaffProfile (platform User id)',
        status: 'published',
      },
    })
  } else {
    await prisma.module.update({ where: { id: mod.id }, data: { status: 'published' } })
  }

  const listCode = load('users-controller.js')
  const meCode = load('users-me-controller.js')

  await upsertRoute(mod.id, 'GET', '/users', listCode)
  await upsertRoute(mod.id, 'GET', '/users/me', meCode)
  await upsertRoute(mod.id, 'GET', '/users/:id', listCode)

  console.log('✓ Users routes published (StaffProfile)')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
