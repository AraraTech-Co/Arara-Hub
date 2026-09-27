// =============================================================================
// Database Types - Portal de Suporte ao Cliente
// =============================================================================

// -----------------------------------------------------------------------------
// ENUMS
// -----------------------------------------------------------------------------

export type UserRole = 'master' | 'admin' | 'developer' | 'user'

/** Função/especialidade do membro da equipe — só rótulo, não afeta permissão (UserRole). */
export type StaffPosition = 'agente_suporte' | 'desenvolvedor' | 'administrador'

/** Equipe operacional elegível como responsável (ex-agent → developer) */
export const STAFF_ROLES: UserRole[] = ['developer', 'admin', 'master']

export type TicketStatus =
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
  | 'acompanhamento_deploy'   // legado — mantido no DB, oculto no kanban
  | 'migracao_sat_nfce'       // legado — mantido no DB, oculto no kanban
  | 'migracao_concluida'      // legado — mantido no DB, oculto no kanban
  | 'cancelado'               // oculto no kanban (filtro apenas)
  | 'fechado'                 // Sprint A — terminal, read-only

// 'urgent' é exibido como "Muito alta" (chave mantida). Ver lib/ticket-priority.ts.
export type TicketPriority = 'very_low' | 'low' | 'medium' | 'high' | 'urgent'

// Renomeado de N0-N3 para P0-P3 na migration 20260519000100_kanban_trello_sync
export type TicketSeverity = 'P0' | 'P1' | 'P2' | 'P3'

export type TicketImpact = 'low' | 'medium' | 'high' | 'critical'

export type TicketType = 'suporte' | 'duvida' | 'incidente' | 'bug' | 'evolucao'

export type CommunicationPreference = 'email' | 'phone' | 'whatsapp' | 'chat'

export type TaskStatus = 'todo' | 'in_progress' | 'done'

export type TaskPriority = 'low' | 'medium' | 'high'

export type IntegrationName = 'whatsapp' | 'discord' | 'trello' | 'chatgpt'

export type IntegrationSyncStatus = 'active' | 'error' | 'pending' | 'disabled'

export type IntegrationLogStatus = 'success' | 'error' | 'pending'

export type WhatsAppGroupPurpose = 'support_schedule' | 'alerts' | 'general'

export type Environment = 'production' | 'staging' | 'development'

export type SLASeverity = 'P1' | 'P2' | 'P3' | 'P4'

export type KPIMetricName =
  | 'mtta' // Mean Time to Acknowledge
  | 'mttr' // Mean Time to Resolve
  | 'sla_compliance'
  | 'recurring_incidents'
  | 'customer_satisfaction'
  | 'first_contact_resolution'

export type ChangeRequestType = 'standard' | 'normal' | 'emergency'

export type ImpactLevel = 'low' | 'medium' | 'high' | 'critical'

export type RiskLevel = 'low' | 'medium' | 'high'

export type ChangeRequestStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'failed'

export type BackupType = 'full' | 'incremental' | 'logs'

export type BackupStatus = 'success' | 'failed' | 'in_progress'

export type APIKeyEnvironment = 'production' | 'sandbox'

export type APIKeyStatus = 'active' | 'revoked' | 'expired'

// -----------------------------------------------------------------------------
// TABLE TYPES
// -----------------------------------------------------------------------------

export interface RecentPageEntry {
  href: string
  label: string
  visitedAt: string // timestamptz
}

/**
 * Perfis de usuários - Extende auth.users do Supabase
 */
export interface Profile {
  id: string // UUID - references auth.users(id)
  email: string
  full_name: string | null
  avatar_url: string | null
  role: UserRole
  position?: StaffPosition | null
  recent_pages?: RecentPageEntry[] | null
  created_at: string // timestamptz
  updated_at: string // timestamptz
}

/**
 * Empresa cliente
 */
export interface Company {
  id: string
  group_id: string | null
  name: string
  cnpj: string | null
  contact_email: string | null
  phone: string | null
  address: string | null
  city: string | null
  state: string | null
  segment: string | null
  active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
  sla_contract_id: string | null
  // New operational fields
  trade_name: string | null
  state_registration: string | null
  operation_type: string | null
  whatsapp: string | null
  product: string | null
  has_pdv: boolean
  pdv_count: number | null
  store_count: number | null
  uses_tef: boolean
  uses_sat: boolean
  uses_nfce: boolean
  active_modules: string[]
  integration_partners: string[]
  operational_notes: string | null
  server_name: string | null
  server_type: string | null
  server_ip_internal: string | null
  server_ip_external: string | null
  server_os: string | null
  db_system: string | null
  vpn_enabled: boolean
  backup_enabled: boolean
  has_homolog_env: boolean
  technical_notes: string | null
}

/**
 * Contato operacional de empresa (sem acesso ao portal)
 */
export interface CompanyContact {
  id: string
  company_id: string
  unit_id: string | null
  name: string
  role_title: string | null
  department: string | null
  email: string | null
  phone: string | null
  whatsapp: string | null
  contact_type: string
  receives_notifications: boolean
  receives_sla_critical: boolean
  on_call: boolean
  notes: string | null
  active: boolean
  created_at: string
  updated_at: string
}

/**
 * Tickets de suporte
 */
export interface Ticket {
  id: string // UUID
  user_id: string | null // UUID - pode ser null para tickets públicos
  assigned_to: string | null // UUID
  title: string
  description: string
  status: TicketStatus
  priority: TicketPriority
  category: string | null
  created_at: string // timestamptz
  updated_at: string // timestamptz
  // Campos adicionais para tickets públicos
  company_name: string | null
  company_cnpj: string | null
  contact_email: string | null
  communication_preference: CommunicationPreference | null
  is_public: boolean
  // Campos do sistema Kanban
  ticket_number: string | null // Auto-gerado: TICKET-000001
  severity: TicketSeverity | null
  impact: TicketImpact | null
  ticket_type: TicketType | null
  recurring: boolean
  position: number
  tags: string[] | null
  // Pendência
  pendency_reason: string | null
  pendency_type: string | null    // Sprint A: 8 tipos PRD (cliente/parceiro/fornecedor/…)
  follow_up_date: string | null
  // Sprint A — flag de bloqueio operacional
  is_blocked: boolean
  blocked_reason: string | null
  pull_request_url: string | null
  // Sprint E — column time tracking
  column_entered_at: string | null
  coAssignees?: { userId: string }[]
}

/**
 * Mensagens dos tickets
 */
export interface TicketMessage {
  id: string // UUID
  ticket_id: string // UUID
  user_id: string // UUID
  message: string
  is_internal: boolean
  created_at: string // timestamptz
}

/**
 * Anexos de arquivos
 */
export interface Attachment {
  id: string // UUID
  ticket_id: string | null // UUID
  message_id: string | null // UUID
  file_name: string
  file_url: string
  file_size: number | null
  file_type: string | null
  uploaded_by: string // UUID
  created_at: string // timestamptz
}

/**
 * Tarefas internas
 */
export interface Task {
  id: string // UUID
  ticket_id: string | null // UUID
  created_by: string // UUID
  assigned_to: string | null // UUID
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  due_date: string | null // timestamptz
  created_at: string // timestamptz
  updated_at: string // timestamptz
}

/**
 * E-mails integrados
 */
export interface Email {
  id: string // UUID
  ticket_id: string | null // UUID
  user_id: string // UUID
  from_email: string
  to_email: string
  subject: string
  body: string
  is_read: boolean
  created_at: string // timestamptz
}

/**
 * Log de atividades
 */
export interface ActivityLog {
  id: string // UUID
  user_id: string // UUID
  ticket_id: string | null // UUID
  action: string
  details: Record<string, unknown> | null // JSONB
  created_at: string // timestamptz
}

/**
 * Checklists dos tickets (por estágio)
 */
export interface TicketChecklist {
  id: string // UUID
  ticket_id: string // UUID
  stage: string
  item: string
  checked: boolean
  checked_by: string | null // UUID
  checked_at: string | null // timestamptz
  created_at: string // timestamptz
}

/**
 * Manuais de suporte (Base de conhecimento)
 */
export interface SupportManual {
  id: string // UUID
  ticket_id: string | null // UUID
  created_by: string // UUID
  title: string
  problem_description: string
  root_cause: string | null
  solution_steps: string
  average_time: number | null // em minutos
  when_to_escalate: string | null
  category: string | null
  tags: string[] | null
  reviewed_by: string | null // UUID
  reviewed_at: string | null // timestamptz
  created_at: string // timestamptz
  updated_at: string // timestamptz
}

/**
 * Post-mortems de incidentes
 */
export interface PostMortem {
  id: string // UUID
  ticket_id: string // UUID
  created_by: string // UUID
  what_happened: string
  timeline: Array<{ time: string; event: string }> // JSONB
  impact: string
  root_cause: string
  corrective_actions: string
  preventive_actions: string
  responsible: {
    corrective: string[]
    preventive: string[]
  } | null // JSONB
  created_at: string // timestamptz
  updated_at: string // timestamptz
}

/**
 * Escala de suporte
 */
export interface SupportSchedule {
  id: string // UUID
  week_start: string // date
  week_end: string // date
  n1_assigned: string | null // UUID
  n2_assigned: string | null // UUID
  n3_assigned: string | null // UUID
  backup_assigned: string | null // UUID
  critical_clients: string[] | null // JSONB - array de IDs de clientes
  notes: string | null
  created_by: string // UUID
  created_at: string // timestamptz
  updated_at: string // timestamptz
}

/**
 * Configuração de SLA
 */
export interface SLAConfig {
  id: string // UUID
  severity: SLASeverity
  name: string
  description: string | null
  response_time_minutes: number
  resolution_time_minutes: number
  business_hours_only: boolean
  escalation_enabled: boolean
  created_at: string // timestamptz
  updated_at: string // timestamptz
}

/**
 * Rastreamento de SLA
 */
export interface SLATracking {
  id: string // UUID
  ticket_id: string // UUID
  severity: string
  response_deadline: string // timestamptz
  resolution_deadline: string // timestamptz
  first_response_at: string | null // timestamptz
  resolved_at: string | null // timestamptz
  response_sla_met: boolean | null
  resolution_sla_met: boolean | null
  breach_reason: string | null
  escalated: boolean
  escalated_at: string | null // timestamptz
  escalated_to: string | null // UUID
  paused_at: string | null // timestamptz — set when SLA is paused
  paused_duration_ms: number // accumulated pause time in ms
  paused?: boolean // computed: !!paused_at
  created_at: string // timestamptz
  updated_at: string // timestamptz
}

/**
 * Configuração de integrações
 */
export interface Integration {
  id: string // UUID
  name: IntegrationName
  enabled: boolean
  config: Record<string, unknown> // JSONB
  api_key: string | null
  webhook_url: string | null
  last_sync_at: string | null // timestamptz
  sync_status: IntegrationSyncStatus | null
  error_message: string | null
  created_at: string // timestamptz
  updated_at: string // timestamptz
}

/**
 * Logs de integrações
 */
export interface IntegrationLog {
  id: string // UUID
  integration_name: string
  action: string
  status: IntegrationLogStatus
  request_data: Record<string, unknown> | null // JSONB
  response_data: Record<string, unknown> | null // JSONB
  error_message: string | null
  user_id: string | null // UUID
  created_at: string // timestamptz
}

/**
 * Grupos de WhatsApp
 */
export interface WhatsAppGroup {
  id: string // UUID
  name: string
  group_id: string | null
  purpose: WhatsAppGroupPurpose | null
  members: string[] // UUID[]
  active: boolean
  created_at: string // timestamptz
  updated_at: string // timestamptz
}

/**
 * Rastreamento de uptime
 */
export interface UptimeTracking {
  id: string // UUID
  service_name: string
  environment: Environment
  target_uptime: number // numeric(5,2) ex: 99.9
  actual_uptime: number | null // numeric(5,2)
  downtime_minutes: number
  month: string // date
  incidents_count: number
  created_at: string // timestamptz
  updated_at: string // timestamptz
}

/**
 * Métricas de KPI
 */
export interface KPIMetric {
  id: string // UUID
  metric_name: KPIMetricName
  value: number // numeric(10,2)
  period_start: string // date
  period_end: string // date
  target_value: number | null // numeric(10,2)
  metadata: Record<string, unknown> | null // JSONB
  created_at: string // timestamptz
}

/**
 * Solicitações de mudança (Change Management)
 */
export interface ChangeRequest {
  id: string // UUID
  change_number: string // Auto-gerado: CHG-000001
  type: ChangeRequestType
  title: string
  description: string
  impact_level: ImpactLevel | null
  risk_level: RiskLevel | null
  status: ChangeRequestStatus
  requested_by: string // UUID
  approved_by: string | null // UUID
  implemented_by: string | null // UUID
  scheduled_start: string | null // timestamptz
  scheduled_end: string | null // timestamptz
  actual_start: string | null // timestamptz
  actual_end: string | null // timestamptz
  rollback_plan: string | null
  testing_plan: string | null
  notification_sent: boolean
  affected_services: string[] | null
  created_at: string // timestamptz
  updated_at: string // timestamptz
}

/**
 * Rastreamento de backups
 */
export interface BackupTracking {
  id: string // UUID
  backup_type: BackupType
  service_name: string
  status: BackupStatus
  size_mb: number | null // numeric(10,2)
  retention_days: number
  backup_location: string | null
  rto_minutes: number | null // Recovery Time Objective
  rpo_minutes: number | null // Recovery Point Objective
  verified: boolean
  verified_at: string | null // timestamptz
  started_at: string // timestamptz
  completed_at: string | null // timestamptz
  error_message: string | null
  created_at: string // timestamptz
}

/**
 * Chaves de API
 */
export interface APIKey {
  id: string // UUID
  name: string
  description: string | null
  key_prefix: string // Primeiros 8 chars visíveis (ex: "sk_live_")
  key_hash: string // Hash da chave completa
  key_secret: string // Chave completa criptografada (mostrada apenas uma vez)
  permissions: string[]
  access_level: string
  route_grants: string[]
  route_denials: string[]
  rate_limit: number
  expires_at: string | null // timestamptz
  last_used_at: string | null // timestamptz
  usage_count: number
  created_by: string // UUID
  environment: APIKeyEnvironment
  status: APIKeyStatus
  ip_whitelist: string[] | null // Restrições de IP opcionais
  webhook_url: string | null // Webhook opcional para eventos
  created_at: string // timestamptz
  updated_at: string // timestamptz
}

/**
 * Log de requisições da API
 */
export interface APIRequestLog {
  id: string // UUID
  api_key_id: string | null // UUID
  endpoint: string
  method: string
  status_code: number
  request_body: Record<string, unknown> | null // JSONB
  response_body: Record<string, unknown> | null // JSONB
  ip_address: string | null // inet
  user_agent: string | null
  duration_ms: number | null
  error_message: string | null
  created_at: string // timestamptz
}

/**
 * Webhooks configurados
 */
export interface Webhook {
  id: string // UUID
  name: string
  url: string
  events: string[] // ex: ['ticket.created', 'ticket.updated']
  secret: string // Para verificação de assinatura
  active: boolean
  last_triggered_at: string | null // timestamptz
  success_count: number
  failure_count: number
  created_by: string // UUID
  created_at: string // timestamptz
  updated_at: string // timestamptz
}

/**
 * Log de entregas de webhook
 */
export interface WebhookDelivery {
  id: string // UUID
  webhook_id: string // UUID
  event_type: string
  payload: Record<string, unknown> // JSONB
  response_status: number | null
  response_body: string | null
  attempts: number
  delivered: boolean
  error_message: string | null
  created_at: string // timestamptz
}
