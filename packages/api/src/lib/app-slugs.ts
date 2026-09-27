/**
 * Public request slug → Postgres App.slug / model_records prefix.
 * Keeps the live API on `time-management` working while the code-first
 * monorepo exposes `portal-horas`.
 */
export const APP_SLUG_ALIASES: Record<string, string> = {
  'portal-horas': 'time-management',
}

export function resolveStorageSlug(requestSlug: string): string {
  return APP_SLUG_ALIASES[requestSlug] ?? requestSlug
}

/** Slugs that should not be registered as static apps (removed demos). */
export const REMOVED_APP_SLUGS = new Set(['festa-da-firma'])
