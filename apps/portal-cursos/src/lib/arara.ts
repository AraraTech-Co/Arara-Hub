/**
 * Arara auth + runtime client for Portal de Cursos.
 * Login JWT + mint app key; courses API always uses Bearer JWT (staff gate).
 */
const ARARA_URL = (import.meta.env.VITE_ARARA_API_URL ?? '').replace(/\/$/, '')
const ARARA_SLUG = import.meta.env.VITE_ARARA_APP_SLUG || 'portal-cursos'

const JWT_KEY = 'arara_jwt'
const USER_KEY = 'arara_user'
const APP_KEY = `arara_app_key:${ARARA_SLUG}`

export const STAFF_ROLES = new Set(['support', 'developer', 'admin', 'master'])

export type AraraUser = {
  id: string
  email: string
  name?: string | null
  roles: string[]
}

export type Course = {
  id: string
  title: string
  slug: string
  summary?: string
  tags?: string[]
  published?: boolean
  sort_order?: number
  created_by?: string
  created_at?: string
  updated_at?: string
}

export type Lesson = {
  id: string
  course_id: string
  title: string
  slug: string
  body_markdown?: string
  sort_order?: number
  published?: boolean
  created_by?: string
  created_at?: string
  updated_at?: string
}

export function getApiBase() {
  return ARARA_URL
}

export function getAppSlug() {
  return ARARA_SLUG
}

export function getToken(): string | null {
  return localStorage.getItem(JWT_KEY)
}

export function getStoredUser(): AraraUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? (JSON.parse(raw) as AraraUser) : null
  } catch {
    return null
  }
}

export function isStaffUser(user: AraraUser | null | undefined): boolean {
  if (!user?.roles?.length) return false
  return user.roles.some((r) => STAFF_ROLES.has(String(r).toLowerCase()))
}

export function logout() {
  localStorage.removeItem(JWT_KEY)
  localStorage.removeItem(USER_KEY)
  localStorage.removeItem(APP_KEY)
  localStorage.removeItem('token')
}

export async function araraLogin(email: string, password: string) {
  const res = await fetch(`${ARARA_URL}/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || data.message || 'Login falhou')
  const token = data.token || data.accessToken
  const user: AraraUser = {
    id: data.user.id,
    email: data.user.email,
    name: data.user.name,
    roles: data.user.roles || [],
  }
  localStorage.setItem(JWT_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
  localStorage.setItem('token', token)

  const keyRes = await fetch(`${ARARA_URL}/v1/apps/${ARARA_SLUG}/keys`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: 'cursos-ui' }),
  })
  if (keyRes.ok) {
    const keyBody = await keyRes.json()
    const raw = keyBody.apiKey?.key || keyBody.key
    if (raw) localStorage.setItem(APP_KEY, raw)
  }

  return { token, user }
}

async function runtimeFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (!headers.has('Content-Type') && init?.body) {
    headers.set('Content-Type', 'application/json')
  }
  const url = `${ARARA_URL}/v1/r/${ARARA_SLUG}${path.startsWith('/') ? path : `/${path}`}`
  const res = await fetch(url, { ...init, headers })
  if (res.status === 204) return undefined as T
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || body.message || `HTTP ${res.status}`)
  return body as T
}

async function platformFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (!headers.has('Content-Type') && init?.body) {
    headers.set('Content-Type', 'application/json')
  }
  const url = `${ARARA_URL}${path.startsWith('/') ? path : `/${path}`}`
  const res = await fetch(url, { ...init, headers })
  if (res.status === 204) return undefined as T
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || body.message || `HTTP ${res.status}`)
  return body as T
}

export type AppNotification = {
  id: string
  userId: string
  title: string
  body: string
  severity: string
  href: string | null
  sourceApp: string | null
  read: boolean
  readAt: string | null
  createdAt: string
}

export const notifications = {
  list: (limit = 10) =>
    platformFetch<{ notifications: AppNotification[]; unreadCount: number }>(
      `/v1/notifications?limit=${limit}`,
    ),
  markRead: (id: string) =>
    platformFetch<{ notification: AppNotification }>(`/v1/notifications/${encodeURIComponent(id)}/read`, {
      method: 'POST',
    }),
  markAllRead: () =>
    platformFetch<{ ok: boolean; count: number }>('/v1/notifications/read-all', { method: 'POST' }),
}

export const api = {
  listCourses: (q?: string) => {
    const qs = q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''
    return runtimeFetch<{ data: Course[]; count: number }>(`/courses${qs}`)
  },
  getCourse: (slug: string) =>
    runtimeFetch<{ data: { course: Course; lessons: Lesson[] } }>(`/courses/${encodeURIComponent(slug)}`),
  createCourse: (payload: Partial<Course>) =>
    runtimeFetch<{ data: Course }>('/courses', { method: 'POST', body: JSON.stringify(payload) }),
  updateCourse: (id: string, payload: Partial<Course>) =>
    runtimeFetch<{ data: Course }>(`/courses/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  deleteCourse: (id: string) =>
    runtimeFetch<void>(`/courses/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  createLesson: (courseId: string, payload: Partial<Lesson>) =>
    runtimeFetch<{ data: Lesson }>(`/courses/${encodeURIComponent(courseId)}/lessons`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateLesson: (id: string, payload: Partial<Lesson>) =>
    runtimeFetch<{ data: Lesson }>(`/lessons/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  deleteLesson: (id: string) =>
    runtimeFetch<void>(`/lessons/${encodeURIComponent(id)}`, { method: 'DELETE' }),
}

/**
 * Adota um JWT já emitido (handoff SSO do Hub), deixando o storage no MESMO
 * estado de um login normal: arara_jwt, token, usuário e app key cunhada.
 */
export async function araraAdoptToken(token: string) {
  localStorage.setItem(JWT_KEY, token)
  localStorage.setItem('token', token)

  const meRes = await fetch(`${ARARA_URL}/v1/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const me = await meRes.json().catch(() => ({}))
  if (!meRes.ok) throw new Error(me.error || me.message || 'Sessão inválida')
  const raw = me.user || me
  const user: AraraUser = {
    id: raw.id,
    email: raw.email,
    name: raw.name,
    roles: raw.roles || [],
  }
  localStorage.setItem(USER_KEY, JSON.stringify(user))

  const keyRes = await fetch(`${ARARA_URL}/v1/apps/${ARARA_SLUG}/keys`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'cursos-ui' }),
  })
  if (keyRes.ok) {
    const keyBody = await keyRes.json()
    const k = keyBody.apiKey?.key || keyBody.key
    if (k) localStorage.setItem(APP_KEY, k)
  }

  return { token, user }
}

/**
 * Entrada vinda do Arara Hub. Contrato padrão: `/sso/?c=<id.verificador>` (o
 * Hub também pode mandar `#/sso?codigo=` — aceitamos os dois). Troca o código
 * pelo token na rota pública do Hub (exige token de webhook na query) e adota a
 * sessão. Roda ANTES do React montar. Devolve true se havia handoff.
 */
export async function consumeHubHandoff(): Promise<boolean> {
  if (import.meta.env.VITE_ARARA_API_URL === undefined) return false

  const { hash, search, pathname } = window.location
  let rawq = ''
  const isSsoHash = /(^|#)\/?sso(\b|\/|\?)/i.test(hash || '')
  if (isSsoHash && (hash || '').includes('?')) {
    rawq = hash.slice(hash.indexOf('?') + 1)
  } else if (search && (/\/sso\/?$/.test(pathname) || /[?&](codigo|c)=/.test(search))) {
    rawq = search.replace(/^\?/, '')
  }
  if (!rawq) return false

  const codigo =
    new URLSearchParams(rawq).get('c') || new URLSearchParams(rawq).get('codigo') || ''
  if (!codigo) return false

  try {
    const res = await fetch(
      `${ARARA_URL}/v1/r/arara-hub/sso/trocar?token=arara-hub-troca-publica`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo }),
      },
    )
    const body = await res.json().catch(() => ({}))
    if (res.ok && body?.token) {
      await araraAdoptToken(body.token)
    }
  } catch {
    /* silencioso: cai no login e a pessoa volta ao Hub */
  } finally {
    const root = import.meta.env.BASE_URL || '/'
    try { window.history.replaceState(null, '', root) } catch { /* noop */ }
  }
  return true
}
