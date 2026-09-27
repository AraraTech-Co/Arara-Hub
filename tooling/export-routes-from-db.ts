#!/usr/bin/env tsx
/**
 * Export published module_routes from Hostinger arara-platform-db into
 * packages/api/data/exports/{slug}/routes.json
 *
 * Requires SSH host `Hostinger-Suporte`. Credentials are read inside the
 * remote container (POSTGRES_*), never committed.
 *
 * Usage (from packages/api): npm run export:routes
 */
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outRoot = join(__dirname, '../packages/api/data/exports')

const ROUTES_SQL = `
SELECT json_agg(row_to_json(t) ORDER BY t.slug, t.module_name, t.method, t.path)
FROM (
  SELECT
    a.slug,
    a.name AS app_name,
    a.id AS app_id,
    m.name AS module_name,
    m.status AS module_status,
    mr.method,
    mr.path,
    mr.controller_code,
    mr.auth_mode,
    mr.webhook_secret_name,
    mr.required_permissions,
    mr.id AS route_id,
    mr.updated_at
  FROM module_routes mr
  JOIN modules m ON m.id = mr.module_id
  JOIN apps a ON a.id = m.app_id
  WHERE m.status = 'published'
) t;
`

const MODELS_SQL = `
SELECT json_agg(row_to_json(t) ORDER BY t.slug, t.name)
FROM (
  SELECT a.slug, md.name, md.version, md.id
  FROM model_defs md
  JOIN apps a ON a.id = md.app_id
) t;
`

function remotePsql(sql: string): string {
  const script = `
set -euo pipefail
USER=$(docker exec arara-platform-db printenv POSTGRES_USER)
DB=$(docker exec arara-platform-db printenv POSTGRES_DB)
PASS=$(docker exec arara-platform-db printenv POSTGRES_PASSWORD)
docker exec -e PGPASSWORD="$PASS" arara-platform-db \\
  psql -U "$USER" -d "$DB" -t -A -c ${JSON.stringify(sql)}
`
  return execFileSync('ssh', ['Hostinger-Suporte', 'bash', '-s'], {
    input: script,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  }).trim()
}

function main() {
  console.log('Exporting routes from Hostinger-Suporte/arara-platform-db…')
  const routesRaw = remotePsql(ROUTES_SQL)
  const modelsRaw = remotePsql(MODELS_SQL)
  const routes = JSON.parse(routesRaw) as Array<Record<string, unknown>>
  const models = JSON.parse(modelsRaw) as Array<Record<string, unknown>>
  const exportedAt = new Date().toISOString()

  const bySlug = new Map<string, typeof routes>()
  for (const r of routes) {
    const slug = String(r.slug)
    if (!bySlug.has(slug)) bySlug.set(slug, [])
    bySlug.get(slug)!.push(r)
  }
  const modelsBy = new Map<string, typeof models>()
  for (const m of models) {
    const slug = String(m.slug)
    if (!modelsBy.has(slug)) modelsBy.set(slug, [])
    modelsBy.get(slug)!.push(m)
  }

  mkdirSync(outRoot, { recursive: true })
  const index: Record<string, unknown> = {
    exportedAt,
    source: 'Hostinger-Suporte/arara-platform-db',
    apps: {} as Record<string, unknown>,
  }

  for (const [slug, items] of [...bySlug.entries()].sort()) {
    const dir = join(outRoot, slug)
    mkdirSync(dir, { recursive: true })
    const normalized = items.map((r) => ({
      module: r.module_name,
      method: r.method,
      path: r.path,
      controllerCode: r.controller_code,
      authMode: (r.auth_mode as string) || 'actor',
      webhookSecretName: r.webhook_secret_name ?? null,
      requiredPermissions: (r.required_permissions as string[]) || [],
      routeId: r.route_id,
      updatedAt: r.updated_at,
    }))
    const payload = { slug, exportedAt, routeCount: normalized.length, routes: normalized }
    const raw = JSON.stringify(payload, null, 2) + '\n'
    writeFileSync(join(dir, 'routes.json'), raw)
    const mlist = (modelsBy.get(slug) || []).map((m) => ({
      name: m.name,
      version: m.version,
      id: m.id,
    }))
    writeFileSync(
      join(dir, 'models.json'),
      JSON.stringify({ slug, exportedAt, models: mlist }, null, 2) + '\n',
    )
    ;(index.apps as Record<string, unknown>)[slug] = {
      routes: normalized.length,
      models: mlist.length,
      routesSha256: createHash('sha256').update(raw).digest('hex'),
      modules: [...new Set(normalized.map((r) => String(r.module)))].sort(),
    }
    console.log(`  ${slug}: ${normalized.length} routes, ${mlist.length} models`)
  }

  writeFileSync(join(outRoot, 'INDEX.json'), JSON.stringify(index, null, 2) + '\n')
  console.log(`Wrote ${outRoot}`)
}

main()
