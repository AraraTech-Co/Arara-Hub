/**
 * Repair tickets created by generic CRUD stubs / check-duplicates spam.
 *
 * - Draft spam (title only, no description): delete
 * - Real tickets missing status/created_at/source: backfill
 *
 * Usage: node scripts/portal-suporte/backfill-incomplete-tickets.mjs
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const APP_SLUG = 'portal-suporte'
const MODEL = 'portal-suporte-Ticket'

function isDraftSpam(data) {
  const title = String(data.title || '').trim()
  const desc = String(data.description || '').trim()
  const status = data.status
  const created = data.created_at || data.createdAt
  // Keystroke spam from broken check-duplicates stub
  if (!title) return true
  if (!desc && !status && !created) return true
  // Very short title-only rows without description
  if (!desc && title.length < 12 && !status) return true
  return false
}

async function main() {
  const app = await prisma.app.findUnique({ where: { slug: APP_SLUG } })
  if (!app) throw new Error(`App ${APP_SLUG} not found`)

  const rows = await prisma.modelRecord.findMany({
    where: { appId: app.id, modelName: MODEL },
    orderBy: { createdAt: 'desc' },
  })

  let deleted = 0
  let patched = 0

  for (const row of rows) {
    const data = { ...(row.data || {}) }

    if (isDraftSpam(data)) {
      await prisma.modelRecord.delete({ where: { id: row.id } })
      deleted++
      continue
    }

    let changed = false
    if (!data.status) {
      data.status = 'novos_chamados'
      changed = true
    }
    if (!data.created_at && !data.createdAt) {
      data.created_at = row.createdAt.toISOString()
      changed = true
    }
    if (!data.updated_at && !data.updatedAt) {
      data.updated_at = row.updatedAt.toISOString()
      changed = true
    }
    if (!data.source || data.source === 'internal') {
      data.source = 'portal'
      changed = true
    }
    if (!data.priority) {
      data.priority = 'medium'
      changed = true
    }
    if (data.position == null) {
      data.position = 0
      changed = true
    }
    if (!data.ticket_number) {
      data.ticket_number = 'TCK' + String(row.createdAt.getTime()).slice(-6)
      changed = true
    }

    if (changed) {
      await prisma.modelRecord.update({
        where: { id: row.id },
        data: { data },
      })
      patched++
    }
  }

  console.log(`✓ tickets scanned=${rows.length} deleted_drafts=${deleted} patched=${patched}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
