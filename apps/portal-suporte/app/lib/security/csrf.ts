/**
 * CSRF + Security Headers — Edge Runtime compatible
 *
 * enforceCsrf: verifica Origin em requisições mutantes (POST/PUT/PATCH/DELETE).
 *   Retorna NextResponse 403 se o origin não for permitido, null se OK.
 *
 * applySecurityHeaders: adiciona headers HTTP de segurança (helmet-like) à resposta.
 */

import { NextRequest, NextResponse } from 'next/server'

// Métodos que alteram estado — devem ter o origin verificado
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

// Origins permitidos (lidos em build-time; Edge não acessa process.env dinamicamente
// para vars não-prefixadas com NEXT_PUBLIC_, então listamos os conhecidos + env)
function getAllowedOrigins(): string[] {
  const origins: string[] = [
    'http://localhost:3000',
    'http://localhost:3001',
    'https://suporte.arara-tech.com',
  ]
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  if (siteUrl && !origins.includes(siteUrl)) {
    origins.push(siteUrl)
  }
  return origins
}

export function enforceCsrf(request: NextRequest): NextResponse | null {
  // Só verifica requisições mutantes
  if (!MUTATING_METHODS.has(request.method)) return null

  const origin = request.headers.get('origin')

  // Sem header Origin → requisição same-origin (browser não envia Origin em same-origin)
  // ou requisição server-side interna → permitir
  if (!origin) return null

  const allowed = getAllowedOrigins()
  const isAllowed = allowed.some(o => origin === o || origin.startsWith(o))

  if (!isAllowed) {
    return NextResponse.json(
      { error: 'Origem não autorizada' },
      { status: 403 }
    )
  }

  return null
}

// Content-Security-Policy — política inicial conservadora.
// 'unsafe-inline' em script-src é necessário: o App Router do Next.js injeta o payload de
// hydration via <script>self.__next_f.push(...)</script> inline (sem nonce configurado) e o
// next-themes injeta um script inline anti-flash-of-wrong-theme — sem isso a página renderiza
// em branco (hydration nunca completa). 'unsafe-eval' é necessário em dev (Fast Refresh).
// 'unsafe-inline' em style-src é necessário (styled-jsx injeta <style> inline).
// Migrar para nonce por request (via middleware) é a evolução natural disso, não feita agora.
const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.sentry.io",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

export function applySecurityHeaders(response: NextResponse, requestId?: string): NextResponse {
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-XSS-Protection', '1; mode=block')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  response.headers.set('Content-Security-Policy', CSP_DIRECTIVES)
  response.headers.set(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains'
  )
  // Correlação de requisição — visível em toda resposta (sucesso ou erro), para
  // rastreabilidade em logs/Sentry/suporte. Ver app/server/controllers/base.controller.ts
  // para como o backend reaproveita esse mesmo ID nos logs estruturados.
  if (requestId) response.headers.set('X-Request-Id', requestId)
  return response
}
