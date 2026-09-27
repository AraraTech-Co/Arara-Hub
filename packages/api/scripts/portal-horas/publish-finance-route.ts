/**
 * Publish GET /finance/investment-calculator for time-management app.
 *
 *   npx tsx scripts/time-management/publish-finance-route.ts
 *   DATABASE_URL=... npx tsx scripts/time-management/publish-finance-route.ts
 */
import 'dotenv/config'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '@prisma/client'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../..')
const prisma = new PrismaClient()

function buildPlatformUserMap(): Record<string, string> {
  const mapPath = path.join(ROOT, 'data/user-id-map.json')
  if (!existsSync(mapPath)) return {}
  const { map } = JSON.parse(readFileSync(mapPath, 'utf8')) as { map: Record<string, string> }
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(map)) {
    if (k.startsWith('time-management:')) out[k] = v
  }
  return out
}

function loadControllerCode(): string {
  const raw = readFileSync(path.join(__dirname, 'finance-controller.js'), 'utf8')
  const platformMap = buildPlatformUserMap()
  return raw.replace('__PLATFORM_USER_MAP__', JSON.stringify(platformMap))
}

async function main() {
  const slug = 'time-management'
  const app = await prisma.app.findUnique({ where: { slug } })
  if (!app) throw new Error(`App ${slug} not found`)

  const controllerCode = loadControllerCode()
  const routePath = '/finance/investment-calculator'

  let mod = await prisma.module.findFirst({
    where: { appId: app.id, name: 'finance' },
  })
  if (!mod) {
    mod = await prisma.module.create({
      data: {
        appId: app.id,
        name: 'finance',
        description: 'Finance reports (investment calculator)',
        status: 'published',
      },
    })
    console.log('→ Created module finance')
  } else {
    await prisma.module.update({
      where: { id: mod.id },
      data: { status: 'published' },
    })
    console.log('→ Updated module finance')
  }

  const existing = await prisma.moduleRoute.findFirst({
    where: { moduleId: mod.id, method: 'GET', path: routePath },
  })

  if (existing) {
    await prisma.moduleRoute.update({
      where: { id: existing.id },
      data: { controllerCode },
    })
    console.log('→ Updated route GET', routePath)
  } else {
    await prisma.moduleRoute.create({
      data: {
        moduleId: mod.id,
        method: 'GET',
        path: routePath,
        controllerCode,
      },
    })
    console.log('→ Created route GET', routePath)
  }

  console.log('✓ Finance route published for', slug)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
