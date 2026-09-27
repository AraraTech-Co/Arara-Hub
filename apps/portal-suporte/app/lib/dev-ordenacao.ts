// =============================================================================
// Ordenação do Kanban Dev — regra pura (item 2.5 da documentação de melhorias).
//
// Separada da tela, como os filtros (dev-filtros.ts): é a única definição do
// que cada critério significa, testável sem React. A ordenação vale DENTRO de
// cada coluna — as colunas são o fluxo e não mudam de lugar.
//
// "Manual" é a ordem que a equipe montou arrastando (campo `position`, gravado
// por POST /tickets/reorder); qualquer outro critério é uma LENTE sobre ela e
// não grava nada.
// =============================================================================

import { getPriorityRank } from '@/lib/ticket-priority'
import { prazoDoCard, type CardComPrazo } from '@/lib/dev-prazo'
import { DEV_LABELS } from '@/lib/kanban-dev'

export type OrdenarPor =
  | 'manual'
  | 'prazo'
  | 'prioridade'
  | 'numero'
  | 'criacao'
  | 'empresa'
  | 'status'
  | 'time'
  | 'agente'

export type Direcao = 'asc' | 'desc'

export type OrdenacaoDev = { por: OrdenarPor; dir: Direcao }

export const ORDENACAO_PADRAO: OrdenacaoDev = { por: 'manual', dir: 'asc' }

/**
 * `dirPadrao` é a direção que faz sentido ao ESCOLHER o critério: prioridade e
 * prazo começam pelo mais urgente; nome, número e data começam do início.
 * `rotulos` dão nome às duas direções — "Crescente" não diz nada para prazo.
 */
export const OPCOES_ORDENACAO: ReadonlyArray<{
  value: OrdenarPor
  label: string
  dirPadrao: Direcao
  rotulos: { asc: string; desc: string }
}> = [
  { value: 'manual', label: 'Manual', dirPadrao: 'asc', rotulos: { asc: 'Como está', desc: 'Invertida' } },
  { value: 'prazo', label: 'Risco de SLA', dirPadrao: 'asc', rotulos: { asc: 'Mais urgente primeiro', desc: 'Mais folga primeiro' } },
  { value: 'prioridade', label: 'Prioridade', dirPadrao: 'desc', rotulos: { asc: 'Mais baixa primeiro', desc: 'Mais alta primeiro' } },
  { value: 'numero', label: 'Nº do ticket', dirPadrao: 'asc', rotulos: { asc: 'Menor primeiro', desc: 'Maior primeiro' } },
  { value: 'criacao', label: 'Data de criação', dirPadrao: 'asc', rotulos: { asc: 'Mais antigo primeiro', desc: 'Mais novo primeiro' } },
  { value: 'empresa', label: 'Empresa', dirPadrao: 'asc', rotulos: { asc: 'A → Z', desc: 'Z → A' } },
  { value: 'status', label: 'Status', dirPadrao: 'asc', rotulos: { asc: 'Início do fluxo primeiro', desc: 'Fim do fluxo primeiro' } },
  { value: 'time', label: 'Time do responsável', dirPadrao: 'asc', rotulos: { asc: 'A → Z', desc: 'Z → A' } },
  { value: 'agente', label: 'Agente', dirPadrao: 'asc', rotulos: { asc: 'A → Z', desc: 'Z → A' } },
]

export function opcaoDe(por: OrdenarPor) {
  return OPCOES_ORDENACAO.find((o) => o.value === por) ?? OPCOES_ORDENACAO[0]
}

export type CardOrdenavel = CardComPrazo & {
  id: string
  ticket_number?: string | null
  priority?: string | null
  company_name?: string | null
  status?: string | null
  position?: number | null
  created_at?: string | null
  assignee?: { id: string; full_name?: string | null } | null
}

export type ContextoOrdenacao = {
  /** Nome do time por id de pessoa (responsável). */
  timePorPessoa?: Map<string, string>
  agora?: number
}

const STATUS_ORDEM: string[] = Object.keys(DEV_LABELS)

function texto(v: unknown): string {
  return String(v ?? '').trim()
}
function compTexto(a: string, b: string): number {
  return a.localeCompare(b, 'pt-BR', { sensitivity: 'base', numeric: true })
}
function tempo(v: string | null | undefined): number {
  const t = new Date(v ?? '').getTime()
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t
}
function posicao(c: CardOrdenavel): number {
  // `Number(null)` é 0 — card sem posição iria para o TOPO. Sem posição = fim.
  if (c.position === null || c.position === undefined || c.position === ('' as unknown)) return Number.POSITIVE_INFINITY
  const p = Number(c.position)
  return Number.isFinite(p) ? p : Number.POSITIVE_INFINITY
}

/** Ordem manual: `position`, depois data de criação — o que o quadro sempre fez. */
function compManual(a: CardOrdenavel, b: CardOrdenavel): number {
  return posicao(a) - posicao(b) || tempo(a.created_at) - tempo(b.created_at) || compTexto(a.id, b.id)
}

/**
 * Compara pelo critério. Cards SEM o dado (sem prazo, sem empresa, sem
 * responsável, sem time) ficam sempre no fim, nas duas direções: inverter a
 * lista não deve trazer para o topo quem não tem o que se está ordenando.
 * Retorna [temDado, comparação].
 */
function chave(por: OrdenarPor, a: CardOrdenavel, b: CardOrdenavel, ctx: ContextoOrdenacao): number | null {
  switch (por) {
    case 'prazo': {
      const pa = prazoDoCard(a, ctx.agora)
      const pb = prazoDoCard(b, ctx.agora)
      const ta = pa.situacao !== 'sem_prazo'
      const tb = pb.situacao !== 'sem_prazo'
      if (ta !== tb) return null
      if (!ta) return 0
      // Minutos restantes: negativo = vencido. Menor = mais urgente.
      return (pa.minutos ?? 0) - (pb.minutos ?? 0)
    }
    case 'prioridade':
      return getPriorityRank(String(a.priority || 'medium')) - getPriorityRank(String(b.priority || 'medium'))
    case 'numero': {
      const na = Number(texto(a.ticket_number).replace(/\D/g, ''))
      const nb = Number(texto(b.ticket_number).replace(/\D/g, ''))
      if (Number.isFinite(na) && Number.isFinite(nb) && texto(a.ticket_number) && texto(b.ticket_number)) return na - nb
      return compTexto(texto(a.ticket_number), texto(b.ticket_number))
    }
    case 'criacao':
      return tempo(a.created_at) - tempo(b.created_at)
    case 'empresa': {
      const ea = texto(a.company_name), eb = texto(b.company_name)
      if (!ea !== !eb) return null
      return compTexto(ea, eb)
    }
    case 'status':
      return STATUS_ORDEM.indexOf(String(a.status)) - STATUS_ORDEM.indexOf(String(b.status))
    case 'time': {
      const ta = a.assignee?.id ? ctx.timePorPessoa?.get(a.assignee.id) ?? '' : ''
      const tb = b.assignee?.id ? ctx.timePorPessoa?.get(b.assignee.id) ?? '' : ''
      if (!ta !== !tb) return null
      return compTexto(ta, tb)
    }
    case 'agente': {
      const na = texto(a.assignee?.full_name), nb = texto(b.assignee?.full_name)
      if (!na !== !nb) return null
      return compTexto(na, nb)
    }
    default:
      return 0
  }
}

function temDado(por: OrdenarPor, c: CardOrdenavel, ctx: ContextoOrdenacao): boolean {
  switch (por) {
    case 'prazo': return prazoDoCard(c, ctx.agora).situacao !== 'sem_prazo'
    case 'empresa': return !!texto(c.company_name)
    case 'time': return !!(c.assignee?.id && ctx.timePorPessoa?.get(c.assignee.id))
    case 'agente': return !!texto(c.assignee?.full_name)
    default: return true
  }
}

/** Ordena uma lista (uma coluna). Não altera a original. */
export function ordenarCards<T extends CardOrdenavel>(cards: T[], ord: OrdenacaoDev, ctx: ContextoOrdenacao = {}): T[] {
  const dir = ord.dir === 'desc' ? -1 : 1
  return [...cards].sort((a, b) => {
    if (ord.por === 'manual') return compManual(a, b) * dir
    const da = temDado(ord.por, a, ctx)
    const db = temDado(ord.por, b, ctx)
    if (da !== db) return da ? -1 : 1
    const k = chave(ord.por, a, b, ctx) ?? 0
    // Desempate SEMPRE pela ordem manual, na direção natural: inverter o
    // critério não embaralha os empatados.
    return k * dir || compManual(a, b)
  })
}

// ── Arrastar para reordenar (só em Manual) ───────────────────────────────────
/** Nova sequência de ids com `arrastado` no lugar de `alvo` (os demais deslizam). */
export function moverNaOrdem(ids: string[], arrastado: string, alvo: string): string[] {
  const de = ids.indexOf(arrastado)
  const para = ids.indexOf(alvo)
  if (de < 0 || para < 0 || de === para) return ids
  const out = ids.slice()
  out.splice(de, 1)
  out.splice(para, 0, arrastado)
  return out
}

// ── URL ──────────────────────────────────────────────────────────────────────
const CHAVE_POR = 'ord'
const CHAVE_DIR = 'dir'
const VALORES: OrdenarPor[] = OPCOES_ORDENACAO.map((o) => o.value)

export function ordenacaoDaUrl(search: string): OrdenacaoDev {
  const p = new URLSearchParams(search)
  const por = p.get(CHAVE_POR) || ''
  const dir = p.get(CHAVE_DIR) || ''
  if (!(VALORES as string[]).includes(por)) return ORDENACAO_PADRAO
  return {
    por: por as OrdenarPor,
    dir: dir === 'asc' || dir === 'desc' ? dir : opcaoDe(por as OrdenarPor).dirPadrao,
  }
}

/** Escreve na query string preservando os outros parâmetros (filtros etc.). */
export function ordenacaoNaUrl(search: string, ord: OrdenacaoDev): string {
  const p = new URLSearchParams(search)
  p.delete(CHAVE_POR)
  p.delete(CHAVE_DIR)
  if (ord.por !== 'manual' || ord.dir !== 'asc') {
    p.set(CHAVE_POR, ord.por)
    p.set(CHAVE_DIR, ord.dir)
  }
  const s = p.toString()
  return s ? `?${s}` : ''
}
