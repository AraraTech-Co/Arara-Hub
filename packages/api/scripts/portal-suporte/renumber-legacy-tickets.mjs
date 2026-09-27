/**
 * Renumera os tickets com número legado (gerado por timestamp, ex. TCK946397,
 * TCK082066) para dentro do bloco sequencial, em ordem de criação.
 *
 * O número anterior fica em `legacy_ticket_number` para rastreabilidade.
 * Não mexe em controllers — o allocator já está correto em produção.
 *
 * DRY_RUN=1 para apenas listar o que seria feito.
 * node scripts/portal-suporte/renumber-legacy-tickets.mjs
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const APP_SLUG = 'portal-suporte'
const TICKET_MODEL = `${APP_SLUG}-Ticket`
const SEQ_MODEL = `${APP_SLUG}-TicketSequence`
const PREFIX = 'TCK'
const PAD = 6
/** Acima disto o número é timestamp legado, não parte da sequência real. */
const SEQ_CEILING = 10000
const DRY_RUN = process.env.DRY_RUN === '1'

function fmt(n) {
  return PREFIX + String(n).padStart(PAD, '0')
}

async function main() {
  const app = await prisma.app.findUnique({ where: { slug: APP_SLUG } })
  if (!app) throw new Error(`App ${APP_SLUG} not found`)

  const tickets = await prisma.modelRecord.findMany({
    where: { appId: app.id, modelName: TICKET_MODEL },
    orderBy: { createdAt: 'asc' },
  })

  const used = new Set()
  let blockMax = 0
  const legacy = []
  const missing = []
  for (const record of tickets) {
    const tn = String((record.data || {}).ticket_number || '')
    if (!tn) {
      missing.push(record)
      continue
    }
    used.add(tn)
    const inBlock = /^TCK\d{6}$/.test(tn) && Number(tn.slice(PREFIX.length)) < SEQ_CEILING
    if (inBlock) {
      const n = Number(tn.slice(PREFIX.length))
      if (n > blockMax) blockMax = n
    } else {
      legacy.push({ record, ticketNumber: tn })
    }
  }

  console.log(`→ ${tickets.length} tickets · bloco atual até ${fmt(blockMax)}`)
  console.log(`  a renumerar: ${legacy.length} · sem número: ${missing.length}`)
  if (DRY_RUN) console.log('  (DRY_RUN — nada será gravado)')

  let next = blockMax + 1
  function claim() {
    while (used.has(fmt(next))) next += 1
    const num = fmt(next)
    used.add(num)
    next += 1
    return num
  }

  for (const record of missing) {
    const num = claim()
    console.log(`  + ${num} (sem número) ${record.id}`)
    if (!DRY_RUN) {
      await prisma.modelRecord.update({
        where: { id: record.id },
        data: { data: { ...(record.data || {}), ticket_number: num } },
      })
    }
  }

  for (const { record, ticketNumber } of legacy) {
    const num = claim()
    const title = String((record.data || {}).title || '').slice(0, 45)
    console.log(`  ~ ${ticketNumber} → ${num}  ${title}`)
    if (!DRY_RUN) {
      await prisma.modelRecord.update({
        where: { id: record.id },
        data: {
          data: {
            ...(record.data || {}),
            ticket_number: num,
            legacy_ticket_number: ticketNumber,
          },
        },
      })
    }
  }

  if (!DRY_RUN) {
    const seqRow = await prisma.modelRecord.findFirst({
      where: {
        appId: app.id,
        modelName: SEQ_MODEL,
        data: { path: ['key'], equals: 'ticket_number' },
      },
    })
    if (seqRow) {
      await prisma.modelRecord.update({
        where: { id: seqRow.id },
        data: { data: { ...(seqRow.data || {}), next, updated_at: new Date().toISOString() } },
      })
    }
  }
  console.log(`→ contador ticket_number = ${next} (próximo ${fmt(next)})`)
  console.log(DRY_RUN ? '✓ Simulação concluída' : '✓ Renumeração concluída')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
