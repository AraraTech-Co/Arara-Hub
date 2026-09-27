import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'

type CanonicalConfig = {
  aliases: Record<string, string>
  coreStaff?: string[]
  platformRenames?: Record<string, string>
}

let cache: CanonicalConfig | null = null

function configPath(): string {
  const candidates = [
    path.join(process.cwd(), 'data/canonical-emails.json'),
    path.join(process.cwd(), '../data/canonical-emails.json'),
  ]
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  return candidates[0]
}

export function loadCanonicalEmailConfig(): CanonicalConfig {
  if (cache) return cache
  const file = configPath()
  if (!existsSync(file)) {
    cache = { aliases: {} }
    return cache
  }
  cache = JSON.parse(readFileSync(file, 'utf8')) as CanonicalConfig
  return cache
}

export function canonicalEmail(email: string): string {
  const e = email.trim().toLowerCase()
  const { aliases } = loadCanonicalEmailConfig()
  return aliases[e] ?? e
}

export function emailsMatch(a: string, b: string): boolean {
  const ca = canonicalEmail(a)
  const cb = canonicalEmail(b)
  return ca === cb
}
