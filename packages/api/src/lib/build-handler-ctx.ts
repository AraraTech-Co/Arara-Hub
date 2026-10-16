import { randomBytes as nodeRandomBytes, randomUUID as nodeRandomUUID } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import { decryptSecret } from './app-secrets.js'
import { hashPassword } from './crypto.js'
import type { ModelApi } from './models.js'
import { createNotification, serializeNotification } from './notifications.js'
import { sandboxFetch, type SandboxFetchInit } from './sandbox-fetch.js'
import type { HandlerApp, HandlerCtx, HandlerFilePart } from './handler-ctx.js'

/** Upper bound so a buggy controller cannot request unbounded CSPRNG output. */
const RANDOM_BYTES_MAX = 1024

function randomBytesHex(n: number): string {
  const size = Number(n)
  if (!Number.isInteger(size) || size < 1 || size > RANDOM_BYTES_MAX) {
    throw new Error(`randomBytes: n must be an integer from 1 to ${RANDOM_BYTES_MAX}`)
  }
  return nodeRandomBytes(size).toString('hex')
}

/**
 * Memo de IDENTIDADE, com vida de UMA requisição (16/10/2026).
 *
 * As guardas empilhadas dentro dos handlers leem o perfil de quem chamou mais
 * de uma vez: 23 rotas o leem 3×, 108 o leem 2×. São ~500 handlers escritos à
 * mão, em string — consertar um por um não é caminho. Aqui é um lugar só.
 *
 * POR QUE AQUI E NÃO NO `buildModelsApi`: hoje os dois têm vida de uma
 * requisição, então daria no mesmo. Mas há entrega planejada para GUARDAR o
 * `buildModelsApi` entre requisições; se o memo morasse lá, naquele dia a
 * identidade passaria a ser cacheada entre requisições em silêncio, e mudança
 * de nível de acesso deixaria de valer na hora. Seria regressão de autorização
 * causada por um PR de desempenho. No `ctx` o memo morre com a requisição,
 * faça aquela entrega o que fizer.
 *
 * SÓ `Profile`, e só `findById`. Nada de dado de negócio: cachear uma conversa
 * ou um chamado por requisição é outra discussão, com outros riscos.
 *
 * ── As duas invariantes de invalidação ────────────────────────────────────
 *
 * 1. A LIMPEZA CERCA A ESCRITA PELOS DOIS LADOS: antes de chamar e, num
 *    `finally`, depois de ela terminar. O `await` dentro do `try` é parte da
 *    garantia — sem ele o `finally` correria antes de a escrita concluir, e uma
 *    leitura concorrente (um `Promise.all` de leitura com escrita) poderia
 *    deixar no memo o valor de antes da escrita pelo resto da requisição.
 *
 * 2. O EMBRULHO VALE POR OBJETO, NÃO POR NOME: substitui toda chave que aponta
 *    para o MESMO objeto de modelo. `buildModelsApi` registra o mesmo objeto
 *    sob até três nomes (`apis[fullName]`, `apis[short]`, `apis[modelName]`, no
 *    fim de `lib/models.ts`). Trocar um nome só deixaria os outros com o objeto
 *    cru: sem memo, o que é inofensivo, e sem a invalidação, o que não é —
 *    escrever por um nome e ler o perfil por outro. Hoje todo chamador usa o
 *    nome curto (medido: o nome completo aparece 0 vezes nos seis apps), então
 *    isto fecha a categoria antes de ela ter caso.
 *
 * A lista abaixo é a superfície de escrita INTEIRA do `ModelApi`.
 * `identidade-uma-vez.test.mjs` reprova se o tipo ganhar um método de escrita
 * que não esteja nela — é o único jeito de o dia do `upsert` não passar calado.
 */
export const ESCRITAS_DO_MODELO = ['create', 'update', 'delete'] as const

function comMemoDeIdentidade(
  models: Record<string, ModelApi>,
): Record<string, ModelApi> {
  const Profile = models.Profile
  if (!Profile || typeof Profile.findById !== 'function') return models

  const memo = new Map<string, unknown>()
  const original = Profile.findById.bind(Profile)
  const envolvido: ModelApi = {
    ...Profile,
    findById: async (id: string) => {
      const chave = String(id)
      if (memo.has(chave)) return memo.get(chave)
      const valor = await original(chave)
      memo.set(chave, valor)
      return valor
    },
  }
  for (const escrita of ESCRITAS_DO_MODELO) {
    const antes = Profile[escrita]
    if (typeof antes !== 'function') continue
    const chamar = antes.bind(Profile) as (...args: unknown[]) => Promise<unknown>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(envolvido as any)[escrita] = async (...args: unknown[]) => {
      memo.clear()
      try {
        return await chamar(...args)
      } finally {
        memo.clear()
      }
    }
  }

  const saida: Record<string, ModelApi> = { ...models }
  for (const nome of Object.keys(models)) {
    if (models[nome] === Profile) saida[nome] = envolvido
  }
  return saida
}

export async function buildHandlerCtx(input: {
  method: string
  params: Record<string, string>
  query: Record<string, unknown>
  body: unknown
  rawBody: string | null
  files?: HandlerFilePart[] | null
  filesTruncated?: boolean
  headers: Record<string, string>
  user: unknown
  app: HandlerApp
  models: Record<string, ModelApi>
  prisma: PrismaClient
}): Promise<HandlerCtx> {
  let status = 200
  let sent: unknown
  const reply = {
    send(value: unknown) {
      sent = value
      return { status, body: value }
    },
    status(code: number) {
      status = code
      return this
    },
  }

  const secrets = {
    async get(name: string) {
      if (typeof name !== 'string' || !name.trim()) {
        throw new Error('secrets.get: name required')
      }
      const row = await input.prisma.appSecret.findUnique({
        where: { appId_name: { appId: input.app.id, name: name.trim() } },
      })
      if (!row) return null
      try {
        return decryptSecret({
          ciphertext: row.ciphertext,
          iv: row.iv,
          authTag: row.authTag,
        })
      } catch {
        throw new Error('secrets.get: decrypt failed')
      }
    },
  }

  const users = {
    async findByEmail(email: string) {
      if (typeof email !== 'string' || !email.trim()) return null
      return input.prisma.user.findUnique({
        where: { email: email.trim().toLowerCase() },
        select: { id: true, email: true, name: true, status: true },
      })
    },
    async setPassword(userId: string, password: string) {
      if (typeof userId !== 'string' || !userId.trim()) {
        throw new Error('users.setPassword: userId required')
      }
      if (typeof password !== 'string' || password.length < 8) {
        throw new Error('users.setPassword: password must have at least 8 characters')
      }
      const user = await input.prisma.user.findUnique({ where: { id: userId.trim() } })
      if (!user) throw new Error('users.setPassword: user not found')
      await input.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await hashPassword(password) },
      })
      return { success: true as const }
    },
  }

  const fetchFn = async (url: string, init?: Record<string, unknown>) =>
    sandboxFetch(url, (init ?? {}) as SandboxFetchInit, { appSlug: input.app.slug })

  const notify = async (payload: {
    userId?: string
    title?: string
    body?: string
    severity?: string
    href?: string | null
    sourceApp?: string | null
  }) => {
    const actorId =
      input.user && typeof input.user === 'object' && input.user !== null && 'id' in input.user
        ? String((input.user as { id?: unknown }).id || '')
        : ''
    const row = await createNotification(input.prisma, {
      userId: String(payload?.userId || ''),
      title: String(payload?.title || ''),
      body: String(payload?.body || ''),
      severity: payload?.severity,
      href: payload?.href,
      sourceApp: payload?.sourceApp ?? input.app.slug,
      createdBy: actorId || null,
    })
    return serializeNotification(row)
  }

  return {
    method: input.method,
    params: input.params,
    query: input.query,
    body: input.body,
    rawBody: input.rawBody,
    files: input.files ?? null,
    filesTruncated: input.filesTruncated ?? false,
    headers: input.headers,
    user: input.user,
    app: input.app,
    models: comMemoDeIdentidade(input.models),
    secrets,
    users,
    fetch: fetchFn,
    notify,
    randomBytes: randomBytesHex,
    randomUUID: () => nodeRandomUUID(),
    reply,
  }
}

export function unwrapHandlerResult(
  result: unknown,
  replySent: { status: number; body: unknown } | null,
): { status: number; body: unknown } {
  if (replySent) return replySent
  if (result && typeof result === 'object' && 'body' in (result as object)) {
    const r = result as { status?: number; body: unknown }
    return { status: r.status || 200, body: r.body }
  }
  return { status: 200, body: result == null ? null : result }
}
