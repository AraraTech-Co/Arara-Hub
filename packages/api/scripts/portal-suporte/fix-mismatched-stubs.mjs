/**
 * Neutraliza os stubs gerados que gravavam no model errado.
 *
 * Contexto: ao integrar o portal-suporte, rotas sem implementação receberam um
 * controller genérico `ctx.models.Ticket.create(body)`. Resultado: qualquer
 * chamada a /auth/login, /search/sync, /devops/:id/reboot etc. criava um "ticket"
 * com o corpo da requisição dentro — inclusive senha em texto no caso do login.
 * Foi essa classe de bug que gerou 28 tickets fantasma via /kb/suggest e
 * /tickets/suggest-priority (já corrigidos e reimplementados).
 *
 * Nenhuma das rotas tratadas aqui aparece em 7 dias de tráfego real de produção,
 * então responder 501 não quebra nada em uso — só troca corrupção silenciosa de
 * dados por um erro explícito.
 *
 * DRY_RUN=1 para apenas listar.
 * node scripts/portal-suporte/fix-mismatched-stubs.mjs
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const APP_SLUG = 'portal-suporte'
const DRY_RUN = process.env.DRY_RUN === '1'

/** Rotas confirmadas em uso nos logs de produção — nunca tocar. */
const IN_USE = new Set([
  'POST /tickets',
  'POST /tickets/check-duplicates',
  'POST /tickets/suggest-priority',
  'POST /tickets/:id/messages',
  'POST /tickets/:id/attachments',
  'POST /tickets/:id/co-assignees',
  'POST /tickets/:id/participants',
  'POST /kb/suggest',
  'POST /whatsapp/inbound',
  'POST /jobs/auto-close-tickets',
  'POST /admin/companies/:id/units',
  'POST /admin/companies/:id/units/:unitId/client-users',
])

function notImplemented(method, path, reason) {
  return `async function handler(ctx) {
  // Stub gerado na integração escrevia no model errado; ver
  // scripts/portal-suporte/fix-mismatched-stubs.mjs
  return ctx.reply.status(501).send({
    success: false,
    error: "Rota não implementada no Portal de Suporte",
    route: ${JSON.stringify(`${method} ${path}`)},
    detail: ${JSON.stringify(reason)},
  });
}
module.exports = { handler };`
}

/** POST /kb é um create real, só apontava para o model errado. */
const KB_CREATE = `async function handler(ctx) {
  var Kb = ctx.models.KbArticle;
  if (!Kb) return ctx.reply.status(500).send({ error: "Model KbArticle missing" });
  var body = ctx.body || {};
  var title = String(body.title || "").trim();
  if (!title) return ctx.reply.status(400).send({ error: "title is required" });

  function slugify(s) {
    return String(s)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\\u0300-\\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
  }
  var slug = String(body.slug || "").trim() || slugify(title);
  var existing = await Kb.findMany({});
  var taken = {};
  for (var i = 0; i < (existing || []).length; i++) taken[String(existing[i].slug || "")] = 1;
  if (taken[slug]) {
    var n = 2;
    while (taken[slug + "-" + n]) n += 1;
    slug = slug + "-" + n;
  }

  var now = new Date().toISOString();
  var row = await Kb.create({
    title: title,
    slug: slug,
    body: String(body.body || body.content || ""),
    category: body.category || null,
    tags: Array.isArray(body.tags) ? body.tags : [],
    is_published: body.isPublished === true || body.is_published === true,
    view_count: 0,
    author_id: (ctx.user && (ctx.user.id || ctx.user.userId)) || null,
    created_at: now,
    updated_at: now,
  });
  return ctx.reply.status(201).send({ success: true, data: row });
}
module.exports = { handler };`

async function main() {
  const app = await prisma.app.findUnique({ where: { slug: APP_SLUG } })
  if (!app) throw new Error(`App ${APP_SLUG} not found`)

  const routes = await prisma.moduleRoute.findMany({
    where: { module: { appId: app.id } },
  })

  const targets = []
  for (const route of routes) {
    const code = route.controllerCode || ''
    if (!code.includes('model.create(body)') || code.length >= 600) continue
    const key = `${route.method} ${route.path}`
    if (IN_USE.has(key)) continue

    const model = (code.match(/ctx\.models\.([A-Za-z]+)/) || [])[1] || ''
    const segments = route.path.split('/').filter((s) => s && !s.startsWith(':'))
    const related = segments.some((s) => {
      const a = s.toLowerCase().replace(/-/g, '').replace(/s$/, '')
      const b = model.toLowerCase().replace(/s$/, '')
      return a.length > 2 && (a.includes(b) || b.includes(a))
    })
    // Só mexe quando o model gravado não tem relação com o recurso da rota.
    if (related) continue
    targets.push({ route, model })
  }

  console.log(`→ ${targets.length} stub(s) gravando em model incompatível`)
  if (DRY_RUN) console.log('  (DRY_RUN — nada será gravado)')

  for (const { route, model } of targets) {
    const key = `${route.method} ${route.path}`
    const isKbCreate = key === 'POST /kb'
    const controllerCode = isKbCreate
      ? KB_CREATE
      : notImplemented(
          route.method,
          route.path,
          `Stub gerado criava registro em ${model}, sem relação com o recurso da rota.`,
        )
    console.log(`  ${isKbCreate ? 'implementada' : '501'}  ${key}  (criava ${model})`)
    if (!DRY_RUN) {
      await prisma.moduleRoute.update({ where: { id: route.id }, data: { controllerCode } })
    }
  }
  console.log(DRY_RUN ? '✓ Simulação concluída' : '✓ Stubs neutralizados')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
