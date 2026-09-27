// =============================================================================
// Usuários do CRM, administrados daqui.
//
// PRD: portal-crm/docs/plans/PRD-hub-login-central-e-admin-crm.md
//
// DUAS CREDENCIAIS DIFERENTES, e a razão de cada uma:
//
//   - As rotas do app `portal-crm` vão com o **JWT da pessoa logada**. A chave
//     de app deste portal NÃO alcança outro app — sondado em 26/08:
//     `GET /v1/r/portal-crm/equipe` com a chave do suporte responde 403
//     "API key or user cannot access this app". Consequência assumida (caminho
//     A do PRD): só funciona para quem é ADMIN no CRM. Um master do suporte
//     sem Profile de CRM vê a tela e toma 403 — e a tela precisa dizer isso com
//     todas as letras, em vez de mostrar erro genérico.
//
//   - A senha vai com a **chave de app do portal-suporte**. `POST
//     /v1/users/:id/password` é da plataforma, não de app: com a chave ele
//     responde 404 para id inexistente (sondado em 26/08), ou seja, autoriza.
//     É o mesmo caminho que a tela de Membros usa desde 20/08. O PRD supunha
//     403 aqui — isso vem de tentar com JWT, não com a chave.
// =============================================================================

import { ARARA_URL } from '@/lib/arara/client'
import { getAppApiKey, getJwt } from '@/lib/arara/auth-storage'

/** Papéis que a plataforma aceita em AppMembership (/readme, seção Membership). */
export type PapelPlataforma = 'user' | 'support' | 'developer' | 'admin'

export type MembroCrm = {
  id: string
  email: string
  fullName?: string | null
  role: 'vendedor' | 'gerente' | 'admin' | string
  phone?: string | null
  active?: boolean
}

/** Erro que a tela precisa distinguir dos demais para explicar o caminho A. */
export class SemAcessoAoCrm extends Error {
  constructor() {
    super('Sua conta não é administradora do CRM.')
    this.name = 'SemAcessoAoCrm'
  }
}

async function comJwt<T>(caminho: string, init?: RequestInit): Promise<T> {
  const jwt = getJwt()
  if (!jwt) throw new Error('Sessão expirada — entre novamente.')
  const headers = new Headers(init?.headers)
  headers.set('Authorization', `Bearer ${jwt}`)
  if (init?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')

  const res = await fetch(`${ARARA_URL}/v1/r/portal-crm${caminho}`, { ...init, headers })
  if (res.status === 403) throw new SemAcessoAoCrm()
  if (!res.ok) {
    const corpo = await res.json().catch(() => ({}))
    throw new Error((corpo as { error?: string }).error || `HTTP ${res.status}`)
  }
  return (res.status === 204 ? undefined : await res.json()) as T
}

function extrair(bruto: unknown): MembroCrm[] {
  if (Array.isArray(bruto)) return bruto as MembroCrm[]
  const o = (bruto ?? {}) as Record<string, unknown>
  for (const chave of ['data', 'membros', 'items']) {
    if (Array.isArray(o[chave])) return o[chave] as MembroCrm[]
  }
  return []
}

export const crmApi = {
  listar: () => comJwt<unknown>('/equipe').then(extrair),

  /**
   * Criar é DOIS passos, e o primeiro é irreversível pela tela: a identidade
   * central nasce em `/v1/auth/register` e passa a valer em todos os portais
   * da Arara. O segundo passo só diz que essa pessoa é do CRM.
   */
  criar: async (dados: { email: string; nome: string; senha: string; role: string; phone?: string }) => {
    const reg = await fetch(`${ARARA_URL}/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: dados.email, password: dados.senha, name: dados.nome }),
    })
    const corpo = await reg.json().catch(() => ({}))
    if (!reg.ok) {
      // 409 é conta que já existe: não é falha, é caminho comum — a pessoa já
      // usa outro portal da Arara e só precisa virar membro do CRM.
      if (reg.status !== 409) {
        throw new Error((corpo as { error?: string }).error || `Falha ao criar a conta (HTTP ${reg.status})`)
      }
    }
    const id = String(
      (corpo as { user?: { id?: string }; id?: string }).user?.id
      ?? (corpo as { id?: string }).id
      ?? '',
    )
    if (!id) {
      throw new Error(
        'A conta existe na plataforma, mas a resposta não trouxe o id. '
        + 'Peça o id em Membros e use "Vincular conta existente".',
      )
    }
    await crmApi.vincular({ id, email: dados.email, nome: dados.nome, role: dados.role, phone: dados.phone })
    return { id, jaExistia: reg.status === 409 }
  },

  /**
   * Dá acesso ao CRM a uma conta que JÁ existe na plataforma.
   *
   * SÃO DUAS COISAS, e só uma delas existia aqui até 28/08:
   *   - o `portal-crm-Profile`, que é o cadastro dentro do CRM (papel, telefone);
   *   - o `AppMembership`, que é o ACESSO ao app — e é o que faz o card do CRM
   *     aparecer no Arara Hub.
   *
   * `POST /v1/auth/register` não cria membership em app nenhum (dito no
   * /readme). Sem o segundo passo, a pessoa aparecia na equipe do CRM e não
   * conseguia entrar por lá.
   */
  vincular: async (dados: { id: string; email: string; nome: string; role: string; phone?: string }) => {
    await comJwt<unknown>('/equipe/membro', {
      method: 'POST',
      body: JSON.stringify({
        id: dados.id,
        email: dados.email,
        name: dados.nome,
        role: dados.role,
        phone: dados.phone || '',
        active: true,
      }),
    })
    await crmApi.darAcesso(dados.id, papelDePlataforma(dados.role))
  },

  /**
   * Concede (ou atualiza) o acesso ao app `portal-crm` na plataforma.
   *
   * Só JWT de pessoa administra membership — chave de app é recusada. Por isso
   * mora aqui, na tela, e não num controller.
   */
  darAcesso: async (userId: string, papel: PapelPlataforma = 'user') => {
    const jwt = getJwt()
    if (!jwt) throw new Error('Sessão expirada — entre novamente.')
    const r = await fetch(`${ARARA_URL}/v1/apps/portal-crm/members`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, role: papel }),
    })
    if (r.status === 403) throw new SemAcessoAoCrm()
    if (!r.ok) {
      const corpo = await r.json().catch(() => ({}))
      throw new Error((corpo as { error?: string }).error || `Falha ao dar acesso (HTTP ${r.status})`)
    }
  },

  /** Quem tem acesso ao app hoje — para a tela mostrar quem está sem. */
  acessos: async (): Promise<Set<string>> => {
    const jwt = getJwt()
    if (!jwt) return new Set()
    const r = await fetch(`${ARARA_URL}/v1/apps/portal-crm/members`, {
      headers: { Authorization: `Bearer ${jwt}` },
    })
    if (!r.ok) return new Set()
    const corpo = await r.json().catch(() => ({}))
    const linhas = (corpo as { members?: unknown[]; data?: unknown[] }).members
      ?? (corpo as { data?: unknown[] }).data ?? []
    return new Set(
      (linhas as Record<string, unknown>[])
        .map((m) => String(m.userId ?? m.user_id ?? (m.user as { id?: string })?.id ?? ''))
        .filter(Boolean),
    )
  },

  tirarAcesso: async (userId: string) => {
    const jwt = getJwt()
    if (!jwt) throw new Error('Sessão expirada — entre novamente.')
    const r = await fetch(`${ARARA_URL}/v1/apps/portal-crm/members/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${jwt}` },
    })
    if (!r.ok && r.status !== 404) throw new Error(`Falha ao tirar o acesso (HTTP ${r.status})`)
  },

  editar: (id: string, mudancas: { role?: string; active?: boolean; phone?: string; fullName?: string }) =>
    comJwt<unknown>(`/equipe/membro/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(mudancas),
    }),

  /**
   * Senha da identidade CENTRAL: vale em todos os portais da Arara, não só no
   * CRM. Vai pela chave de app, não pelo JWT.
   */
  redefinirSenha: async (id: string, senha: string) => {
    const key = getAppApiKey('portal-suporte')
    if (!key) throw new Error('Sessão sem chave do app — entre novamente.')
    const res = await fetch(`${ARARA_URL}/v1/users/${encodeURIComponent(id)}/password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key },
      body: JSON.stringify({ password: senha }),
    })
    if (!res.ok) {
      const corpo = await res.json().catch(() => ({}))
      throw new Error((corpo as { error?: string }).error || `HTTP ${res.status}`)
    }
  },
}

/**
 * Senha inicial legível de ditar por telefone — é assim que ela chega em quem
 * vai usá-la. Sorteada no navegador com `crypto`, não com `Math.random`.
 */
export function gerarSenha(): string {
  const alfabeto = 'abcdefghijkmnopqrstuvwxyz'
  const digitos = '23456789'
  const bytes = new Uint32Array(12)
  crypto.getRandomValues(bytes)
  const letra = (i: number) => alfabeto[bytes[i] % alfabeto.length]
  const numero = (i: number) => digitos[bytes[i] % digitos.length]
  return (
    [0, 1, 2, 3].map(letra).join('')
    + '-'
    + [4, 5, 6, 7].map(letra).join('')
    + '-'
    + [8, 9, 10, 11].map(numero).join('')
  )
}

/**
 * O papel do CRM (`vendedor | gerente | admin`) traduzido para o vocabulário
 * de papéis da PLATAFORMA (`user | support | developer | admin`), que é o que
 * `AppMembership` aceita.
 *
 * Vendedor e gerente viram `user`: o papel que manda dentro do CRM é o do
 * Profile. O membership diz apenas QUEM ENTRA — e dar `admin` de plataforma a
 * um vendedor seria conceder, de graça, o direito de administrar membros e
 * revogar chaves do app.
 */
export function papelDePlataforma(papelCrm: string): PapelPlataforma {
  return String(papelCrm).toLowerCase() === 'admin' ? 'admin' : 'user'
}
