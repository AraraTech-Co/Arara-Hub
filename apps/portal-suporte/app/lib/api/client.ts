/**
 * Unified fetch for portal UI → Arara Platform.
 *
 * Users: shared across apps (JWT).
 * API keys: per-app scope; prefer x-api-key on /v1/r/{slug}/*, Bearer elsewhere.
 */
import { ARARA_SLUG, ARARA_URL, araraFetch } from '@/lib/arara/client'
import { getAppApiKey, getJwt, getSessaoToken } from '@/lib/arara/auth-storage'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

function rewritePath(path: string): string {
  if (path.startsWith('http')) return path
  if (path.startsWith('/v1/')) return `${ARARA_URL}${path}`
  if (path.startsWith('/api/')) {
    return `${ARARA_URL}/v1/r/${ARARA_SLUG}${path.slice('/api'.length)}`
  }
  if (ARARA_URL && path.startsWith('/')) return `${ARARA_URL}${path}`
  return path
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const baseHeaders = new Headers(init?.headers)
  if (!baseHeaders.has('Content-Type') && init?.body) {
    baseHeaders.set('Content-Type', 'application/json')
  }

  const jwt = typeof window !== 'undefined' ? getJwt() : null
  const appKey = typeof window !== 'undefined' ? getAppApiKey(ARARA_SLUG) : null

  // Identidade do portal — o MESMO cabeçalho que `arara/client.ts` e
  // `arara-api-fetch.ts` enviam. Este é o TERCEIRO cliente HTTP do front e era
  // o único que ainda não mandava: 14 módulos de API passam por aqui (tickets,
  // kb, companies, users, devops…), então assim que o JWT expirava a chamada
  // chegava ao servidor sem pessoa dentro. Enquanto o servidor tratava isso
  // como chamada de serviço, passava despercebido — e passava por cima de toda
  // regra de nível. Com a guarda de sessão virou 401, que é o certo, e foi o
  // que quebrou "resolver ticket" no quadro e a Base de Conhecimento.
  const sessao = typeof window !== 'undefined' ? getSessaoToken() : null
  const ehRuntime = path.startsWith('/api/') || path.includes(`/v1/r/${ARARA_SLUG}`)
  if (sessao && ehRuntime) baseHeaders.set('x-portal-sessao', sessao)

  // JWT na frente: a chave de API não carrega pessoa, e sem `ctx.user` o
  // servidor não consegue aplicar nenhuma regra por nível de acesso. A chave
  // fica de reserva para o caso de o JWT ser recusado no app.
  const credenciais: Array<[string, string]> = []
  if (jwt) credenciais.push(['Authorization', `Bearer ${jwt}`])
  if (appKey) credenciais.push(['x-api-key', appKey])
  if (!credenciais.length) credenciais.push(['', ''])

  let res!: Response
  for (const [nome, valor] of credenciais) {
    const headers = new Headers(baseHeaders)
    if (nome) headers.set(nome, valor)
    res = await fetch(rewritePath(path), { ...init, headers })
    if (res.ok || (res.status !== 401 && res.status !== 403)) break
  }

  if (!res.ok) {
    const body: { error?: string; message?: string } = await res.json().catch(() => ({}))
    throw new ApiError(res.status, body.error ?? body.message ?? `HTTP ${res.status}`)
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'PUT',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'PATCH',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}

/** Prefer araraFetch for new code; api kept for existing lib/api/*.ts imports. */
export { araraFetch }
