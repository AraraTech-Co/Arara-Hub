/**
 * Conserta a numeração sequencial de tickets (doc §4 / RN07).
 *
 * Problema: o allocator derivava `next` do MAIOR ticket_number existente. Números
 * legados gerados por timestamp (ex. TCK946397, TCK082066) empurraram o contador
 * para fora da sequência limpa, então novos tickets saíam com número "aleatório".
 *
 * Correção:
 *  1. Allocator passa a tratar TicketSequence.ticket_number como fonte de verdade;
 *     o scan de tickets é só fallback quando o contador não existe.
 *  2. Contador é reposicionado no fim do bloco contíguo TCK000001..N.
 *  3. Tickets sem ticket_number (e os informados em REASSIGN_IDS) entram no bloco.
 *  4. Com RENUMBER_LEGACY=1, renumera todos os números fora do bloco contíguo.
 *
 * node scripts/portal-suporte/fix-ticket-sequence.mjs
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const APP_SLUG = 'portal-suporte'
const TICKET_MODEL = `${APP_SLUG}-Ticket`
const SEQ_MODEL = `${APP_SLUG}-TicketSequence`
const PREFIX = 'TCK'
const PAD = 6
const RENUMBER_LEGACY = process.env.RENUMBER_LEGACY === '1'
/**
 * Numbers at/above this are timestamp-derived junk (TCK082066, TCK946397), not
 * part of the real sequence — real volume is in the hundreds. Keeps the counter
 * anchored to the clean block even though that block has gaps (deleted tickets).
 */
const SEQ_CEILING = Number(process.env.SEQ_CEILING || 10000)
/** Records to pull back into the clean block regardless of their current number. */
const REASSIGN_IDS = new Set(
  (process.env.REASSIGN_IDS || '')
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean),
)

function fmt(n) {
  return PREFIX + String(n).padStart(PAD, '0')
}

function numericValue(ticketNumber) {
  const tn = String(ticketNumber || '')
  if (!/^TCK\d{6}$/.test(tn)) return null
  const n = Number(tn.slice(PREFIX.length))
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * Allocator that trusts the counter row. Fallback scan ignores gaps so a stray
 * timestamp-derived number can never push the sequence into the tens of thousands.
 */
const ALLOC_HELPER = `
async function allocateTicketNumber(Ticket, Seq) {
  var PREFIX = "TCK";
  var PAD = 6;
  // Values at/above this are legacy timestamp numbers, never part of the sequence.
  var SEQ_CEILING = 10000;
  var tickets = await Ticket.findMany({});
  var used = {};
  var blockMax = 0;
  for (var j = 0; j < (tickets || []).length; j++) {
    var tn = String(tickets[j].ticket_number || tickets[j].ticketNumber || "");
    used[tn] = 1;
    if (/^TCK[0-9]{6}$/.test(tn)) {
      var n = parseInt(tn.slice(PREFIX.length), 10);
      if (!isNaN(n) && n > 0 && n < SEQ_CEILING && n > blockMax) blockMax = n;
    }
  }
  var next = blockMax + 1;
  if (Seq) {
    try {
      var rows = await Seq.findMany({});
      for (var i = 0; i < (rows || []).length; i++) {
        if (String(rows[i].key || "") === "ticket_number") {
          var sn = Number(rows[i].next || 0);
          // Counter wins whenever it is inside the clean range.
          if (sn > 0 && sn < SEQ_CEILING) next = sn;
        }
      }
    } catch (e) {}
  }
  for (var attempt = 0; attempt < 200; attempt++) {
    var candidate = next + attempt;
    var num = PREFIX + String(candidate).padStart(PAD, "0");
    if (used[num]) continue;
    // Atomic claim via unique ModelRecord id — second writer fails
    if (Seq) {
      try {
        await Seq.create({
          id: "tnclaim_" + num,
          key: "claim:" + num,
          next: candidate + 1,
          updated_at: new Date().toISOString(),
        });
      } catch (e) {
        continue;
      }
      try {
        var seqRows = await Seq.findMany({});
        var seq = null;
        for (var k = 0; k < (seqRows || []).length; k++) {
          if (String(seqRows[k].key || "") === "ticket_number") { seq = seqRows[k]; break; }
        }
        if (seq) {
          var cur = Number(seq.next || 0);
          if (candidate + 1 > cur || cur >= SEQ_CEILING) {
            await Seq.update(seq.id, { next: candidate + 1, updated_at: new Date().toISOString() });
          }
        } else {
          await Seq.create({
            id: "ticket_number_seq",
            key: "ticket_number",
            next: candidate + 1,
            updated_at: new Date().toISOString(),
          });
        }
      } catch (e) {}
    }
    return num;
  }
  throw new Error("Não foi possível alocar ticket_number");
}
`.trim()

async function patchAllocatorRoutes(appId) {
  const routes = await prisma.moduleRoute.findMany({
    where: { module: { appId }, controllerCode: { contains: 'async function allocateTicketNumber' } },
  })
  let patchedCount = 0
  for (const route of routes) {
    const code = route.controllerCode || ''
    const start = code.indexOf('async function allocateTicketNumber')
    if (start < 0) continue
    const marker = 'throw new Error("Não foi possível alocar ticket_number");'
    const markerAt = code.indexOf(marker, start)
    if (markerAt < 0) {
      console.log('  ! skip (marker not found)', route.method, route.path)
      continue
    }
    const endBrace = code.indexOf('}', code.indexOf('}', markerAt) + 1)
    if (endBrace < 0) {
      console.log('  ! skip (end not found)', route.method, route.path)
      continue
    }
    const updated = code.slice(0, start) + ALLOC_HELPER + code.slice(endBrace + 1)
    if (!updated.includes('var SEQ_CEILING = 10000;')) {
      console.log('  ! skip (patch did not apply)', route.method, route.path)
      continue
    }
    await prisma.moduleRoute.update({ where: { id: route.id }, data: { controllerCode: updated } })
    console.log('  → allocator patched', route.method, route.path)
    patchedCount += 1
  }
  return patchedCount
}

async function main() {
  const app = await prisma.app.findUnique({ where: { slug: APP_SLUG } })
  if (!app) throw new Error(`App ${APP_SLUG} not found`)

  console.log('→ Patching allocator in controllers…')
  console.log(`  ${await patchAllocatorRoutes(app.id)} rota(s) atualizada(s)`)

  const tickets = await prisma.modelRecord.findMany({
    where: { appId: app.id, modelName: TICKET_MODEL },
    orderBy: { createdAt: 'asc' },
  })
  console.log(`→ ${tickets.length} tickets`)

  const present = new Set()
  const used = new Set()
  const toAssign = []
  const legacy = []
  for (const record of tickets) {
    const data = record.data || {}
    const tn = String(data.ticket_number || data.ticketNumber || '')
    if (!tn || REASSIGN_IDS.has(record.id)) {
      toAssign.push({ record, previous: tn || null })
      continue
    }
    used.add(tn)
    const value = numericValue(tn)
    if (value != null) present.add(value)
  }

  // Clean block = every value below the ceiling; gaps are fine, we take the max.
  let blockMax = 0
  for (const value of present) {
    if (value < SEQ_CEILING) {
      if (value > blockMax) blockMax = value
    } else {
      legacy.push(fmt(value))
    }
  }
  console.log(
    `  bloco limpo até ${fmt(blockMax)} · a numerar: ${toAssign.length} · fora do bloco: ${legacy.length}`,
  )

  let next = blockMax + 1
  function claim() {
    while (used.has(fmt(next)) || present.has(next)) next += 1
    const num = fmt(next)
    used.add(num)
    present.add(next)
    next += 1
    return num
  }

  for (const { record, previous } of toAssign) {
    const num = claim()
    const data = { ...(record.data || {}), ticket_number: num }
    if (previous) data.legacy_ticket_number = previous
    await prisma.modelRecord.update({ where: { id: record.id }, data: { data } })
    console.log(`  + ${num}${previous ? ` (era ${previous})` : ' (era sem número)'}`)
  }

  if (RENUMBER_LEGACY && legacy.length) {
    const legacySet = new Set(legacy)
    for (const record of tickets) {
      const data = record.data || {}
      const tn = String(data.ticket_number || data.ticketNumber || '')
      if (!legacySet.has(tn)) continue
      const num = claim()
      await prisma.modelRecord.update({
        where: { id: record.id },
        data: { data: { ...data, ticket_number: num, legacy_ticket_number: tn } },
      })
      console.log(`  ~ ${tn} → ${num}`)
    }
  } else if (legacy.length) {
    console.log(`  (mantidos ${legacy.length} números legados; RENUMBER_LEGACY=1 renumera)`)
  }

  const seqRow = await prisma.modelRecord.findFirst({
    where: { appId: app.id, modelName: SEQ_MODEL, data: { path: ['key'], equals: 'ticket_number' } },
  })
  const seqData = { key: 'ticket_number', next, updated_at: new Date().toISOString() }
  if (seqRow) {
    await prisma.modelRecord.update({
      where: { id: seqRow.id },
      data: { data: { ...(seqRow.data || {}), ...seqData } },
    })
  } else {
    await prisma.modelRecord.create({
      data: { id: 'ticket_number_seq', appId: app.id, modelName: SEQ_MODEL, data: seqData },
    })
  }
  console.log(`→ contador ticket_number = ${next} (próximo ${fmt(next)})`)
  console.log('✓ Numeração sequencial corrigida')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
