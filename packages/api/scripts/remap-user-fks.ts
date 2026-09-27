/**
 * Remap legacy user FKs in ModelRecords to unified platform User ids.
 * Also verifies portal-suporte Profile ids already match platform users.
 *
 *   npx tsx scripts/remap-user-fks.ts
 */
import 'dotenv/config'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaClient, type Prisma } from '@prisma/client'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA = path.resolve(__dirname, '../data')
const prisma = new PrismaClient()

type MapFile = {
  map: Record<string, string>
}

  const FK_FIELDS = [
  'user_id',
  'userId',
  'manager_id',
  'managerId',
  'assigned_to',
  'assignedTo',
  'ownerId',
  'owner_id',
  'created_by',
  'createdBy',
  'author_id',
  'authorId',
  'profile_id',
  'profileId',
  'rejection_accepted_by_user_id',
  'rejectionAcceptedByUserId',
]

async function main() {
  const mapPath = path.join(DATA, 'user-id-map.json')
  if (!existsSync(mapPath)) throw new Error('Run unify-users.ts first')
  const { map } = JSON.parse(readFileSync(mapPath, 'utf8')) as MapFile

  const apps = await prisma.app.findMany({
    where: { slug: { in: ['portal-suporte', 'portal-crm', 'time-management'] } },
  })

  let updated = 0
  let checked = 0

  for (const app of apps) {
    const rows = await prisma.modelRecord.findMany({ where: { appId: app.id } })
    for (const row of rows) {
      checked++
      const data = { ...(row.data as Record<string, unknown>) }
      let dirty = false
      for (const field of FK_FIELDS) {
        const v = data[field]
        if (v == null || v === '') continue
        const key = `${app.slug}:${String(v)}`
        const mapped = map[key]
        if (mapped && mapped !== String(v)) {
          data[field] = mapped
          dirty = true
        }
      }
      if (dirty) {
        await prisma.modelRecord.update({
          where: { id: row.id },
          data: { data: data as Prisma.InputJsonValue },
        })
        updated++
      }
    }
    console.log(`  ${app.slug}: checked ${rows.length}`)
  }

  // Company shared alignment: ensure Company model alias note in credentials
  const suporte = apps.find((a) => a.slug === 'portal-suporte')
  if (suporte) {
    const companies = await prisma.modelRecord.count({
      where: { appId: suporte.id, modelName: 'portal-suporte-Company' },
    })
    console.log(`  portal-suporte-Company records: ${companies} (shared promotion = UI/read via alias; storage remains namespaced until platform shared-store)`)
  }

  // Sanity: core users exist (from local canonical-emails.json)
  const canonPath = path.join(DATA, 'canonical-emails.json')
  const core: string[] = existsSync(canonPath)
    ? ((JSON.parse(readFileSync(canonPath, 'utf8')) as { coreStaff?: string[] }).coreStaff || [])
    : []
  for (const email of core) {
    const u = await prisma.user.findUnique({ where: { email }, include: { memberships: true } })
    console.log(`  user ${email}: ${u ? `ok memberships=${u.memberships.length}` : 'MISSING'}`)
  }

  console.log('✓ Remap done', { checked, updated })
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
