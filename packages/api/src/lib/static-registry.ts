import type { StaticRoute } from './handler-ctx.js'

const registries = new Map<string, StaticRoute[]>()

export function registerAppRoutes(slug: string, routes: StaticRoute[]): void {
  registries.set(slug, routes)
}

export function getAppRoutes(slug: string): StaticRoute[] {
  return registries.get(slug) ?? []
}

export function listRegisteredSlugs(): string[] {
  return [...registries.keys()]
}

export function findStaticRoute(
  slug: string,
  method: string,
  // matched externally via path-to-regexp
): StaticRoute[] {
  return getAppRoutes(slug).filter((r) => r.method.toUpperCase() === method.toUpperCase())
}
