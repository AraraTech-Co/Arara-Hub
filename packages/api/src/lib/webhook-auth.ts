import { timingSafeEqual } from 'node:crypto'
import { decryptSecret } from './app-secrets.js'
import type { PrismaClient } from '@prisma/client'

function safeEqualString(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

/** Pull webhook token from query or parsed body (Avisa: ?token= or form field token). */
export function extractWebhookToken(
  query: Record<string, unknown>,
  body: unknown,
): string | null {
  const fromQuery = query.token
  if (typeof fromQuery === 'string' && fromQuery.length > 0) return fromQuery
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const t = (body as Record<string, unknown>).token
    if (typeof t === 'string' && t.length > 0) return t
  }
  return null
}

/**
 * Validate inbound webhook token against AppSecret plaintext.
 * Returns true if ok; never logs the secret value.
 */
export async function verifyWebhookSecret(opts: {
  prisma: PrismaClient
  appId: string
  secretName: string
  providedToken: string | null
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!opts.providedToken) {
    return { ok: false, reason: 'Missing webhook token (query or body `token`)' }
  }
  const row = await opts.prisma.appSecret.findUnique({
    where: { appId_name: { appId: opts.appId, name: opts.secretName } },
  })
  if (!row) {
    return { ok: false, reason: `Webhook secret AppSecret "${opts.secretName}" not configured` }
  }
  let expected: string
  try {
    expected = decryptSecret({
      ciphertext: row.ciphertext,
      iv: row.iv,
      authTag: row.authTag,
    })
  } catch {
    return { ok: false, reason: 'Webhook secret decrypt failed' }
  }
  if (!safeEqualString(opts.providedToken, expected)) {
    return { ok: false, reason: 'Invalid webhook token' }
  }
  return { ok: true }
}
