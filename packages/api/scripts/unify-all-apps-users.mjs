/**
 * Align ALL apps to the same platform User identity.
 *
 * Rules (workspace):
 * - User is shared (platform.users) — never portal-*-User as identity
 * - App profiles use platform User.id as data.id
 * - FKs (user_id, ownerId, assigned_to, …) point to platform User.id
 *
 * Steps:
 * 1. Build legacyId → platformId map (user-id-map + email match)
 * 2. portal-suporte: delete orphan NextAuth User clones (Profile already aligned)
 * 3. portal-crm: rewrite Profile → platform ids + emails
 * 4. Deep-remap leftover legacy ids in all app records
 * 5. Ensure core staff AppMembership on all apps
 * 6. Normalize emails via canonical-emails.json
 *
 *   node scripts/unify-all-apps-users.mjs
 *   node scripts/unify-all-apps-users.mjs --dry-run
 */
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '@prisma/client'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const prisma = new PrismaClient()
const dryRun = process.argv.includes('--dry-run')

const ID_LIKE =
  /(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|usr_[a-z0-9]+|user-[a-z0-9_-]+|user_[a-f0-9]+)/gi

const FK_KEYS = new Set([
  'user_id',
  'userId',
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
  'manager_id',
  'managerId',
  'rejection_accepted_by_user_id',
  'rejectionAcceptedByUserId',
  'actorId',
  'actor_id',
])

function loadJson(rel) {
  const p = path.join(ROOT, rel)
  if (!existsSync(p)) return null
  return JSON.parse(readFileSync(p, 'utf8'))
}

function deepRemap(value, idMap) {
  if (typeof value === 'string') {
    if (idMap[value]) return idMap[value]
    return value.replace(ID_LIKE, (m) => idMap[m] || idMap[m.toLowerCase()] || m)
  }
  if (Array.isArray(value)) return value.map((v) => deepRemap(v, idMap))
  if (value && typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) {
      out[k] = deepRemap(v, idMap)
    }
    return out
  }
  return value
}

function normalizeEmail(email, aliases) {
  if (typeof email !== 'string' || !email.includes('@')) return email
  const e = email.trim().toLowerCase()
  return aliases[e] || e
}

async function main() {
  console.log(dryRun ? '→ DRY RUN' : '→ Unifying all apps onto platform User')

  const canon = loadJson('data/canonical-emails.json') || { aliases: {}, coreStaff: [] }
  const aliases = Object.fromEntries(
    Object.entries(canon.aliases || {}).map(([k, v]) => [k.toLowerCase(), String(v).toLowerCase()]),
  )
  const mapFile = loadJson('data/user-id-map.json') || { map: {} }

  const platformUsers = await prisma.user.findMany()
  const byEmail = new Map(platformUsers.map((u) => [u.email.toLowerCase(), u]))
  const byId = new Map(platformUsers.map((u) => [u.id, u]))

  /** @type {Record<string, string>} */
  const idMap = {}

  // From user-id-map: only bare legacy id keys (app:legacyId → platform)
  for (const [k, v] of Object.entries(mapFile.map || {})) {
    if (k.includes(':email:')) continue
    const legacy = k.includes(':') ? k.slice(k.indexOf(':') + 1) : k
    if (legacy && v && legacy !== v) {
      idMap[legacy] = v
      idMap[legacy.toLowerCase()] = v
    }
  }

  const apps = await prisma.app.findMany({
    where: {
      slug: { in: ['portal-suporte', 'portal-crm', 'time-management', 'portal-araratech'] },
    },
  })
  const bySlug = Object.fromEntries(apps.map((a) => [a.slug, a]))

  // ── 1) portal-suporte-User: orphan NextAuth clones → delete (Profile is the app profile)
  const suporte = bySlug['portal-suporte']
  if (suporte) {
    const nextAuthUsers = await prisma.modelRecord.findMany({
      where: { appId: suporte.id, modelName: 'portal-suporte-User' },
    })
    for (const row of nextAuthUsers) {
      const data = row.data
      const email = normalizeEmail(String(data.email || ''), aliases)
      const platform = byEmail.get(email)
      const legacyId = String(data.id || row.id)
      if (platform && legacyId !== platform.id) {
        idMap[legacyId] = platform.id
        idMap[legacyId.toLowerCase()] = platform.id
      }
      console.log(`  suporte-User DROP ${legacyId} (${email || 'no-email'}) → use Profile/platform`)
    }
    if (!dryRun && nextAuthUsers.length) {
      const del = await prisma.modelRecord.deleteMany({
        where: { appId: suporte.id, modelName: 'portal-suporte-User' },
      })
      console.log(`→ Deleted ${del.count} portal-suporte-User rows`)
    }

    // Ensure Profile emails are canonical; ids already = platform
    const profiles = await prisma.modelRecord.findMany({
      where: { appId: suporte.id, modelName: 'portal-suporte-Profile' },
    })
    let profileEmailFixes = 0
    for (const row of profiles) {
      const data = { ...row.data }
      const email = data.email ? normalizeEmail(String(data.email), aliases) : null
      if (!email) continue
      const platform = byEmail.get(email)
      let dirty = false
      if (email !== data.email) {
        data.email = email
        dirty = true
      }
      if (platform && data.id !== platform.id) {
        // should be rare — Profile already aligned
        idMap[String(data.id)] = platform.id
        data.id = platform.id
        dirty = true
      }
      if (dirty) {
        profileEmailFixes++
        if (!dryRun) {
          await prisma.modelRecord.update({
            where: { id: row.id },
            data: { data },
          })
        }
      }
    }
    console.log(`→ portal-suporte Profile email/id fixes: ${profileEmailFixes}`)
  }

  // ── 2) portal-crm Profile → platform User id
  const crm = bySlug['portal-crm']
  if (crm) {
    const crmProfiles = await prisma.modelRecord.findMany({
      where: { appId: crm.id, modelName: 'portal-crm-Profile' },
    })
    for (const row of crmProfiles) {
      const data = { ...row.data }
      const legacyId = String(data.id || row.id.replace(/^portal-c_/, ''))
      const platformId =
        idMap[legacyId] ||
        idMap[`portal-crm:${legacyId}`] ||
        mapFile.map?.[`portal-crm:${legacyId}`]
      if (!platformId || !byId.has(platformId)) {
        console.warn(`  CRM Profile SKIP unknown ${legacyId}`)
        continue
      }
      const platform = byId.get(platformId)
      idMap[legacyId] = platformId
      const nextData = {
        ...data,
        id: platformId,
        email: platform.email,
        fullName: data.fullName || data.full_name || platform.name || platform.email,
      }
      const newStorageId = `crm-profile_${platformId}`.slice(0, 64)
      console.log(`  CRM Profile ${legacyId} → ${platformId} (${platform.email})`)
      if (dryRun) continue
      if (row.id !== newStorageId) {
        await prisma.modelRecord.delete({ where: { id: row.id } }).catch(() => {})
      }
      await prisma.modelRecord.upsert({
        where: { id: newStorageId },
        create: {
          id: newStorageId,
          appId: crm.id,
          modelName: 'portal-crm-Profile',
          data: nextData,
        },
        update: { data: nextData },
      })
    }
  }

  // ── 3) Deep remap FKs / embedded ids across all apps
  let remapped = 0
  for (const app of apps) {
    const rows = await prisma.modelRecord.findMany({ where: { appId: app.id } })
    for (const row of rows) {
      // Skip identity profiles we already rewrote by storage id change
      if (app.slug === 'portal-crm' && row.modelName === 'portal-crm-Profile') continue
      if (app.slug === 'time-management' && row.modelName === 'time-management-StaffProfile') {
        // still normalize emails inside
      }

      const before = JSON.stringify(row.data)
      let after = deepRemap(row.data, idMap)

      // email fields
      if (after && typeof after === 'object' && !Array.isArray(after)) {
        for (const key of ['email', 'analyst_email', 'analystEmail', 'manager_email', 'managerEmail']) {
          if (typeof after[key] === 'string') {
            after[key] = normalizeEmail(after[key], aliases)
          }
        }
      }

      if (JSON.stringify(after) === before) continue
      remapped++
      if (!dryRun) {
        await prisma.modelRecord.update({
          where: { id: row.id },
          data: { data: after },
        })
      }
    }
    console.log(`→ ${app.slug}: scanned ${rows.length} records`)
  }
  console.log(`→ Remapped fields in ${remapped} records`)

  // ── 4) Memberships for core staff on all apps
  const coreEmails = new Set(
    (canon.coreStaff || mapFile.coreEmails || []).map((e) => String(e).toLowerCase()),
  )
  // also include everyone already on suporte with @arara-tech.com
  for (const u of platformUsers) {
    if (u.email.endsWith('@arara-tech.com') && !u.email.includes('+')) {
      coreEmails.add(u.email.toLowerCase())
    }
  }

  let memberships = 0
  for (const email of coreEmails) {
    const user = byEmail.get(email)
    if (!user) continue
    for (const app of apps) {
      if (dryRun) {
        memberships++
        continue
      }
      await prisma.appMembership.upsert({
        where: { userId_appId: { userId: user.id, appId: app.id } },
        create: { userId: user.id, appId: app.id, role: 'member' },
        update: {},
      })
      memberships++
    }
  }
  console.log(`→ Ensured memberships: ${memberships}`)

  // ── 5) Sanity report
  console.log('\n=== Sanity ===')
  for (const app of apps) {
    const identityModels = await prisma.modelDef.findMany({
      where: {
        appId: app.id,
        OR: [
          { name: { endsWith: '-User' } },
          { name: { endsWith: '-Users' } },
          { name: { endsWith: '-Profile' } },
          { name: { endsWith: '-StaffProfile' } },
        ],
      },
    })
    for (const def of identityModels) {
      const rows = await prisma.modelRecord.findMany({
        where: { appId: app.id, modelName: def.name },
      })
      let ok = 0
      let bad = 0
      for (const r of rows) {
        const id = String(r.data?.id || '')
        const email = r.data?.email ? String(r.data.email).toLowerCase() : ''
        const platform = (email && byEmail.get(email)) || byId.get(id)
        if (platform && platform.id === id) ok++
        else if (!email && !id) bad++
        else if (platform && platform.id !== id) bad++
        else if (def.name.endsWith('-User') || def.name.endsWith('-Users')) bad++
        else ok++ // profile without email but id match attempted
      }
      console.log(`  ${def.name}: ${rows.length} rows (aligned~${ok}, review~${bad})`)
    }
  }

  console.log('✓ Done', { dryRun, remapped, idMapSize: Object.keys(idMap).length })
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
