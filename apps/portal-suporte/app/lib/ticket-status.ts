// =============================================================================
// Constantes compartilhadas de status de ticket — labels, cores e ordem.
//
// Sprint A (PRD): 7 colunas oficiais com mapeamento visual de legados.
// Os statuses legados permanecem no DB; são mapeados visualmente nas colunas.
// =============================================================================

export type TicketStatusKey =
  | 'novos_chamados'
  | 'triagem'
  | 'pendencia_suporte'
  | 'pendencia_dev'
  | 'em_atendimento'
  | 'em_teste'
  | 'aguardando_cliente'
  | 'resolvido'
  | 'resolvido_com_manual'
  | 'resolvido_sem_manual'
  | 'post_mortem'
  | 'cancelado'
  | 'fechado'
  | 'acompanhamento_deploy'
  | 'migracao_sat_nfce'
  | 'migracao_concluida'

// ---------------------------------------------------------------------------
// Labels exibidos no Kanban e nos selects
// ---------------------------------------------------------------------------
export const STATUS_LABELS: Record<TicketStatusKey, string> = {
  novos_chamados:       'Backlog',
  triagem:              'Em Triagem',
  pendencia_suporte:    'Pendência',
  pendencia_dev:        'Pendência DEV',
  em_atendimento:       'Em Atendimento',
  em_teste:             'Teste e Homologação',
  aguardando_cliente:   'Pendência — Cliente',
  resolvido:            'Resolvido',
  resolvido_com_manual: 'Resolvido c/ Manual',
  resolvido_sem_manual: 'Resolvido s/ Manual',
  post_mortem:          'Post-Mortem',
  cancelado:            'Cancelado',
  fechado:              'Fechado',
  acompanhamento_deploy: 'Acompanhamento Deploy',
  migracao_sat_nfce:    'Migração SAT/NFC-e',
  migracao_concluida:   'Migração Concluída',
}

// ---------------------------------------------------------------------------
// Classes Tailwind para badges e cabeçalhos de coluna (bg + text + border)
// Tokens definidos em app/styles/status.css — light/dark automático via CSS vars.
// ---------------------------------------------------------------------------
export const STATUS_COLORS: Record<TicketStatusKey, string> = {
  novos_chamados:        'bg-status-backlog          text-status-backlog-fg          border-status-backlog-bd',
  triagem:               'bg-status-triage           text-status-triage-fg           border-status-triage-bd',
  pendencia_suporte:     'bg-status-pending          text-status-pending-fg          border-status-pending-bd',
  pendencia_dev:         'bg-status-pending-dev      text-status-pending-dev-fg      border-status-pending-dev-bd',
  em_atendimento:        'bg-status-in-progress      text-status-in-progress-fg      border-status-in-progress-bd',
  em_teste:              'bg-status-testing          text-status-testing-fg          border-status-testing-bd',
  aguardando_cliente:    'bg-status-waiting          text-status-waiting-fg          border-status-waiting-bd',
  resolvido:             'bg-status-resolved         text-status-resolved-fg         border-status-resolved-bd',
  resolvido_com_manual:  'bg-status-resolved-manual  text-status-resolved-manual-fg  border-status-resolved-manual-bd',
  resolvido_sem_manual:  'bg-status-resolved-manual  text-status-resolved-manual-fg  border-status-resolved-manual-bd',
  post_mortem:           'bg-muted text-foreground/80 border-border',
  cancelado:             'bg-status-cancelled        text-status-cancelled-fg        border-status-cancelled-bd',
  fechado:               'bg-muted text-muted-foreground border-border',
  acompanhamento_deploy: 'bg-muted text-foreground/80 border-border',
  migracao_sat_nfce:     'bg-status-migration        text-status-migration-fg        border-status-migration-bd',
  migracao_concluida:    'bg-status-migration-done   text-status-migration-done-fg   border-status-migration-done-bd',
}

// ---------------------------------------------------------------------------
// Ícones das colunas (espelha KANBAN_STAGES em kanban-board.tsx)
// ---------------------------------------------------------------------------
export const STATUS_ICONS: Record<TicketStatusKey, string> = {
  novos_chamados:       '📥',
  triagem:              '🔎',
  pendencia_suporte:    '⏸️',
  pendencia_dev:        '🟣',
  em_atendimento:       '🛠️',
  em_teste:             '🧪',
  aguardando_cliente:   '⏳',
  resolvido:            '✔️',
  resolvido_com_manual: '📖',
  resolvido_sem_manual: '✅',
  post_mortem:          '🔴',
  cancelado:            '🚫',
  fechado:              '🔒',
  acompanhamento_deploy: '📦',
  migracao_sat_nfce:    '🔄',
  migracao_concluida:   '✅',
}

// ---------------------------------------------------------------------------
// Ordem visual do Kanban (7 colunas PRD + legados mapeados)
// ---------------------------------------------------------------------------
export const KANBAN_STATUS_ORDER: TicketStatusKey[] = [
  'novos_chamados',
  'triagem',
  'em_atendimento',
  'pendencia_suporte',
  'aguardando_cliente',
  'pendencia_dev',
  'em_teste',
  'resolvido',
  'resolvido_com_manual',
  'resolvido_sem_manual',
  'post_mortem',
  'cancelado',
  'fechado',
  'acompanhamento_deploy',
  'migracao_sat_nfce',
  'migracao_concluida',
]

// ---------------------------------------------------------------------------
// Status considerados "finalizados" — usados em métricas e SLATracking
// ---------------------------------------------------------------------------
export const RESOLVED_STATUSES: TicketStatusKey[] = [
  'resolvido',
  'resolvido_com_manual',
  'resolvido_sem_manual',
  'post_mortem',
  'cancelado',
  'fechado',
]

export function isResolvedStatus(status: string): boolean {
  return (RESOLVED_STATUSES as string[]).includes(status)
}

// ---------------------------------------------------------------------------
// Status terminais (read-only — nenhuma transição permitida mesmo com admin)
// ---------------------------------------------------------------------------
export const TERMINAL_STATUSES: string[] = ['fechado']

export function isTerminalStatus(status: string): boolean {
  return TERMINAL_STATUSES.includes(status)
}

// ---------------------------------------------------------------------------
// 7 Colunas visuais do PRD (mapeamento status DB → coluna visual)
// ---------------------------------------------------------------------------
export const KANBAN_COLUMN_STATUSES: Record<string, TicketStatusKey[]> = {
  novos_chamados: ['novos_chamados'],
  triagem:        ['triagem'],
  em_atendimento: ['em_atendimento'],
  pendencia:      ['pendencia_suporte', 'pendencia_dev', 'aguardando_cliente'],
  em_teste:       ['em_teste'],
  resolvido:      ['resolvido', 'resolvido_com_manual', 'resolvido_sem_manual', 'post_mortem'],
  fechado:        ['fechado'],
}

/** Statuses reais que mapeiam para a coluna virtual Pendência */
export const PENDENCIA_DB_STATUSES: TicketStatusKey[] = [
  'pendencia_suporte',
  'pendencia_dev',
  'aguardando_cliente',
]

export function isPendencyStatus(status: string): boolean {
  return (PENDENCIA_DB_STATUSES as string[]).includes(status)
}

/** Retorna o id da coluna Kanban para um status do banco */
export function getKanbanColumnId(status: string): string {
  for (const [columnId, statuses] of Object.entries(KANBAN_COLUMN_STATUSES)) {
    if ((statuses as string[]).includes(status)) return columnId
  }
  return status
}

/** Verifica se um status pertence a uma coluna (inclui colunas virtuais) */
export function statusBelongsToColumn(status: string, columnId: string): boolean {
  const statuses = KANBAN_COLUMN_STATUSES[columnId]
  if (statuses) return (statuses as string[]).includes(status)
  return status === columnId
}

/** Verifica se dois status/colunas são a mesma coluna visual do Kanban */
export function isSameKanbanColumn(fromStatus: string, toColumnId: string): boolean {
  return getKanbanColumnId(fromStatus) === toColumnId
}

// ---------------------------------------------------------------------------
// Checklists padrão por estágio (usados como template ao criar novos itens)
// ---------------------------------------------------------------------------
export const DEFAULT_CHECKLIST_ITEMS: Partial<Record<TicketStatusKey, string[]>> = {
  novos_chamados: [
    'Cliente identificado',
    'Descrição mínima do problema',
    'Severidade atribuída',
    'Horário de abertura registrado',
    'Evidências anexadas (se houver)',
  ],
  triagem: [
    'Tipo de chamado identificado',
    'Validado impacto',
    'Validado módulo',
    'Verificado se é recorrente / existe manual',
    'Definido responsável',
    'Card renomeado com padrão',
    'Comentário inicial adicionado',
  ],
  em_atendimento: [
    'Problema compreendido',
    'Ambiente analisado',
    'Logs coletados',
    'Testes feitos',
    'Possível causa definida',
    'Ações realizadas documentadas',
    'Status atualizado no card',
  ],
  em_teste: [
    'Bug corrigido / ajuste aplicado',
    'Reparo testado no ambiente correto',
    'Fluxo completo reproduzido',
    'Logs limpos',
    'Evidências anexadas',
    'Comunicação pronta para enviar ao cliente',
  ],
  aguardando_cliente: [
    'Solução enviada ao cliente',
    'Evidências anexadas',
    'Aguardando retorno',
    'Follow-up agendado',
  ],
  pendencia_suporte: [
    'Tipo de pendência externa registrado',
    'Parceiro/fornecedor notificado',
    'Prazo de retorno definido',
    'Follow-up agendado',
  ],
  pendencia_dev: [
    'Tarefa aberta no time de desenvolvimento',
    'Reproduzido em ambiente interno',
    'Prioridade negociada com o produto',
  ],
  resolvido: [
    'Solução aplicada',
    'Cliente confirmou resolução',
    'Card encerrado',
  ],
  resolvido_com_manual: [
    'Problema documentado',
    'Causa encontrada',
    'Solução passo a passo clara',
    'Tempo médio registrado',
    'Quando escalar definido',
    'Manual revisado por N2/N3',
  ],
  resolvido_sem_manual: [
    'Solução aplicada',
    'Cliente validou',
    'Card finalizado',
  ],
  post_mortem: [
    'O que aconteceu',
    'Linha do tempo completa',
    'Impacto',
    'Causa raiz (RCA)',
    'Ações corretivas',
    'Ações preventivas',
    'Responsáveis pelos próximos passos',
  ],
}

// ---------------------------------------------------------------------------
// Statuses APOSENTADOS — fora do quadro e fora dos seletores.
//
// Vieram do Trello e não existem mais como etapa de trabalho. Continuam no
// banco porque chamado antigo não se reescreve: o rótulo segue sendo exibido
// em quem já está neles (ver `getStatusLabel`), mas ninguém consegue mover um
// chamado PARA cá. O quadro já os escondia desde sempre — era só o seletor do
// card que continuava oferecendo.
// ---------------------------------------------------------------------------
export const STATUSES_APOSENTADOS: string[] = [
  'cancelado',
  'acompanhamento_deploy',
  'migracao_sat_nfce',
  'migracao_concluida',
]

/**
 * AS COLUNAS DO QUADRO — e é isto que o seletor de status oferece.
 *
 * O quadro tem SETE colunas. `pendencia` e `resolvido` são VIRTUAIS: agrupam
 * mais de um status do banco (Pendência junta suporte, DEV e cliente).
 * Oferecer os status do banco no seletor fazia a tela do chamado mostrar doze
 * opções para um quadro de sete — duas linguagens para a mesma coisa.
 *
 * Quem escolhe "Pendência" responde DEPOIS de que tipo ela é, no mesmo diálogo
 * que o quadro já usa ao arrastar; o status do banco sai de lá.
 *
 * Os rótulos são os do QUADRO (`KANBAN_STAGES` em kanban-board.tsx), não os de
 * `STATUS_LABELS` — "Triagem", e não "Em Triagem".
 */
export const COLUNAS_DO_QUADRO: {
  id: string
  label: string
  /** O status gravado quando a coluna não tem sub-escolha. */
  statusPadrao: TicketStatusKey
  /** true = a coluna pergunta o tipo antes de gravar. */
  perguntaSubtipo?: boolean
}[] = [
  { id: 'novos_chamados', label: 'Backlog',             statusPadrao: 'novos_chamados' },
  { id: 'triagem',        label: 'Triagem',             statusPadrao: 'triagem' },
  { id: 'em_atendimento', label: 'Em Atendimento',      statusPadrao: 'em_atendimento' },
  { id: 'pendencia',      label: 'Pendência',           statusPadrao: 'pendencia_suporte', perguntaSubtipo: true },
  { id: 'em_teste',       label: 'Teste e Homologação', statusPadrao: 'em_teste' },
  { id: 'resolvido',      label: 'Resolvido',           statusPadrao: 'resolvido' },
  { id: 'fechado',        label: 'Fechado',             statusPadrao: 'fechado' },
]

/** Os status do banco que caem numa coluna — usado pelos filtros de lista. */
export function statusesDaColuna(colunaId: string): string[] {
  return (KANBAN_COLUMN_STATUSES[colunaId] as string[] | undefined) ?? [colunaId]
}

/** Labels de statuses legados (ocultos no Kanban, ainda no DB) */
export const LEGACY_STATUS_LABELS: Record<string, string> = {
  acompanhamento_deploy: '📦 Acompanhamento Deploy',
  migracao_sat_nfce:     'Migração SAT/NFC-e',
  migracao_concluida:    'Migração Concluída SAT/NFC-e',
}

export function getStatusLabel(status: string): string {
  return STATUS_LABELS[status as TicketStatusKey]
    ?? LEGACY_STATUS_LABELS[status]
    ?? status
}

export function getStatusColor(status: string): string {
  return STATUS_COLORS[status as TicketStatusKey]
    ?? 'bg-muted text-foreground/80 border-border'
}

// ---------------------------------------------------------------------------
// CLIENT_STATUS_MAP — reduz 16 statuses internos em 9 públicos
// O cliente nunca vê rótulos técnicos (pendencia_dev, migracao_sat_nfce…).
// ---------------------------------------------------------------------------
export const CLIENT_STATUS_MAP: Record<TicketStatusKey, string> = {
  novos_chamados:        'Aberto',
  triagem:               'Em Análise',
  em_atendimento:        'Em Atendimento',
  em_teste:              'Em Validação',
  aguardando_cliente:    'Aguardando Sua Resposta',
  pendencia_suporte:     'Em Análise',
  pendencia_dev:         'Em Desenvolvimento',
  acompanhamento_deploy: 'Em Implantação',
  migracao_sat_nfce:     'Em Implantação',
  migracao_concluida:    'Concluído',
  resolvido:             'Resolvido',
  resolvido_com_manual:  'Resolvido',
  resolvido_sem_manual:  'Resolvido',
  post_mortem:           'Aguardando Confirmação',
  cancelado:             'Cancelado',
  fechado:               'Fechado',
}

export function getClientStatusLabel(status: string): string {
  return CLIENT_STATUS_MAP[status as TicketStatusKey] ?? 'Em Análise'
}
