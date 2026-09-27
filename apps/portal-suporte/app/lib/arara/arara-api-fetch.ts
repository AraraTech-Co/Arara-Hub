/**
 * Drop-in replacement for `fetch('/api/...')` that rewrites to Arara and attaches
 * the app API key / JWT. Use in legacy components that still call relative /api.
 */
import { ARARA_SLUG, ARARA_URL } from '@/lib/arara/client'
import { getAppApiKey, getJwt, getSessaoToken } from '@/lib/arara/auth-storage'

function rewrite(path: string): string {
  if (path.startsWith('http')) return path
  if (path.startsWith('/api/')) {
    return `${ARARA_URL}/v1/r/${ARARA_SLUG}${path.slice('/api'.length)}`
  }
  return path
}

export async function araraApiFetch(input: string, init?: RequestInit): Promise<Response> {
  const baseHeaders = new Headers(init?.headers)
  if (init?.body && !baseHeaders.has('Content-Type') && !(init.body instanceof FormData)) {
    baseHeaders.set('Content-Type', 'application/json')
  }

  const jwt = typeof window !== 'undefined' ? getJwt() : null
  const appKey = typeof window !== 'undefined' ? getAppApiKey(ARARA_SLUG) : null

  // Identidade do portal — o MESMO cabeçalho que `client.ts` envia, e pelo mesmo
  // motivo: a chave de API não carrega pessoa. Sem isto, assim que o JWT expira
  // a requisição chega ao servidor sem ninguém dentro. Enquanto o servidor
  // tratava "sem pessoa" como chamada de serviço, isso passava despercebido —
  // e passava por cima de toda regra de nível. Com a guarda de sessão
  // (scripts/guarda-sessao.py) passaria a ser 401, que é o certo, mas derrubaria
  // as 57 telas que usam este cliente. Este cabeçalho é o que as mantém de pé.
  const sessao = typeof window !== 'undefined' ? getSessaoToken() : null
  const ehRuntime = input.startsWith('/api/') || input.includes(`/v1/r/${ARARA_SLUG}`)
  if (sessao && ehRuntime) baseHeaders.set('x-portal-sessao', sessao)

  // JWT primeiro: a chave de API não carrega pessoa, e sem `ctx.user` nenhuma
  // regra por nível de acesso pode valer no servidor. A chave fica de reserva
  // caso o JWT seja recusado.
  const credenciais: Array<[string, string]> = []
  if (jwt) credenciais.push(['Authorization', `Bearer ${jwt}`])
  if (appKey) credenciais.push(['x-api-key', appKey])
  if (!credenciais.length) credenciais.push(['', ''])

  let res!: Response
  for (const [nome, valor] of credenciais) {
    const headers = new Headers(baseHeaders)
    if (nome) headers.set(nome, valor)
    res = await fetch(rewrite(input), { ...init, headers })
    if (res.ok || (res.status !== 401 && res.status !== 403)) break
  }
  return res
}
