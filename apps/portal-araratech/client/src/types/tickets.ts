/**
 * Tipos das respostas da API interna de tickets (/api/tickets).
 * Espelham os DTOs da lib PortalSuporte no server.
 */

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

export interface TicketSummary {
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

export interface TicketAttachment {
  id: string;
  file_name: string;
  file_url: string;
  file_size: number | null;
  created_at: string;
}

export interface TicketDetail extends TicketSummary {
  description: string;
  ticket_number: string | null;
  attachments: TicketAttachment[];
  messages_url: string;
}

export interface TicketMessage {
  id: string;
  conteudo: string;
  remetente: string;
  interno: boolean;
  criado_em: string;
}

export interface TicketExternalAttachment {
  id: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  fileType: string;
  uploadedBy: string;
  createdAt: string;
}

export interface TicketPaginationMeta {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface TicketListResponse {
  data: TicketSummary[];
  meta: TicketPaginationMeta;
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

export const TICKET_STATUS_OPTIONS: { value: TicketStatus; label: string }[] = [
  { value: "novos_chamados", label: "Novos chamados" },
  { value: "triagem", label: "Triagem" },
  { value: "pendencia_suporte", label: "Pendência suporte" },
  { value: "pendencia_dev", label: "Pendência dev" },
  { value: "em_atendimento", label: "Em atendimento" },
  { value: "em_teste", label: "Em teste" },
  { value: "aguardando_cliente", label: "Aguardando cliente" },
  { value: "resolvido", label: "Resolvido" },
  { value: "resolvido_com_manual", label: "Resolvido com manual" },
  { value: "resolvido_sem_manual", label: "Resolvido sem manual" },
  { value: "post_mortem", label: "Post-mortem" },
  { value: "fechado", label: "Fechado" },
  { value: "cancelado", label: "Cancelado" },
];

export const TICKET_PRIORITY_OPTIONS: { value: TicketPriority; label: string }[] = [
  { value: "low", label: "Baixa" },
  { value: "medium", label: "Média" },
  { value: "high", label: "Alta" },
  { value: "urgent", label: "Urgente" },
];
