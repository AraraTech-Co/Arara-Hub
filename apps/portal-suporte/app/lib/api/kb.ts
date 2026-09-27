import { api } from './client'

// ---------------------------------------------------------------------------
// KB Article types — derived from kb.controller.ts and db/types.ts
// ---------------------------------------------------------------------------

export interface KbArticleSummary {
  id: string
  title: string
  slug: string
  category: string | null
  tags: string[]
  isPublished: boolean
  viewCount: number
  createdAt: string
  updatedAt: string
  author: { fullName: string | null } | null
}

export interface KbArticle extends KbArticleSummary {
  body: string
  author: { fullName: string | null; email: string } | null
}

export interface KbSuggestResult {
  id: string
  title: string
  category: string | null
  score: number
  excerpt: string
}

interface ApiData<T> { success: boolean; data: T }

export interface KbListResponse { articles: KbArticleSummary[] }
export interface KbOneResponse  { article: KbArticle }
export interface KbSuggestResponse { articles: KbSuggestResult[] }

export interface KbCreateBody {
  title: string
  body: string
  category?: string | null
  tags?: string[]
  isPublished?: boolean
}

export interface KbUpdateBody {
  title?: string
  body?: string
  category?: string | null
  tags?: string[]
  isPublished?: boolean
}

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

export const kbApi = {
  /**
   * GET /api/kb
   * Params: q, category, published (staff-only), limit
   */
  list: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : ''
    return api.get<KbListResponse>(`/api/kb${qs}`)
  },

  /** GET /api/kb/[id]  (id can be UUID or slug) */
  getById: (id: string) =>
    api.get<KbOneResponse>(`/api/kb/${id}`),

  /** POST /api/kb */
  create: (body: KbCreateBody) =>
    api.post<ApiData<KbArticle>>('/api/kb', body),

  /** PUT /api/kb/[id] */
  update: (id: string, body: KbUpdateBody) =>
    api.put<ApiData<KbArticle>>(`/api/kb/${id}`, body),

  /** DELETE /api/kb/[id] */
  delete: (id: string) =>
    api.delete<{ success: boolean }>(`/api/kb/${id}`),

  /**
   * POST /api/kb/suggest
   * Semantic search via pgvector. Falls back gracefully when embeddings are unavailable.
   */
  suggest: (query: string, topK = 5) =>
    api.post<KbSuggestResponse>('/api/kb/suggest', { query, topK }),
}
