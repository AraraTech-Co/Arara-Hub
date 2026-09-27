/**
 * Rate limiter simples em memória (janela fixa) — protege login contra brute-force.
 * Suficiente para o deploy de container único do CRM. Em cenário multi-instância,
 * migrar para o Redis compartilhado do VPS (REDIS_HOST).
 */

type Bucket = { count: number; resetAt: number }
const buckets = new Map<string, Bucket>()

// Limpeza periódica para não vazar memória (só em runtime Node, não no build).
if (typeof setInterval !== "undefined") {
  const timer = setInterval(() => {
    const now = Date.now()
    for (const [key, b] of buckets) if (b.resetAt <= now) buckets.delete(key)
  }, 60_000)
  // não segura o processo vivo
  if (typeof timer === "object" && "unref" in timer) (timer as { unref: () => void }).unref()
}

export type RateLimitResult = { allowed: boolean; remaining: number; retryAfterSec: number }

/**
 * @param key    identificador (ex.: "login:email@x.com")
 * @param limit  tentativas permitidas na janela
 * @param windowMs duração da janela em ms
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now()
  const b = buckets.get(key)
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, remaining: limit - 1, retryAfterSec: 0 }
  }
  if (b.count >= limit) {
    return { allowed: false, remaining: 0, retryAfterSec: Math.ceil((b.resetAt - now) / 1000) }
  }
  b.count++
  return { allowed: true, remaining: limit - b.count, retryAfterSec: 0 }
}

/** Zera o contador (ex.: após login bem-sucedido). */
export function rateLimitReset(key: string) {
  buckets.delete(key)
}
