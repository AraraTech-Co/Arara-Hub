/**
 * Funil do prospect (item 3 do PRD de 10/11).
 *
 * A etapa vive no Client da matriz (ou do cadastro avulso, sem parentId).
 * Filial mostra a etapa da matriz. Registro sem `etapa` conta como `mapeado`.
 * Substitui status e temperatura nas telas; esses campos ficam gravados, sem uso.
 */
import type { HandlerCtx, StaticRoute } from '../../lib/handler-ctx.js'

export const ETAPAS = [
  'mapeado',
  'qualificado',
  'em_cadencia',
  'respondeu',
  'descoberta',
  'demo',
  'proposta',
  'ganho',
  'perdido',
  'sem_resposta',
] as const
export const TOQUES = ['T1', 'T2', 'T3'] as const
export const MOTIVOS_PERDA = [
  'preco',
  'timing',
  'ja_tem_sistema',
  'nao_e_decisor',
  'sem_dor',
  'canal_errado',
  'mensagem_fraca',
  'dados_errados',
] as const

export const ETAPA_PADRAO = 'mapeado'
const PAGINA = 500

type Registro = Record<string, unknown>

function idDaPessoa(ctx: HandlerCtx): string | null {
  const u = ctx.user as { id?: unknown } | null | undefined
  return u && typeof u.id === 'string' && u.id.length > 0 ? u.id : null
}

function novoId(): string {
  return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
}

export function etapaDe(c: Registro): string {
  return typeof c.etapa === 'string' && (ETAPAS as readonly string[]).includes(c.etapa) ? c.etapa : ETAPA_PADRAO
}

/** Lê todos os registros que casam com o filtro, página a página (a camada corta em 500 sem avisar). */
export async function lerTodos(
  model: HandlerCtx['models'][string],
  filtro: Record<string, unknown> = {},
): Promise<Registro[]> {
  const todos: Registro[] = []
  for (let offset = 0; ; offset += PAGINA) {
    const pagina = (await model.findMany({ ...filtro, limit: PAGINA, offset })) as Registro[]
    todos.push(...pagina)
    if (pagina.length < PAGINA) return todos
  }
}

async function moverEtapa(ctx: HandlerCtx) {
  const uid = idDaPessoa(ctx)
  if (!uid) return ctx.reply.status(401).send({ error: 'Auth necessaria' })
  const { Client, Profile, Deal, Stage, LeadStatusHistory } = ctx.models
  if (!Client) return ctx.reply.status(500).send({ error: 'Model Client missing' })

  const id = String((ctx.params as Registro | undefined)?.id ?? '')
  const b = (ctx.body ?? {}) as Registro
  const etapa = b.etapa
  if (typeof etapa !== 'string' || !(ETAPAS as readonly string[]).includes(etapa)) {
    return ctx.reply.status(400).send({ error: 'Etapa inválida' })
  }
  let toque: string | null = null
  let motivoPerda: string | null = null
  if (etapa === 'em_cadencia') {
    if (typeof b.toque !== 'string' || !(TOQUES as readonly string[]).includes(b.toque)) {
      return ctx.reply.status(400).send({ error: 'Em cadência exige o toque (T1, T2 ou T3)' })
    }
    toque = b.toque
  }
  if (etapa === 'perdido') {
    if (typeof b.motivoPerda !== 'string' || !(MOTIVOS_PERDA as readonly string[]).includes(b.motivoPerda)) {
      return ctx.reply.status(400).send({ error: 'Perdido exige o motivo da perda' })
    }
    motivoPerda = b.motivoPerda
  }

  const c = (await Client.findById(id)) as Registro | null
  if (!c) return ctx.reply.status(404).send({ error: 'Cliente nao encontrado' })
  if (c.parentId) return ctx.reply.status(400).send({ error: 'O funil fica na matriz' })
  if (!c.ownerId) return ctx.reply.status(403).send({ error: 'Pegue o lead antes de mover a etapa' })
  const perfil = Profile ? ((await Profile.findById(uid)) as Registro | null) : null
  const gestor = perfil?.role === 'gerente' || perfil?.role === 'admin'
  if (!gestor && String(c.ownerId) !== uid) {
    return ctx.reply.status(403).send({ error: 'Só o dono do lead ou o gestor pode mover a etapa' })
  }

  const agora = new Date().toISOString()
  const de = etapaDe(c)
  const atualizado = await Client.update(id, { etapa, toque, motivoPerda, etapaEm: agora, updatedAt: agora })

  if (LeadStatusHistory && (de !== etapa || c.toque !== toque || c.motivoPerda !== motivoPerda)) {
    await LeadStatusHistory.create({
      id: novoId(),
      tipo: 'etapa',
      clientId: id,
      fromStatus: de,
      toStatus: etapa,
      toque,
      motivoPerda,
      changedById: uid,
      changedAt: agora,
    })
  }

  // Entrar em Proposta abre uma negociação no pipeline, se a matriz não tiver uma aberta.
  let negociacao: Registro | null = null
  if (etapa === 'proposta' && de !== 'proposta' && Deal && Stage) {
    const abertas = (await Deal.findMany({ clientId: id, status: 'open', limit: 1 })) as Registro[]
    if (abertas.length === 0) {
      const estagios = (await Stage.findMany({})) as Registro[]
      const proposta = estagios.find((s) => /proposta/i.test(String(s.name ?? '')))
      if (proposta) {
        const qtd = Math.max(1, Number(c.qtdLojas) || 1)
        negociacao = (await Deal.create({
          id: novoId(),
          title: String(c.name ?? 'Negociação'),
          clientId: id,
          stageId: proposta.id,
          ownerId: c.ownerId,
          status: 'open',
          qtdLojas: qtd,
          value: 0,
          createdAt: agora,
          stageHistory: [{ stageId: proposta.id, at: agora }],
        })) as Registro
      }
    }
  }

  return ctx.reply.send({ data: atualizado, negociacao })
}

async function resumoDoFunil(ctx: HandlerCtx) {
  const { Client } = ctx.models
  if (!Client) return ctx.reply.status(500).send({ error: 'Model Client missing' })
  const todos = await lerTodos(Client)
  const prospects = todos.filter((c) => !c.parentId)
  const porEtapa: Record<string, number> = Object.fromEntries(ETAPAS.map((e) => [e, 0]))
  const porMotivo: Record<string, number> = Object.fromEntries(MOTIVOS_PERDA.map((m) => [m, 0]))
  let semMotivo = 0
  for (const c of prospects) {
    const e = etapaDe(c)
    porEtapa[e] += 1
    if (e === 'perdido') {
      if (typeof c.motivoPerda === 'string' && c.motivoPerda in porMotivo) porMotivo[c.motivoPerda] += 1
      else semMotivo += 1
    }
  }
  return ctx.reply.send({ total: prospects.length, porEtapa, porMotivo, perdidoSemMotivo: semMotivo })
}

export const rotasDoFunil: StaticRoute[] = [
  {
    module: 'crm-funil',
    method: 'POST',
    path: '/clients/:id/etapa',
    authMode: 'actor',
    webhookSecretName: null,
    requiredPermissions: [],
    handler: moverEtapa,
  },
  {
    module: 'crm-funil',
    method: 'GET',
    path: '/funil/resumo',
    authMode: 'actor',
    webhookSecretName: null,
    requiredPermissions: [],
    handler: resumoDoFunil,
  },
]
