import { api } from './client'

// ─── Shared response shapes ────────────────────────────────────────────────────

interface ApiList<T> { success: boolean; data: T[] }
interface ApiOne<T>  { success: boolean; data: T }

// ─── Users ────────────────────────────────────────────────────────────────────

export type UserRole = 'user' | 'developer' | 'admin' | 'master'

export interface AdminUser {
  id: string
  email: string
  full_name: string | null
  role: UserRole
  created_at: string
  company_id?: string | null
  unit_id?: string | null
  expires_at?: string | null
  company?: { id: string; name: string } | null
}

export interface CreateUserPayload {
  email: string
  full_name?: string
  role: UserRole
  company_id?: string | null
  unit_id?: string | null
  expires_at?: string | null
}

export const adminUsersApi = {
  list: () =>
    api.get<ApiList<AdminUser>>('/api/admin/users'),
  create: (body: CreateUserPayload) =>
    api.post<ApiOne<AdminUser>>('/api/admin/users', body),
  update: (id: string, body: Partial<CreateUserPayload>) =>
    api.patch<ApiOne<AdminUser>>(`/api/admin/users/${id}`, body),
  delete: (id: string) =>
    api.delete<{ success: boolean }>(`/api/admin/users?id=${id}`),
}

// ─── Invite Codes ─────────────────────────────────────────────────────────────

export interface InviteCode {
  id: string
  code: string
  role: UserRole
  used: boolean
  created_at: string
  expires_at?: string | null
}

export interface CreateInviteCodePayload {
  role: UserRole
  expires_at?: string | null
}

// ─── Teams ────────────────────────────────────────────────────────────────────

export interface AgentInfo {
  id: string
  fullName: string | null
  avatarUrl: string | null
  role: string
  email: string | null
}

export interface TeamMemberInfo {
  teamId: string
  profileId: string
  isLead: boolean
  profile: AgentInfo
}

export interface AdminTeam {
  id: string
  name: string
  description: string | null
  color: string
  active: boolean
  members: TeamMemberInfo[]
  _count: { tickets: number }
}

export interface CreateTeamPayload {
  name: string
  description?: string
  color: string
}

export interface AddTeamMemberPayload {
  profile_id: string
  is_lead: boolean
}

export const adminTeamsApi = {
  list: () =>
    api.get<ApiList<AdminTeam>>('/api/admin/teams'),
  create: (body: CreateTeamPayload) =>
    api.post<ApiOne<AdminTeam>>('/api/admin/teams', body),
  update: (id: string, body: Partial<CreateTeamPayload>) =>
    api.patch<ApiOne<AdminTeam>>(`/api/admin/teams/${id}`, body),
  delete: (id: string) =>
    api.delete<{ success: boolean }>(`/api/admin/teams/${id}`),
  addMember: (teamId: string, body: AddTeamMemberPayload) =>
    api.post<ApiOne<TeamMemberInfo>>(`/api/admin/teams/${teamId}/members`, body),
  removeMember: (teamId: string, profileId: string) =>
    api.delete<{ success: boolean }>(`/api/admin/teams/${teamId}/members?profile_id=${profileId}`),
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export interface AdminSettings {
  companyName: string
  companyEmail: string
  companyPhone: string
  companyWebsite: string
  supportEmail: string
  emailNotifications: boolean
  smsNotifications: boolean
  whatsappNotifications: boolean
  discordNotifications: boolean
  twoFactorAuth: boolean
  sessionTimeout: number
  ipWhitelist: string
  logoUrl: string
  primaryColor: string
  accentColor: string
  /**
   * Rodízio: ao chegar num nó de atendente, o motor escolhe quem recebe — quem
   * está há mais tempo sem conversa nova, com a fila aberta como desempate.
   */
  waAutoAssignEnabled: boolean
  /**
   * Operador que assume a conversa quando a resposta sai pelo celular/WhatsApp
   * Web (o webhook não diz quem respondeu). Vazio = fica na fila.
   */
  waOperadorPadraoId?: string | null
  /**
   * IA humanizada: respostas em linguagem natural no lugar do menu. Depende de
   * `anthropic_api_key` no cofre E de `api.anthropic.com` na allowlist de saída
   * da plataforma; sem as duas, o motor registra o motivo e segue pelo menu.
   */
  waIaEnabled: boolean
  /** Triagem por menus: executa o fluxo publicado em `WaFlows` a cada mensagem. */
  waMenuEnabled: boolean
  /** Grupos do WhatsApp entram na inbox (17/09/2026). Ausente = desligado. */
  waGruposEnabled?: boolean
  /** Dispositivo do WhatsApp (`numero:N`, 0 = celular) → id do operador que responde por ele (17/09/2026). */
  waDispositivos?: Record<string, string>
  /**
   * Aviso de mudança de situação por WhatsApp.
   *
   * AUSENTE = LIGADO, nos dois lados. O aviso existe desde antes desta chave;
   * tratar `undefined` como desligado apagaria o recurso para todos no deploy,
   * sem ninguém ter clicado. Por isso a leitura é sempre `!== false`, nunca
   * `Boolean(...)`.
   */
  waStatusEnabled: boolean
}

export const adminSettingsApi = {
  // O BaseController responde { success, data } — o payload vem em `data`.
  get: () =>
    api.get<{ data: AdminSettings }>('/api/admin/settings'),
  update: (body: Partial<AdminSettings>) =>
    api.put<{ data: AdminSettings }>('/api/admin/settings', body),
}

// ─── SLA Contracts ────────────────────────────────────────────────────────────

export interface SlaContract {
  id: string
  name: string
  tier: string
  p0ResponseMin: number
  p1ResponseMin: number
  p2ResponseMin: number
  p3ResponseMin: number
  p0ResolutionMin: number
  p1ResolutionMin: number
  p2ResolutionMin: number
  p3ResolutionMin: number
  active: boolean
  createdAt: string
  updatedAt: string
  _count: { companies: number }
}

export interface SlaContractPayload {
  name: string
  tier: string
  p0_response_min: number
  p1_response_min: number
  p2_response_min: number
  p3_response_min: number
  p0_resolution_min: number
  p1_resolution_min: number
  p2_resolution_min: number
  p3_resolution_min: number
}

export const adminSlaContractsApi = {
  list: () =>
    api.get<ApiList<SlaContract>>('/api/admin/sla-contracts'),
  create: (body: SlaContractPayload) =>
    api.post<ApiOne<SlaContract>>('/api/admin/sla-contracts', body),
  update: (id: string, body: Partial<SlaContractPayload>) =>
    api.patch<ApiOne<SlaContract>>(`/api/admin/sla-contracts/${id}`, body),
}

// ─── SLA Calendar ─────────────────────────────────────────────────────────────

export interface SlaCalendarEntry {
  id: string
  date: string
  description: string | null
  type: string
}

export interface CreateSlaCalendarPayload {
  date: string
  description?: string
  type: string
}

export const adminSlaCalendarApi = {
  create: (body: CreateSlaCalendarPayload) =>
    api.post<ApiOne<SlaCalendarEntry>>('/api/admin/sla-calendar', body),
  delete: (id: string) =>
    api.delete<{ success: boolean }>(`/api/admin/sla-calendar/${id}`),
}

// ─── Automation ───────────────────────────────────────────────────────────────

export interface Condition {
  field: string
  operator: string
  value: string
}

export interface Action {
  type: string
  params: Record<string, string>
}

export interface RunLog {
  id: string
  success: boolean
  error: string | null
  actionsRun: string[] | null
  createdAt: string
}

export interface AutomationRule {
  id: string
  name: string
  description: string | null
  active: boolean
  triggerType: string
  conditions: Condition[]
  actions: Action[]
  runCount: number
  lastRunAt: string | null
  createdAt: string
  _count?: { runLogs: number }
  runLogs?: RunLog[]
}

export interface AutomationRulePayload {
  name: string
  description?: string
  triggerType: string
  conditions: Condition[]
  actions: Action[]
  active?: boolean
}

export const adminAutomationApi = {
  list: () =>
    api.get<ApiList<AutomationRule>>('/api/admin/automation'),
  getById: (id: string) =>
    api.get<ApiOne<AutomationRule>>(`/api/admin/automation/${id}`),
  create: (body: AutomationRulePayload) =>
    api.post<ApiOne<AutomationRule>>('/api/admin/automation', body),
  update: (id: string, body: Partial<AutomationRulePayload>) =>
    api.patch<ApiOne<AutomationRule>>(`/api/admin/automation/${id}`, body),
  delete: (id: string) =>
    api.delete<{ success: boolean }>(`/api/admin/automation/${id}`),
  toggleActive: (id: string, active: boolean) =>
    api.patch<ApiOne<AutomationRule>>(`/api/admin/automation/${id}`, { active }),
}

// ─── Analytics ────────────────────────────────────────────────────────────────

export interface CategoryWeekRow { category: string; week: string; count: number }
export interface TypeRow { type: string; count: number; pct: number }
export interface StatusRow { status: string; count: number }
export interface ResolutionRow { category: string; avg_hours: number; ticket_count: number }

export interface HeatmapData {
  byCategory: CategoryWeekRow[]
  byType: TypeRow[]
  byStatus: StatusRow[]
  resolutionByCategory: ResolutionRow[]
  period_days: number
  generated_at: string
}

export interface RootCauseRow {
  category: string
  label: string
  count: number
  pct: number
}

export interface DrillTicket {
  id: string
  ticketNumber: string | null
  title: string
  companyName: string | null
  resolvedAt: string | null
}

export interface RootCauseData {
  top10: RootCauseRow[]
  total: number
  period_days: number
  drill: DrillTicket[]
}

export interface ColumnTimeRow {
  column: string
  avg_hours: number
  ticket_count: number
}

export const adminAnalyticsApi = {
  heatmap: (days: number) =>
    api.get<HeatmapData>(`/api/admin/analytics/heatmap?days=${days}`),
  rootCause: (days: number, category?: string) => {
    const params = new URLSearchParams({ days: String(days) })
    if (category) params.set('category', category)
    return api.get<RootCauseData>(`/api/admin/analytics/root-cause?${params}`)
  },
  columnTimes: () =>
    api.get<{ data: ColumnTimeRow[] }>('/api/admin/analytics/column-times'),
}

// ─── Permissions ──────────────────────────────────────────────────────────────

export interface Permission {
  id: string
  name: string
  description: string | null
  roles: string[]
}

export const adminPermissionsApi = {
  list: () =>
    api.get<{ permissions: Permission[] }>('/api/admin/permissions'),
  updateRole: (roleId: string, body: { permissions: string[] }) =>
    api.patch<{ success: boolean }>(`/api/admin/permissions/${roleId}`, body),
}

// ─── Impersonate ──────────────────────────────────────────────────────────────

export interface ImpersonateSession {
  userId: string
  email: string
  full_name: string | null
}

export const adminImpersonateApi = {
  getCurrent: () =>
    api.get<{ impersonating: ImpersonateSession | null }>('/api/admin/impersonate'),
  start: (userId: string) =>
    api.post<{ success: boolean }>('/api/admin/impersonate', { user_id: userId }),
  stop: () =>
    api.delete<{ success: boolean }>('/api/admin/impersonate'),
}

// ─── Operational Alerts ───────────────────────────────────────────────────────

export interface OperationalAlert {
  id: string
  message: string
  type: string
  active: boolean
  createdAt: string
}

// ─── Incidents ────────────────────────────────────────────────────────────────

export interface Incident {
  id: string
  title: string
  description: string | null
  status: string
  severity: string
  startedAt: string
  resolvedAt: string | null
  createdAt: string
}

export interface CreateIncidentPayload {
  title: string
  description?: string | null
  status?: string
  severity?: string | null
  started_at?: string | null
  root_cause?: string | null
  resolution?: string | null
  resolved_at?: string | null
}

export const adminIncidentsApi = {
  list: () =>
    api.get<ApiList<Incident>>('/api/admin/incidents'),
  getById: (id: string) =>
    api.get<ApiOne<Incident>>(`/api/admin/incidents/${id}`),
  create: (body: CreateIncidentPayload) =>
    api.post<ApiOne<Incident>>('/api/admin/incidents', body),
  update: (id: string, body: Partial<CreateIncidentPayload>) =>
    api.patch<ApiOne<Incident>>(`/api/admin/incidents/${id}`, body),
  addTicket: (incidentId: string, ticketId: string) =>
    api.post<{ success: boolean }>(`/api/admin/incidents/${incidentId}/tickets`, { ticket_id: ticketId }),
  removeTicket: (incidentId: string, ticketId: string) =>
    api.delete<{ success: boolean }>(`/api/admin/incidents/${incidentId}/tickets?ticket_id=${ticketId}`),
}

// ─── SSH Servers (DevOps) ─────────────────────────────────────────────────────

export interface SshServer {
  id: string
  name: string
  host: string
  port: number
  username: string
  active: boolean
}

export const adminSshServersApi = {
  list: () =>
    api.get<ApiList<SshServer>>('/api/admin/ssh-servers'),
}
