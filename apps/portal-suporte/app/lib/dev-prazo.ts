// =============================================================================
// Prazo do card do Kanban Dev — uma regra só para o selo, o filtro e a ordem.
//
// O card Dev não tem SLA próprio (nem POST /dev/tickets nem a escalada criam
// SLATracking). Decisão da documentação de melhorias (14/09/2026):
//
//   1. card escalado → o SLA VIVO do chamado de origem, que é o prazo que o
//      cliente cobra. O servidor manda em `origem.sla`, resolvido na leitura;
//   2. sem SLA na origem (ou demanda interna) → a previsão de entrega do
//      Projetos/Gantt / esforço de sprint;
//   3. sem nenhum dos dois → "sem prazo".
//
// REVISADO 15/09/2026: previsão de sprint termina às 12:00 (sexta), não no
// fim do dia. `esforco_entrega === 'asap'` é urgência sem data (como vencido).
//
// Limiar de risco igual ao do SlaIndicator (240 min), para o mesmo selo não
// dizer "em risco" num lugar e "no prazo" noutro. A previsão com só data
// (YYYY-MM-DD) vale até o meio-dia; com hora ISO, usa a hora gravada.
// =============================================================================

import type { EsforcoEntrega } from './dev-esforco'

export type SituacaoPrazo = 'vencido' | 'em_risco' | 'no_prazo' | 'sem_prazo'

export type PrazoDoCard = {
  situacao: SituacaoPrazo
  /** Minutos até o fim do prazo; negativo = vencido há tanto. Nulo sem prazo. */
  minutos: number | null
  fonte: 'sla' | 'previsao' | 'asap' | null
  /** Destaque de urgência: ASAP ou prazo já passou. */
  urgente: boolean
}

export const SLA_RISCO_MIN = 240
export const PREVISAO_RISCO_MIN = 24 * 60

export const SITUACAO_PRAZO_LABEL: Record<SituacaoPrazo, string> = {
  vencido: 'Vencido',
  em_risco: 'Em risco',
  no_prazo: 'No prazo',
  sem_prazo: 'Sem prazo',
}

/** Peso para ordenar por risco: vencido primeiro, sem prazo por último. */
export const SITUACAO_PRAZO_PESO: Record<SituacaoPrazo, number> = {
  vencido: 0,
  em_risco: 1,
  no_prazo: 2,
  sem_prazo: 3,
}

type SlaOrigem = { breached?: boolean; minutes_remaining?: number | null } | null | undefined

export type CardComPrazo = {
  origem_ticket_id?: string | null
  previsao_entrega?: string | null
  esforco_entrega?: EsforcoEntrega | string | null
  origem?: { sla?: SlaOrigem } | null
}

/**
 * Limite da previsão: ISO com hora → essa hora; só `YYYY-MM-DD` → meio-dia local
 * (regra das sprints: sexta até 12:00).
 */
function limitePrevisao(data: string): number | null {
  const comHora = String(data).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/)
  if (comHora) {
    const d = new Date(
      Number(comHora[1]), Number(comHora[2]) - 1, Number(comHora[3]),
      Number(comHora[4]), Number(comHora[5]), Number(comHora[6] || 0), 0,
    )
    return Number.isNaN(d.getTime()) ? null : d.getTime()
  }
  const soData = String(data).match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!soData) return null
  const d = new Date(Number(soData[1]), Number(soData[2]) - 1, Number(soData[3]), 12, 0, 0, 0)
  return Number.isNaN(d.getTime()) ? null : d.getTime()
}

export function prazoDoCard(card: CardComPrazo, agora: number = Date.now()): PrazoDoCard {
  if (card.esforco_entrega === 'asap') {
    return { situacao: 'vencido', minutos: null, fonte: 'asap', urgente: true }
  }

  const sla = card.origem_ticket_id ? card.origem?.sla : null
  if (sla && (sla.breached || typeof sla.minutes_remaining === 'number')) {
    const minutos = typeof sla.minutes_remaining === 'number' ? sla.minutes_remaining : null
    const vencido = !!sla.breached || (minutos !== null && minutos <= 0)
    const situacao: SituacaoPrazo = vencido ? 'vencido' : minutos !== null && minutos <= SLA_RISCO_MIN ? 'em_risco' : 'no_prazo'
    return {
      situacao,
      minutos,
      fonte: 'sla',
      urgente: situacao === 'vencido',
    }
  }

  const fim = card.previsao_entrega ? limitePrevisao(card.previsao_entrega) : null
  if (fim !== null) {
    const minutos = Math.round((fim - agora) / 60000)
    const situacao: SituacaoPrazo = minutos <= 0 ? 'vencido' : minutos <= PREVISAO_RISCO_MIN ? 'em_risco' : 'no_prazo'
    return {
      situacao,
      minutos,
      fonte: 'previsao',
      urgente: situacao === 'vencido',
    }
  }

  return { situacao: 'sem_prazo', minutos: null, fonte: null, urgente: false }
}

/**
 * Elegível a reestimar: não-ASAP, previsão já passou, card ainda aberto.
 * Independente do SLA da origem — o prazo reestimado é a previsão de sprint.
 */
export function podeReestimar(
  card: CardComPrazo & { status?: string | null },
  agora: number = Date.now(),
): boolean {
  if (card.esforco_entrega === 'asap') return false
  const st = String(card.status || '')
  if (st === 'aplicado_no_cliente' || st === 'descartado') return false
  if (!card.previsao_entrega) return false
  const fim = limitePrevisao(card.previsao_entrega)
  return fim !== null && fim <= agora
}
