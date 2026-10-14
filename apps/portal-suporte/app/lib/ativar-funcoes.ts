// =============================================================================
// ⚠️ TEMPORÁRIO — remover quando tudo estiver ativo em produção.
//
// Para apagar: este arquivo, `app/_components/admin/ativar-funcoes-card.tsx`,
// a linha que monta o card em
// `app/_components/admin/whatsapp-analytics-client.tsx`, e o teste
// `scripts/testes-handlers/ativar-funcoes.test.js`. Nada mais importa daqui.
//
// POR QUE EXISTE: as Fases 3, 4 e 5 estão em produção mas INERTES — falta
// criar os models e as chaves VAPID. Isso era trabalho de quatro scripts
// Python que leem `apps/portal-suporte/.env.local` com uma `ARARA_API_KEY`.
// Esse arquivo não existe na máquina de quem precisa rodar, e copiar chave de
// API para um terminal é o tipo de passo que ninguém deveria ter de dar para
// ligar uma feature.
//
// O navegador de quem está logado já tem o que basta: o JWT da plataforma. É
// o mesmo caminho que `app/lib/api/app-secrets.ts` usa para gravar o token do
// provedor — grava e nunca lê de volta, porque o segredo nasce
// `serverOnly: true`.
//
// OS SCHEMAS ABAIXO SÃO A MESMA COISA que os dos scripts `.py`. Duas
// definições do mesmo model divergiriam no primeiro ajuste, e aí o card
// criaria um model diferente do que o script cria. Como o Python não importa
// TypeScript, há um teste comparando os dois arquivo a arquivo
// (`ativar-funcoes.test.js`): se divergirem, a suíte reprova.
// =============================================================================

import { ARARA_SLUG, ARARA_URL } from '@/lib/arara/client'
import { getJwt } from '@/lib/arara/auth-storage'

/** Um model a criar, no formato que a API da plataforma espera. */
export interface ModelNovo {
  name: string
  alias: string
  schema: { type: 'object'; properties: Record<string, { type: string }> }
}

const txt = { type: 'string' }
const num = { type: 'number' }
const bool = { type: 'boolean' }

// ── Fase 3a: contas de WhatsApp ────────────────────────────────────────────
export const MODEL_CONTA: ModelNovo = {
  name: 'portal-suporte-WaConta',
  alias: 'WaConta',
  schema: {
    type: 'object',
    properties: {
      id: txt, nome: txt, setor: txt, ativa: bool, numero: txt,
      criada_em: txt, created_at: txt,
    },
  },
}

/** O campo que a conversa ganha. Ausente = conta default; nada é reescrito. */
export const CAMPO_CONTA_NA_CONVERSA = 'conta_id'
export const MODEL_CONVERSA = 'portal-suporte-WhatsAppConversation'

// ── Fase 4: Web Push ───────────────────────────────────────────────────────
export const MODEL_PUSH_INSCRICAO: ModelNovo = {
  name: 'portal-suporte-PushInscricao',
  alias: 'PushInscricao',
  schema: {
    type: 'object',
    properties: {
      id: txt, user_id: txt, endpoint: txt, p256dh: txt, auth: txt, ua: txt,
      criada_em: txt, created_at: txt,
    },
  },
}

export const MODEL_PUSH_PREFERENCIA: ModelNovo = {
  name: 'portal-suporte-PushPreferencia',
  alias: 'PushPreferencia',
  schema: {
    type: 'object',
    properties: {
      id: txt, user_id: txt, fila: bool, minha_conversa: bool,
      chamado_atribuido: bool, updated_at: txt, created_at: txt,
    },
  },
}

export const MODEL_PUSH_FILA: ModelNovo = {
  name: 'portal-suporte-PushNaFila',
  alias: 'PushNaFila',
  schema: {
    type: 'object',
    properties: {
      id: txt, user_id: txt, titulo: txt, corpo: txt, url: txt, tipo: txt,
      status: txt, created_at: txt,
    },
  },
}

export const SEGREDO_VAPID_PUBLICA = 'push_vapid_public'
export const SEGREDO_VAPID_PRIVADA = 'push_vapid_private'

// ── Fase 5: arquivos de apoio ──────────────────────────────────────────────
export const MODEL_ARQUIVO: ModelNovo = {
  name: 'portal-suporte-Arquivo',
  alias: 'Arquivo',
  schema: {
    type: 'object',
    properties: {
      id: txt, nome: txt, pasta: txt, tipo: txt, tamanho: num,
      dono_id: txt, acl_nivel: txt, acl_grant: txt, criado_em: txt,
      ativo: txt, conteudo_removido: bool,
      apagado_em: txt, apagado_por: txt, created_at: txt,
    },
  },
}

export const MODEL_ARQUIVO_CONTEUDO: ModelNovo = {
  name: 'portal-suporte-ArquivoConteudo',
  alias: 'ArquivoConteudo',
  schema: {
    type: 'object',
    properties: { id: txt, arquivo_id: txt, conteudo: txt, created_at: txt },
  },
}

export const MODEL_ARQUIVO_EVENTO: ModelNovo = {
  name: 'portal-suporte-ArquivoEvento',
  alias: 'ArquivoEvento',
  schema: {
    type: 'object',
    properties: {
      id: txt, arquivo_id: txt, acao: txt, por: txt, nome: txt,
      quando: txt, created_at: txt,
    },
  },
}

/** Os passos, na MESMA ordem dos scripts. */
export const PASSOS: {
  chave: string
  rotulo: string
  fase: string
  model?: ModelNovo
  campo?: { model: string; nome: string }
  segredos?: string[]
}[] = [
  { chave: 'conta', rotulo: 'Contas de WhatsApp', fase: 'Fase 3', model: MODEL_CONTA },
  {
    chave: 'conta_id', rotulo: 'Campo da conta na conversa', fase: 'Fase 3',
    campo: { model: MODEL_CONVERSA, nome: CAMPO_CONTA_NA_CONVERSA },
  },
  { chave: 'push_inscricao', rotulo: 'Inscrições de aviso', fase: 'Fase 4', model: MODEL_PUSH_INSCRICAO },
  { chave: 'push_preferencia', rotulo: 'Preferências de aviso', fase: 'Fase 4', model: MODEL_PUSH_PREFERENCIA },
  { chave: 'push_fila', rotulo: 'Fila de avisos', fase: 'Fase 4', model: MODEL_PUSH_FILA },
  { chave: 'vapid', rotulo: 'Chaves de assinatura dos avisos', fase: 'Fase 4', segredos: [SEGREDO_VAPID_PUBLICA, SEGREDO_VAPID_PRIVADA] },
  { chave: 'arquivo', rotulo: 'Arquivos de apoio', fase: 'Fase 5', model: MODEL_ARQUIVO },
  { chave: 'arquivo_conteudo', rotulo: 'Conteúdo dos arquivos', fase: 'Fase 5', model: MODEL_ARQUIVO_CONTEUDO },
  { chave: 'arquivo_evento', rotulo: 'Auditoria de arquivos', fase: 'Fase 5', model: MODEL_ARQUIVO_EVENTO },
]

// ── A conversa com a plataforma, sempre por JWT ────────────────────────────

async function comJwt<T>(caminho: string, init?: RequestInit): Promise<T> {
  const jwt = getJwt()
  // Mesma mensagem do card do token: é a que a equipe já conhece.
  if (!jwt) throw new Error('Sessão necessária')
  const headers = new Headers(init?.headers)
  headers.set('Authorization', `Bearer ${jwt}`)
  if (init?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const res = await fetch(`${ARARA_URL}/v1/apps/${ARARA_SLUG}${caminho}`, { ...init, headers })
  const corpo = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((corpo as { error?: string }).error || `HTTP ${res.status}`)
  return corpo as T
}

export interface EstadoDoPasso {
  chave: string
  rotulo: string
  fase: string
  existe: boolean
}

/** Lê o que já existe. NÃO grava nada — é a simulação dos scripts. */
export async function lerEstado(): Promise<EstadoDoPasso[]> {
  const [models, secrets] = await Promise.all([
    comJwt<{ models?: { name: string; schema?: { properties?: Record<string, unknown> } }[] }>('/models'),
    comJwt<{ secrets?: { name: string }[] }>('/secrets'),
  ])
  const porNome = new Map((models.models ?? []).map((m) => [m.name, m]))
  const nomesDeSegredo = new Set((secrets.secrets ?? []).map((s) => s.name))

  return PASSOS.map((p) => {
    let existe = false
    if (p.model) existe = porNome.has(p.model.name)
    if (p.campo) {
      const alvo = porNome.get(p.campo.model)
      existe = !!alvo?.schema?.properties && p.campo.nome in alvo.schema.properties
    }
    if (p.segredos) existe = p.segredos.every((s) => nomesDeSegredo.has(s))
    return { chave: p.chave, rotulo: p.rotulo, fase: p.fase, existe }
  })
}

/**
 * Par VAPID gerado NO NAVEGADOR.
 *
 * Formato que o `web-push` exige (e que o `push-vapid.py` produz com openssl):
 * a pública é o ponto não comprimido — `0x04 || x || y`, 65 bytes — em
 * base64url, e a privada são os 32 bytes do escalar, que é exatamente o campo
 * `d` do JWK. Nada de PKCS8 aqui: `setVapidDetails` recusaria.
 */
export async function gerarVapid(): Promise<{ publica: string; privada: string }> {
  const par = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  )
  const jwk = await crypto.subtle.exportKey('jwk', par.privateKey)
  if (!jwk.x || !jwk.y || !jwk.d) throw new Error('O navegador não devolveu a chave no formato esperado')
  const x = base64urlParaBytes(jwk.x)
  const y = base64urlParaBytes(jwk.y)
  const publica = new Uint8Array(65)
  publica[0] = 4
  publica.set(x, 1)
  publica.set(y, 33)
  return { publica: bytesParaBase64url(publica), privada: jwk.d }
}

function base64urlParaBytes(s: string): Uint8Array {
  const base64 = (s + '='.repeat((4 - (s.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const cru = atob(base64)
  const out = new Uint8Array(cru.length)
  for (let i = 0; i < cru.length; i++) out[i] = cru.charCodeAt(i)
  return out
}

function bytesParaBase64url(b: Uint8Array): string {
  let s = ''
  for (const byte of b) s += String.fromCharCode(byte)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Cria um model. */
export async function criarModel(m: ModelNovo): Promise<void> {
  await comJwt('/models', { method: 'POST', body: JSON.stringify(m) })
}

/**
 * Acrescenta uma propriedade ao schema de um model existente, PRESERVANDO as
 * que já estão lá — mandar só a nova apagaria o resto.
 */
export async function acrescentarCampo(modelName: string, campo: string): Promise<void> {
  const { models } = await comJwt<{ models?: { name: string; schema?: { properties?: Record<string, unknown> } }[] }>('/models')
  const alvo = (models ?? []).find((m) => m.name === modelName)
  if (!alvo) throw new Error(`O model ${modelName} não existe`)
  const props = { ...(alvo.schema?.properties ?? {}) }
  if (campo in props) return   // idempotente
  props[campo] = { type: 'string' }
  await comJwt(`/models/${encodeURIComponent(modelName)}`, {
    method: 'PATCH',
    body: JSON.stringify({ schema: { type: 'object', properties: props } }),
  })
}

/** Grava os dois segredos VAPID. `serverOnly` para o valor nunca voltar. */
export async function gravarVapid(par: { publica: string; privada: string }): Promise<void> {
  await comJwt('/secrets', {
    method: 'POST',
    body: JSON.stringify({ name: SEGREDO_VAPID_PUBLICA, value: par.publica, serverOnly: true }),
  })
  await comJwt('/secrets', {
    method: 'POST',
    body: JSON.stringify({ name: SEGREDO_VAPID_PRIVADA, value: par.privada, serverOnly: true }),
  })
}
