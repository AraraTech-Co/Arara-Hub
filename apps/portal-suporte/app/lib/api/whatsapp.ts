import { api } from './client'
import type { TicketPriority } from '@/db/types'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WAMessage {
  id: string
  from_me: boolean
  sender_name: string | null
  body: string
  media_type: string | null
  media_url?: string | null
  /** Id da mensagem quando há mídia guardada — pedir por `whatsappApi.midia`. */
  media_ref?: string | null
  timestamp: string
}

export interface WAConversation {
  id: string
  remote_jid: string
  contact_name: string | null
  status: string
  updated_at: string
  last_message: WAMessage | null
  // Estado de fila na carga inicial — opcionais porque este mesmo tipo serve à
  // tela antiga admin/whatsapp, que não os consome.
  phase?: WAPhase
  priority?: WAPriority
  unread_count?: number
  assigned_to?: WAInboxRef | null
  department?: { id: string; name: string; color: string | null } | null
  company?: WAInboxRef | null
  contact?: WAInboxRef | null
  ticket: {
    id: string
    title: string
    status: string
    priority: string
    ticket_number: string | null
    company_name: string | null
    assignee: { id: string; fullName: string } | null
    sla: { resolution_deadline: string; breached: boolean } | null
  } | null
}

// ─── Inbox (SSE) types ──────────────────────────────────────────────────────
// Shapes emitidos pelos streams SSE. Separados dos tipos legados acima para
// não quebrar o monolito admin/whatsapp que consome WAConversation/WAMessage.

export interface WAInboxLastMessage {
  id: string
  from_me: boolean
  body: string
  media_type: string | null
  timestamp: string
}

export interface WAInboxRef {
  id: string
  name: string
}

export type WAPhase =
  | 'novo'
  | 'triagem'
  | 'em_atendimento'
  | 'aguardando_cliente'
  | 'resolvido'

/** Mesma escala do chamado: a prioridade da conversa vira a do ticket aberto dela. */
export type WAPriority = TicketPriority

export interface WAAssignedRef {
  id: string
  name: string | null
}

export interface WADepartmentRef {
  id: string
  name: string
  color: string | null
}

/** Conversa como emitida por GET /api/whatsapp/stream (evento `conversations`). */
export interface WAInboxConversation {
  id: string
  remote_jid: string
  /** Grupo do WhatsApp (17/09/2026): fixo na aba Grupos, sem dono, fora da fila. */
  is_group?: boolean
  contact_name: string | null
  status: string
  unread_count: number
  updated_at: string
  company: WAInboxRef | null
  contact: WAInboxRef | null
  last_message: WAInboxLastMessage | null
  phase: WAPhase
  priority: WAPriority
  assigned_to: WAAssignedRef | null
  department: WADepartmentRef | null
  /**
   * Chamado aberto a partir desta conversa. Presente = o acompanhamento migrou
   * para o kanban de chamados, e o card sai do kanban do WhatsApp.
   */
  ticket: WAConversationTicketRef | null
  /** Etiquetas da conversa (usadas pelo filtro por etiqueta). */
  tags?: WATagRef[]
  /** Motivo do encerramento. Null nas conversas fechadas antes desta feature. */
  close_reason?: WAInboxRef | null
}

export interface WATagRef {
  id: string
  name: string
  color: string | null
}

export interface WAConversationTicketRef {
  id: string
  ticket_number: string | null
}

export interface Department {
  id: string
  name: string
  slug: string
  color: string | null
  menuKey: string | null
  active: boolean
}

export interface UpdateConversationData {
  /** Nome escrito por quem atende — para o grupo que a Avisa não sabe nomear. */
  contact_name?: string | null
  phase?: WAPhase
  priority?: WAPriority
  departmentId?: string | null
  /** Obrigatório ao mover para `resolvido` (arrasto no kanban). */
  closeReasonId?: string
}

export interface CreateDepartmentData {
  name: string
  slug?: string
  color?: string | null
  menuKey?: string | null
}

/** Mensagem como emitida por GET /api/whatsapp/[id]/stream (evento `messages`). */
export interface WAReacao {
  emoji: string
  /** Quem reagiu: id do atendente, ou `cliente:<nome>` quando veio do WhatsApp. */
  por: string
  nome: string | null
  em: string
}

export interface WACitacao {
  message_id: string
  corpo: string
  autor: string | null
}

export interface WAThreadMessage {
  id: string
  /** Id no WhatsApp — responder, reagir e apagar dependem dele. */
  message_id?: string | null
  sender_jid?: string | null
  reacoes?: WAReacao[]
  apagada?: boolean
  editada?: boolean
  citacao?: WACitacao | null
  from_me: boolean
  sender_name: string | null
  body: string
  media_type: string | null
  media_url: string | null
  /** Nome do arquivo enviado (anexo do portal). */
  media_name?: string | null
  /** Mídia decifrada no servidor, carregada sob demanda (GET /whatsapp/midia/:id). */
  media_ref?: string | null
  timestamp: string
}

export interface WAGroup {
  id: string
  name: string
  [key: string]: unknown
}

// ─── Sprint 3: notas / respostas rápidas / automações ─────────────────────────

/** Nota interna de uma conversa (invisível ao cliente). */
export interface WANote {
  id: string
  body: string
  createdAt: string
  author: { id: string; fullName: string | null } | null
}

/** Resposta rápida disparada por atalho no composer. */
export interface WAQuickReply {
  id: string
  shortcut: string
  title: string
  body: string
  departmentId: string | null
  active: boolean
}

export type WAAutomationTrigger =
  | 'no_reply_24h'
  | 'entered_queue'
  | 'sla_breached'
  | 'phase_changed'

export type WAAutomationAction =
  | 'move_phase'
  | 'send_message'
  | 'notify_agents'
  | 'assign'

/** Regra de automação do WhatsApp. */
export interface WAAutomationRule {
  id: string
  name: string
  trigger: WAAutomationTrigger
  action: WAAutomationAction
  conditions: unknown
  actionParams: unknown
  active: boolean
}

export interface CreateAutomationData {
  name: string
  trigger: WAAutomationTrigger
  action: WAAutomationAction
  conditions?: unknown
  actionParams?: unknown
}

export interface UpdateAutomationData {
  active?: boolean
  name?: string
}

// ─── Sprint 4: CRM / ticket / métricas ───────────────────────────────────────

/** Etiqueta do catálogo — GET /api/whatsapp/tags (cru do Prisma). */
export interface WATag {
  id: string
  name: string
  color: string
  active: boolean
}

/** Atendente para o dropdown de atribuição — GET /api/whatsapp/agents. */
export interface WAAgent {
  id: string
  name: string | null
  online: boolean
}

/**
 * Etiqueta de uma conversa, na forma que a API DEVOLVE: plana.
 *
 * Era declarada como `{ id, tag: { id, name, color } }` — o formato do include
 * do Prisma, do backend anterior. A plataforma achata: o serializador monta
 * `{ id, name, color }` a partir do vínculo (ver a rota de conversas). Como
 * ninguém corrigiu o tipo, `detail.tags.map(t => t.tag.id)` compilava e
 * quebrava em tempo de execução com "undefined is not an object (evaluating
 * 'e.tag.id')" — e só em conversa QUE TEM etiqueta, porque com a lista vazia o
 * map nunca roda. Foi assim que passou despercebido.
 */
export interface WAConversationTag {
  id: string
  name: string
  color: string | null
}

/** Conversa com contexto de CRM — GET /api/whatsapp/[id] (cru do Prisma, camelCase). */
export interface WAConversationDetail {
  id: string
  remoteJid: string
  contactName: string | null
  providerContactId: string | null
  status: string
  phase: string
  priority: string
  unreadCount: number
  slaDueAt: string | null
  firstResponseAt: string | null
  assignedToId: string | null
  company: { id: string; name: string; cnpj: string | null; phone: string | null } | null
  contact: {
    id: string
    name: string
    email: string | null
    phone: string | null
    whatsapp: string | null
    roleTitle: string | null
  } | null
  assignedTo: { id: string; fullName: string | null } | null
  department: { id: string; name: string; color: string | null } | null
  ticket: {
    id: string
    ticketNumber: string | null
    title: string
    status: string
    priority: string
  } | null
  tags: WAConversationTag[]
}

/** Contadores do dashboard da inbox — GET /api/whatsapp/metrics. */
export interface WAMetrics {
  open: number
  queue: number
  slaAtRisk: number
  byPhase: Record<string, number>
}

// ─── API client ───────────────────────────────────────────────────────────────

export const whatsappApi = {
  /** GET /api/whatsapp — listar conversas */
  listConversations: () => api.get<{ data: WAConversation[] }>('/api/whatsapp'),

  /** GET /api/whatsapp/[id]/messages — mensagens de uma conversa */
  getMessages: (id: string) =>
    api.get<{ data: WAMessage[]; nao_lidas?: number }>(`/api/whatsapp/${id}/messages`),

  /** GET /api/whatsapp/dispositivos — aparelhos que já responderam pelo número (admin) */
  dispositivos: () =>
    api.get<{ data: { dispositivo: string; mensagens: number; ultimo_uso: string | null; ultima_mensagem: string; profile_id: string | null }[] }>('/api/whatsapp/dispositivos'),

  /** GET /api/whatsapp/midia/[id] — conteúdo (data: URI) da mídia de uma mensagem */
  midia: (mensagemId: string) =>
    api.get<{ data: { id: string; media_type: string | null; data_uri: string } }>(`/api/whatsapp/midia/${mensagemId}`),

  /** POST /api/whatsapp — enviar mensagem (com anexo opcional, base64) */
  sendMessage: (
    conversationId: string,
    message: string,
    anexo?: { nome: string; dados: string },
    responderA?: { message_id: string },
  ) => api.post<{ data: WAMessage }>('/api/whatsapp', {
    conversationId, message, anexo, responder_a: responderA,
  }),

  /** POST /api/whatsapp/mensagem/[id]/acao — reagir (emoji vazio remove) ou apagar */
  acaoNaMensagem: (
    id: string,
    acao: 'reagir' | 'apagar' | 'editar',
    extra?: { emoji?: string; message?: string },
  ) =>
    api.post<{ data: { reacoes?: WAReacao[]; apagada?: boolean; body?: string } }>(
      `/api/whatsapp/mensagem/${id}/acao`, { acao, ...extra },
    ),

  /** GET /api/whatsapp/groups — listar grupos */
  listGroups: () => api.get<{ data: WAGroup[] }>('/api/whatsapp/groups'),

  // ── Fila / atribuição / fases (Sprint 2) ──────────────────────────────────

  /** PATCH /api/whatsapp/[id] — atualiza fase / prioridade / departamento */
  updateConversation: (id: string, data: UpdateConversationData) =>
    api.patch<{ data: WAInboxConversation }>(`/api/whatsapp/${id}`, data),

  /** POST /api/whatsapp/[id]/assign — "Atender" (pull). Lança ApiError 409 se indisponível */
  assignConversation: (id: string) =>
    api.post<{ data: { ok: true } }>(`/api/whatsapp/${id}/assign`, {}),

  /** POST /api/whatsapp/[id]/reassign — reatribui a conversa a outro agente */
  reassignConversation: (id: string, agentId: string) =>
    api.post<{ data: { ok: true } }>(`/api/whatsapp/${id}/reassign`, { agentId }),

  /** POST /api/whatsapp/[id]/unassign — remove a atribuição (volta à fila) */
  unassignConversation: (id: string) =>
    api.post<{ data: unknown }>(`/api/whatsapp/${id}/unassign`, {}),

  /** POST /api/whatsapp/[id]/resolve — conclui a conversa (motivo é obrigatório) */
  resolveConversation: (id: string, closeReasonId: string) =>
    api.post<{ data: unknown }>(`/api/whatsapp/${id}/resolve`, { closeReasonId }),

  /** GET /api/whatsapp/close-reasons — motivos ativos para o diálogo de concluir */
  listCloseReasons: () => api.get<{ data: WAInboxRef[] }>('/api/whatsapp/close-reasons'),

  /** GET /api/whatsapp/agents — atendentes p/ o dropdown de atribuição */
  listAgents: () => api.get<{ data: WAAgent[] }>('/api/whatsapp/agents'),

  // ── Etiquetas (Sprint 5) ──────────────────────────────────────────────────

  /** GET /api/whatsapp/tags — catálogo de etiquetas */
  listTags: () => api.get<{ data: WATag[] }>('/api/whatsapp/tags'),

  /** POST /api/whatsapp/tags — cria uma etiqueta no catálogo */
  createTag: (data: { name: string; color?: string }) =>
    api.post<{ data: WATag }>('/api/whatsapp/tags', data),

  /** POST /api/whatsapp/[id]/tags — vincula etiqueta à conversa */
  attachTag: (id: string, tagId: string) =>
    api.post<{ data: unknown }>(`/api/whatsapp/${id}/tags`, { tagId }),

  /** DELETE /api/whatsapp/[id]/tags?tagId= — desvincula etiqueta da conversa */
  detachTag: (id: string, tagId: string) =>
    api.delete<{ data: unknown }>(`/api/whatsapp/${id}/tags?tagId=${encodeURIComponent(tagId)}`),

  /** GET /api/whatsapp/departments — lista departamentos */
  listDepartments: () => api.get<{ data: Department[] }>('/api/whatsapp/departments'),

  /** POST /api/whatsapp/departments — cria um departamento */
  createDepartment: (data: CreateDepartmentData) =>
    api.post<{ data: Department }>('/api/whatsapp/departments', data),

  /** GET /api/whatsapp/presence — presença atual do atendente (+ preferência de som, que segue o usuário) */
  getPresence: () =>
    api.get<{ data: { online: boolean; som?: boolean } }>('/api/whatsapp/presence'),

  /** POST /api/whatsapp/presence — alterna presença online/offline */
  setPresence: (online: boolean) =>
    api.post<{ data: { online: boolean } }>('/api/whatsapp/presence', { online }),

  /** POST /api/whatsapp/presence — grava só a preferência do aviso sonoro (não mexe no Online) */
  setSom: (som: boolean) =>
    api.post<{ data: { som: boolean } }>('/api/whatsapp/presence', { som }),

  // ── Notas internas (Sprint 3) ─────────────────────────────────────────────

  /** GET /api/whatsapp/[id]/notes — lista notas internas da conversa */
  listNotes: (id: string) =>
    api.get<{ data: WANote[] }>(`/api/whatsapp/${id}/notes`),

  /** POST /api/whatsapp/[id]/notes — adiciona nota interna */
  addNote: (id: string, body: string) =>
    api.post<{ data: WANote }>(`/api/whatsapp/${id}/notes`, { body }),

  // ── Respostas rápidas (Sprint 3) ──────────────────────────────────────────

  /** GET /api/whatsapp/quick-replies — lista respostas rápidas */
  listQuickReplies: () =>
    api.get<{ data: WAQuickReply[] }>('/api/whatsapp/quick-replies'),

  // ── Automações (Sprint 3) ─────────────────────────────────────────────────

  /** GET /api/whatsapp/automations — lista regras de automação */
  listAutomations: () =>
    api.get<{ data: WAAutomationRule[] }>('/api/whatsapp/automations'),

  /** POST /api/whatsapp/automations — cria uma regra de automação */
  createAutomation: (data: CreateAutomationData) =>
    api.post<{ data: WAAutomationRule }>('/api/whatsapp/automations', data),

  /** PATCH /api/whatsapp/automations/[id] — atualiza (ativo / nome) */
  updateAutomation: (id: string, data: UpdateAutomationData) =>
    api.patch<{ data: WAAutomationRule }>(`/api/whatsapp/automations/${id}`, data),

  // ── CRM / ticket / métricas (Sprint 4) ────────────────────────────────────

  /** GET /api/whatsapp/[id] — conversa com contexto de CRM */
  getConversation: (id: string) =>
    api.get<{ data: WAConversationDetail }>(`/api/whatsapp/${id}`),

  /** POST /api/whatsapp/[id]/contato — cadastra (ou atualiza) o contato da conversa. */
  cadastrarContato: (id: string, body: { nome: string; telefone?: string; empresa_id?: string }) =>
    api.post<{
      data: {
        contato_id: string
        nome: string
        telefone: string | null
        sem_telefone: boolean
        empresa: { id: string; name: string | null } | null
        ja_existia: boolean
      }
    }>(`/api/whatsapp/${id}/contato`, body),

  /**
   * POST /api/whatsapp/[id]/ticket — abre o chamado a partir da conversa.
   * Título e descrição vêm da janela; solicitante, responsável e empresa saem
   * da conversa, no servidor.
   */
  createTicket: (
    id: string,
    body: {
      title: string
      description: string
      category?: string | null
      priority?: WAPriority
    },
  ) =>
    api.post<{ data: { ticketId: string; created: boolean } }>(
      `/api/whatsapp/${id}/ticket`,
      body,
    ),

  /** GET /api/whatsapp/metrics — contadores do dashboard da inbox */
  getMetrics: () => api.get<{ data: WAMetrics }>('/api/whatsapp/metrics'),

  /** GET /api/whatsapp/analytics — painel de desempenho do atendimento */
  getAnalytics: (params: {
    from?: string
    to?: string
    granularity?: WAGranularity
    metric?: WASeriesMetric
  } = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v != null) as [string, string][],
    ).toString()
    return api.get<{ data: WAAnalytics }>(`/api/whatsapp/analytics${qs ? `?${qs}` : ''}`)
  },
}

// ─── Analytics ────────────────────────────────────────────────────────────────

export type WAGranularity = 'hour' | 'day' | 'week'

export type WASeriesMetric =
  | 'novos_contatos'
  | 'conversas_unicas'
  | 'conversas_abertas'
  | 'conversas_encerradas'

export interface WAAnalytics {
  period: { from: string; to: string; granularity: WAGranularity }
  funnel: {
    total: number
    botOnly: number
    botThenTeam: number
    teamOnly: number
    noResponse: number
    resolvedFromBotOnly: number
    resolvedFromBotThenTeam: number
    resolvedFromTeamOnly: number
  }
  totals: { assignments: number; firstResponses: number; closed: number }
  /** Segundos; null quando não houve amostra no período. */
  times: {
    firstResponseMedian: number | null
    firstResponseAvg: number | null
    resolutionMedian: number | null
    resolutionAvg: number | null
  }
  agents: Array<{
    agentId: string | null
    agentName: string | null
    assigned: number
    responded: number
    closed: number
    firstResponseMedian: number | null
    firstResponseAvg: number | null
    resolutionMedian: number | null
    resolutionAvg: number | null
  }>
  daily: Array<{ bucket: string; assigned: number; responded: number; closed: number }>
  series: { metric: WASeriesMetric; points: Array<{ bucket: string; value: number }> }
  /**
   * Por que os atendimentos foram encerrados no período (maior primeiro).
   * `reasonId` null = conversas encerradas antes de o motivo existir.
   */
  closeReasons: Array<{ reasonId: string | null; reasonName: string; closed: number }>
}
