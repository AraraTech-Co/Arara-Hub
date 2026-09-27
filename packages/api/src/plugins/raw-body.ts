import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import { Readable } from 'node:stream'
import fp from 'fastify-plugin'

declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: string
  }
}

/** Must cover ~100MB file as base64 JSON (~133MB) + margin. */
export const BODY_LIMIT_BYTES = Number(process.env.BODY_LIMIT_BYTES || 150 * 1024 * 1024)

function isMultipart(request: FastifyRequest): boolean {
  const ct = String(request.headers['content-type'] ?? '').toLowerCase()
  return ct.includes('multipart/form-data')
}

/**
 * Buffer JSON / urlencoded bodies for webhook controllers (rawBody) and re-emit
 * the *full* stream to Fastify parsers.
 * Never touch multipart — hosting zip uploads must stream intact to @fastify/multipart.
 * Do NOT truncate: a truncated body breaks JSON.parse for attachment uploads.
 */
const rawBodyPluginImpl: FastifyPluginAsync = async (app) => {
  app.addHook('preParsing', async (request: FastifyRequest, _reply, payload) => {
    if (isMultipart(request)) {
      return payload
    }

    const chunks: Buffer[] = []
    let stored = 0
    for await (const chunk of payload) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      if (stored + buf.length > BODY_LIMIT_BYTES) {
        // Drain remainder so the socket does not hang, then reject.
        for await (const _ of payload) {
          /* drain */
        }
        const err = new Error(
          `Request body too large (max ${Math.floor(BODY_LIMIT_BYTES / (1024 * 1024))}MB)`,
        ) as Error & { statusCode: number }
        err.statusCode = 413
        throw err
      }
      chunks.push(buf)
      stored += buf.length
    }
    const full = Buffer.concat(chunks, stored)
    request.rawBody = full.toString('utf8')
    return Readable.from(full)
  })
}

export const rawBodyPlugin = fp(rawBodyPluginImpl, { name: 'raw-body' })

export function requestHeadersForSandbox(request: FastifyRequest): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(request.headers)) {
    const k = key.toLowerCase()
    if (k === 'cookie' || k === 'set-cookie') continue
    if (value == null) continue
    out[k] = Array.isArray(value) ? value.join(', ') : String(value)
  }
  return out
}
