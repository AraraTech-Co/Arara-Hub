/**
 * Publish GET /finance/investment-calculator
 * node scripts/time-management/publish-finance-route.mjs
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '@prisma/client'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const prisma = new PrismaClient()

async function main() {
  const app = await prisma.app.findUnique({ where: { slug: 'time-management' } })
  if (!app) throw new Error('App not found')

  const controllerCode = readFileSync(path.join(__dirname, 'finance-controller.js'), 'utf8')
  const routePath = '/finance/investment-calculator'

  let mod = await prisma.module.findFirst({ where: { appId: app.id, name: 'finance' } })
  if (!mod) {
    mod = await prisma.module.create({
      data: {
        appId: app.id,
        name: 'finance',
        description: 'Finance reports',
        status: 'published',
      },
    })
  } else {
    await prisma.module.update({ where: { id: mod.id }, data: { status: 'published' } })
  }

  const existing = await prisma.moduleRoute.findFirst({
    where: { moduleId: mod.id, method: 'GET', path: routePath },
  })
  if (existing) {
    await prisma.moduleRoute.update({ where: { id: existing.id }, data: { controllerCode } })
    console.log('→ Updated GET', routePath)
  } else {
    await prisma.moduleRoute.create({
      data: { moduleId: mod.id, method: 'GET', path: routePath, controllerCode },
    })
    console.log('→ Created GET', routePath)
  }
  console.log('✓ Finance route published')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
