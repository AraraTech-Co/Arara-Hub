import {
  getAppApiKey,
  getJwt,
  setAppApiKey,
  setJwt,
  setMemberships,
  setStoredUser,
  type AraraMembership,
  type AraraUser,
  type CrmProfile,
} from './auth-storage'

export const ARARA_URL = (process.env.NEXT_PUBLIC_ARARA_API_URL ?? '').replace(/\/$/, '')

export const ARARA_SLUG = process.env.NEXT_PUBLIC_ARARA_APP_SLUG || 'portal-crm'

export class AraraError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'AraraError'
    this.status = status
  }
}

function rewrite(path: string): string {
  if (path.startsWith('http')) return path
  if (path.startsWith('/v1/')) return `${ARARA_URL}${path}`
  if (path.startsWith('/')) return `${ARARA_URL}/v1/r/${ARARA_SLUG}${path}`
  return `${ARARA_URL}/v1/r/${ARARA_SLUG}/${path}`
}

type AuthMode = 'auto' | 'jwt' | 'appKey' | 'none'

async function request<T>(path: string, init?: RequestInit & { auth?: AuthMode }): Promise<T> {
  const { auth = 'auto', headers: initHeaders, ...rest } = init || {}
  const headers = new Headers(initHeaders)
  if (rest.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const jwt = getJwt()
  const appKey = getAppApiKey(ARARA_SLUG)
  const isRuntime = path.startsWith('/') && !path.startsWith('/v1/')

  if (auth === 'none') {
    // no credentials
  } else if (auth === 'jwt' || (auth === 'auto' && jwt && !isRuntime)) {
    if (jwt) headers.set('Authorization', `Bearer ${jwt}`)
  } else if (auth === 'appKey' || (auth === 'auto' && isRuntime && appKey)) {
    if (appKey) headers.set('x-api-key', appKey)
    else if (jwt) headers.set('Authorization', `Bearer ${jwt}`)
  } else if (auth === 'auto' && jwt) {
    headers.set('Authorization', `Bearer ${jwt}`)
  } else if (auth === 'auto' && appKey) {
    headers.set('x-api-key', appKey)
  }

  const res = await fetch(rewrite(path), { ...rest, headers })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new AraraError(res.status, body.error || body.message || `HTTP ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const arara = {
  login: async (email: string, password: string) => {
    const data = await request<{
      token: string
      user: AraraUser
      memberships?: AraraMembership[]
    }>('/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
      auth: 'none',
    })
    setJwt(data.token)
    setStoredUser(data.user)
    if (data.memberships) setMemberships(data.memberships)
    return data
  },

  me: () =>
    request<{ user: AraraUser; memberships?: AraraMembership[] }>('/v1/auth/me', {
      auth: 'jwt',
    }),

  createAppKey: (slug: string, name?: string) =>
    request<{ apiKey: { id: string; prefix: string; key: string; scopes: string[] } }>(
      `/v1/apps/${slug}/keys`,
      {
        method: 'POST',
        body: JSON.stringify({ name: name || 'crm-ui' }),
        auth: 'jwt',
      },
    ),

  bindAppKey: (slug: string, rawKey: string) => {
    setAppApiKey(slug, rawKey)
  },

  myProfile: () => request<CrmProfile>('/me/profile'),

  clients: (qs?: Record<string, string | undefined>) => {
    const sp = new URLSearchParams()
    if (qs) {
      for (const [k, v] of Object.entries(qs)) {
        if (v != null && v !== '') sp.set(k, v)
      }
    }
    const q = sp.toString()
    return request<{ data: Record<string, unknown>[]; count: number }>(
      `/clients${q ? `?${q}` : ''}`,
    )
  },

  client: (id: string) => request<Record<string, unknown>>(`/Client/${id}`),

  createClient: (body: Record<string, unknown>) =>
    request<Record<string, unknown>>('/clients', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  patchClient: (id: string, body: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/clients/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  leads: (q?: string) =>
    request<{ data: Record<string, unknown>[]; count: number }>(
      `/leads${q ? `?q=${encodeURIComponent(q)}` : ''}`,
    ),

  claimLead: (id: string) =>
    request<{ success: boolean }>(`/leads/${id}/claim`, { method: 'POST' }),

  deals: (qs?: Record<string, string | undefined>) => {
    const sp = new URLSearchParams()
    if (qs) {
      for (const [k, v] of Object.entries(qs)) {
        if (v != null && v !== '') sp.set(k, v)
      }
    }
    const q = sp.toString()
    return request<{ data: Record<string, unknown>[]; count: number }>(
      `/deals${q ? `?${q}` : ''}`,
    )
  },

  deal: (id: string) => request<Record<string, unknown>>(`/Deal/${id}`),

  createDeal: (body: Record<string, unknown>) =>
    request<Record<string, unknown>>('/deals', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  patchDeal: (id: string, body: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/deals/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  moveDealStage: (id: string, stageId: string) =>
    request<Record<string, unknown>>(`/deals/${id}/stage`, {
      method: 'PATCH',
      body: JSON.stringify({ stageId }),
    }),

  stages: () => request<{ data: Record<string, unknown>[]; count: number }>('/stages'),

  createStage: (body: Record<string, unknown>) =>
    request<Record<string, unknown>>('/stages', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  patchStage: (id: string, body: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/stages/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  activities: (qs?: Record<string, string | undefined>) => {
    const sp = new URLSearchParams()
    if (qs) {
      for (const [k, v] of Object.entries(qs)) {
        if (v != null && v !== '') sp.set(k, v)
      }
    }
    const q = sp.toString()
    return request<{ data: Record<string, unknown>[]; count: number }>(
      `/activities${q ? `?${q}` : ''}`,
    )
  },

  createActivity: (body: Record<string, unknown>) =>
    request<Record<string, unknown>>('/activities', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  completeActivity: (id: string, notes?: string) =>
    request<Record<string, unknown>>(`/activities/${id}/complete`, {
      method: 'POST',
      body: JSON.stringify({ notes }),
    }),

  goals: (qs?: Record<string, string | undefined>) => {
    const sp = new URLSearchParams()
    if (qs) {
      for (const [k, v] of Object.entries(qs)) {
        if (v != null && v !== '') sp.set(k, v)
      }
    }
    const q = sp.toString()
    return request<{ data: Record<string, unknown>[]; count: number }>(
      `/goals${q ? `?${q}` : ''}`,
    )
  },

  createGoal: (body: Record<string, unknown>) =>
    request<Record<string, unknown>>('/goals', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  teams: () => request<{ data: Record<string, unknown>[]; count: number }>('/teams'),

  profiles: () => request<{ data: Record<string, unknown>[]; count: number }>('/profiles'),
}

/** Back-compat alias used by older snippets. */
export async function araraFetch(path: string, init?: RequestInit) {
  return request(path.startsWith('/') ? path : `/${path}`, init)
}