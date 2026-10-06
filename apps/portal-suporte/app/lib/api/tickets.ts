import { api } from './client'
import type { RawKanbanTicket } from '@/components/kanban/kanban.types'
import type { TicketStatus, TicketPriority } from '@/db/types'

export interface TicketSummary {
  id: string
  ticketNumber: number
  title: string
  status: TicketStatus
  priority: TicketPriority
  companyName: string | null
  createdAt: string
  updatedAt: string
}

export interface TimeEntry {
  id: string
  minutes: number
  description: string | null
  logged_at: string
  user_name: string | null
  user_id: string
}

interface ApiList<T> {
  success: boolean
  data: T[]
  meta?: { page: number; pageSize: number; total: number; totalPages: number }
}

interface ApiOne<T> { success: boolean; data: T }

export const ticketsApi = {
  list: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : ''
    return api.get<ApiList<TicketSummary>>(`/api/tickets${qs}`)
  },
  getById:  (id: string) =>
    api.get<ApiOne<TicketSummary>>(`/api/tickets/${id}`),
  create: (body: Record<string, unknown>) =>
    api.post<ApiOne<TicketSummary>>('/api/tickets', body),
  update: (id: string, body: Record<string, unknown>) =>
    api.put<ApiOne<TicketSummary>>(`/api/tickets/${id}`, body),
  changeStatus: (id: string, status: string, opts?: Record<string, unknown>) =>
    api.post<ApiOne<TicketSummary>>(`/api/tickets/${id}/status`, { status, ...opts }),
  assign: (id: string, assigneeId: string | null, opts?: { force?: boolean }) =>
    api.patch<ApiOne<TicketSummary>>(`/api/tickets/${id}/assign`, {
      assignee_id: assigneeId,
      ...(opts?.force ? { force: true } : {}),
    }),
  escalate: (id: string, toUserId: string, reason?: string) =>
    api.post<ApiOne<TicketSummary>>(`/api/tickets/${id}/escalate`, { to_user_id: toUserId, reason }),
  archive: (id: string) =>
    api.patch<{ success: boolean; ticket: { id: string } }>(`/api/tickets/${id}/archive`),
  addMessage: (id: string, body: { message: string; is_internal?: boolean }) =>
    api.post(`/api/tickets/${id}/messages`, body),
  checkDuplicates: (body: { title: string; company_name?: string; company_cnpj?: string }) =>
    api.post<{ duplicates: Array<{ id: string; title: string; status: string; similarity_score: number }> }>(
      '/api/tickets/check-duplicates', body
    ),

  // Time entries
  listTimeEntries: (id: string) =>
    api.get<{ success: boolean; data: TimeEntry[]; total_minutes: number }>(`/api/tickets/${id}/time-entries`),
  addTimeEntry: (id: string, body: { minutes: number; description?: string | null }) =>
    api.post<{ success: boolean; data: TimeEntry }>(`/api/tickets/${id}/time-entries`, body),
  deleteTimeEntry: (id: string, entryId: string) =>
    api.delete<{ success: boolean }>(`/api/tickets/${id}/time-entries/${entryId}`),

  // Co-assignees
  addCoAssignee: (id: string, userId: string) =>
    api.post(`/api/tickets/${id}/co-assignees`, { userId }),
  removeCoAssignee: (id: string, userId: string) =>
    api.delete(`/api/tickets/${id}/co-assignees/${userId}`),

  // Bulk
  bulkAction: (ids: string[], action: string, extra?: Record<string, string>) =>
    api.post<{ updated: number }>('/api/tickets/bulk-action', { ids, action, ...extra }),

  // Reorder
  reorder: (ticketIds: string[], status: string) =>
    api.post('/api/tickets/reorder', { ticketIds, status }),

  // Kanban board
  kanban: () =>
    api.get<{ data: Record<string, RawKanbanTicket[]> }>('/api/tickets/kanban'),

  // Suggest priority
  suggestPriority: (body: { impact: string; urgency?: string | null; companyId?: string | null }) =>
    api.post<{ data: { priority: string; score: number } | null }>('/api/tickets/suggest-priority', body),

  // Status change (PATCH). `clear_assignee: true` tira o responsável ao resolver;
  // sem a flag o dono permanece (arrastar no Kanban não deve órfão o card).
  patchStatus: (id: string, body: Record<string, unknown>) =>
    api.patch<{ success: boolean }>(`/api/tickets/${id}/status`, body),

  // Delete ticket
  delete: (id: string) =>
    api.delete<{ success: boolean }>(`/api/tickets/${id}`),

  // CNPJ ticket count
  cnpjCount: (cnpj: string) =>
    api.get<{ total: number }>(`/api/tickets/cnpj?cnpj=${encodeURIComponent(cnpj)}`),
}
