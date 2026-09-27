import {
  getAppApiKey,
  getJwt,
  getRefreshToken,
  getSessaoToken,
  setAppApiKey,
  setRefreshToken,
  setJwt,
  setMemberships,
  setStoredUser,
  type AraraMembership,
  type AraraUser,
} from './auth-storage'

export const ARARA_URL = (process.env.NEXT_PUBLIC_ARARA_API_URL ?? '').replace(/\/$/, '')
export const ARARA_SLUG = process.env.NEXT_PUBLIC_ARARA_APP_SLUG || 'portal-suporte'

export class AraraError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'AraraError'
    this.status = status
  }
}

type AuthMode = 'auto' | 'jwt' | 'appKey' | 'none'

export function rewriteAraraPath(path: string): string {
  if (path.startsWith('http')) return path
  // Platform auth / apps management (not app runtime)
  if (path.startsWith('/v1/')) return `${ARARA_URL}${path}`
  // Legacy portal paths
  if (path.startsWith('/api/')) {
    const rest = path.slice('/api'.length)
    return `${ARARA_URL}/v1/r/${ARARA_SLUG}${rest}`
  }
  if (path.startsWith('/')) return `${ARARA_URL}${path}`
  return `${ARARA_URL}/${path}`
}

function rewrite(path: string): string {
  return rewriteAraraPath(path)
}

async function request<T>(path: string, init?: RequestInit & { auth?: AuthMode }): Promise<T> {
  const { auth = 'auto', headers: initHeaders, ...rest } = init || {}
  const baseHeaders = new Headers(initHeaders)
  if (rest.body && !baseHeaders.has('Content-Type')) {
    baseHeaders.set('Content-Type', 'application/json')
  }

  const jwt = getJwt()
  const appKey = getAppApiKey(ARARA_SLUG)
  const isRuntime = path.startsWith('/api/') || path.includes(`/v1/r/${ARARA_SLUG}`)

  // Ordem de credenciais. O JWT vem primeiro no runtime porque a chave de API
  // NÃO carrega pessoa (`ctx.user` fica vazio): com ela, o controller não sabe
  // quem está chamando, a mensagem enviada sai assinada como "Atendente"
  // genérico e nenhuma regra por nível de acesso pode ser aplicada no servidor.
  // A chave fica como segunda tentativa, para não trancar ninguém fora caso o
  // JWT seja recusado no app.
  // Identidade do portal. Vai junto SEMPRE que a chamada é para os nossos
  // controllers: se o JWT tiver expirado, a requisição ainda chega pela chave
  // de app — que não carrega pessoa. Sem este cabeçalho, o servidor não saberia
  // quem está pedindo e as guardas de permissão seriam puladas.
  if (isRuntime) {
    const sessao = getSessaoToken()
    if (sessao) baseHeaders.set('x-portal-sessao', sessao)
  }

  const tentativas: Array<[string, string]> = []
  if (auth === 'none') {
    // sem credencial
  } else if (auth === 'jwt') {
    if (jwt) tentativas.push(['Authorization', `Bearer ${jwt}`])
  } else if (auth === 'appKey') {
    if (appKey) tentativas.push(['x-api-key', appKey])
    else if (jwt) tentativas.push(['Authorization', `Bearer ${jwt}`])
  } else {
    if (jwt) tentativas.push(['Authorization', `Bearer ${jwt}`])
    if (appKey) tentativas.push(['x-api-key', appKey])
    if (!isRuntime) tentativas.reverse()
  }
  if (!tentativas.length) tentativas.push(['', ''])

  let ultima: Response | null = null
  for (let i = 0; i < tentativas.length; i++) {
    const headers = new Headers(baseHeaders)
    const [nome, valor] = tentativas[i]
    if (nome) headers.set(nome, valor)

    const res = await fetch(rewrite(path), { ...rest, headers })
    ultima = res
    // Só credencial recusada justifica tentar a próxima; 404 ou 500 são
    // resposta legítima e repetir só duplicaria o efeito de um POST.
    if (res.ok || (res.status !== 401 && res.status !== 403)) break
  }

  const res = ultima!
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new AraraError(res.status, body.error || body.message || `HTTP ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

/**
 * Renova o access token com o refresh (plataforma, 21/08).
 *
 * O refresh é ROTATIVO: a resposta traz um novo, e o antigo morre na hora.
 * Por isso o token novo é gravado antes de qualquer outra coisa — perder essa
 * gravação significa deslogar a pessoa na próxima abertura, sem motivo visível.
 */
export async function renovarSessaoPlataforma(): Promise<boolean> {
  const refresh = getRefreshToken()
  if (!refresh) return false
  try {
    const r = await fetch(`${ARARA_URL}/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: refresh }),
    })
    if (!r.ok) {
      // 401 = refresh inválido, expirado ou já usado. Não adianta insistir.
      if (r.status === 401) setRefreshToken(null)
      return false
    }
    const corpo = (await r.json()) as { token?: string; refreshToken?: string }
    if (!corpo.token) return false
    setJwt(corpo.token)
    if (corpo.refreshToken) setRefreshToken(corpo.refreshToken)
    return true
  } catch {
    // Rede caiu: NÃO descarta o refresh — ele ainda pode valer na próxima.
    return false
  }
}

export const arara = {
  /** Cria a conta na plataforma. Não concede acesso ao portal: quem concede é
      o `Profile`, criado depois pelo resgate do convite (operador) ou pela
      confirmação por WhatsApp (cliente). Ver scripts/cadastro-acesso.py. */
  register: (email: string, password: string, name: string) =>
    request<{ token?: string; user?: AraraUser }>('/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
      auth: 'none',
    }),

  login: async (email: string, password: string) => {
    const data = await request<{
      token: string
      refreshToken?: string
      user: AraraUser
      memberships?: AraraMembership[]
    }>('/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
      auth: 'none',
    })
    setJwt(data.token)
    // O refresh (30 dias, rotativo) é o que permite renovar o access sem pedir
    // a senha de novo. Chegou com a plataforma em 21/08.
    if (data.refreshToken) setRefreshToken(data.refreshToken)
    setStoredUser(data.user)
    setMemberships(data.memberships || [])
    return data
  },

  me: () =>
    request<{ type: string; user?: AraraUser; memberships?: AraraMembership[] }>('/v1/auth/me', {
      auth: 'jwt',
    }),

  /**
   * Nível do usuário dentro do portal (`portal-suporte-Profile.role`).
   *
   * Não existe `/profiles/me` (chave de API não carrega pessoa), mas a
   * plataforma garante `Profile.id = users.id` — então o id do logado abre a
   * linha dele direto. O filtro por e-mail cobre cadastro que não siga a
   * convenção. Nos dois casos vem só a linha dele, nunca a lista inteira.
   */
  appRole: async (user: { id?: string; email?: string }): Promise<string | null> => {
    if (user.id) {
      const row = await request<{ role?: string; data?: { role?: string } }>(
        `/api/profiles/${user.id}`,
      ).catch(() => null)
      const role = row?.role ?? row?.data?.role
      if (role) return role
    }
    if (!user.email) return null
    const res = await request<{ data?: { role?: string }[] }>(
      `/api/profiles?email=${encodeURIComponent(user.email)}`,
    ).catch(() => null)
    return res?.data?.[0]?.role ?? null
  },

  /** Admin/owner: mint an API key for a specific app (shared user, per-app key). */
  createAppKey: (slug: string, name?: string) =>
    request<{
      apiKey: { id: string; prefix: string; key: string; scopes: string[] }
    }>(`/v1/apps/${slug}/keys`, {
      method: 'POST',
      body: JSON.stringify({ name: name || 'ui-client' }),
      auth: 'jwt',
    }),

  bindAppKey: (slug: string, rawKey: string) => {
    setAppApiKey(slug, rawKey)
  },

  tickets: () =>
    request<{ data: Record<string, unknown>[]; count: number }>('/api/tickets'),

  ticket: (id: string) => request<Record<string, unknown>>(`/api/tickets/${id}`),

  createTicket: (body: Record<string, unknown>) =>
    request<Record<string, unknown>>('/api/tickets', {
      method: 'POST',
      body: JSON.stringify(body),
      auth: 'appKey',
    }),

  trackTicket: (token: string) =>
    request<Record<string, unknown>>(
      `/api/tickets/track?token=${encodeURIComponent(token)}`,
      { auth: 'appKey' },
    ),

  publicTicket: (id: string, email: string) =>
    request<Record<string, unknown>>(
      `/api/tickets/public?id=${encodeURIComponent(id)}&email=${encodeURIComponent(email)}`,
      { auth: 'appKey' },
    ),

  publicReply: (body: Record<string, unknown>) =>
    request<Record<string, unknown>>('/api/tickets/public/reply', {
      method: 'POST',
      body: JSON.stringify(body),
      auth: 'appKey',
    }),

  rateGet: (token: string) =>
    request<Record<string, unknown>>(`/api/rate/${encodeURIComponent(token)}`, {
      auth: 'appKey',
    }),

  ratePost: (token: string, body: { score: number; comment?: string | null }) =>
    request<Record<string, unknown>>(`/api/rate/${encodeURIComponent(token)}`, {
      method: 'POST',
      body: JSON.stringify(body),
      auth: 'appKey',
    }),

  ticketMessages: (id: string) =>
    request<{ data: Record<string, unknown>[]; count: number }>(`/api/tickets/${id}/messages`),

  postTicketMessage: (id: string, body: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/api/tickets/${id}/messages`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  patchTicket: (id: string, data: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/api/tickets/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  /**
   * Cadastro completo, incluindo as 122 linhas de legado que vieram da carga
   * de chamados — é a tela de administração de Empresas que consome isto, e
   * ela precisa mostrar as duas faixas. Para escolher empresa, use
   * `companiesApi.list()`, que já corta o legado.
   *
   * O limite é explícito porque o padrão da rota é 50.
   */
  companies: () =>
    request<{ data: Record<string, unknown>[]; count: number }>('/api/admin/companies?limit=1000'),

  company: (id: string) => request<Record<string, unknown>>(`/api/admin/companies/${id}`),

  createCompany: (body: Record<string, unknown>) =>
    request<Record<string, unknown>>('/api/admin/companies', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  profiles: () =>
    request<{ data: Record<string, unknown>[]; count: number }>('/api/profiles'),

  tasks: () => request<{ data: Record<string, unknown>[]; count: number }>('/api/tasks'),
  teams: () => request<{ data: Record<string, unknown>[]; count: number }>('/api/admin/teams'),
  incidents: () =>
    request<{ data: Record<string, unknown>[]; count: number }>('/api/admin/incidents'),
  emails: () => request<{ data: Record<string, unknown>[]; count: number }>('/api/emails'),
  slaConfigs: () =>
    request<{ data: Record<string, unknown>[]; count: number }>('/api/sla/configs'),
  slaContracts: () =>
    request<{ data: Record<string, unknown>[]; count: number }>('/api/admin/sla-contracts'),
  slaCalendar: () =>
    request<{ data: Record<string, unknown>[]; count: number }>('/api/admin/sla-calendar'),
}

export const araraFetch = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body !== undefined ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body !== undefined ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}
