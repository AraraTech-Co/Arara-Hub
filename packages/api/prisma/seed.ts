import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { hashPassword } from '../src/lib/crypto.js'

const prisma = new PrismaClient()

const PERMISSIONS = [
  { name: 'apps:create', description: 'Create applications' },
  { name: 'modules:write', description: 'Create and update modules/routes' },
  { name: 'models:write', description: 'Create and update model definitions' },
] as const

/** Canonical person roles: user | support | developer | admin (no master). */
const ROLES: Record<string, string[]> = {
  user: [],
  support: [],
  developer: ['apps:create', 'modules:write', 'models:write'],
  admin: ['apps:create', 'modules:write', 'models:write'],
}

async function main() {
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { name: p.name },
      create: p,
      update: { description: p.description },
    })
  }

  const permissionRows = await prisma.permission.findMany()
  const byName = Object.fromEntries(permissionRows.map((p) => [p.name, p.id]))

  for (const [roleName, perms] of Object.entries(ROLES)) {
    const role = await prisma.role.upsert({
      where: { name: roleName },
      create: { name: roleName, description: `Role ${roleName}` },
      update: {},
    })
    for (const permName of perms) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId: byName[permName]!,
          },
        },
        create: { roleId: role.id, permissionId: byName[permName]! },
        update: {},
      })
    }
  }

  const developerRole = await prisma.role.findUniqueOrThrow({ where: { name: 'developer' } })
  const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'admin' } })

  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@arara.local'
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'change-me-admin'
  const devEmail = process.env.SEED_DEV_EMAIL || 'fernandinho@arara.local'
  const devPassword = process.env.SEED_DEV_PASSWORD || 'change-me-dev'

  await prisma.user.upsert({
    where: { email: devEmail },
    create: {
      email: devEmail,
      name: 'Fernandinho',
      passwordHash: await hashPassword(devPassword),
      roles: { create: [{ roleId: developerRole.id }] },
    },
    update: {},
  })

  await prisma.user.upsert({
    where: { email: adminEmail },
    create: {
      email: adminEmail,
      name: 'Admin',
      passwordHash: await hashPassword(adminPassword),
      roles: { create: [{ roleId: adminRole.id }] },
    },
    update: {},
  })

  console.log('Seed OK')
  console.log(`  ${adminEmail} (admin) — password from SEED_ADMIN_PASSWORD`)
  console.log(`  ${devEmail} (developer) — password from SEED_DEV_PASSWORD`)
  console.log('  (no demo apps — use production app slugs / integrate scripts)')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
