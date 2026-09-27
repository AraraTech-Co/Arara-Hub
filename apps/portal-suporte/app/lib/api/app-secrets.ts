// =============================================================================
// Cofre de credenciais da plataforma (`AppSecret`, AES-256-GCM).
//
// Regra que torna isto seguro num front estático: o segredo nasce
// `serverOnly: true`, e a chave de API que o portal minta no login tem escopo
// `app:{slug}:*` — que NÃO inclui `secrets:read`. Ou seja, a tela consegue
// GRAVAR mas o valor nunca volta por ela. Quem lê em claro é a machine key,
// que vive só no servidor que usa a credencial.
//
// Por isso tudo aqui vai com JWT explícito: gravar exige JWT com acesso ao app,
// e a chave de API não serve nem para isso.
// =============================================================================

import { ARARA_SLUG, ARARA_URL } from '@/lib/arara/client'
import { getJwt } from '@/lib/arara/auth-storage'

export interface AppSecretMeta {
  id: string
  name: string
  serverOnly?: boolean
  createdAt?: string
  updatedAt?: string
}

async function pedir<T>(caminho: string, init?: RequestInit): Promise<T> {
  const jwt = getJwt()
  if (!jwt) throw new Error('Sessão necessária')
  const headers = new Headers(init?.headers)
  headers.set('Authorization', `Bearer ${jwt}`)
  if (init?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')

  const res = await fetch(`${ARARA_URL}/v1/apps/${ARARA_SLUG}/secrets${caminho}`, {
    ...init,
    headers,
  })
  const corpo = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((corpo as { error?: string }).error || `HTTP ${res.status}`)
  return corpo as T
}

export const appSecretsApi = {
  /** Metadados apenas — a API não devolve valor nesta rota, para ninguém. */
  list: () => pedir<{ secrets: AppSecretMeta[] }>(''),

  /**
   * Grava ou substitui. `serverOnly` fica ligado: sem isso o valor passaria a
   * ser legível pela chave de API que está no navegador de toda a equipe.
   */
  set: (name: string, value: string) =>
    pedir<{ secret: AppSecretMeta }>('', {
      method: 'POST',
      body: JSON.stringify({ name, value, serverOnly: true }),
    }),

  remove: (name: string) =>
    pedir<unknown>(`/${encodeURIComponent(name)}`, { method: 'DELETE' }),
}

/** Nome do segredo do token do provedor de WhatsApp, no cofre da plataforma. */
export const SEGREDO_WHATSAPP = 'whatsapp_token'
