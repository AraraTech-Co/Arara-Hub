import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import bcrypt from "bcryptjs"
import * as dotenv from "dotenv"
dotenv.config()

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter } as any)

async function main() {
  const hash = (p: string) => bcrypt.hash(p, 12)

  // Etapas do funil
  const stages = await Promise.all([
    prisma.stage.upsert({ where: { id: "stage-1" }, update: {}, create: { id: "stage-1", name: "Prospecção", order: 1, color: "#6366f1" } }),
    prisma.stage.upsert({ where: { id: "stage-2" }, update: {}, create: { id: "stage-2", name: "Qualificação", order: 2, color: "#8b5cf6" } }),
    prisma.stage.upsert({ where: { id: "stage-3" }, update: {}, create: { id: "stage-3", name: "Proposta", order: 3, color: "#f59e0b" } }),
    prisma.stage.upsert({ where: { id: "stage-4" }, update: {}, create: { id: "stage-4", name: "Negociação", order: 4, color: "#f97316" } }),
    prisma.stage.upsert({ where: { id: "stage-5" }, update: {}, create: { id: "stage-5", name: "Fechamento", order: 5, color: "#22c55e" } }),
  ])

  // Admin
  const admin = await prisma.user.upsert({
    where: { email: "admin@arara-tech.com" },
    update: {},
    create: {
      id: "user-admin",
      name: "Admin",
      email: "admin@arara-tech.com",
      passwordHash: await hash("admin123"),
      role: "admin",
    },
  })

  // Equipe (sem manager ainda)
  await prisma.team.upsert({
    where: { id: "team-1" },
    update: {},
    create: { id: "team-1", name: "Equipe Comercial" },
  })

  // Gerente
  await prisma.user.upsert({
    where: { email: "gerente@arara-tech.com" },
    update: {},
    create: {
      id: "user-gerente",
      name: "Carlos Gerente",
      email: "gerente@arara-tech.com",
      passwordHash: await hash("gerente123"),
      role: "gerente",
      teamId: "team-1",
    },
  })

  // Atualiza equipe com manager
  await prisma.team.update({ where: { id: "team-1" }, data: { managerId: "user-gerente" } })

  // Vendedores
  const v1 = await prisma.user.upsert({
    where: { email: "joao@arara-tech.com" },
    update: {},
    create: {
      id: "user-v1",
      name: "João Vendedor",
      email: "joao@arara-tech.com",
      passwordHash: await hash("vendedor123"),
      role: "vendedor",
      teamId: "team-1",
    },
  })

  const v2 = await prisma.user.upsert({
    where: { email: "maria@arara-tech.com" },
    update: {},
    create: {
      id: "user-v2",
      name: "Maria Vendas",
      email: "maria@arara-tech.com",
      passwordHash: await hash("vendedor123"),
      role: "vendedor",
      teamId: "team-1",
    },
  })

  // ── Datas relativas a hoje (para agenda/dashboard ficarem vivos) ──
  const now = new Date()
  const curMonth = now.getMonth() + 1
  const curYear = now.getFullYear()
  const at = (dayOffset: number, h: number, m = 0) => {
    const d = new Date(now)
    d.setDate(d.getDate() + dayOffset)
    d.setHours(h, m, 0, 0)
    return d
  }
  const thisMonth = (day: number) => new Date(curYear, curMonth - 1, day, 12, 0, 0)

  // ── Clientes (mix de leads e clientes, entre os dois vendedores) ──
  const clients: {
    id: string; name: string; company: string; email: string; phone: string
    type: "lead" | "cliente"; ownerId: string; tags: string[]
  }[] = [
    { id: "client-1", name: "Ana Ribeiro", company: "ABC Varejo Ltda", email: "ana@abcvarejo.com.br", phone: "(11) 99999-0001", type: "cliente", ownerId: "user-v1", tags: ["varejo", "sp"] },
    { id: "client-2", name: "BrunoTavares", company: "XYZ Comércio", email: "bruno@xyz.com.br", phone: "(11) 99999-0002", type: "lead", ownerId: "user-v1", tags: ["distribuidor"] },
    { id: "client-3", name: "Camila Nunes", company: "Nunes Materiais", email: "camila@nunesmat.com.br", phone: "(21) 98888-0100", type: "lead", ownerId: "user-v1", tags: ["construção", "rj"] },
    { id: "client-4", name: "Diego Farias", company: "Supermercados Farias", email: "diego@farias.com.br", phone: "(31) 97777-0200", type: "cliente", ownerId: "user-v1", tags: ["supermercado", "mg"] },
    { id: "client-5", name: "Elaine Costa", company: "Farmácia Vida", email: "elaine@farmaciavida.com.br", phone: "(11) 96666-0300", type: "cliente", ownerId: "user-v2", tags: ["farmácia"] },
    { id: "client-6", name: "Fábio Menezes", company: "Auto Peças Menezes", email: "fabio@apmenezes.com.br", phone: "(41) 95555-0400", type: "lead", ownerId: "user-v2", tags: ["autopeças", "pr"] },
    { id: "client-7", name: "Gabriela Lima", company: "Padaria Pão Nosso", email: "gabriela@paonosso.com.br", phone: "(11) 94444-0500", type: "lead", ownerId: "user-v2", tags: ["padaria"] },
    { id: "client-8", name: "Henrique Alves", company: "Distribuidora HA", email: "henrique@dha.com.br", phone: "(51) 93333-0600", type: "cliente", ownerId: "user-v1", tags: ["distribuidor", "rs"] },
  ]
  for (const c of clients) {
    await prisma.client.upsert({ where: { id: c.id }, update: c, create: c })
  }

  // ── Deals espalhados por todas as etapas + alguns ganhos no mês ──
  const deals: {
    id: string; title: string; clientId: string; ownerId: string; stageId: string
    value: number; expectedClose: Date; status: "open" | "won" | "lost"; closedAt?: Date
  }[] = [
    { id: "deal-1", title: "Licença SGC — ABC Varejo", clientId: "client-1", ownerId: "user-v1", stageId: "stage-4", value: 12000, expectedClose: at(9, 12), status: "open" },
    { id: "deal-2", title: "Módulo Fiscal — XYZ", clientId: "client-2", ownerId: "user-v1", stageId: "stage-1", value: 5500, expectedClose: at(25, 12), status: "open" },
    { id: "deal-3", title: "SGC + PDV — Nunes Materiais", clientId: "client-3", ownerId: "user-v1", stageId: "stage-2", value: 18400, expectedClose: at(18, 12), status: "open" },
    { id: "deal-4", title: "Expansão 3 lojas — Farias", clientId: "client-4", ownerId: "user-v1", stageId: "stage-3", value: 27000, expectedClose: at(12, 12), status: "open" },
    { id: "deal-5", title: "Renovação anual — Farmácia Vida", clientId: "client-5", ownerId: "user-v2", stageId: "stage-5", value: 9800, expectedClose: at(4, 12), status: "open" },
    { id: "deal-6", title: "Migração fiscal — Auto Peças Menezes", clientId: "client-6", ownerId: "user-v2", stageId: "stage-1", value: 6400, expectedClose: at(30, 12), status: "open" },
    { id: "deal-7", title: "PDV mobile — Pão Nosso", clientId: "client-7", ownerId: "user-v2", stageId: "stage-2", value: 4200, expectedClose: at(21, 12), status: "open" },
    { id: "deal-8", title: "Licença SGC — Distribuidora HA", clientId: "client-8", ownerId: "user-v1", stageId: "stage-5", value: 15600, expectedClose: thisMonth(28), status: "won", closedAt: thisMonth(8) },
    { id: "deal-9", title: "Suporte Premium — ABC Varejo", clientId: "client-1", ownerId: "user-v1", stageId: "stage-5", value: 7200, expectedClose: thisMonth(20), status: "won", closedAt: thisMonth(15) },
    { id: "deal-10", title: "Treinamento equipe — Farias", clientId: "client-4", ownerId: "user-v1", stageId: "stage-5", value: 3400, expectedClose: thisMonth(10), status: "lost", closedAt: thisMonth(10) },
  ]
  for (const d of deals) {
    await prisma.deal.upsert({ where: { id: d.id }, update: d, create: d })
  }

  // ── Atividades: hoje (agenda), próximos dias e algumas concluídas ──
  const activities: {
    id: string; type: "call" | "visit" | "email" | "meeting" | "follow_up"
    dealId?: string; clientId: string; ownerId: string; scheduledAt: Date; doneAt?: Date; notes?: string
  }[] = [
    { id: "act-1", type: "visit", dealId: "deal-1", clientId: "client-1", ownerId: "user-v1", scheduledAt: at(0, 10), notes: "Apresentar proposta de expansão e tirar dúvidas do financeiro." },
    { id: "act-2", type: "call", dealId: "deal-4", clientId: "client-4", ownerId: "user-v1", scheduledAt: at(0, 14, 30), notes: "Retorno sobre desconto nas 3 lojas." },
    { id: "act-3", type: "follow_up", dealId: "deal-3", clientId: "client-3", ownerId: "user-v1", scheduledAt: at(0, 16), notes: "Confirmar recebimento da proposta enviada." },
    { id: "act-4", type: "meeting", dealId: "deal-2", clientId: "client-2", ownerId: "user-v1", scheduledAt: at(1, 9), notes: "Reunião de qualificação — entender volume de notas." },
    { id: "act-5", type: "visit", dealId: "deal-8", clientId: "client-8", ownerId: "user-v1", scheduledAt: at(2, 11), notes: "Assinatura do contrato." },
    { id: "act-6", type: "email", clientId: "client-1", ownerId: "user-v1", scheduledAt: at(-2, 15), doneAt: at(-2, 15, 20), notes: "Enviado material técnico do SGC." },
    { id: "act-7", type: "call", dealId: "deal-9", clientId: "client-1", ownerId: "user-v1", scheduledAt: at(-4, 10), doneAt: at(-4, 10, 12), notes: "Fechado suporte premium." },
    { id: "act-8", type: "visit", dealId: "deal-5", clientId: "client-5", ownerId: "user-v2", scheduledAt: at(0, 13), notes: "Renovação anual — levar contrato." },
  ]
  for (const a of activities) {
    await prisma.activity.upsert({ where: { id: a.id }, update: a, create: a })
  }

  // ── Metas do mês corrente (João e Maria) ──
  await prisma.goal.upsert({
    where: { userId_periodMonth_periodYear: { userId: "user-v1", periodMonth: curMonth, periodYear: curYear } },
    update: { targetValue: 40000, targetDeals: 5 },
    create: { userId: "user-v1", periodMonth: curMonth, periodYear: curYear, targetValue: 40000, targetDeals: 5 },
  })
  await prisma.goal.upsert({
    where: { userId_periodMonth_periodYear: { userId: "user-v2", periodMonth: curMonth, periodYear: curYear } },
    update: { targetValue: 25000, targetDeals: 4 },
    create: { userId: "user-v2", periodMonth: curMonth, periodYear: curYear, targetValue: 25000, targetDeals: 4 },
  })

  // Config padrão
  await prisma.appConfig.upsert({
    where: { key: "reminder_minutes_before" },
    update: {},
    create: { key: "reminder_minutes_before", value: "60" },
  })

  console.log("Seed concluído.")
  console.log("  admin@arara-tech.com / admin123")
  console.log("  gerente@arara-tech.com / gerente123")
  console.log("  joao@arara-tech.com / vendedor123")
  console.log("  maria@arara-tech.com / vendedor123")
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
