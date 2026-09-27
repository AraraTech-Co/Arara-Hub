// =============================================================================
// Fonte canônica de PRIORIDADE e SEVERIDADE de ticket — labels e cores.
//
// Espelha o padrão de `ticket-status.ts`. Importável de client e server (sem React).
// NÃO recopiar estes maps em componentes/rotas — importar daqui.
//
// Escalas (definidas em `app/db/types.ts`):
//   TicketPriority = very_low | low | medium | high | urgent
//   TicketSeverity = P0 | P1 | P2 | P3   (P0 = crítico … P3 = informação)
//
// A escala SLASeverity (P1-P4) é OUTRO conceito (prazos de SLA) e vive separada.
// =============================================================================

import type { TicketPriority, TicketSeverity } from '@/db/types'

// ---------------------------------------------------------------------------
// Prioridade — 5 níveis desde 14/09/2026
// ---------------------------------------------------------------------------
// Pedido da documentação de melhorias: Muito baixa, Baixa, Média, Alta, Muito
// alta. A CHAVE `urgent` foi mantida e só o rótulo virou "Muito alta"; entrou
// uma chave nova, `very_low`. Renomear as chaves obrigaria converter todos os
// chamados gravados, o histórico de mudanças e os filtros salvos — e os
// sinais de "urgentes" do painel, que comparam `=== 'urgent'`, continuam
// certos sem mexer.
//
// O servidor normaliza com a MESMA tabela de apelidos (`_normPrioridade`,
// routes.generated.ts). Mudou aqui, muda lá.

/** Da menor para a maior. Selects e filtros devem iterar por aqui. */
export const PRIORITY_KEYS = ['very_low', 'low', 'medium', 'high', 'urgent'] as const satisfies readonly TicketPriority[]

/** Peso para ordenar: maior = mais prioritário. */
export const PRIORITY_RANK: Record<TicketPriority, number> = {
  very_low: 0,
  low:      1,
  medium:   2,
  high:     3,
  urgent:   4,
}

export const PRIORITY_LABELS: Record<TicketPriority, string> = {
  very_low: 'Muito baixa',
  low:      'Baixa',
  medium:   'Média',
  high:     'Alta',
  urgent:   'Muito alta',
}

/** Pronto para <Select>: da menor para a maior. */
export const PRIORITY_OPTIONS: ReadonlyArray<{ value: TicketPriority; label: string }> =
  PRIORITY_KEYS.map((value) => ({ value, label: PRIORITY_LABELS[value] }))

const APELIDOS: Record<string, TicketPriority> = {
  very_low: 'very_low', muito_baixa: 'very_low',
  low: 'low', baixa: 'low',
  medium: 'medium', media: 'medium',
  high: 'high', alta: 'high',
  urgent: 'urgent', urgente: 'urgent', critica: 'urgent', critical: 'urgent', muito_alta: 'urgent',
}

/** Chave canônica, ou `null` se o valor não é uma prioridade reconhecível. */
export function normalizePriority(value: unknown): TicketPriority | null {
  const chave = String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\s-]+/g, '_')
  return APELIDOS[chave] ?? null
}

/** Classes de badge (bg + text + border). Tokens em app/styles/priority.css. */
export const PRIORITY_COLORS: Record<TicketPriority, string> = {
  // Borda tracejada: "quase nada a fazer" precisa se distinguir de Baixa sem
  // ganhar cor — cor chamaria atenção para o que menos merece.
  very_low: 'bg-transparent text-muted-foreground border-dashed border-border',
  low:      'bg-muted text-foreground/80 border-border',
  medium:   'bg-priority-medium  text-priority-medium-fg  border-priority-medium-bd',
  high:     'bg-priority-high    text-priority-high-fg    border-priority-high-bd',
  urgent:   'bg-priority-urgent  text-priority-urgent-fg  border-priority-urgent-bd',
}

/** Cor da borda esquerda do card (kanban). Tokens em app/styles/priority.css. */
export const PRIORITY_BORDER: Record<TicketPriority, string> = {
  very_low: 'border-l-transparent',
  low:      'border-l-border',
  medium:   'border-l-priority-medium-line',
  high:     'border-l-priority-high-line',
  urgent:   'border-l-priority-urgent-line',
}

/** Cor do "dot" indicador. Tokens em app/styles/priority.css. */
export const PRIORITY_DOT: Record<TicketPriority, string> = {
  very_low: 'bg-priority-very-low-dot',
  low:      'bg-priority-low-dot',
  medium:   'bg-priority-medium-dot',
  high:     'bg-priority-high-dot',
  urgent:   'bg-priority-urgent-dot',
}

export const PRIORITY_EMOJI: Record<TicketPriority, string> = {
  very_low: '▫️',
  low:      '⚪',
  medium:   '🔵',
  high:     '🟠',
  urgent:   '🔴',
}

// Valor irreconhecível mostra "—" em cinza. Antes caía em "Baixa" calado: um
// dado estragado aparecia como se fosse uma escolha.
const SEM_PRIORIDADE_COR = 'bg-muted text-muted-foreground border-border'

export function getPriorityLabel(priority: string): string {
  const p = normalizePriority(priority)
  return p ? PRIORITY_LABELS[p] : '—'
}

export function getPriorityColor(priority: string): string {
  const p = normalizePriority(priority)
  return p ? PRIORITY_COLORS[p] : SEM_PRIORIDADE_COR
}

export function getPriorityBorder(priority: string): string {
  const p = normalizePriority(priority)
  return p ? PRIORITY_BORDER[p] : PRIORITY_BORDER.low
}

export function getPriorityDot(priority: string): string {
  const p = normalizePriority(priority)
  return p ? PRIORITY_DOT[p] : PRIORITY_DOT.low
}

export function getPriorityEmoji(priority: string): string {
  const p = normalizePriority(priority)
  return p ? PRIORITY_EMOJI[p] : PRIORITY_EMOJI.low
}

/** Peso para ordenação; valor irreconhecível vai para o fim (-1). */
export function getPriorityRank(priority: string): number {
  const p = normalizePriority(priority)
  return p ? PRIORITY_RANK[p] : -1
}

// ---------------------------------------------------------------------------
// Severidade (escala de ticket P0-P3)
// ---------------------------------------------------------------------------
// Escala invertida em 2026-08-14: P0 passa a ser o mais grave.
//
// Antes era P0 = Informação e P3 = Crítico — o contrário de toda convenção de
// operação e do `SLASeverity` (P1..P4) que vive neste mesmo repositório. Quem
// trabalha com suporte lê "P0" como "sistema parado"; num selo de 10px, numa
// tela usada o dia inteiro, isso é risco de triagem.
//
// Os 427 chamados já classificados foram remapeados junto (P0<->P3, P1<->P2)
// por scripts/inverter-severidade.py, para o significado de cada um continuar
// o mesmo. Mudar só este rótulo teria invertido o sentido de todos eles.
export const SEVERITY_LABELS: Record<TicketSeverity, string> = {
  P0: 'P0 — Crítico',
  P1: 'P1 — Alto',
  P2: 'P2 — Médio',
  P3: 'P3 — Informação',
}

/** Classes de badge (bg + text + border). Tokens em app/styles/priority.css. */
export const SEVERITY_COLORS: Record<TicketSeverity, string> = {
  // Os tokens `severity-p*` foram desenhados com p3 = mais grave. Com a escala
  // invertida, o mapeamento cruza de propósito: o que importa é que o mais
  // grave use a cor mais forte, não que o número bata com o nome do token.
  P0: 'bg-severity-p3 text-severity-p3-fg border-severity-p3-bd',
  P1: 'bg-severity-p2 text-severity-p2-fg border-severity-p2-bd',
  P2: 'bg-severity-p1 text-severity-p1-fg border-severity-p1-bd',
  P3: 'bg-severity-p0 text-severity-p0-fg border-severity-p0-bd',
}

export function getSeverityLabel(severity: string): string {
  return SEVERITY_LABELS[severity as TicketSeverity] ?? severity
}

export function getSeverityColor(severity: string): string {
  return SEVERITY_COLORS[severity as TicketSeverity] ?? 'bg-muted text-foreground/80 border-border'
}
