// =============================================================================
// Adicionar membro da equipe — liberação de acesso feita pelo ADMIN.
//
// Por que não é o convite: o código de convite é resgatado pela PRÓPRIA pessoa,
// numa rota do portal. A plataforma recusa essa chamada antes de o portal rodar
// ("API key or user cannot access this app"), porque a conta nova ainda não é
// membro do app — e só dono/admin do app cria esse vínculo. Por isso quem libera
// é o admin, com a própria sessão, em três passos:
//
//   1. conta na plataforma — POST /v1/auth/register. Conta nova responde 201;
//      conta que já existe responde 409, SEM o id;
//   2. perfil no portal — POST /admin/membros acha a conta pelo e-mail, grava
//      papel, nome e WhatsApp e devolve o id (e troca a senha, se pedido);
//   3. acesso ao app — POST /v1/apps/portal-suporte/members com o JWT do admin.
//
// Os três são idempotentes: se algo falhar no meio, clicar de novo completa.
// =============================================================================

import { ARARA_SLUG, ARARA_URL, renovarSessaoPlataforma } from '@/lib/arara/client'
import { getJwt } from '@/lib/arara/auth-storage'
import { api, ApiError } from '@/lib/api/client'

export type PapelMembro = 'support' | 'developer' | 'admin'

export type NovoMembro = {
  nome: string
  email: string
  /** Senha inicial. Vale para conta nova; em conta existente, só com `trocarSenhaSeExistir`. */
  senha: string
  role: PapelMembro
  /** Só dígitos, com DDD. */
  phone?: string
  trocarSenhaSeExistir?: boolean
}

export type ResultadoMembro = {
  userId: string
  email: string
  role: string
  contaCriada: boolean
  /** Senha de conta EXISTENTE trocada pela desta tela. */
  senhaDefinida: boolean
  perfilExistia: boolean
}

type RespostaPerfil = {
  data: { user_id: string; email: string; role: string; perfil_existia: boolean; senha_definida: boolean }
}

function erroDoRegistro(status: number, corpo: unknown): string {
  const c = (corpo ?? {}) as { error?: string; details?: { fieldErrors?: Record<string, string[]> } }
  const campos = c.details?.fieldErrors ?? {}
  if (campos.email?.length) return 'e-mail inválido'
  if (campos.password?.length) return 'a senha precisa ter pelo menos 8 caracteres'
  if (status === 429) return 'muitas tentativas seguidas — espere um minuto e tente de novo'
  return c.error || `HTTP ${status}`
}

async function darAcessoAoApp(userId: string, role: PapelMembro): Promise<Response | null> {
  const enviar = (jwt: string) =>
    fetch(`${ARARA_URL}/v1/apps/${ARARA_SLUG}/members`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, role }),
    }).catch(() => null)

  const jwt = getJwt()
  let r = jwt ? await enviar(jwt) : null
  // JWT vencido no meio do caminho: renova UMA vez com o refresh e repete.
  if (!jwt || (r && r.status === 401)) {
    if (await renovarSessaoPlataforma()) {
      const novo = getJwt()
      if (novo) r = await enviar(novo)
    }
  }
  return r
}

export async function adicionarMembro(
  dados: NovoMembro,
  aoAvancar?: (passo: string) => void,
): Promise<ResultadoMembro> {
  const email = dados.email.trim().toLowerCase()

  // ── 1. conta na plataforma ────────────────────────────────────────────────
  aoAvancar?.('Criando a conta…')
  const reg = await fetch(`${ARARA_URL}/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: dados.senha, name: dados.nome }),
  }).catch(() => null)
  if (!reg) throw new Error('Sem conexão com a plataforma ao criar a conta. Tente de novo.')
  // A resposta do registro traz o token da PESSOA NOVA. Não é guardado: gravar
  // aqui trocaria a sessão do admin pela dela.
  const contaCriada = reg.ok
  if (!reg.ok && reg.status !== 409) {
    const corpo = await reg.json().catch(() => ({}))
    throw new Error(`Não foi possível criar a conta: ${erroDoRegistro(reg.status, corpo)}.`)
  }

  // ── 2. perfil no portal ───────────────────────────────────────────────────
  aoAvancar?.('Gravando o perfil…')
  const senhaTrocada = !contaCriada && dados.trocarSenhaSeExistir ? dados.senha : undefined
  let perfil: RespostaPerfil
  try {
    perfil = await api.post<RespostaPerfil>('/api/admin/membros', {
      email,
      nome: dados.nome,
      role: dados.role,
      phone: dados.phone || undefined,
      senha: senhaTrocada,
    })
  } catch (e) {
    if (e instanceof ApiError && e.status === 403) {
      throw new Error('Só administradores do portal podem adicionar membros.')
    }
    // 404 aqui tem DUAS causas, e confundi-las custou caro em 07/10/2026: o
    // handler devolve 404 com `codigo: "sem_conta"` quando o e-mail não existe
    // na plataforma, mas o ROTEADOR devolve 404 "No static route matched"
    // quando a própria rota não está publicada. Mostrar "a conta ainda não
    // aparece" no segundo caso manda todo mundo procurar defeito na conta da
    // pessoa, enquanto o que falta é o deploy do backend.
    if (e instanceof ApiError && e.status === 404) {
      const semRota = /no static route|route.*matched|cannot (POST|post)/i.test(e.message || '')
      throw new Error(
        semRota
          ? 'A rota de adicionar membro não está publicada no servidor (404 do roteador, não da conta). '
            + 'Isso é deploy do backend, não cadastro: avise quem publica. Nada foi gravado.'
          : 'A conta ainda não aparece na plataforma. Espere alguns segundos e clique de novo — repetir é seguro.',
      )
    }
    throw new Error(`Conta ok, mas o perfil não foi gravado: ${e instanceof Error ? e.message : String(e)}. Clique de novo — repetir é seguro.`)
  }
  const userId = String(perfil.data?.user_id || '')
  if (!userId) throw new Error('O portal não devolveu o id da conta. Clique de novo — repetir é seguro.')

  // ── 3. acesso ao app ──────────────────────────────────────────────────────
  aoAvancar?.('Liberando o acesso…')
  const r = await darAcessoAoApp(userId, dados.role)
  if (!r) {
    throw new Error('Perfil gravado, mas sua sessão da plataforma não está disponível para liberar o acesso. Saia, entre de novo e clique outra vez — repetir é seguro.')
  }
  if (r.status === 401) {
    throw new Error('Perfil gravado, mas sua sessão expirou antes de liberar o acesso. Saia, entre de novo e clique outra vez — repetir é seguro.')
  }
  if (r.status === 403) {
    throw new Error('Perfil gravado, mas sua conta não administra o portal na plataforma (é preciso ser dono ou admin do app). Com essa permissão, clique de novo — repetir é seguro.')
  }
  if (!r.ok) {
    const corpo = (await r.json().catch(() => ({}))) as { error?: string }
    throw new Error(`Perfil gravado, mas o acesso não foi liberado: ${corpo.error || `HTTP ${r.status}`}. Clique de novo — repetir é seguro.`)
  }

  return {
    userId,
    email: perfil.data.email || email,
    role: perfil.data.role || dados.role,
    contaCriada,
    senhaDefinida: Boolean(senhaTrocada),
    perfilExistia: Boolean(perfil.data.perfil_existia),
  }
}
