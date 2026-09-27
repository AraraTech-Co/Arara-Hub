import type { FastifyRequest } from 'fastify'

/** Max bytes per file part exposed to sandbox controllers (portal attachments ceiling). */
export const RUNTIME_MULTIPART_MAX_FILE_BYTES = 5 * 1024 * 1024

export type SandboxFilePart = {
  field: string
  filename: string
  contentType: string
  size: number
  /** Base64 payload; omitted when truncated over RUNTIME_MULTIPART_MAX_FILE_BYTES. */
  data?: string
}

export type ParsedMultipart = {
  body: Record<string, unknown>
  files: SandboxFilePart[]
  filesTruncated: boolean
}

export function isMultipartRequest(request: FastifyRequest): boolean {
  const ct = String(request.headers['content-type'] ?? '').toLowerCase()
  return ct.includes('multipart/form-data')
}

/**
 * Consume multipart parts into text fields + file metadata for sandbox ctx.
 * Does not reconstruct wire bytes (rawBody stays null for multipart).
 */
export async function parseRuntimeMultipart(request: FastifyRequest): Promise<ParsedMultipart> {
  const body: Record<string, unknown> = {}
  const files: SandboxFilePart[] = []
  let filesTruncated = false

  for await (const part of request.parts()) {
    if (part.type === 'file') {
      const chunks: Buffer[] = []
      let size = 0
      let overLimit = false
      for await (const chunk of part.file) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        size += buf.length
        if (!overLimit) {
          if (size > RUNTIME_MULTIPART_MAX_FILE_BYTES) {
            overLimit = true
            filesTruncated = true
            chunks.length = 0
          } else {
            chunks.push(buf)
          }
        }
      }
      const entry: SandboxFilePart = {
        field: part.fieldname,
        filename: part.filename || 'upload',
        contentType: part.mimetype || 'application/octet-stream',
        size,
      }
      if (!overLimit) {
        entry.data = Buffer.concat(chunks).toString('base64')
      }
      files.push(entry)
    } else {
      // field
      const value = part.value
      const existing = body[part.fieldname]
      if (existing === undefined) {
        body[part.fieldname] = value
      } else if (Array.isArray(existing)) {
        existing.push(value)
      } else {
        body[part.fieldname] = [existing, value]
      }
    }
  }

  return { body, files, filesTruncated }
}
