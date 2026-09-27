import { NextRequest, NextResponse } from 'next/server'
import { enforceCsrf, applySecurityHeaders } from '@/lib/security/csrf'
import { buildRateLimitHeaders } from '@/lib/security/rate-limit-headers'
import {
  canAccessPath,
  getEffectiveMinLevel,
  isPublicPath,
  requiresAuthentication,
} from '@/lib/auth/access-control'
import type { AccessLevel } from '@/lib/auth/types'

// Roda no Edge runtime — ioredis (TCP) não funciona aqui, por isso este limiter é
// em memória (por instância). Aceitável para o deploy atual (container único); se o
// app escalar horizontalmente, migrar para um client Redis Edge-compatible (REST).
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

// Regra global — aplicada a TODA requisição (inclusive GET), evita abuso/DoS geral da API.
const GLOBAL_LIMIT    = 100
const GLOBAL_WINDOW_MS = 60_000

const RATE_LIMIT_RULES: Array<{ pattern: RegExp; limit: number; windowMs: number }> = [
  { pattern: /^\/api\/auth/,              limit: 20,  windowMs: 60_000 },
  { pattern: /^\/api\/tickets$/,          limit: 60,  windowMs: 60_000 },
  { pattern: /^\/api\/admin\/impersonate/, limit: 10, windowMs: 60_000 },
  { pattern: /^\/api\/webhooks\/whatsapp/, limit: 120, windowMs: 60_000 },
  { pattern: /^\/api\/webhooks\/avisa/,    limit: 300, windowMs: 60_000 },
]

// Acima desse tamanho, varre e descarta entradas expiradas na próxima chamada —
// evita crescimento ilimitado do Map já que a regra global agora conta toda requisição.
const SWEEP_THRESHOLD = 10_000

function sweepExpired(now: number) {
  if (rateLimitMap.size < SWEEP_THRESHOLD) return
  for (const [key, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(key)
  }
}

function getRateLimitClientKey(req: NextRequest, route: string): string {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  return `rl:${ip}:${route}`
}

interface RateLimitCheck {
  allowed: boolean
  remaining: number
  resetAt: number
}

function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitCheck {
  const now = Date.now()
  sweepExpired(now)
  const entry = rateLimitMap.get(key)

  if (!entry || now > entry.resetAt) {
    const resetAt = now + windowMs
    rateLimitMap.set(key, { count: 1, resetAt })
    return { allowed: true, remaining: limit - 1, resetAt }
  }

  if (entry.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt }
  }

  entry.count++
  return { allowed: true, remaining: limit - entry.count, resetAt: entry.resetAt }
}

function tooManyRequests(limit: number, remaining: number, resetAt: number): NextResponse {
  return applySecurityHeaders(
    NextResponse.json(
      { error: 'Muitas requisições. Tente novamente em instantes.' },
      { status: 429, headers: buildRateLimitHeaders({ limit, remaining, resetAt }) }
    )
  )
}

function getAccessLevel(req: NextRequest): AccessLevel | null {
  return (
    req.cookies.get('portal_access_level')?.value ??
    req.cookies.get('portal_role')?.value ?? // legacy cookie during migration
    null
  ) as AccessLevel | null
}

function isApiRequest(pathname: string): boolean {
  return pathname.startsWith('/api/')
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Request ID — gerado uma vez por requisição, repassado ao Node runtime via header
  // (Edge não compartilha AsyncLocalStorage com as rotas) e devolvido em toda resposta.
  const requestId = crypto.randomUUID()
  const forwardedHeaders = new Headers(request.headers)
  forwardedHeaders.set('x-request-id', requestId)
  const withRequestHeaders = { request: { headers: forwardedHeaders } }
  const withHeaders = (res: NextResponse) => applySecurityHeaders(res, requestId)

  // Regra global — 100 req/min por IP, cumulativa com as regras específicas abaixo
  // (ambas precisam passar; esta roda sempre, inclusive em GET).
  const globalCheck = checkRateLimit(getRateLimitClientKey(request, '__global__'), GLOBAL_LIMIT, GLOBAL_WINDOW_MS)
  if (!globalCheck.allowed) {
    return withHeaders(tooManyRequests(GLOBAL_LIMIT, globalCheck.remaining, globalCheck.resetAt))
  }

  if (request.method !== 'GET') {
    for (const rule of RATE_LIMIT_RULES) {
      if (rule.pattern.test(pathname)) {
        const key = getRateLimitClientKey(request, pathname)
        const result = checkRateLimit(key, rule.limit, rule.windowMs)
        if (!result.allowed) {
          return withHeaders(tooManyRequests(rule.limit, result.remaining, result.resetAt))
        }
        break
      }
    }
  }

  const csrfBlock = enforceCsrf(request)
  if (csrfBlock) return withHeaders(csrfBlock)

  if (!requiresAuthentication(pathname) && isPublicPath(pathname)) {
    return withHeaders(NextResponse.next(withRequestHeaders))
  }

  const hasSession = !!request.cookies.get('portal_session')?.value
  const apiKey = request.headers.get('x-api-key')
  const accessLevel = getAccessLevel(request)

  if (requiresAuthentication(pathname) || getEffectiveMinLevel(pathname)) {
    if (!hasSession && !apiKey) {
      if (isApiRequest(pathname)) {
        return withHeaders(
          NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
        )
      }
      const url = request.nextUrl.clone()
      url.pathname = '/auth/login'
      url.searchParams.set('next', pathname)
      return withHeaders(NextResponse.redirect(url))
    }

    if (hasSession && accessLevel) {
      if (!canAccessPath(accessLevel, pathname)) {
        if (isApiRequest(pathname)) {
          return withHeaders(
            NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
          )
        }
        const url = request.nextUrl.clone()
        url.pathname = accessLevel === 'user' ? '/dashboard' : '/admin'
        return withHeaders(NextResponse.redirect(url))
      }
    }

    if (apiKey && !hasSession && isApiRequest(pathname)) {
      // Full API key validation happens in auth.verifyRequest() on the server
      return withHeaders(NextResponse.next(withRequestHeaders))
    }
  }

  return withHeaders(NextResponse.next(withRequestHeaders))
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
