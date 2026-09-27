/**
 * Enrich portal-crm ModelDefs from Prisma domain + seed funnel Stages + Profile.role
 * + ensure AppMembership for known CRM staff.
 *
 * Run (from platform/):
 *   npx tsx scripts/portal-crm/enrich-schemas-and-seed.ts
 *
 * Then deploy to prod (copy + docker exec) — see README.
 */
import 'dotenv/config'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaClient, type Prisma } from '@prisma/client'

const prisma = new PrismaClient()
const APP_SLUG = 'portal-crm'
const __dirname = path.dirname(fileURLToPath(import.meta.url))

const SCHEMAS: Array<{ name: string; schema: Record<string, unknown> }> = [
  {
    name: `${APP_SLUG}-Client`,
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        company: { type: ['string', 'null'] },
        email: { type: ['string', 'null'] },
        phone: { type: ['string', 'null'] },
        type: { type: 'string', enum: ['lead', 'cliente'] },
        ownerId: { type: ['string', 'null'] },
        source: { type: ['string', 'null'] },
        notes: { type: ['string', 'null'] },
        tags: { type: 'array', items: { type: 'string' } },
        createdAt: { type: 'string' },
        updatedAt: { type: 'string' },
      },
      required: ['id', 'name', 'type'],
    },
  },
  {
    name: `${APP_SLUG}-Deal`,
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        clientId: { type: 'string' },
        ownerId: { type: 'string' },
        stageId: { type: 'string' },
        value: { type: ['number', 'null'] },
        expectedClose: { type: ['string', 'null'] },
        closedAt: { type: ['string', 'null'] },
        status: { type: 'string', enum: ['open', 'won', 'lost'] },
        stageHistory: { type: 'array' },
        createdAt: { type: 'string' },
        updatedAt: { type: 'string' },
      },
      required: ['id', 'title', 'clientId', 'ownerId', 'stageId', 'status'],
    },
  },
  {
    name: `${APP_SLUG}-Stage`,
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        order: { type: 'number' },
        color: { type: 'string' },
        active: { type: 'boolean' },
        createdAt: { type: 'string' },
        updatedAt: { type: 'string' },
      },
      required: ['id', 'name', 'order'],
    },
  },
  {
    name: `${APP_SLUG}-Activity`,
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        type: {
          type: 'string',
          enum: ['call', 'visit', 'email', 'meeting', 'follow_up'],
        },
        dealId: { type: ['string', 'null'] },
        clientId: { type: ['string', 'null'] },
        ownerId: { type: 'string' },
        scheduledAt: { type: 'string' },
        doneAt: { type: ['string', 'null'] },
        notes: { type: ['string', 'null'] },
        reminderSent: { type: 'boolean' },
        createdAt: { type: 'string' },
        updatedAt: { type: 'string' },
      },
      required: ['id', 'type', 'ownerId', 'scheduledAt'],
    },
  },
  {
    name: `${APP_SLUG}-Goal`,
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        userId: { type: 'string' },
        periodMonth: { type: 'number' },
        periodYear: { type: 'number' },
        targetValue: { type: 'number' },
        targetDeals: { type: 'number' },
        createdAt: { type: 'string' },
        updatedAt: { type: 'string' },
      },
      required: ['id', 'userId', 'periodMonth', 'periodYear'],
    },
  },
  {
    name: `${APP_SLUG}-Team`,
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        managerId: { type: ['string', 'null'] },
        createdAt: { type: 'string' },
        updatedAt: { type: 'string' },
      },
      required: ['id', 'name'],
    },
  },
  {
    name: `${APP_SLUG}-Profile`,
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        email: { type: ['string', 'null'] },
        fullName: { type: ['string', 'null'] },
        role: { type: 'string', enum: ['vendedor', 'gerente', 'admin'] },
        position: { type: ['string', 'null'] },
        phone: { type: ['string', 'null'] },
        avatarUrl: { type: ['string', 'null'] },
        teamId: { type: ['string', 'null'] },
        expiresAt: { type: ['string', 'null'] },
        createdAt: { type: 'string' },
        updatedAt: { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    name: `${APP_SLUG}-AppConfig`,
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        key: { type: 'string' },
        value: { type: 'string' },
      },
      required: ['id', 'key', 'value'],
    },
  },
]

const STAGES = [
  { id: 'stage-1', name: 'Prospecção', order: 1, color: '#6366f1' },
  { id: 'stage-2', name: 'Qualificação', order: 2, color: '#8b5cf6' },
  { id: 'stage-3', name: 'Proposta', order: 3, color: '#f59e0b' },
  { id: 'stage-4', name: 'Negociação', order: 4, color: '#f97316' },
  { id: 'stage-5', name: 'Fechamento', order: 5, color: '#22c55e' },
]

/** Map AppMembership.role → CRM Profile.role */
function crmRoleFromMembership(role: string): 'vendedor' | 'gerente' | 'admin' {
  const r = role.toLowerCase()
  if (r === 'admin' || r === 'owner') return 'admin'
  if (r === 'gerente' || r === 'manager') return 'gerente'
  if (r === 'vendedor') return 'vendedor'
  return 'vendedor'
}

const EXTRA_MEMBER_EMAILS: string[] = (() => {
  try {
    const p = path.resolve(__dirname, '../../data/canonical-emails.json')
    const raw = JSON.parse(readFileSync(p, 'utf8')) as { coreStaff?: string[] }
    return raw.coreStaff || []
  } catch {
    return []
  }
})()

async function main() {
  const app = await prisma.app.findUnique({ where: { slug: APP_SLUG } })
  if (!app) throw new Error(`App ${APP_SLUG} not found`)

  console.log('→ ModelDefs')
  for (const def of SCHEMAS) {
    await prisma.modelDef.upsert({
      where: { appId_name: { appId: app.id, name: def.name } },
      create: {
        appId: app.id,
        name: def.name,
        schema: def.schema as Prisma.InputJsonValue,
        version: 1,
      },
      update: { schema: def.schema as Prisma.InputJsonValue },
    })
    console.log('  MODEL', def.name)
  }

  console.log('→ Seed Stages')
  const stageModel = `${APP_SLUG}-Stage`
  const now = new Date().toISOString()
  for (const s of STAGES) {
    const existing = await prisma.modelRecord.findFirst({
      where: { appId: app.id, modelName: stageModel, id: s.id },
    })
    const data = { ...s, active: true, createdAt: now, updatedAt: now }
    if (existing) {
      await prisma.modelRecord.update({
        where: { id: existing.id },
        data: { data: data as Prisma.InputJsonValue },
      })
    } else {
      await prisma.modelRecord.create({
        data: {
          id: s.id,
          appId: app.id,
          modelName: stageModel,
          data: data as Prisma.InputJsonValue,
        },
      })
    }
    console.log('  STAGE', s.name)
  }

  console.log('→ Seed Team')
  const teamModel = `${APP_SLUG}-Team`
  const teamId = 'team-1'
  const teamExisting = await prisma.modelRecord.findFirst({
    where: { appId: app.id, modelName: teamModel, id: teamId },
  })
  if (!teamExisting) {
    await prisma.modelRecord.create({
      data: {
        id: teamId,
        appId: app.id,
        modelName: teamModel,
        data: {
          id: teamId,
          name: 'Equipe Comercial',
          managerId: null,
          createdAt: now,
          updatedAt: now,
        } as Prisma.InputJsonValue,
      },
    })
    console.log('  TEAM Equipe Comercial')
  }

  console.log('→ AppMembership + Profile.role')
  for (const email of EXTRA_MEMBER_EMAILS) {
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      console.warn('  skip membership — user missing', email)
      continue
    }
    await prisma.appMembership.upsert({
      where: { userId_appId: { userId: user.id, appId: app.id } },
      create: { userId: user.id, appId: app.id, role: email.includes('leo') || email.includes('andre') ? 'admin' : 'member' },
      update: {},
    })
  }

  const memberships = await prisma.appMembership.findMany({
    where: { appId: app.id },
    include: { user: true },
  })
  const profileModel = `${APP_SLUG}-Profile`
  for (const m of memberships) {
    const role = crmRoleFromMembership(m.role)
    // Storage PK is app-scoped (User.id is shared across apps — cannot reuse as ModelRecord.id).
    const storageId = `crm-profile-${m.userId}`
    const existing = await prisma.modelRecord.findFirst({
      where: {
        appId: app.id,
        modelName: profileModel,
        OR: [{ id: storageId }, { data: { path: ['id'], equals: m.userId } }],
      },
    })
    const base = {
      id: m.userId,
      email: m.user.email,
      fullName: m.user.name || m.user.email.split('@')[0],
      role,
      teamId: 'team-1',
      updatedAt: now,
    }
    if (existing) {
      const prev = (existing.data || {}) as Record<string, unknown>
      await prisma.modelRecord.update({
        where: { id: existing.id },
        data: {
          data: { ...prev, ...base, createdAt: prev.createdAt || now } as Prisma.InputJsonValue,
        },
      })
    } else {
      await prisma.modelRecord.create({
        data: {
          id: storageId,
          appId: app.id,
          modelName: profileModel,
          data: {
            ...base,
            createdAt: now,
            phone: null,
            position: null,
            avatarUrl: null,
            expiresAt: null,
          } as Prisma.InputJsonValue,
        },
      })
    }
    console.log('  PROFILE', m.user.email, role)
  }

  console.log('OK portal-crm schemas + seed')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
