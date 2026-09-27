/**
 * Sync distinct ticket company_name values into portal-suporte-Company catalog.
 * Skips names that already match (normalized) an existing company.
 * Rewrites tickets to canonical company_name + company_id.
 *
 * Run inside platform container:
 *   npx tsx scripts/portal-suporte/sync-companies-from-tickets.ts
 */
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const APP_SLUG = 'portal-suporte'
const MODEL = 'portal-suporte-Company'
const TICKET = 'portal-suporte-Ticket'

function norm(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function pickCanonical(names: string[]): string {
  const scored = [...names].sort((a, b) => {
    const aNice = /[a-zà-ú]/.test(a) ? 1 : 0
    const bNice = /[a-zà-ú]/.test(b) ? 1 : 0
    if (aNice !== bNice) return bNice - aNice
    return b.length - a.length
  })
  return scored[0]
}

async function main() {
  const app = await prisma.app.findUnique({ where: { slug: APP_SLUG } })
  if (!app) throw new Error('app missing')

  const companies = await prisma.modelRecord.findMany({
    where: { appId: app.id, modelName: MODEL },
  })
  const byNorm = new Map<string, { id: string; name: string }>()
  for (const c of companies) {
    const data = c.data as Record<string, unknown>
    const name = String(data.name || '')
    if (!name) continue
    byNorm.set(norm(name), { id: c.id, name })
  }

  const tickets = await prisma.modelRecord.findMany({
    where: { appId: app.id, modelName: TICKET },
  })

  const groups = new Map<string, string[]>()
  for (const t of tickets) {
    const data = t.data as Record<string, unknown>
    const raw = String(data.company_name || data.companyName || '').trim()
    if (!raw) continue
    const key = norm(raw)
    if (!key) continue
    const list = groups.get(key) || []
    if (!list.includes(raw)) list.push(raw)
    groups.set(key, list)
  }

  let created = 0
  let linked = 0
  const now = new Date().toISOString()

  for (const [key, variants] of groups) {
    let entry = byNorm.get(key)
    if (!entry) {
      const canonical = pickCanonical(variants)
      const id = randomUUID()
      await prisma.modelRecord.create({
        data: {
          id,
          appId: app.id,
          modelName: MODEL,
          data: {
            id,
            name: canonical,
            trade_name: null,
            cnpj: null,
            active: true,
            created_at: now,
            updated_at: now,
            synced_from_tickets: true,
            name_aliases: variants.filter((v) => v !== canonical),
          },
        },
      })
      entry = { id, name: canonical }
      byNorm.set(key, entry)
      created++
    }

    for (const t of tickets) {
      const data = t.data as Record<string, unknown>
      const raw = String(data.company_name || data.companyName || '').trim()
      if (norm(raw) !== key) continue
      if (data.company_name === entry.name && String(data.company_id || '') === entry.id) continue
      await prisma.modelRecord.update({
        where: { id: t.id },
        data: {
          data: {
            ...data,
            company_name: entry.name,
            company_id: entry.id,
          },
        },
      })
      linked++
    }
  }

  console.log({
    distinctNames: groups.size,
    catalogBefore: companies.length,
    created,
    ticketsLinked: linked,
    catalogAfter: companies.length + created,
  })
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
