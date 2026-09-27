// =============================================================================
// Fases da conversa de WhatsApp — fonte canônica.
//
// Espelha o papel de lib/ticket-status.ts para os chamados. Antes esta lista
// vivia inline no thread-pane; com o kanban passou a ter dois consumidores, e
// duas cópias divergiriam na primeira fase nova.
//
// Os valores batem com o enum WAConversationPhase (prisma/schema.prisma).
// =============================================================================

import type { WAPhase } from '@/lib/api/whatsapp'

export interface WAPhaseMeta {
  key: WAPhase
  label: string
  /** Classe de fundo/borda da coluna e do chip. Só tokens — nunca hex inline. */
  accent: string
}

/** Ordem de exibição: da entrada até a conclusão. */
export const WA_PHASES: WAPhaseMeta[] = [
  { key: 'novo',               label: 'Novo',               accent: 'bg-sem-info    text-sem-info-fg    border-sem-info-bd' },
  { key: 'triagem',            label: 'Triagem',            accent: 'bg-muted       text-muted-foreground border-border' },
  { key: 'em_atendimento',     label: 'Em atendimento',     accent: 'bg-sem-warning text-sem-warning-fg border-sem-warning-bd' },
  { key: 'aguardando_cliente', label: 'Aguardando cliente', accent: 'bg-muted       text-muted-foreground border-border' },
  { key: 'resolvido',          label: 'Resolvido',          accent: 'bg-sem-success text-sem-success-fg border-sem-success-bd' },
]

export const WA_PHASE_ORDER: WAPhase[] = WA_PHASES.map((p) => p.key)

export function waPhaseLabel(phase: WAPhase): string {
  return WA_PHASES.find((p) => p.key === phase)?.label ?? phase
}

export function isWAPhase(value: unknown): value is WAPhase {
  return typeof value === 'string' && WA_PHASE_ORDER.includes(value as WAPhase)
}
