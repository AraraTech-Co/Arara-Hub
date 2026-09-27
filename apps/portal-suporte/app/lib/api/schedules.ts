import { api } from './client'
import type { SupportSchedule } from '@/db/types'

// ---------------------------------------------------------------------------
// Schedules types — derived from db/types.ts and operations.models.ts
// ---------------------------------------------------------------------------

interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  meta?: { page: number; pageSize: number; total: number; totalPages: number }
}

export interface ScheduleCreateBody {
  week_start: string
  week_end: string
  n1_assigned?: string | null
  n2_assigned?: string | null
  n3_assigned?: string | null
  backup_assigned?: string | null
  critical_clients?: string[]
  notes?: string | null
}

export interface ScheduleUpdateBody {
  n1_assigned?: string | null
  n2_assigned?: string | null
  n3_assigned?: string | null
  backup_assigned?: string | null
  critical_clients?: string[]
  notes?: string | null
}

export type DailyShiftType = 'morning' | 'night' | 'warroom'

export interface DailyShiftAgent {
  id: string
  full_name: string | null
  email: string | null
  role: string | null
}

export interface DailyShift {
  id: string
  date: string
  type: DailyShiftType
  agent_ids: string[]
  notes: string | null
  created_by: string
  created_at: string
  agents: DailyShiftAgent[]
}

export interface DailyShiftCreateBody {
  date: string
  type: DailyShiftType
  agent_ids: string[]
  notes?: string | null
}

export interface OnCallResponse {
  schedule: SupportSchedule | null
  n1?: { id: string; full_name: string | null; email: string } | null
  n2?: { id: string; full_name: string | null; email: string } | null
  n3?: { id: string; full_name: string | null; email: string } | null
  backup?: { id: string; full_name: string | null; email: string } | null
}

// Re-export for convenience
export type { SupportSchedule }

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

export const schedulesApi = {
  /**
   * GET /api/schedules
   * Optional params: agent_id, upcoming (weeks), start_date + end_date
   */
  list: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : ''
    return api.get<ApiResponse<SupportSchedule[]>>(`/api/schedules${qs}`)
  },

  /** GET /api/schedules/[id] */
  getById: (id: string) =>
    api.get<ApiResponse<SupportSchedule>>(`/api/schedules/${id}`),

  /** GET /api/schedules/current */
  getCurrent: () =>
    api.get<ApiResponse<SupportSchedule | null>>('/api/schedules/current'),

  /** GET /api/schedules/on-call */
  getOnCall: () =>
    api.get<ApiResponse<OnCallResponse>>('/api/schedules/on-call'),

  /**
   * GET /api/schedules/calendar
   * Optional params: year, month (1-based)
   */
  getCalendar: (year?: number, month?: number) => {
    const params = new URLSearchParams()
    if (year  !== undefined) params.set('year',  String(year))
    if (month !== undefined) params.set('month', String(month))
    const qs = params.toString() ? `?${params.toString()}` : ''
    return api.get<ApiResponse<SupportSchedule[]>>(`/api/schedules/calendar${qs}`)
  },

  /** POST /api/schedules */
  create: (body: ScheduleCreateBody) =>
    api.post<ApiResponse<SupportSchedule>>('/api/schedules', body),

  /** PUT /api/schedules/[id] */
  update: (id: string, body: ScheduleUpdateBody) =>
    api.put<ApiResponse<SupportSchedule>>(`/api/schedules/${id}`, body),

  /** DELETE /api/schedules/[id] */
  delete: (id: string) =>
    api.delete<ApiResponse>(`/api/schedules/${id}`),

  /** POST /api/schedules/generate — generate upcoming weeks */
  generate: (weeks = 4) =>
    api.post<ApiResponse<SupportSchedule[]>>('/api/schedules/generate', { weeks }),

  // ── Daily shifts ──────────────────────────────────────────────────────────

  /**
   * GET /api/schedules/daily
   * Optional params: start (date), end (date), type (morning|night|warroom)
   */
  listDaily: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : ''
    return api.get<ApiResponse<DailyShift[]>>(`/api/schedules/daily${qs}`)
  },

  /**
   * POST /api/schedules/daily
   * Upserts a shift for the given date + type.
   */
  upsertDaily: (body: DailyShiftCreateBody) =>
    api.post<ApiResponse<DailyShift>>('/api/schedules/daily', body),

  /**
   * DELETE /api/schedules/daily?id=<shiftId>
   */
  deleteDaily: (id: string) =>
    api.delete<ApiResponse>(`/api/schedules/daily?id=${encodeURIComponent(id)}`),
}
