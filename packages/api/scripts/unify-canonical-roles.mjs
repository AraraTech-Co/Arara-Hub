/**
 * Unify canonical person roles across Platform + app profiles/memberships.
 *
 * Roles: user | support | developer | admin (multi-role via UserRole)
 *
 * Requires local (gitignored) data/role-assignments.json:
 *   { "email@example.com": ["admin", "developer"], ... }
 *
 * Usage:
 *   node scripts/unify-canonical-roles.mjs
 *
 * Idempotent.
 */
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const assignmentsPath = path.resolve(__dirname, '../data/role-assignments.json')

if (!existsSync(assignmentsPath)) {
  console.error(
    `Missing ${assignmentsPath} (gitignored). Create it locally with email → role[] map.`,
  )
  process.exit(1)
}

/** email → platform role names to assign (replaces existing UserRoles) */
const ASSIGNMENTS = JSON.parse(readFileSync(assignmentsPath, 'utf8'))

/** Primary membership role per email when they have a membership (highest of their roles). */
function primaryRole(roles) {
  const rank = { user: 10, support: 20, developer: 30, admin: 40 }
  let best = 'user'
  for (const r of roles) {
    if ((rank[r] || 0) > (rank[best] || 0)) best = r
  }
  return best
}

const ROLE_ALIASES = {
  master: 'admin',
  member: 'support',
  agent: 'support',
  agente: 'support',
  vendedor: 'user',
  gerente: 'admin',
  manager: 'admin',
}

function normalizeStoredRole(raw) {
  if (!raw) return null
  const k = String(raw).toLowerCase()
  if (['user', 'support', 'developer', 'admin'].includes(k)) return k
  return ROLE_ALIASES[k] || null
}

async function ensureRoles() {
  const names = ['user', 'support', 'developer', 'admin']
  const map = {}
  for (const name of names) {
    const role = await prisma.role.upsert({
      where: { name },
      create: { name, description: `Role ${name}` },
      update: {},
    })
    map[name] = role.id
  }
  return map
}

async function setUserRoles(userId, roleNames, roleIds) {
  await prisma.userRole.deleteMany({ where: { userId } })
  for (const name of roleNames) {
    const roleId = roleIds[name]
    if (!roleId) continue
    await prisma.userRole.create({ data: { userId, roleId } })
  }
}

async function patchModelRecords(appSlug, modelNames, mutate) {
  const app = await prisma.app.findUnique({ where: { slug: appSlug } })
  if (!app) {
    console.log(`  skip app ${appSlug} (not found)`)
    return 0
  }
  let updated = 0
  for (const modelName of modelNames) {
    const rows = await prisma.modelRecord.findMany({
      where: { appId: app.id, modelName },
    })
    for (const row of rows) {
      const data = { ...(row.data || {}) }
      const next = mutate(data, row)
      if (!next) continue
      await prisma.modelRecord.update({
        where: { id: row.id },
        data: { data: next },
      })
      updated++
    }
  }
  return updated
}

async function main() {
  console.log('→ Ensuring canonical roles…')
  const roleIds = await ensureRoles()

  console.log('→ Assigning UserRoles…')
  for (const [email, roles] of Object.entries(ASSIGNMENTS)) {
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      console.log(`  ! missing user ${email}`)
      continue
    }
    await setUserRoles(user.id, roles, roleIds)
    console.log(`  ✓ ${email} → ${roles.join(',')}`)

    const primary = primaryRole(roles)
    const memberships = await prisma.appMembership.findMany({ where: { userId: user.id } })
    for (const m of memberships) {
      if (m.role === primary) continue
      await prisma.appMembership.update({
        where: { id: m.id },
        data: { role: primary },
      })
      console.log(`    membership ${m.appId.slice(0, 8)}… → ${primary}`)
    }
  }

  // Normalize leftover memberships for users not in ASSIGNMENTS
  console.log('→ Normalizing other memberships…')
  const allMemberships = await prisma.appMembership.findMany({ include: { user: true } })
  for (const m of allMemberships) {
    const n = normalizeStoredRole(m.role)
    if (n && n !== m.role) {
      await prisma.appMembership.update({ where: { id: m.id }, data: { role: n } })
      console.log(`  membership ${m.user.email} ${m.role} → ${n}`)
    } else if (!n && m.role) {
      // unknown → support if looks staffy else user
      const fallback = ['member', 'Member'].includes(m.role) ? 'support' : 'user'
      await prisma.appMembership.update({ where: { id: m.id }, data: { role: fallback } })
      console.log(`  membership ${m.user.email} ${m.role} → ${fallback}`)
    }
  }

  console.log('→ portal-suporte Profile roles…')
  const psUpdated = await patchModelRecords('portal-suporte', ['portal-suporte-Profile', 'Profile'], (data) => {
    const email = String(data.email || '').toLowerCase()
    const assigned = ASSIGNMENTS[email]
    let nextRole = assigned ? primaryRole(assigned) : normalizeStoredRole(data.role)
    if (!nextRole) return null
    if (data.role === nextRole) return null
    return { ...data, role: nextRole }
  })
  console.log(`  updated ${psUpdated} profiles`)

  console.log('→ portal-crm Profile roles…')
  const crmUpdated = await patchModelRecords('portal-crm', ['portal-crm-Profile', 'Profile'], (data) => {
    const email = String(data.email || '').toLowerCase()
    const assigned = ASSIGNMENTS[email]
    let nextRole = assigned ? primaryRole(assigned) : normalizeStoredRole(data.role)
    if (!nextRole) return null
    if (data.role === nextRole) return null
    return { ...data, role: nextRole }
  })
  console.log(`  updated ${crmUpdated} profiles`)

  console.log('→ time-management StaffProfile roles…')
  const tmUpdated = await patchModelRecords(
    'time-management',
    ['time-management-StaffProfile', 'StaffProfile'],
    (data) => {
      const email = String(data.email || '').toLowerCase()
      const assigned = ASSIGNMENTS[email]
      let nextRole = assigned ? primaryRole(assigned) : normalizeStoredRole(data.role)
      // Legacy manager_role → admin if not already higher
      if ((data.manager_role || data.managerRole) && (!nextRole || nextRole === 'user' || nextRole === 'support')) {
        nextRole = 'admin'
      }
      if (!nextRole) return null
      const changed = data.role !== nextRole || data.manager_role === true || data.managerRole === true
      if (!changed) return null
      return {
        ...data,
        role: nextRole,
        manager_role: false,
        managerRole: false,
      }
    },
  )
  console.log(`  updated ${tmUpdated} staff profiles`)

  console.log('✓ Canonical roles unified')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
