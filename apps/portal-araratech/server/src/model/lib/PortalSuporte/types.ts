// Tipos espelhando a API externa do portal-suporte (/api/external/tickets)

export type TicketPriority = "low" | "medium" | "high" | "urgent";
export type TicketSeverity = "P0" | "P1" | "P2" | "P3";

export type TicketStatus =
  | "novos_chamados"
  | "triagem"
  | "pendencia_suporte"
  | "pendencia_dev"
  | "em_atendimento"
  | "em_teste"
  | "aguardando_cliente"
  | "resolvido"
  | "resolvido_com_manual"
  | "resolvido_sem_manual"
  | "post_mortem"
  | "fechado"
  | "cancelado";

/** Envelope padrão de resposta única da API externa */
export interface ExternalApiSingleResponse<T> {
  data: T;
}

/** Filtros aceitos em GET /api/external/tickets */
export interface ExternalTicketListFilters {
  company_cnpj?: string;
  contact_email?: string;
  company_name?: string;
  status?: TicketStatus | string;
  priority?: TicketPriority | string;
  severity?: TicketSeverity | string;
  created_after?: string;
  created_before?: string;
  page?: number;
  page_size?: number;
}

export interface ExternalTicketSummary {
  id: string;
  title: string;
  status: TicketStatus | string;
  status_label: string;
  priority: TicketPriority | string;
  severity: TicketSeverity | string | null;
  company_name: string | null;
  company_cnpj: string | null;
  contact_email: string | null;
  created_at: string;
  updated_at: string;
  sla_deadline: string | null;
  sla_breached: boolean;
}

export interface ExternalTicketAttachment {
  id: string;
  file_name: string;
  file_url: string;
  file_size: number | null;
  created_at: string;
}

export interface ExternalTicketDetail extends ExternalTicketSummary {
  description: string;
  ticket_number: string | null;
  attachments: ExternalTicketAttachment[];
  messages_url: string;
}

export interface ExternalMessage {
  id: string;
  conteudo: string;
  remetente: string;
  interno: boolean;
  criado_em: string;
}

export interface ExternalAttachment {
  id: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  fileType: string;
  uploadedBy: string;
  createdAt: string;
}

export interface PaginationMeta {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface PaginatedTickets {
  data: ExternalTicketSummary[];
  meta: PaginationMeta;
}

export class PortalSuporteError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "PortalSuporteError";
    this.status = status;
  }
}
