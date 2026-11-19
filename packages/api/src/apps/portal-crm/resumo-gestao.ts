/**
 * Resumo de vendas para a Central de Gestão — só totais, sem negócio, cliente ou vendedor.
 *
 * GET /vendas/resumo-gestao?mes=AAAA-MM
 *   - vendido: soma de `Deal.value` com `status: "won"` e `closedAt` (data local de São Paulo) no mês,
 *     de todos os vendedores;
 *   - ganhos: quantidade desses negócios;
 *   - meta: soma, entre os vendedores, da meta (`Goal.targetValue`) do mês. Cada `POST /goals` cria um
 *     registro novo, então vale a mais recente de cada vendedor no mês (a mesma que o dashboard usa);
 *     sem nenhuma meta positiva, `meta: null`.
 * Lê tudo de 500 em 500. Se a leitura não terminar, `complete: false` e nenhum número.
 * Exige pessoa identificada (401 sem ela); o acesso ao app é o membership do CRM, conferido pela plataforma.
 */
import type { HandlerCtx, StaticRoute } from '../../lib/handler-ctx.js'

type Registro = Record<string, unknown>
const LOTE = 500
const TETO_LOTES = 40

function idDaPessoa(ctx: HandlerCtx): string | null {
  const u = ctx.user as { id?: unknown } | null | undefined
  return u && typeof u.id === 'string' && u.id.length > 0 ? u.id : null
}

async function lerTudo(model: HandlerCtx['models'][string]): Promise<{ itens: Registro[]; completo: boolean }> {
  const vistos = new Set<string>()
  const itens: Registro[] = []
  for (let lote = 0; lote < TETO_LOTES; lote++) {
    const pagina = ((await model.findMany({ limit: LOTE, offset: lote * LOTE })) || []) as Registro[]
    for (const r of pagina) {
      const id = String(r.id)
      if (!vistos.has(id)) {
        vistos.add(id)
        itens.push(r)
      }
    }
    if (pagina.length < LOTE) return { itens, completo: true }
  }
  return { itens, completo: false }
}

const formatoSP = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
})

export function mesSP(iso: unknown): string {
  if (typeof iso !== 'string' || !iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p: Record<string, string> = {}
  for (const x of formatoSP.formatToParts(d)) p[x.type] = x.value
  return `${p.year}-${p.month}`
}

export async function resumoDeVendas(ctx: HandlerCtx) {
  if (!idDaPessoa(ctx)) return ctx.reply.status(401).send({ error: 'Auth necessaria' })
  const Deal = ctx.models.Deal
  const Goal = ctx.models.Goal
  if (!Deal || !Goal) return ctx.reply.status(503).send({ error: 'Models Deal/Goal ausentes' })
  const mes = (ctx.query as Record<string, unknown> | undefined)?.mes
  if (typeof mes !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
    return ctx.reply.status(400).send({ error: 'mes deve ser AAAA-MM' })
  }
  const ano = Number(mes.slice(0, 4))
  const m = Number(mes.slice(5, 7))

  const deals = await lerTudo(Deal)
  const goals = await lerTudo(Goal)
  if (!deals.completo || !goals.completo) return ctx.reply.send({ mes, complete: false })

  let vendido = 0
  let ganhos = 0
  for (const d of deals.itens) {
    if (d.status !== 'won') continue
    if (mesSP(d.closedAt) !== mes) continue
    const v = Number(d.value ?? 0)
    vendido += Number.isFinite(v) ? v : 0
    ganhos += 1
  }

  // A camada devolve do mais novo ao mais antigo: a primeira meta vista de cada vendedor é a vigente.
  const metaPorVendedor = new Map<string, number>()
  for (const g of goals.itens) {
    if (Number(g.periodMonth) !== m || Number(g.periodYear) !== ano) continue
    const uid = String(g.userId ?? '')
    if (!uid || metaPorVendedor.has(uid)) continue
    const alvo = Number(g.targetValue ?? 0)
    metaPorVendedor.set(uid, Number.isFinite(alvo) ? alvo : 0)
  }
  let meta = 0
  for (const v of metaPorVendedor.values()) meta += v

  return ctx.reply.send({
    mes,
    complete: true,
    vendido: Math.round(vendido * 100) / 100,
    ganhos,
    meta: meta > 0 ? Math.round(meta * 100) / 100 : null,
    vendedores_com_meta: metaPorVendedor.size,
  })
}

export const rotasDoResumoGestao: StaticRoute[] = [
  {
    module: 'crm-resumo-gestao',
    method: 'GET',
    path: '/vendas/resumo-gestao',
    authMode: 'actor',
    webhookSecretName: null,
    requiredPermissions: [],
    handler: resumoDeVendas,
  },
]
