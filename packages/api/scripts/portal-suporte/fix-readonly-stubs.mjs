/**
 * Rotas de consulta que eram stubs gerados (`model.create(body)`) e criavam um
 * registro-lixo no model Ticket a cada chamada.
 *
 * Sintoma: o wizard chama /tickets/suggest-priority e /kb/suggest enquanto o
 * atendente digita, então cada abertura de chamado gerava vários "tickets"
 * fantasma sem título — que depois consumiam números da sequência.
 *
 * Este script reimplementa as duas rotas como somente-leitura e remove o lixo.
 *
 * node scripts/portal-suporte/fix-readonly-stubs.mjs
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const APP_SLUG = 'portal-suporte'
const TICKET_MODEL = `${APP_SLUG}-Ticket`
const SEQ_MODEL = `${APP_SLUG}-TicketSequence`

/** Matriz impacto × urgência (sem escrita). */
const SUGGEST_PRIORITY_CODE = `async function handler(ctx) {
  var body = ctx.body || {};
  var impact = String(body.impact || body.impacto || "").toLowerCase();
  var urgency = String(body.urgency || body.urgencia || "").toLowerCase();
  if (!impact) return ctx.reply.send({ success: true, data: null });

  var SCALE = { low: 1, medium: 2, high: 3, critical: 4 };
  var i = SCALE[impact] || 0;
  var u = SCALE[urgency] || i;
  if (!i) return ctx.reply.send({ success: true, data: null });

  var score = i * u;
  var priority = score >= 12 ? "urgent" : score >= 6 ? "high" : score >= 3 ? "medium" : "low";

  // Contrato SLA do cliente pode elevar a prioridade sugerida.
  try {
    var companyId = body.companyId || body.company_id || null;
    var Company = ctx.models.Company;
    var Sla = ctx.models.SlaContract;
    if (companyId && Company && Sla) {
      var company = await Company.findById(String(companyId));
      var slaId = company && (company.sla_contract_id || company.slaContractId);
      if (slaId) {
        var sla = await Sla.findById(String(slaId));
        var tier = String((sla && sla.tier) || "").toLowerCase();
        if ((tier === "platinum" || tier === "gold") && priority === "medium") priority = "high";
        else if (tier === "platinum" && priority === "high") priority = "urgent";
      }
    }
  } catch (e) {}

  return ctx.reply.send({ success: true, data: { priority: priority, score: score } });
}
module.exports = { handler };`

/** Busca por palavras no KB (sem escrita). */
const KB_SUGGEST_CODE = `async function handler(ctx) {
  var Kb = ctx.models.KbArticle || ctx.models.KnowledgeArticle;
  var body = ctx.body || {};
  var query = String(body.query || body.q || "").trim();
  var topK = Number(body.topK || body.top_k || 5);
  if (!topK || topK < 1) topK = 5;
  if (topK > 20) topK = 20;
  if (!Kb || !query) return ctx.reply.send({ success: true, articles: [] });

  function norm(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\\u0300-\\u036f]/g, "");
  }
  var STOP = { de: 1, da: 1, do: 1, no: 1, na: 1, em: 1, um: 1, uma: 1, os: 1, as: 1, e: 1, o: 1, a: 1 };
  var terms = norm(query)
    .split(/[^a-z0-9]+/)
    .filter(function (t) {
      return t.length > 2 && !STOP[t];
    });
  if (!terms.length) return ctx.reply.send({ success: true, articles: [] });

  var rows = await Kb.findMany({});
  var scored = [];
  for (var i = 0; i < (rows || []).length; i++) {
    var r = rows[i];
    if (r.is_published === false || r.isPublished === false) continue;
    var title = norm(r.title);
    var text = norm(r.body || r.content || "");
    var tags = norm((r.tags || []).join(" "));
    var score = 0;
    for (var j = 0; j < terms.length; j++) {
      var t = terms[j];
      if (title.indexOf(t) >= 0) score += 5;
      if (tags.indexOf(t) >= 0) score += 3;
      if (text.indexOf(t) >= 0) score += 1;
    }
    if (!score) continue;
    var raw = String(r.body || r.content || "");
    scored.push({
      id: r.id,
      title: r.title || null,
      slug: r.slug || null,
      category: r.category || null,
      score: score,
      excerpt: raw.slice(0, 180),
    });
  }
  scored.sort(function (a, b) {
    return b.score - a.score;
  });
  return ctx.reply.send({ success: true, articles: scored.slice(0, topK) });
}
module.exports = { handler };`

async function replaceRoute(appId, method, path, controllerCode) {
  const route = await prisma.moduleRoute.findFirst({
    where: { module: { appId }, method, path },
  })
  if (!route) {
    console.log('  ! rota não encontrada', method, path)
    return
  }
  await prisma.moduleRoute.update({ where: { id: route.id }, data: { controllerCode } })
  console.log('  → reimplementada', method, path)
}

async function main() {
  const app = await prisma.app.findUnique({ where: { slug: APP_SLUG } })
  if (!app) throw new Error(`App ${APP_SLUG} not found`)

  console.log('→ Reimplementando rotas de consulta…')
  await replaceRoute(app.id, 'POST', '/tickets/suggest-priority', SUGGEST_PRIORITY_CODE)
  await replaceRoute(app.id, 'POST', '/kb/suggest', KB_SUGGEST_CODE)

  console.log('→ Removendo registros-lixo do model Ticket…')
  const junk = await prisma.modelRecord.findMany({
    where: { appId: app.id, modelName: TICKET_MODEL },
  })
  const junkIds = junk
    .filter((r) => {
      const data = r.data || {}
      const title = String(data.title || '').trim()
      if (title) return false
      const keys = Object.keys(data)
      // Assinaturas dos stubs: suggest-priority e kb/suggest.
      const isSuggestPriority = keys.includes('impact') || keys.includes('urgency')
      const isKbSuggest = keys.includes('query') || keys.includes('topK')
      return isSuggestPriority || isKbSuggest
    })
    .map((r) => r.id)

  if (junkIds.length) {
    const removed = await prisma.modelRecord.deleteMany({ where: { id: { in: junkIds } } })
    console.log(`  ${removed.count} registro(s) removido(s)`)
  } else {
    console.log('  nada a remover')
  }

  const remaining = await prisma.modelRecord.count({
    where: { appId: app.id, modelName: TICKET_MODEL },
  })
  console.log(`  ${remaining} tickets restantes`)

  // Junk consumiu números da sequência; devolver o contador ao fim dos tickets reais.
  const tickets = await prisma.modelRecord.findMany({
    where: { appId: app.id, modelName: TICKET_MODEL },
  })
  let blockMax = 0
  for (const t of tickets) {
    const tn = String((t.data || {}).ticket_number || '')
    if (!/^TCK\d{6}$/.test(tn)) continue
    const n = Number(tn.slice(3))
    if (n > 0 && n < 10000 && n > blockMax) blockMax = n
  }
  const next = blockMax + 1
  const seqRow = await prisma.modelRecord.findFirst({
    where: { appId: app.id, modelName: SEQ_MODEL, data: { path: ['key'], equals: 'ticket_number' } },
  })
  if (seqRow) {
    await prisma.modelRecord.update({
      where: { id: seqRow.id },
      data: {
        data: { ...(seqRow.data || {}), next, updated_at: new Date().toISOString() },
      },
    })
  }
  console.log(`→ contador ticket_number = ${next} (próximo TCK${String(next).padStart(6, '0')})`)
  console.log('✓ Stubs de consulta corrigidos')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
