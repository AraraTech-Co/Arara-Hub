/**
 * Repara o POST /tickets: o patch do allocator removeu por engano as declarações
 * iniciais do handler (model/Company/Seq/Log/body), deixando `});` solto.
 *
 * node scripts/portal-suporte/repair-tickets-controller.mjs
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const APP_SLUG = 'portal-suporte'

const BROKEN = `throw new Error("Não foi possível alocar ticket_number");
});
  const now = new Date().toISOString();`

const FIXED = `throw new Error("Não foi possível alocar ticket_number");
}
  const model = ctx.models.Ticket;
  const Company = ctx.models.Company;
  const Seq = ctx.models.TicketSequence;
  const Log = ctx.models.ActivityLog;
  if (!model) return ctx.reply.status(500).send({ error: "Model Ticket missing" });
  const body = Object.assign({}, ctx.body || {});
  const now = new Date().toISOString();`

async function main() {
  const app = await prisma.app.findUnique({ where: { slug: APP_SLUG } })
  if (!app) throw new Error(`App ${APP_SLUG} not found`)

  const route = await prisma.moduleRoute.findFirst({
    where: { module: { appId: app.id }, method: 'POST', path: '/tickets' },
  })
  if (!route) throw new Error('POST /tickets not found')

  const code = route.controllerCode || ''
  if (!code.includes(BROKEN)) {
    if (code.includes('const model = ctx.models.Ticket;')) {
      console.log('✓ Controller já está íntegro')
      return
    }
    throw new Error('Padrão quebrado não encontrado — inspecionar manualmente')
  }

  const updated = code.replace(BROKEN, FIXED)
  for (const needed of [
    'const model = ctx.models.Ticket;',
    'const Seq = ctx.models.TicketSequence;',
    'const body = Object.assign({}, ctx.body || {});',
    'var SEQ_CEILING = 10000;',
  ]) {
    if (!updated.includes(needed)) throw new Error(`Reparo incompleto: falta ${needed}`)
  }
  // Fail before writing if the controller is not parseable.
  new Function('ctx', `return (async () => { ${updated.replace('module.exports = { handler };', '')} })`)

  await prisma.moduleRoute.update({ where: { id: route.id }, data: { controllerCode: updated } })
  console.log('✓ POST /tickets reparado')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
