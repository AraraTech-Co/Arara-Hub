/**
 * Unify staff users from portal-suporte Profiles + CRM/horas dumps into platform User.
 * Emits data/user-id-map.json and AppMembership rows.
 *
 * Requires local (gitignored) data/canonical-emails.json:
 *   { "aliases": { "legacy@…": "canonical@…" }, "coreStaff": ["canonical@…"] }
 *
 *   npx tsx scripts/unify-users.ts
 */
import 'dotenv/config'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '@prisma/client'
import { hashPassword } from '../src/lib/crypto.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA = path.resolve(__dirname, '../data')
const prisma = new PrismaClient()

function loadCanonicalEmails(): { aliases: Record<string, string>; coreStaff: string[] } {
  const p = path.join(DATA, 'canonical-emails.json')
  if (!existsSync(p)) {
    throw new Error(
      `Missing ${p} (gitignored). Create it locally from your staff map before running unify-users.`,
    )
  }
  const raw = JSON.parse(readFileSync(p, 'utf8')) as {
    aliases?: Record<string, string>
    coreStaff?: string[]
  }
  return { aliases: raw.aliases || {}, coreStaff: raw.coreStaff || [] }
}

const { aliases: EMAIL_ALIASES, coreStaff } = loadCanonicalEmails()
const CORE_EMAILS = new Set(coreStaff)

type LegacyUser = {
  legacyApp: string
  legacyId: string
  email: string
  name: string
  passwordHash?: string | null
  role: string
}

function canonEmail(email: string): string {
  const e = email.trim().toLowerCase()
  return EMAIL_ALIASES[e] || e
}

function loadJsonArray(file: string): Record<string, unknown>[] {
  if (!existsSync(file)) return []
  const raw = JSON.parse(readFileSync(file, 'utf8'))
  return Array.isArray(raw) ? raw : []
}

function collectLegacy(): LegacyUser[] {
  const out: LegacyUser[] = []

  for (const p of loadJsonArray(path.join(DATA, 'portal-suporte-prod/profiles.json'))) {
    const email = String(p.email || '')
    if (!email) continue
    out.push({
      legacyApp: 'portal-suporte',
      legacyId: String(p.id),
      email,
      name: String(p.full_name || p.fullName || email),
      passwordHash: (p.password_hash || p.passwordHash) as string | undefined,
      role: String(p.role || 'user'),
    })
  }

  for (const u of loadJsonArray(path.join(DATA, 'portal-crm-prod/User.json'))) {
    const email = String(u.email || '')
    if (!email) continue
    out.push({
      legacyApp: 'portal-crm',
      legacyId: String(u.id),
      email,
      name: String(u.name || email),
      passwordHash: (u.passwordHash || u.password_hash) as string | undefined,
      role: String(u.role || 'vendedor'),
    })
  }

  for (const u of loadJsonArray(path.join(DATA, 'time-management-prod/users.json'))) {
    const email = String(u.email || '')
    if (!email) continue
    out.push({
      legacyApp: 'time-management',
      legacyId: String(u.id),
      email,
      name: String(u.full_name || u.fullName || email),
      passwordHash: (u.password_hash || u.passwordHash) as string | undefined,
      role: String(u.role || 'user'),
    })
  }

  return out
}

async function ensureApp(slug: string, name: string, ownerId: string) {
  return prisma.app.upsert({
    where: { slug },
    create: { slug, name, description: `${name} (unified)`, ownerId },
    update: { name, status: 'active' },
  })
}

async function main() {
  const developer = await prisma.role.findUnique({ where: { name: 'developer' } })
  const admin = await prisma.role.findUnique({ where: { name: 'admin' } })
  if (!developer) throw new Error('Run db:seed first')

  const legacy = collectLegacy()
  const byCanon = new Map<string, LegacyUser[]>()
  for (const u of legacy) {
    const c = canonEmail(u.email)
    if (!byCanon.has(c)) byCanon.set(c, [])
    byCanon.get(c)!.push(u)
  }

  // Prefer suporte Profile id as platform user id when present
  const idMap: Record<string, string> = {}
  const fallbackHash = await hashPassword('ChangeMeUnified123!')

  let ownerId =
    (
      await prisma.user.findFirst({
        where: { email: { in: ['admin@arara.local', 'portal-suporte@arara.local'] } },
      })
    )?.id || ''

  for (const [email, rows] of byCanon) {
    const suporte = rows.find((r) => r.legacyApp === 'portal-suporte')
    const best = suporte || rows[0]
    const platformId = suporte?.legacyId || `user_${Buffer.from(email).toString('hex').slice(0, 24)}`
    const hash =
      rows.map((r) => r.passwordHash).find((h) => typeof h === 'string' && h.startsWith('$2')) ||
      fallbackHash

    await prisma.user.upsert({
      where: { email },
      create: {
        id: platformId,
        email,
        name: best.name,
        passwordHash: hash,
        status: 'active',
      },
      update: {
        name: best.name,
        passwordHash: hash,
        status: 'active',
      },
    })

    // If email already existed with different id, resolve actual id
    const saved = await prisma.user.findUniqueOrThrow({ where: { email } })
    const uid = saved.id

    if (!ownerId) ownerId = uid

    const platformRole =
      best.role === 'admin' || best.role === 'master' ? admin || developer : developer
    if (CORE_EMAILS.has(email) || best.role === 'admin' || best.role === 'master' || best.role === 'developer') {
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: uid, roleId: platformRole!.id } },
        create: { userId: uid, roleId: platformRole!.id },
        update: {},
      })
    }

    for (const r of rows) {
      idMap[`${r.legacyApp}:${r.legacyId}`] = uid
      idMap[`${r.legacyApp}:email:${canonEmail(r.email)}`] = uid
    }
  }

  if (!ownerId) throw new Error('No owner user for apps')

  const apps = [
    { slug: 'portal-suporte', name: 'Portal Suporte' },
    { slug: 'portal-crm', name: 'Portal CRM' },
    { slug: 'time-management', name: 'Time Management / Horas' },
    { slug: 'portal-araratech', name: 'Portal AraraTech' },
  ]

  const appIds: Record<string, string> = {}
  for (const a of apps) {
    const app = await ensureApp(a.slug, a.name, ownerId)
    appIds[a.slug] = app.id
  }

  // Memberships from legacy rows
  for (const [email, rows] of byCanon) {
    const uid = idMap[`portal-suporte:email:${email}`] || idMap[`portal-crm:email:${email}`] || idMap[`time-management:email:${email}`]
    if (!uid) continue
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) continue

    for (const r of rows) {
      const appId = appIds[r.legacyApp]
      if (!appId) continue
      await prisma.appMembership.upsert({
        where: { userId_appId: { userId: user.id, appId } },
        create: { userId: user.id, appId, role: r.role },
        update: { role: r.role },
      })
    }

    // Core staff get membership on all apps
    if (CORE_EMAILS.has(email)) {
      for (const slug of Object.keys(appIds)) {
        await prisma.appMembership.upsert({
          where: { userId_appId: { userId: user.id, appId: appIds[slug] } },
          create: { userId: user.id, appId: appIds[slug], role: 'member' },
          update: {},
        })
      }
    }
  }

  const outPath = path.join(DATA, 'user-id-map.json')
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        aliases: EMAIL_ALIASES,
        coreEmails: [...CORE_EMAILS],
        map: idMap,
        users: [...byCanon.keys()],
        apps: appIds,
      },
      null,
      2,
    ),
  )
  console.log('✓ Unified', byCanon.size, 'users →', outPath)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
