const API_URL = (import.meta.env.VITE_ARARA_API_URL || 'http://localhost:4100').replace(/\/$/, '')
const APP_SLUG = import.meta.env.VITE_ARARA_APP_SLUG || 'portal-suporte'
const ENV_API_KEY = import.meta.env.VITE_ARARA_API_KEY || ''

const TOKEN_KEY = 'arara_jwt'
const KEY_KEY = 'arara_api_key'

export function getApiBase() {
  return API_URL
}

export function getAppSlug() {
  return APP_SLUG
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

export function getApiKey(): string {
  return localStorage.getItem(KEY_KEY) || ENV_API_KEY
}

export function setApiKey(key: string | null) {
  if (key) localStorage.setItem(KEY_KEY, key)
  else localStorage.removeItem(KEY_KEY)
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

type RequestOpts = RequestInit & { auth?: 'auto' | 'jwt' | 'apiKey' | 'none' }

async function request<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const { auth = 'auto', headers: initHeaders, ...rest } = opts
  const headers = new Headers(initHeaders)
  if (!headers.has('Content-Type') && rest.body) {
    headers.set('Content-Type', 'application/json')
  }

  const token = getToken()
  const apiKey = getApiKey()

  if (auth === 'jwt' || (auth === 'auto' && token)) {
    if (token) headers.set('Authorization', `Bearer ${token}`)
  } else if (auth === 'apiKey' || (auth === 'auto' && apiKey)) {
    if (apiKey) headers.set('x-api-key', apiKey)
  }

  const res = await fetch(`${API_URL}${path}`, { ...rest, headers })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(res.status, body.error || body.message || `HTTP ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const arara = {
  login: (email: string, password: string) =>
    request<{ token: string; user: { id: string; email: string; name: string | null; roles: string[] } }>(
      '/v1/auth/login',
      { method: 'POST', body: JSON.stringify({ email, password }), auth: 'none' },
    ),

  me: () => request<{ type: string; user?: { email: string; roles: string[] } }>('/v1/auth/me'),

  tickets: () =>
    request<{ data: Ticket[]; count: number }>(`/v1/r/${APP_SLUG}/tickets`, { auth: 'auto' }),

  ticket: (id: string) => request<Ticket>(`/v1/r/${APP_SLUG}/tickets/${id}`, { auth: 'auto' }),

  companies: () =>
    request<{ data: Company[]; count: number }>(`/v1/r/${APP_SLUG}/admin/companies`, {
      auth: 'auto',
    }),
}

export type Ticket = {
  id: string
  title?: string
  status?: string
  priority?: string
  ticket_number?: string
  company_name?: string
  created_at?: string
  requester?: string
}

export type Company = {
  id: string
  name?: string
  cnpj?: string
  city?: string
  active?: boolean
}
