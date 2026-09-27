// =============================================================================
// Inbox de notificações — o da PLATAFORMA, não do portal.
//
// A versão anterior falava com `/api/notifications`, rota do backend em Prisma
// que morreu na migração; o sino ficou pendurado num cabeçalho que ninguém
// renderizava e o aviso parou de existir sem ninguém notar.
//
// Agora a fonte é `/v1/notifications`, o inbox compartilhado entre todos os
// portais da Arara. Duas consequências que valem saber:
//
//   - é JWT de pessoa, não chave de app: a chave não carrega identidade e a
//     rota devolve o inbox de QUEM está logado (`ctx.user`);
//   - `href` é URL absoluta e pode apontar para outro portal — o aviso de um
//     lançamento de horas chega no mesmo sino que o de um chamado.
// =============================================================================

import { ARARA_URL } from '@/lib/arara/client'
import { getJwt } from '@/lib/arara/auth-storage'

export type Notificacao = {
  id: string
  title: string
  body?: string | null
  severity?: 'info' | 'success' | 'warning' | 'critical' | null
  href?: string | null
  sourceApp?: string | null
  readAt?: string | null
  createdAt: string
}

async function pedir<T>(caminho: string, init?: RequestInit): Promise<T> {
  const jwt = getJwt()
  if (!jwt) throw new Error('Sessão necessária')
  const headers = new Headers(init?.headers)
  headers.set('Authorization', `Bearer ${jwt}`)
  if (init?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')

  const res = await fetch(`${ARARA_URL}/v1/notifications${caminho}`, { ...init, headers })
  if (!res.ok) {
    const corpo = await res.json().catch(() => ({}))
    throw new Error((corpo as { error?: string }).error || `HTTP ${res.status}`)
  }
  return (res.status === 204 ? undefined : await res.json()) as T
}

/** A rota já devolveu `{data:[…]}`, `{notifications:[…]}` e lista crua. */
function extrair(bruto: unknown): Notificacao[] {
  if (Array.isArray(bruto)) return bruto as Notificacao[]
  const o = (bruto ?? {}) as Record<string, unknown>
  for (const chave of ['data', 'notifications', 'items']) {
    if (Array.isArray(o[chave])) return o[chave] as Notificacao[]
  }
  return []
}

export const notificacoesApi = {
  listar: (limite = 15) =>
    pedir<unknown>(`?limit=${limite}`).then(extrair),

  // `keepalive` porque estas duas saem no exato momento em que a pessoa navega
  // para o chamado: sem ele o navegador CANCELA a requisição ao descarregar a
  // página, o "lida" nunca chega ao servidor e o aviso volta não lido — era
  // metade do defeito relatado em 26/08.
  marcarLida: (id: string) =>
    pedir<unknown>(`/${encodeURIComponent(id)}/read`, { method: 'POST', keepalive: true }),

  marcarTodasLidas: () => pedir<unknown>('/read-all', { method: 'POST', keepalive: true }),
}

export function naoLida(n: Notificacao): boolean {
  return !n.readAt
}
