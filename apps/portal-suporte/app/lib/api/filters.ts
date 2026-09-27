import { api } from './client'

export interface FilterConfig {
  agentFilter:     string
  priorityFilter:  string
  slaFilter:       string
  search:          string
  companyFilter:   string
  escalatedFilter: boolean
  /** Origem do chamado. Presets antigos não têm — valem como 'all'. */
  sourceFilter?:   string
}

export interface SavedFilter {
  id:           string
  name:         string
  filterConfig: FilterConfig
  isDefault:    boolean
  created_at:   string
}

interface FiltersListResponse { filters: SavedFilter[] }
interface FilterResponse      { filter: SavedFilter }

export const filtersApi = {
  list: () =>
    api.get<FiltersListResponse>('/api/filters'),

  create: (body: { name: string; filterConfig: FilterConfig; isDefault?: boolean }) =>
    api.post<FilterResponse>('/api/filters', body),

  setDefault: (id: string) =>
    api.patch<FilterResponse>(`/api/filters/${id}`, { isDefault: true }),

  delete: (id: string) =>
    api.delete<{ success: boolean }>(`/api/filters/${id}`),
}
