import { isIP } from 'node:net'
import { request as undiciRequest } from 'undici'

const MAX_BODY_BYTES = 2 * 1024 * 1024
/** Binary responses (responseType 'base64'): WhatsApp media ceiling. */
const MAX_BINARY_BODY_BYTES = 16 * 1024 * 1024

export type SandboxFetchInit = {
  method?: string
  headers?: Record<string, string>
  body?: string
  /**
   * 'text' (default) decodes the body as UTF-8 and truncates at 2 MB.
   * 'base64' returns the raw bytes base64-encoded (up to 16 MB; larger bodies
   * come back as an empty string with `truncated: true`) — for media downloads,
   * which UTF-8 decoding would corrupt.
   */
  responseType?: 'text' | 'base64'
}

export type SandboxFetchResult = {
  status: number
  headers: Record<string, string>
  body: string
  /** Set when the body exceeded the ceiling for its responseType. */
  truncated?: boolean
}

export type SandboxFetchOpts = {
  appSlug?: string
}

function parseAllowlist(): Set<string> {
  const raw = process.env.SANDBOX_FETCH_ALLOWLIST ?? ''
  return new Set(
    raw
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
  )
}

/**
 * SANDBOX_FETCH_ALLOWLIST_BY_APP=portal-suporte:www.avisaapi.com.br,portal-suporte:openrouter.ai
 * Entries are slug:hostname (exact hostname, lowercased).
 */
function parseAllowlistByApp(): Map<string, Set<string>> {
  const raw = process.env.SANDBOX_FETCH_ALLOWLIST_BY_APP ?? ''
  const map = new Map<string, Set<string>>()
  for (const entry of raw.split(',')) {
    const trimmed = entry.trim()
    if (!trimmed) continue
    const colon = trimmed.indexOf(':')
    if (colon <= 0) continue
    const slug = trimmed.slice(0, colon).trim().toLowerCase()
    const host = trimmed.slice(colon + 1).trim().toLowerCase()
    if (!slug || !host) continue
    let set = map.get(slug)
    if (!set) {
      set = new Set()
      map.set(slug, set)
    }
    set.add(host)
  }
  return map
}

function isPrivateOrLocalIp(ip: string): boolean {
  const v = ip.toLowerCase()
  if (v === '::1' || v === '0:0:0:0:0:0:0:1') return true
  if (v.startsWith('fe80:') || v.startsWith('fc') || v.startsWith('fd')) return true
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(v)
  if (!m) return false
  const a = Number(m[1])
  const b = Number(m[2])
  if (a === 10 || a === 127 || a === 0) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
  return false
}

function hostAllowed(host: string, appSlug?: string): boolean {
  const global = parseAllowlist()
  if (global.has(host)) return true
  if (appSlug) {
    const byApp = parseAllowlistByApp().get(appSlug.toLowerCase())
    if (byApp?.has(host)) return true
  }
  return false
}

/**
 * Host-side fetch for sandbox controllers.
 * Allowlist: SANDBOX_FETCH_ALLOWLIST (global) + SANDBOX_FETCH_ALLOWLIST_BY_APP (slug:host).
 * Empty global and no per-app entry for host = deny.
 */
export async function sandboxFetch(
  urlStr: string,
  init: SandboxFetchInit = {},
  opts: SandboxFetchOpts = {},
): Promise<SandboxFetchResult> {
  let url: URL
  try {
    url = new URL(urlStr)
  } catch {
    throw new Error('fetch: invalid URL')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('fetch: only http/https allowed')
  }

  const host = url.hostname.toLowerCase()
  if (isIP(host) && isPrivateOrLocalIp(host)) {
    throw new Error('fetch: private/link-local IPs are blocked')
  }

  const global = parseAllowlist()
  const byApp = opts.appSlug
    ? parseAllowlistByApp().get(opts.appSlug.toLowerCase())
    : undefined
  if (global.size === 0 && (!byApp || byApp.size === 0)) {
    throw new Error('fetch: SANDBOX_FETCH_ALLOWLIST is empty (all hosts denied)')
  }
  if (!hostAllowed(host, opts.appSlug)) {
    throw new Error(`fetch: host not allowlisted: ${host}`)
  }

  const timeoutMs = Number(process.env.SANDBOX_FETCH_TIMEOUT_MS ?? 8000)
  const method = (init.method ?? 'GET').toUpperCase()
  const headers: Record<string, string> = { ...(init.headers ?? {}) }

  const res = await undiciRequest(url, {
    method,
    headers,
    body: init.body,
    headersTimeout: timeoutMs,
    bodyTimeout: timeoutMs,
  })

  const buf = Buffer.from(await res.body.arrayBuffer())
  let body: string
  let truncated = false
  if (init.responseType === 'base64') {
    truncated = buf.length > MAX_BINARY_BODY_BYTES
    body = truncated ? '' : buf.toString('base64')
  } else {
    truncated = buf.length > MAX_BODY_BYTES
    body = truncated
      ? buf.subarray(0, MAX_BODY_BYTES).toString('utf8')
      : buf.toString('utf8')
  }

  const outHeaders: Record<string, string> = {}
  for (const [k, v] of Object.entries(res.headers)) {
    if (v == null) continue
    outHeaders[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : String(v)
  }

  return truncated
    ? { status: res.statusCode, headers: outHeaders, body, truncated }
    : { status: res.statusCode, headers: outHeaders, body }
}
