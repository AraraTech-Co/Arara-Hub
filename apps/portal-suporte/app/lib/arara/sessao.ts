// =============================================================================
// Sessão do portal — identidade que sobrevive à expiração do JWT.
//
// O JWT da plataforma expira e não existe rota de renovação (404 em
// /v1/auth/refresh e irmãs). Quando ele morre, o cliente cai na chave de app —
// que NÃO carrega pessoa (`ctx.user` vem `{type:"apiKey"}`). Sem uma identidade
// nossa, as guardas do servidor seriam puladas e um JWT vencido viraria acesso
// de serviço.
//
// Então o portal tem a própria sessão: um token de 256 bits gerado AQUI
// (o sandbox não tem `crypto`), partido em duas metades:
//
//   sid (16 hex)          → vira o id do registro no servidor: busca O(1)
//   verificador (48 hex)  → a metade secreta, conferida no servidor
//
// Vazar uma lista de ids não dá acesso a nada: falta o verificador.
//
// Plano: docs/plans/plano-sessao-persistente-portal.md
// =============================================================================

import { araraFetch } from './client'
import { getSessaoToken, setSessaoToken } from './auth-storage'

export { getSessaoToken }

export type PerfilDaSessao = {
  id: string
  full_name: string | null
  email: string | null
  role: string | null
  feature_grants: string[]
}

/** Token novo, 256 bits do CSPRNG do navegador. */
function gerarToken(): { sid: string; verificador: string; token: string } {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  const sid = hex.slice(0, 16)
  const verificador = hex.slice(16)
  return { sid, verificador, token: `${sid}.${verificador}` }
}

/**
 * Cria a sessão logo após o login — é o JWT recém-emitido que prova quem é.
 * Falhar aqui não impede de usar o portal: só significa que a sessão não vai
 * durar além do JWT, e é melhor entrar do que barrar por causa disso.
 */
export async function criarSessao(): Promise<boolean> {
  try {
    const { sid, verificador, token } = gerarToken()
    await araraFetch.post('/api/auth/sessao/criar', {
      sid,
      verificador,
      agente: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    })
    setSessaoToken(token)
    return true
  } catch {
    return false
  }
}

/** Valida na abertura do portal. Renova por uso, no servidor. */
export async function validarSessao(): Promise<{ userId: string; perfil: PerfilDaSessao | null } | null> {
  const token = getSessaoToken()
  if (!token) return null
  try {
    const r = await araraFetch.post<{ data?: { user_id?: string; perfil?: PerfilDaSessao | null } }>(
      '/api/auth/sessao/validar',
      {},
    )
    const uid = r?.data?.user_id
    if (!uid) return null
    return { userId: String(uid), perfil: r.data?.perfil ?? null }
  } catch {
    // Sessão recusada é o servidor dizendo que acabou — o chamador limpa.
    return null
  }
}

/** Logout de verdade: a sessão morre no servidor, não só neste navegador. */
export async function encerrarSessao(): Promise<void> {
  const token = getSessaoToken()
  setSessaoToken(null)
  if (!token) return
  try {
    await araraFetch.post('/api/auth/sessao/encerrar', {})
  } catch {
    // Se a rede falhar, o token já saiu daqui; a sessão expira sozinha no prazo.
  }
}

export function limparSessaoLocal() {
  setSessaoToken(null)
}
