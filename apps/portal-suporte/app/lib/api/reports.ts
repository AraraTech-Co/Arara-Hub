import { api } from './client'

// ── Types ─────────────────────────────────────────────────────────────────────

export type ReportPeriod = 'weekly' | 'monthly' | 'annual'

export interface ReportSummary {
  tickets_created:    number
  tickets_resolved:   number
  tickets_open:       number
  messages_sent:      number
  sla_total:          number
  sla_breached:       number
  sla_compliance_pct: number
  actions_logged:     number
  portal_created:     number
  hist_created:       number
  portal_resolved:    number
  hist_resolved:      number
  avg_response_hours: number | null
  reopen_rate_pct:    number
  reopened_count:     number
}

export interface AgentVolume {
  agent_id:              string
  agent_name:            string
  tickets_resolved:      number
  avg_resolution_hours:  number
}

export interface CompanyVolume {
  company: string
  count:   number
}

export interface ReportTicketItem {
  id:           string
  title:        string
  status:       string
  priority:     string
  severity:     string | null
  ticket_type:  string | null
  category:     string | null
  company:      string | null
  assignee:     string
  creator:      string
  created_at:   string
  updated_at:   string
}

export interface ReportTrelloItem {
  id:            string
  name:          string
  list:          string | null
  severity:      string | null
  client:        string | null
  ticket_num:    string | null
  labels:        string[]
  resolved:      boolean
  last_activity: string | null
}

export interface AgentPerformance {
  agent_id:   string | null
  agent_name: string
  tickets:    number
}

export interface TimelineItem {
  action:     string
  agent:      string
  ticket_id:  string | null
  created_at: string
}

export interface AiLearningRun {
  id:               string
  tickets_analyzed: number
  faq_created:      number
  gaps_created:     number
  top_patterns:     unknown
  created_at:       string
}

export interface AiStats {
  triaged_count:       number
  priority_changed:    number
  priority_change_pct: number
  by_category:         { category: string; count: number }[]
  learning_runs:       AiLearningRun[]
  total_learning_runs: number
}

export interface TrelloHistorico {
  total_cards:     number
  total_resolved:  number
  by_severity:     Record<string, number>
  by_label:        Record<string, number>
  period_cards:    number
  period_resolved: number
  period_by_label: Record<string, number>
}

export interface ReportData {
  period:   ReportPeriod
  from:     string
  to:       string
  summary:  ReportSummary
  company_filter:      string | null
  available_companies: string[]

  by_priority:        Record<string, number>
  by_severity:        Record<string, number>
  by_severity_portal: Record<string, number>
  by_severity_hist:   Record<string, number>

  agent_performance:  AgentPerformance[]
  agent_volume:       AgentVolume[]
  company_breakdown:  CompanyVolume[]
  action_summary:     Record<string, number>
  timeline:           TimelineItem[]
  tickets_list:       ReportTicketItem[]
  trello_cards_list:  ReportTrelloItem[]

  ai:               AiStats
  trello_historico: TrelloHistorico
}

export interface ReportSnapshot {
  id:               string
  period:           ReportPeriod
  periodFrom:       string
  periodTo:         string
  createdAt:        string
  ticketsCreated:   number
  ticketsResolved:  number
  ticketsOpen:      number
  slaCompliancePct: number
  slaBreached:      number
  messagesSent:     number
}

// ── API ───────────────────────────────────────────────────────────────────────

export const reportsApi = {
  /**
   * Busca o relatório completo para o período e data de referência indicados.
   * Retorna ReportData contendo summary, listas de tickets, histórico Trello e IA.
   */
  get: (period: ReportPeriod, date?: string, companyName?: string) => {
    const params = new URLSearchParams({ period })
    if (date) params.set('date', date)
    if (companyName) params.set('company', companyName)
    return api.get<{ data: ReportData }>(`/api/reports?${params}`)
  },

  /**
   * Busca o histórico de snapshots salvos automaticamente a cada acesso.
   * @param period  Período dos snapshots ('weekly' | 'monthly' | 'annual')
   * @param limit   Máximo de snapshots retornados (padrão 24, máximo 60)
   */
  getHistory: (period: ReportPeriod, limit = 24) => {
    const params = new URLSearchParams({ history: 'true', period, limit: String(limit) })
    return api.get<{ data: ReportSnapshot[] }>(`/api/reports?${params}`)
  },

  // Nota: o endpoint /api/reports/[id]/pdf retorna um blob PDF.
  // Não é mapeado aqui — use um <a href="/api/reports/{id}/pdf"> direto
  // ou window.open para preservar o fluxo de download binário.
}
