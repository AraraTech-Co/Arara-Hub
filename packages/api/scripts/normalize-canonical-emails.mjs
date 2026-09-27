/**
 * Normalize staff emails to @arara-tech.com in platform User + all ModelRecords.
 *
 *   node scripts/normalize-canonical-emails.mjs
 *   node scripts/normalize-canonical-emails.mjs --dry-run
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '@prisma/client'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const prisma = new PrismaClient()
const dryRun = process.argv.includes('--dry-run')

const config = JSON.parse(
  readFileSync(path.join(ROOT, 'data/canonical-emails.json'), 'utf8'),
)
const ALIASES = Object.fromEntries(
  Object.entries(config.aliases).map(([k, v]) => [k.toLowerCase(), v.toLowerCase()]),
)
const PLATFORM_RENAMES = config.platformRenames || {}

function normalizeEmail(value) {
  if (typeof value !== 'string' || !value.includes('@')) return value
  const lower = value.trim().toLowerCase()
  return ALIASES[lower] ?? value
}

function deepNormalize(value) {
  if (typeof value === 'string') return normalizeEmail(value)
  if (Array.isArray(value)) return value.map(deepNormalize)
  if (value && typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) {
      out[k] = deepNormalize(v)
    }
    return out
  }
  return value
}

function jsonChanged(before, after) {
  return JSON.stringify(before) !== JSON.stringify(after)
}

async function renamePlatformUsers() {
  let renamed = 0
  for (const [oldEmail, newEmail] of Object.entries(PLATFORM_RENAMES)) {
    const old = oldEmail.toLowerCase()
    const canonical = newEmail.toLowerCase()
    const user = await prisma.user.findUnique({ where: { email: old } })
    if (!user) {
      console.log(`  skip platform rename (not found): ${old}`)
      continue
    }
    const conflict = await prisma.user.findUnique({ where: { email: canonical } })
    if (conflict && conflict.id !== user.id) {
      console.warn(`  CONFLICT platform rename ${old} → ${canonical} (target exists)`)
      continue
    }
    console.log(`  platform User: ${old} → ${canonical}`)
    if (!dryRun) {
      await prisma.user.update({ where: { id: user.id }, data: { email: canonical } })
    }
    renamed++
  }
  return renamed
}

async function normalizeModelRecords() {
  const rows = await prisma.modelRecord.findMany()
  let updated = 0
  for (const row of rows) {
    const before = row.data
    const after = deepNormalize(before)
    if (!jsonChanged(before, after)) continue
    if (!dryRun) {
      await prisma.modelRecord.update({
        where: { id: row.id },
        data: { data: after },
      })
    }
    updated++
  }
  return updated
}

async function updateUserIdMap() {
  const mapPath = path.join(ROOT, 'data/user-id-map.json')
  if (!existsSync(mapPath)) return
  const doc = JSON.parse(readFileSync(mapPath, 'utf8'))
  doc.aliases = config.aliases
  doc.coreEmails = config.coreStaff
  if (Array.isArray(doc.users)) {
    doc.users = doc.users.map((e) => normalizeEmail(String(e)))
  }
  if (doc.map && typeof doc.map === 'object') {
    for (const [k, v] of Object.entries(doc.map)) {
      if (k.includes(':email:')) {
        const parts = k.split(':email:')
        const email = normalizeEmail(parts[1])
        doc.map[`${parts[0]}:email:${email}`] = v
        if (email !== parts[1]) delete doc.map[k]
      }
    }
  }
  doc.generatedAt = new Date().toISOString()
  if (!dryRun) writeFileSync(mapPath, JSON.stringify(doc, null, 2))
  console.log('  user-id-map.json updated')
}

async function main() {
  console.log(dryRun ? '→ DRY RUN' : '→ Applying canonical email normalization')
  console.log('→ Platform users')
  const renamed = await renamePlatformUsers()
  console.log('→ Model records')
  const records = await normalizeModelRecords()
  await updateUserIdMap()
  console.log('✓ Done', { renamed, recordsUpdated: records, dryRun })
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
