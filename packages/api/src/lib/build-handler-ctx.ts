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
    models: input.models,
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
