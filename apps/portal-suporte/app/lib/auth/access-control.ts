import rawConfig from '../../../config/access-control.json'
import type { AccessLevel } from './types'

export type AccessContext = {
  pathPrefix: string
  floorLevel: AccessLevel
}

export type RouteRule = {
  pattern: string
  minLevel: AccessLevel
}

export type LevelDef = {
  id: AccessLevel
  rank: number
  label: string
}

export type AccessControlConfig = {
  levels: LevelDef[]
  contexts: Record<string, AccessContext>
  publicPaths: string[]
  routes: RouteRule[]
}

const config = rawConfig as AccessControlConfig

const levelRank = new Map<string, number>(
  config.levels.map((l) => [l.id, l.rank])
)

function patternToRegex(pattern: string): RegExp {
  let re = '^'
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] === '*' && pattern[i + 1] === '*') {
      re += '.*'
      i++
    } else if (pattern[i] === '*') {
      re += '[^/]+'
    } else {
      re += pattern[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    }
  }
  return new RegExp(`${re}$`)
}

function matchesPattern(pathname: string, pattern: string): boolean {
  if (pattern === pathname) return true
  return patternToRegex(pattern).test(pathname)
}

function patternSpecificity(pattern: string): number {
  return pattern.replace(/\*\*/g, '').replace(/\*/g, '').length
}

export function getAccessControlConfig(): AccessControlConfig {
  return config
}

/**
 * Apelidos de migração da plataforma (`GET /readme`, seção 8).
 *
 * Enquanto houver perfil gravado com o vocabulário antigo, o nível precisa
 * continuar valendo — senão a pessoa perde acesso entre a mudança do código e
 * a do banco.
 */
const APELIDOS: Record<string, AccessLevel> = {
  master: 'admin' as AccessLevel,
  gerente: 'admin' as AccessLevel,
  member: 'support' as AccessLevel,
  agent: 'support' as AccessLevel,
  vendedor: 'user' as AccessLevel,
}

export function getLevelRank(level: AccessLevel): number {
  const direto = levelRank.get(level)
  if (direto !== undefined) return direto
  const canonico = APELIDOS[String(level ?? '').trim().toLowerCase()]
  // Nível irreconhecível continua valendo -1: fica abaixo de tudo.
  return canonico !== undefined ? (levelRank.get(canonico) ?? -1) : -1
}

export function isKnownLevel(level: AccessLevel): boolean {
  // Apelido TAMBÉM é nível conhecido. Sem isto, `verify('master', …)` devolvia
  // false para todo mundo — `getLevelRank('master')` resolve o apelido e dá 40,
  // mas `isKnownLevel` olhava só os quatro ids do JSON e barrava antes.
  //
  // Efeito prático, encontrado em 26/08: TODO item de menu marcado
  // `minLevel: 'master'` ficava invisível para todos, inclusive para quem é
  // master — Configurações e Permissões estavam assim, sem ninguém notar.
  return getLevelRank(level) >= 0
}

export function hasMinLevel(actorLevel: AccessLevel, requiredLevel: AccessLevel): boolean {
  return getLevelRank(actorLevel) >= getLevelRank(requiredLevel)
}

export function isPublicPath(pathname: string): boolean {
  return config.publicPaths.some((p) => matchesPattern(pathname, p))
}

export function findContext(pathname: string): AccessContext | null {
  let best: AccessContext | null = null
  let bestLen = -1
  for (const ctx of Object.values(config.contexts)) {
    if (pathname === ctx.pathPrefix || pathname.startsWith(ctx.pathPrefix + '/')) {
      if (ctx.pathPrefix.length > bestLen) {
        best = ctx
        bestLen = ctx.pathPrefix.length
      }
    }
  }
  return best
}

export function findRouteRule(pathname: string): RouteRule | null {
  let best: RouteRule | null = null
  let bestScore = -1
  for (const rule of config.routes) {
    if (!matchesPattern(pathname, rule.pattern)) continue
    const score = patternSpecificity(rule.pattern)
    if (score > bestScore) {
      best = rule
      bestScore = score
    }
  }
  return best
}

export function getEffectiveMinLevel(pathname: string): AccessLevel | null {
  if (isPublicPath(pathname)) return null

  const ctx = findContext(pathname)
  const rule = findRouteRule(pathname)

  if (!ctx && !rule) return null

  const floor = ctx?.floorLevel
  const routeMin = rule?.minLevel

  if (floor && routeMin) {
    return getLevelRank(floor) >= getLevelRank(routeMin) ? floor : routeMin
  }
  return routeMin ?? floor ?? null
}

export function canAccessPath(actorLevel: AccessLevel, pathname: string): boolean {
  const required = getEffectiveMinLevel(pathname)
  if (!required) return true
  return hasMinLevel(actorLevel, required)
}

export function canApiKeyAccessPath(
  accessLevel: AccessLevel,
  pathname: string,
  routeGrants: string[],
  routeDenials: string[]
): boolean {
  if (routeDenials.some((p) => matchesPattern(pathname, p))) return false

  if (routeGrants.length > 0) {
    if (!routeGrants.some((p) => matchesPattern(pathname, p))) return false
  }

  return canAccessPath(accessLevel, pathname)
}

export function listProtectableRoutes(): RouteRule[] {
  return [...config.routes]
}

export function listLevels(): LevelDef[] {
  return [...config.levels].sort((a, b) => a.rank - b.rank)
}

export function requiresAuthentication(pathname: string): boolean {
  if (isPublicPath(pathname)) return false
  return findContext(pathname) !== null || findRouteRule(pathname) !== null
}
