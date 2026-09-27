// =============================================================================
// State Machine — Transições válidas de status de ticket
//
// Sprint A (PRD oficial): 7 macroetapas do fluxo operacional.
// Statuses legados mantidos para compatibilidade com DB existente.
// Admins podem forçar qualquer transição exceto sair de 'fechado'.
// =============================================================================

export type TicketStatusKey =
  | 'novos_chamados'
  | 'triagem'
  | 'em_atendimento'
  | 'em_teste'
  | 'aguardando_cliente'
  | 'pendencia_suporte'
  | 'pendencia_dev'
  | 'resolvido'
  | 'resolvido_com_manual'
  | 'resolvido_sem_manual'
  | 'post_mortem'
  | 'cancelado'
  | 'acompanhamento_deploy'
  | 'migracao_sat_nfce'
  | 'migracao_concluida'
  | 'fechado'

// ---------------------------------------------------------------------------
// Status terminal — imutável mesmo para admins
// ---------------------------------------------------------------------------
export const TERMINAL_STATUS = 'fechado'

/**
 * Transições permitidas — baseadas no fluxo PRD oficial.
 * Coluna visual → macroetapas:
 *   novos_chamados (Backlog)   → triagem
 *   triagem                   → em_atendimento | pendencia
 *   em_atendimento            → pendencia | em_teste | resolvido
 *   pendencia (aguardando_*)  → triagem | em_atendimento | em_teste
 *   em_teste                  → resolvido | em_atendimento
 *   resolvido                 → fechado | em_atendimento (reabertura)
 *   fechado                   → (terminal — imutável)
 */
export const VALID_TRANSITIONS: Record<TicketStatusKey, TicketStatusKey[]> = {
  // ── PRD Backlog ────────────────────────────────────────────────────────────
  novos_chamados: [
    'triagem', 'em_atendimento',
    'resolvido', 'resolvido_com_manual', 'resolvido_sem_manual',
    'cancelado',
  ],

  // ── PRD Triagem ───────────────────────────────────────────────────────────
  triagem: [
    'em_atendimento',
    'aguardando_cliente', 'pendencia_suporte', 'pendencia_dev',
    'resolvido', 'resolvido_com_manual', 'resolvido_sem_manual',
    'cancelado',
  ],

  // ── PRD Em Atendimento ────────────────────────────────────────────────────
  em_atendimento: [
    'triagem',
    'em_teste',
    'aguardando_cliente', 'pendencia_suporte', 'pendencia_dev',
    'resolvido', 'resolvido_com_manual', 'resolvido_sem_manual',
    'post_mortem', 'cancelado',
    'acompanhamento_deploy', 'migracao_sat_nfce',
  ],

  // ── PRD Pendência (dependência externa) ───────────────────────────────────
  aguardando_cliente: [
    'triagem', 'em_atendimento', 'em_teste',
    'resolvido', 'resolvido_com_manual', 'resolvido_sem_manual',
    'cancelado',
  ],
  pendencia_suporte: [
    'triagem', 'em_atendimento', 'em_teste', 'cancelado',
  ],
  pendencia_dev: [
    'triagem', 'em_atendimento', 'em_teste', 'cancelado',
  ],

  // ── PRD Teste e Homologação ───────────────────────────────────────────────
  em_teste: [
    'em_atendimento',
    'resolvido', 'resolvido_com_manual', 'resolvido_sem_manual',
    'cancelado',
  ],

  // ── PRD Resolvido (coluna visual unifica os 4 abaixo) ────────────────────
  resolvido: [
    'fechado',
    'em_atendimento', // reabertura
  ],
  resolvido_com_manual: [
    'fechado',
    'em_atendimento', // reabertura
    'post_mortem', 'cancelado',
  ],
  resolvido_sem_manual: [
    'fechado',
    'em_atendimento', // reabertura
    'cancelado',
  ],
  post_mortem: [
    'fechado', 'cancelado',
  ],

  // ── Legados ────────────────────────────────────────────────────────────────
  cancelado: [
    'novos_chamados', // reabertura
  ],
  acompanhamento_deploy: [
    'em_atendimento', 'resolvido', 'resolvido_com_manual', 'resolvido_sem_manual', 'cancelado',
  ],
  migracao_sat_nfce: [
    'migracao_concluida', 'em_atendimento', 'cancelado',
  ],
  migracao_concluida: [
    // terminal legado — só admin pode forçar
  ],

  // ── PRD Fechado — TERMINAL (imutável, read-only) ─────────────────────────
  fechado: [
    // Nenhuma transição permitida — nem mesmo admin pode sair de fechado
  ],
}

/**
 * Verifica se a transição de `from` para `to` é válida.
 *
 * @param from   - status atual do ticket
 * @param to     - novo status desejado
 * @param isAdmin - se true, bypassa restrições exceto 'fechado' (sempre imutável)
 */
export function isValidTransition(
  from: string,
  to: string,
  isAdmin = false
): { allowed: boolean; reason?: string } {
  // Fechado é sempre terminal — ninguém sai, nem admins
  if (from === TERMINAL_STATUS) {
    return {
      allowed: false,
      reason: `Ticket fechado é imutável. Nenhuma transição é permitida a partir de '${TERMINAL_STATUS}'.`,
    }
  }

  if (from === to) return { allowed: true } // no-op

  // Admins podem forçar qualquer transição (exceto sair de fechado — tratado acima)
  if (isAdmin) return { allowed: true }

  const allowed = VALID_TRANSITIONS[from as TicketStatusKey]
  if (!allowed) {
    // Status desconhecido no mapa (legado não mapeado) — permitir para não quebrar
    return { allowed: true }
  }

  if (allowed.includes(to as TicketStatusKey)) {
    return { allowed: true }
  }

  return {
    allowed: false,
    reason: `Transição de '${from}' para '${to}' não é permitida. Transições válidas: ${allowed.join(', ') || 'nenhuma (status terminal)'}`,
  }
}
