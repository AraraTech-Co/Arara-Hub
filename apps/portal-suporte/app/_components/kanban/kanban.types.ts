// =============================================================================
// Tipos compartilhados do Kanban — usados por kanban-board/column/card/filter-bar/etc.
// =============================================================================
//
// O board recebe tickets de duas origens diferentes que não usam o mesmo casing:
// (1) app/(admin)/admin/kanban/page.tsx serializa direto do Prisma em snake_case
//     na primeira carga (server component);
// (2) o polling de 30s (ticketsApi.kanban()) bate em getKanbanBoard(), que passa
//     por serializeTicket() em ticket.repository.ts — também snake_case, mas com
//     alguns campos extras (company/unit/received_by).
// RawKanbanTicket documenta as duas formas (snake_case e o camelCase Prisma cru,
// para o caso de algum caller repassar o objeto direto). normalizeTicket() em
// kanban-board.tsx reconcilia as duas para o formato canônico KanbanTicket usado
// por todo o resto da árvore de componentes.

import type {
  TicketStatus,
  TicketPriority,
  TicketSeverity,
  TicketType,
  TicketImpact,
  UserRole,
} from '@/db/types'

export interface KanbanPerson {
  id: string
  full_name?: string | null
  fullName?: string | null
  email?: string
  avatar_url?: string | null
}

export interface KanbanRating {
  score: number | null
  token: string
}

export interface KanbanSla {
  breached: boolean
  minutes_remaining: number | null
  paused: boolean
  escalated: boolean
  severity?: string | null
  response_deadline: string | null
  resolution_deadline: string
  first_response_at: string | null
  resolved_at: string | null
  response_sla_met?: boolean | null
  resolution_sla_met?: boolean | null
}

export interface KanbanAgent {
  id: string
  full_name: string | null
  email: string
  role?: UserRole
}

export interface KanbanStage {
  id: string;
  title: string;
  description: string;
  icon: string;
}

export interface KanbanCurrentUser {
  id: string
  role: string
  full_name?: string | null
  name?: string | null
  email?: string
}

/** Shape solto recebido de qualquer uma das duas origens — ver comentário acima. */
export interface RawKanbanTicket {
  id: string
  title: string
  description: string
  status: string
  priority: string
  severity?: string | null
  category?: string | null
  ticket_number?: string | null
  ticketNumber?: string | null
  ticket_type?: string | null
  ticketType?: string | null
  /** Por onde o chamado entrou: portal | whatsapp | email | telefone. */
  source?: string | null
  tags?: string[] | null
  recurring?: boolean
  is_public?: boolean
  isPublic?: boolean
  company_name?: string | null
  companyName?: string | null
  contact_email?: string | null
  contactEmail?: string | null
  position?: number
  created_at?: string
  createdAt?: string
  updated_at?: string
  updatedAt?: string
  user_id?: string | null
  userId?: string | null
  assigned_to?: string | null
  assignedTo?: string | null
  user?: KanbanPerson | null
  assignee?: KanbanPerson | null
  /** Resolvidos pelo controller do kanban — antes vinha só o id. */
  co_assignees?: KanbanPerson[]
  escalated_to_user?: KanbanPerson | null
  /** Responsável + escalado + co-responsáveis. É o que o filtro por pessoa usa. */
  envolvidos?: string[]
  message_count?: number
  attachment_count?: number
  _count?: { messages?: number; attachments?: number }
  sla?: KanbanSla | null
  pendency_reason?: string | null
  pendencyReason?: string | null
  pendency_type?: string | null
  pendencyType?: string | null
  follow_up_date?: string | null
  followUpDate?: string | null
  requester?: string | null
  company_cnpj?: string | null
  companyCnpj?: string | null
  impact?: string | null
  rating?: KanbanRating | null
  is_blocked?: boolean
  isBlocked?: boolean
  blocked_reason?: string | null
  blockedReason?: string | null
  pull_request_url?: string | null
  pullRequestUrl?: string | null
  column_entered_at?: string | null
  columnEnteredAt?: string | null
  coAssignees?: { userId: string }[]
  team?: { name: string } | null
  teamId?: string | null
  cnpj_ticket_count?: number | null
}

/** Formato canônico — resultado de normalizeTicket(), usado por todo o board. */
export interface KanbanTicket {
  id: string
  title: string
  description: string
  status: TicketStatus
  priority: TicketPriority
  severity: TicketSeverity | null
  category: string | null
  ticket_number: string | null
  ticket_type: TicketType | null
  /** Por onde o chamado entrou. Antigos vieram antes do campo: valem como portal. */
  source: string | null
  tags: string[]
  recurring: boolean
  is_public: boolean
  company_name: string | null
  contact_email: string | null
  position: number
  created_at: string
  updated_at: string
  user_id: string | null
  assigned_to: string | null
  user: KanbanPerson | null
  assignee: KanbanPerson | null
  co_assignees?: KanbanPerson[]
  escalated_to_user?: KanbanPerson | null
  envolvidos?: string[]
  message_count: number
  attachment_count: number
  sla: KanbanSla | null
  pendency_reason: string | null
  pendency_type: string | null
  follow_up_date: string | null
  requester: string | null
  company_cnpj: string | null
  impact: TicketImpact | null
  rating: KanbanRating | null
  is_blocked: boolean
  blocked_reason: string | null
  pull_request_url: string | null
  column_entered_at: string | null
  // Presentes no payload inicial (page.tsx) e lidos direto por card/column/filter-bar,
  // mas não tocados por normalizeTicket — preservados via spread.
  coAssignees?: { userId: string }[]
  company?: { id: string; name: string } | null
  unit?: { id: string; name: string; city: string | null; state: string | null } | null
  received_by?: KanbanPerson | null
  team?: { name: string } | null
  teamId?: string | null
  cnpj_ticket_count?: number | null
}
