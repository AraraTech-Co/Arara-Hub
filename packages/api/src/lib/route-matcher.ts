import { match, type MatchFunction } from 'path-to-regexp'
import type { StaticRoute } from './handler-ctx.js'

export type MatchedStatic = {
  route: StaticRoute
  params: Record<string, string>
  score: number
}

/**
 * Um casador por caminho, construído uma vez. As rotas são código do
 * repositório e só mudam em deploy (que reinicia o processo), então o caminho de
 * uma rota nunca muda de significado durante a vida do processo: não há o que
 * invalidar. Só entra no mapa o que compilou; um caminho inválido continua
 * lançando a cada tentativa, como antes.
 */
const matchers = new Map<string, MatchFunction<Record<string, string>>>()

export function matcherFor(path: string): MatchFunction<Record<string, string>> {
  let m = matchers.get(path)
  if (!m) {
    m = match(path, { decode: decodeURIComponent }) as MatchFunction<Record<string, string>>
    matchers.set(path, m)
  }
  return m
}

/** Quantos casadores existem (para os testes). */
export function matcherCacheSize(): number {
  return matchers.size
}

/**
 * Escolhe a rota estática de `routePool` que casa com `method` e `restPath`.
 * Entre as que casam, vence a de MENOR número de parâmetros (a mais específica);
 * empate fica com a primeira na ordem do registro.
 */
export function matchStaticRoute(
  routePool: StaticRoute[],
  method: string,
  restPath: string,
): MatchedStatic | null {
  let matched: MatchedStatic | null = null
  for (const route of routePool) {
    if (route.method !== method) continue
    const result = matcherFor(route.path)(restPath)
    if (!result) continue
    const score = (route.path.match(/:/g) || []).length
    const candidate: MatchedStatic = {
      route,
      params: result.params as Record<string, string>,
      score,
    }
    if (!matched || candidate.score < matched.score) matched = candidate
  }
  return matched
}
