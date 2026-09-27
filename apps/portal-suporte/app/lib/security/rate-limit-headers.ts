/**
 * Headers padrão de rate limit — usados em toda resposta 429 do projeto
 * (middleware.ts, app/lib/auth/guards.ts, app/server/controllers/auth.controller.ts).
 */

export interface RateLimitHeaderInput {
  limit: number
  remaining: number
  /** epoch ms de quando a janela reseta */
  resetAt: number
}

export function buildRateLimitHeaders({ limit, remaining, resetAt }: RateLimitHeaderInput): Record<string, string> {
  const retryAfterSeconds = Math.max(0, Math.ceil((resetAt - Date.now()) / 1000))
  return {
    'Retry-After': String(retryAfterSeconds),
    'X-RateLimit-Limit': String(limit),
    'X-RateLimit-Remaining': String(Math.max(0, remaining)),
    'X-RateLimit-Reset': String(Math.ceil(resetAt / 1000)),
  }
}
