// =============================================================================
// Projetos — vocabulário e cálculos, espelho de leitura das regras do servidor.
//
// A VERDADE mora no servidor (módulo `projetos`, publicado por
// scripts/projetos-regras.py): permissão, validação de data e progresso são
// decididos lá. Este arquivo existe para a tela mostrar o mesmo número sem uma
// ida ao servidor a cada render — cortesia, não trava.
//
// Especificação: docs/plans/especificacao-modulo-projetos-e-gantt-portal-suporte.md
// =============================================================================

export type ProjetoTipo = 'interno' | 'cliente'
export type ProjetoStatus = 'planejado' | 'em_andamento' | 'pausado' | 'concluido' | 'cancelado'

export const PROJETO_STATUS_LABELS: Record<ProjetoStatus, string> = {
  planejado: 'Planejado',
  em_andamento: 'Em Andamento',
  pausado: 'Pausado',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
}

export const PROJETO_STATUS_CLASSES: Record<ProjetoStatus, string> = {
  planejado: 'bg-muted text-muted-foreground',
  em_andamento: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  pausado: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  concluido: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  cancelado: 'bg-red-500/15 text-red-600 dark:text-red-400',
}

export const PROJETO_TIPO_LABELS: Record<ProjetoTipo, string> = {
  interno: 'Interno',
  cliente: 'Cliente',
}

/**
 * Progresso derivado do status do fluxo Dev — a mesma tabela do servidor.
 * Ninguém digita "62%" num card; o status já diz onde a coisa está.
 */
export const PROGRESSO_POR_STATUS: Record<string, number> = {
  no_status: 0,
  backlog: 0,
  em_desenvolvimento: 25,
  teste_reprovado: 40,
  desenvolvimento_finalizado: 50,
  pronto_para_teste: 70,
  em_testes: 80,
  teste_aprovado: 90,
  aplicado_no_cliente: 100,
}

/** Valor manual vence; vazio segue o status. */
export function progressoDoCard(card: { status?: string; progresso?: number | null }): number {
  if (card.progresso !== null && card.progresso !== undefined) {
    const n = Number(card.progresso)
    if (!Number.isNaN(n)) return Math.max(0, Math.min(100, n))
  }
  return PROGRESSO_POR_STATUS[String(card.status || '')] ?? 0
}

// ── Datas ────────────────────────────────────────────────────────────────────
// TODA conversão de data de planejamento passa por aqui. `new Date(texto)`
// espalhado pela tela é onde o prazo de 27/08 vira 26/08 — o navegador
// interpreta "2026-08-27" como meia-noite UTC e mostra no fuso local.

/** Normaliza qualquer coisa para "AAAA-MM-DD" (ou vazio). */
export function dataCal(v: unknown): string {
  if (!v) return ''
  const s = String(v).slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''
}

/** "2026-08-27" → "27/08/2026". Sem Date, sem fuso, sem surpresa. */
export function dataBR(v: unknown): string {
  const s = dataCal(v)
  if (!s) return '—'
  const [a, m, d] = s.split('-')
  return `${d}/${m}/${a}`
}

/** Hoje em "AAAA-MM-DD", no fuso de quem está olhando. */
export function hojeCal(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

const TERMINAIS = ['aplicado_no_cliente', 'descartado']

export function cardAtrasado(card: { status?: string; previsao_entrega?: unknown }): boolean {
  const fim = dataCal(card.previsao_entrega)
  if (!fim) return false
  if (TERMINAIS.includes(String(card.status || ''))) return false
  return fim < hojeCal()
}

/** Minutos → "2h 30min". A estimativa é guardada em minutos, como o TicketTimeEntry. */
export function duracaoBR(minutos?: number | null): string {
  const m = Number(minutos || 0)
  if (!m) return '—'
  const h = Math.floor(m / 60)
  const r = m % 60
  if (!h) return `${r}min`
  return r ? `${h}h ${r}min` : `${h}h`
}
