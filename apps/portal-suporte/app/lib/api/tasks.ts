import { api } from './client'
import type { Task, TaskStatus, TaskPriority } from '@/db/types'

// ---------------------------------------------------------------------------
// Tasks types — derived from db/types.ts and ticket.models.ts
// ---------------------------------------------------------------------------

interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  meta?: { page: number; pageSize: number; total: number; totalPages: number }
}

export interface TaskCreateBody {
  title: string
  ticket_id?: string | null
  /** Server-side user id — the controller re-sets this from the session, but it is accepted in the body */
  created_by?: string
  assigned_to?: string | null
  description?: string | null
  priority?: TaskPriority
  due_date?: string | null
  status?: TaskStatus
}

export interface TaskUpdateBody {
  title?: string
  description?: string | null
  status?: TaskStatus
  priority?: TaskPriority
  due_date?: string | null
  assigned_to?: string | null
}

export interface TaskStats {
  todo: number
  in_progress: number
  done: number
  overdue: number
  total: number
}

// Re-export for convenience
export type { Task, TaskStatus, TaskPriority }

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

export const tasksApi = {
  /**
   * GET /api/tasks
   * Optional params: ticket_id, assigned_to, status, overdue, upcoming (days),
   *                  my (boolean string), page, pageSize
   */
  list: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : ''
    return api.get<ApiResponse<Task[]>>(`/api/tasks${qs}`)
  },

  /** GET /api/tasks/[id] */
  getById: (id: string) =>
    api.get<ApiResponse<Task>>(`/api/tasks/${id}`),

  /** POST /api/tasks */
  create: (body: TaskCreateBody) =>
    api.post<ApiResponse<Task>>('/api/tasks', body),

  /** PUT /api/tasks/[id] */
  update: (id: string, body: TaskUpdateBody) =>
    api.put<ApiResponse<Task>>(`/api/tasks/${id}`, body),

  /** DELETE /api/tasks/[id] */
  delete: (id: string) =>
    api.delete<ApiResponse>(`/api/tasks/${id}`),

  /** POST /api/tasks/[id]/status */
  changeStatus: (id: string, status: TaskStatus) =>
    api.post<ApiResponse<Task>>(`/api/tasks/${id}/status`, { status }),

  /** POST /api/tasks/[id]/complete */
  complete: (id: string) =>
    api.post<ApiResponse<Task>>(`/api/tasks/${id}/complete`),

  /** POST /api/tasks/[id]/assign */
  assign: (id: string, assigneeId: string) =>
    api.post<ApiResponse<Task>>(`/api/tasks/${id}/assign`, { assignee_id: assigneeId }),

  /**
   * GET /api/tasks/stats
   * Optional params: my (boolean string) — limits to caller's tasks
   */
  stats: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : ''
    return api.get<ApiResponse<TaskStats>>(`/api/tasks/stats${qs}`)
  },
}
