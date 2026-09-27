import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../..')

export function loadEmailAliases() {
  const raw = JSON.parse(readFileSync(path.join(ROOT, 'data/canonical-emails.json'), 'utf8'))
  return raw.aliases || {}
}

export function embedEmailAliases(code) {
  return code.replace('__EMAIL_ALIASES__', JSON.stringify(loadEmailAliases()))
}

export function buildPlatformUserMap() {
  const mapPath = path.join(ROOT, 'data/user-id-map.json')
  try {
    const { map } = JSON.parse(readFileSync(mapPath, 'utf8'))
    const out = {}
    for (const [k, v] of Object.entries(map)) {
      if (k.startsWith('time-management:')) out[k] = v
    }
    return out
  } catch {
    return {}
  }
}
