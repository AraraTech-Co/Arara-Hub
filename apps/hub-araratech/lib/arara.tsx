'use client'

/**
 * Cliente da Arara Platform para o Arara Hub (client-only).
 * - Users globais na plataforma (mesmo login de todos os apps).
 * - JWT no localStorage; sem app API key (o Hub só usa rotas com JWT).
 * - Handoff SSO via /v1/r/arara-hub/sso/criar (code-based).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'

export const ARARA_URL = (process.env.NEXT_PUBLIC_ARARA_API_URL || 'https://api.arara-tech.com').replace(/\/$/, '')
export const HUB_SLUG = process.env.NEXT_PUBLIC_ARARA_APP_SLUG || 'arara-hub'

const JWT_KEY = 'arara_jwt'
const USER_KEY = 'arara_user'
const MEMBERSHIPS_KEY = 'arara_memberships'

export type AraraUser = { id: string; email: string; name: string | null; roles?: string[] }
export type AraraMembership = { role: string; app: { slug: string; name: string } }
export type AraraNotification = {
  id: string
  title?: string
  body?: string
  severity?: 'info' | 'success' | 'warning' | 'critical'
  href?: string | null
  sourceApp?: string | null
  readAt?: string | null
}

// ---- storage (guardado em try/catch: janela anônima / storage bloqueado) ----
function ls(): Storage | null {
  try { return typeof window !== 'undefined' ? window.localStorage : null } catch { return null }
}
export const getJwt = () => ls()?.getItem(JWT_KEY) ?? null
export const setJwt = (t: string | null) => { const s = ls(); if (!s) return; t ? s.setItem(JWT_KEY, t) : s.removeItem(JWT_KEY) }
function readJson<T>(key: string, fallback: T): T {
  try { const raw = ls()?.getItem(key); return raw ? (JSON.parse(raw) as T) : fallback } catch { return fallback }
}
function writeJson(key: string, v: unknown | null) {
  const s = ls(); if (!s) return
  if (v == null) s.removeItem(key)
  else s.setItem(key, JSON.stringify(v))
}
export const getStoredUser = () => readJson<AraraUser | null>(USER_KEY, null)
export const getMemberships = () => readJson<AraraMembership[]>(MEMBERSHIPS_KEY, [])

export class AraraError extends Error {
  status: number
  constructor(status: number, message: string) { super(message); this.name = 'AraraError'; this.status = status }
}

async function req<T>(path: string, init?: RequestInit & { withAuth?: boolean }): Promise<T> {
  const { withAuth = true, headers: h, ...rest } = init || {}
  const headers = new Headers(h)
  if (rest.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const jwt = getJwt()
  if (withAuth && jwt) headers.set('Authorization', `Bearer ${jwt}`)
  const res = await fetch(`${ARARA_URL}${path}`, { ...rest, headers })
  if (!res.ok) {
    const b = await res.json().catch(() => ({}))
    throw new AraraError(res.status, (b as { error?: string; message?: string }).error || (b as { message?: string }).message || `HTTP ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const arara = {
  async login(email: string, password: string) {
    const d = await req<{ token: string; user: AraraUser; memberships?: AraraMembership[] }>(
      '/v1/auth/login',
      { method: 'POST', body: JSON.stringify({ email, password }), withAuth: false },
    )
    setJwt(d.token)
    writeJson(USER_KEY, d.user)
    writeJson(MEMBERSHIPS_KEY, d.memberships ?? [])
    return d
  },
  async me() {
    const d = await req<{ user?: AraraUser; memberships?: AraraMembership[] }>('/v1/auth/me')
    const user = d.user ?? (d as unknown as AraraUser)
    if (user) writeJson(USER_KEY, user)
    if (d.memberships) writeJson(MEMBERSHIPS_KEY, d.memberships)
    return { user, memberships: d.memberships ?? getMemberships() }
  },
  logout() { setJwt(null); writeJson(USER_KEY, null); writeJson(MEMBERSHIPS_KEY, null) },

  /** Notificações (serviço nativo da plataforma). */
  async notifications(): Promise<AraraNotification[]> {
    try {
      const d = await req<{ data?: AraraNotification[] } | AraraNotification[]>('/v1/notifications')
      return Array.isArray(d) ? d : d.data ?? []
    } catch { return [] }
  },
  async markRead(id: string) {
    try { await req(`/v1/notifications/${id}/read`, { method: 'POST' }) } catch { /* best-effort */ }
  },

  /**
   * Handoff SSO: gera código no navegador, guarda o JWT no servidor keyed pelo
   * código, e devolve o `codigo` (id.verificador) para anexar na URL do destino.
   * O app de destino troca em /v1/r/arara-hub/sso/trocar.
   */
  async ssoHandoff(appSlug: string): Promise<string> {
    const hex = (bytes: number) =>
      Array.from(crypto.getRandomValues(new Uint8Array(bytes)))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
    const id = hex(8) // 16 hex
    const verificador = hex(24) // 48 hex
    await req(`/v1/r/${HUB_SLUG}/sso/criar`, {
      method: 'POST',
      body: JSON.stringify({ id, verificador, app_slug: appSlug }),
    })
    return `${id}.${verificador}`
  },
}

// ---------------------------- Auth context ----------------------------
type AuthState = {
  ready: boolean
  user: AraraUser | null
  memberships: AraraMembership[]
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}
const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [user, setUser] = useState<AraraUser | null>(null)
  const [memberships, setMships] = useState<AraraMembership[]>([])

  const hydrate = useCallback(async () => {
    if (!getJwt()) { setUser(null); setMships([]); setReady(true); return }
    try {
      const me = await arara.me()
      setUser(me.user ?? null)
      setMships(me.memberships ?? [])
    } catch {
      arara.logout(); setUser(null); setMships([])
    } finally { setReady(true) }
  }, [])

  useEffect(() => { void hydrate() }, [hydrate])

  const login = useCallback(async (email: string, password: string) => {
    await arara.login(email, password)
    await hydrate()
  }, [hydrate])

  const logout = useCallback(() => { arara.logout(); setUser(null); setMships([]) }, [])

  return <Ctx.Provider value={{ ready, user, memberships, login, logout }}>{children}</Ctx.Provider>
}

export function useAuth(): AuthState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth precisa do <AuthProvider>')
  return v
}
