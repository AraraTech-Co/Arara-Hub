/**
 * Unify time-management identity onto platform User ids.
 *
 * - time-management-Users → time-management-StaffProfile
 * - data.id = platform User.id (same person across apps)
 * - storage id = `tm-profile_${platformUserId}` (avoids clash with portal-suporte Profile)
 * - Remap all legacy user UUID refs in time-management records (user_id, manager_id, …)
 *
 *   node scripts/time-management/unify-users-to-platform.mjs
 *   node scripts/time-management/unify-users-to-platform.mjs --dry-run
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const dryRun = process.argv.includes('--dry-run')
const SLUG = 'time-management'
const OLD_MODEL = 'time-management-Users'
const NEW_MODEL = 'time-management-StaffProfile'

const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi

function storageId(platformUserId) {
  return `tm-profile_${platformUserId}`.slice(0, 64)
}

function deepRemap(value, idMap) {
  if (typeof value === 'string') {
    if (idMap[value]) return idMap[value]
    return value.replace(UUID_RE, (m) => idMap[m.toLowerCase()] || idMap[m] || m)
  }
  if (Array.isArray(value)) return value.map((v) => deepRemap(v, idMap))
  if (value && typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) out[k] = deepRemap(v, idMap)
    return out
  }
  return value
}

async function main() {
  console.log(dryRun ? '→ DRY RUN' : '→ Applying Horas user unification')

  const app = await prisma.app.findUnique({ where: { slug: SLUG } })
  if (!app) throw new Error(`App ${SLUG} not found`)

  const platformUsers = await prisma.user.findMany()
  const byEmail = new Map(platformUsers.map((u) => [u.email.toLowerCase(), u]))

  const userRows = await prisma.modelRecord.findMany({
    where: { appId: app.id, modelName: OLD_MODEL },
  })

  /** @type {Record<string, string>} legacyId → platformId */
  const idMap = {}
  const plans = []

  for (const row of userRows) {
    const data = { ...(row.data) }
    const email = String(data.email || '').toLowerCase()
    const legacyId = String(data.id || row.id)
    const platform = byEmail.get(email)
    if (!platform) {
      console.warn(`  SKIP no platform user for ${email} (legacy ${legacyId})`)
      continue
    }
    idMap[legacyId] = platform.id
    idMap[legacyId.toLowerCase()] = platform.id
    plans.push({ row, data, platform, legacyId })
  }

  console.log(`→ Mapped ${plans.length} Horas users → platform ids`)

  // 1) Rewrite user profile records
  for (const { row, data, platform, legacyId } of plans) {
    const nextData = {
      ...data,
      id: platform.id,
      email: platform.email,
      full_name: data.full_name || data.fullName || platform.name || platform.email,
      // drop password — auth is platform-only
      password_hash: undefined,
      passwordHash: undefined,
    }
    delete nextData.password_hash
    delete nextData.passwordHash

    const newId = storageId(platform.id)
    console.log(`  profile ${legacyId} → ${platform.id} (${platform.email})`)

    if (dryRun) continue

    // Delete old if different storage id
    if (row.id !== newId) {
      await prisma.modelRecord.delete({ where: { id: row.id } }).catch(() => {})
    }

    await prisma.modelRecord.upsert({
      where: { id: newId },
      create: {
        id: newId,
        appId: app.id,
        modelName: NEW_MODEL,
        data: nextData,
      },
      update: {
        modelName: NEW_MODEL,
        data: nextData,
      },
    })
  }

  // 2) Rename ModelDef Users → StaffProfile
  const oldDef = await prisma.modelDef.findFirst({
    where: { appId: app.id, name: OLD_MODEL },
  })
  if (oldDef) {
    console.log(`→ ModelDef ${OLD_MODEL} → ${NEW_MODEL}`)
    if (!dryRun) {
      const existingNew = await prisma.modelDef.findFirst({
        where: { appId: app.id, name: NEW_MODEL },
      })
      if (existingNew) {
        await prisma.modelDef.delete({ where: { id: oldDef.id } })
      } else {
        await prisma.modelDef.update({
          where: { id: oldDef.id },
          data: { name: NEW_MODEL },
        })
      }
    }
  }

  // 3) Remap FK refs in all other time-management records
  const others = await prisma.modelRecord.findMany({
    where: {
      appId: app.id,
      NOT: { modelName: NEW_MODEL },
    },
  })
  // Also remap any leftover OLD_MODEL rows that weren't migrated
  const leftover = await prisma.modelRecord.findMany({
    where: { appId: app.id, modelName: OLD_MODEL },
  })

  let remapped = 0
  for (const row of [...others, ...leftover]) {
    if (row.modelName === NEW_MODEL) continue
    const before = JSON.stringify(row.data)
    const after = deepRemap(row.data, idMap)
    if (JSON.stringify(after) === before) continue
    remapped++
    if (!dryRun) {
      await prisma.modelRecord.update({
        where: { id: row.id },
        data: { data: after },
      })
    }
  }
  console.log(`→ Remapped FK fields in ${remapped} records`)

  // 4) Drop leftover OLD_MODEL rows (inactive/unmapped)
  if (!dryRun) {
    const deleted = await prisma.modelRecord.deleteMany({
      where: { appId: app.id, modelName: OLD_MODEL },
    })
    if (deleted.count) console.log(`→ Deleted ${deleted.count} leftover ${OLD_MODEL} rows`)
  }

  // Sanity
  const profiles = await prisma.modelRecord.count({
    where: { appId: app.id, modelName: NEW_MODEL },
  })
  console.log('✓ Done', { profiles, mapped: plans.length, remapped, dryRun })
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
