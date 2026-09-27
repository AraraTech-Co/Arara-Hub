// =============================================================================
// Origem do chamado — fonte única de rótulos.
//
// Espelha o enum TicketSource (prisma/schema.prisma). Já são três consumidores
// (tela do chamado, barra de filtros do kanban e o drawer do mobile); uma
// quarta cópia divergiria na primeira origem nova.
// =============================================================================

export type TicketSource = 'portal' | 'whatsapp' | 'email' | 'telefone'

export const TICKET_SOURCES: { value: TicketSource; label: string }[] = [
  { value: 'portal', label: 'Portal' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'email', label: 'E-mail' },
  { value: 'telefone', label: 'Telefone' },
]

export const TICKET_SOURCE_LABELS: Record<string, string> = Object.fromEntries(
  TICKET_SOURCES.map((s) => [s.value, s.label]),
)

export function ticketSourceLabel(source: string | null | undefined): string {
  if (!source) return '—'
  return TICKET_SOURCE_LABELS[source] ?? source
}
