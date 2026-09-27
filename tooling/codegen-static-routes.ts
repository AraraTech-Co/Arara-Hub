#!/usr/bin/env tsx
/**
 * Generate TypeScript static route registries from data/exports/{slug}/routes.json
 * One routes.generated.ts per slug (+ index.ts).
 */
import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const apiRoot = join(__dirname, '../packages/api')
const exportsRoot = join(apiRoot, 'data/exports')
const appsRoot = join(apiRoot, 'src/apps')

type ExportRoute = {
  module: string
  method: string
  path: string
  controllerCode: string
  authMode: string
  webhookSecretName: string | null
  requiredPermissions: string[]
  routeId: string
}

function pascal(slug: string): string {
  return slug
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('')
}

function generateSlug(slug: string) {
  const routesPath = join(exportsRoot, slug, 'routes.json')
  if (!existsSync(routesPath)) {
    console.warn(`skip ${slug}: no routes.json`)
    return
  }
  const payload = JSON.parse(readFileSync(routesPath, 'utf8')) as { routes: ExportRoute[] }
  const slugDir = join(appsRoot, slug)
  mkdirSync(slugDir, { recursive: true })

  const entries = payload.routes.map((route, i) => {
    const method = route.method.toUpperCase()
    const codeLiteral = JSON.stringify(route.controllerCode)
    const perms = JSON.stringify(route.requiredPermissions || [])
    const secret =
      route.webhookSecretName == null ? 'null' : JSON.stringify(route.webhookSecretName)
    const hash = createHash('sha1').update(route.routeId).digest('hex').slice(0, 8)
    return `  // ${i} ${route.module} ${method} ${route.path} (${hash})
  {
    module: ${JSON.stringify(route.module)},
    method: ${JSON.stringify(method)},
    path: ${JSON.stringify(route.path)},
    authMode: ${JSON.stringify(route.authMode || 'actor')},
    webhookSecretName: ${secret},
    requiredPermissions: ${perms},
    source: ${JSON.stringify(route.routeId)},
    handler: compileController(${codeLiteral}),
  }`
  })

  const generated = `/** @generated from data/exports/${slug}/routes.json — run: npm run codegen:routes */
import type { StaticRoute } from '../../lib/handler-ctx.js'
import { compileController } from '../../lib/compile-controller.js'

export const ${pascal(slug)}Routes: StaticRoute[] = [
${entries.join(',\n')}
]
`
  writeFileSync(join(slugDir, 'routes.generated.ts'), generated)

  const index = `/** Static routes for ${slug} */
import { registerAppRoutes } from '../../lib/static-registry.js'
import { ${pascal(slug)}Routes } from './routes.generated.js'

export function load${pascal(slug)}Routes() {
  registerAppRoutes('${slug}', ${pascal(slug)}Routes)
  return ${pascal(slug)}Routes
}

export { ${pascal(slug)}Routes }
`
  writeFileSync(join(slugDir, 'index.ts'), index)
  console.log(`  ${slug}: ${payload.routes.length} handlers`)
}

function main() {
  const slugs = readdirSync(exportsRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()

  console.log('Generating static handlers…')
  for (const slug of slugs) generateSlug(slug)

  const registerAll = `/** @generated — loads all static app route registries */
${slugs.map((s) => `import { load${pascal(s)}Routes } from './${s}/index.js'`).join('\n')}

export function registerAllStaticApps(): void {
${slugs.map((s) => `  load${pascal(s)}Routes()`).join('\n')}
}
`
  writeFileSync(join(appsRoot, 'register-all.ts'), registerAll)
  console.log(`Wrote register-all.ts for ${slugs.length} apps`)
}

main()
