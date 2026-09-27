#!/usr/bin/env node
/**
 * Auditoria dos controllers gerados automaticamente do portal-suporte.
 *
 * Muitas rotas nasceram como stub genérico (`model.create(body)`) e escrevem um
 * registro a cada chamada, mesmo quando a semântica é de consulta/ação. Foi assim
 * que /kb/suggest e /tickets/suggest-priority criaram 28 "tickets" fantasma.
 *
 * Cruza:
 *  - rotas exportadas em /tmp/ps-routes.csv (method, path, faz_create, tamanho)
 *  - chamadas reais no código do frontend (portal-suporte/app)
 *
 * node scripts/portal-suporte/audit-stub-routes.mjs [caminho-do-csv]
 */
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const CSV = process.argv[2] || '/tmp/ps-routes.csv'
const FRONTEND = resolve(HERE, '../../../portal-suporte/app')

/** Verbos cujo nome indica consulta ou ação, nunca "criar registro". */
const READ_ONLY_HINTS = [
  'suggest',
  'search',
  'check',
  'validate',
  'test',
  'analyze',
  'preview',
  'export',
  'stats',
  'report',
  'login',
  'logout',
  'verify',
  'refresh',
  'send',
  'notify',
  'sync',
  'execute',
  'triage',
  'chat',
  'upload',
  'impersonate',
  'set-password',
  'change-password',
  'forgot-password',
  'reset-password',
]

function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 1
        } else quoted = false
      } else field += ch
      continue
    }
    if (ch === '"') quoted = true
    else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (ch !== '\r') field += ch
  }
  if (field || row.length) {
    row.push(field)
    rows.push(row)
  }
  const header = rows.shift() || []
  return rows
    .filter((r) => r.length >= header.length)
    .map((r) => Object.fromEntries(header.map((h, idx) => [h, r[idx]])))
}

/** Um path de rota vira um regex que casa com a chamada no frontend. */
function pathToSearch(path) {
  return (
    '/api' +
    path
      .split('/')
      .map((seg) => (seg.startsWith(':') ? '[^/`\'"]+' : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
      .join('/')
  )
}

/**
 * `app/api`, `app/server` e `pages/api` são a árvore Next legada, removida do
 * bundle no export estático — referências ali não contam como uso real.
 */
const EXCLUDED = [
  '!node_modules',
  '!api/**',
  '!server/**',
  '!uploads/**',
  '!**/route.ts',
  '!**/*.controller.ts',
  '!**/*.service.ts',
  '!**/*.repository.ts',
]

function usedByFrontend(path) {
  const args = ['--quiet']
  for (const glob of EXCLUDED) args.push('--glob', glob)
  args.push('-e', pathToSearch(path), FRONTEND)
  try {
    execFileSync('rg', args, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

const routes = parseCsv(readFileSync(CSV, 'utf8'))
const stubs = routes.filter(
  (r) => r.faz_create === 't' && Number(r.tamanho) < 600 && r.method !== 'GET',
)

const report = stubs.map((r) => {
  const lower = `${r.path}`.toLowerCase()
  return {
    route: `${r.method} ${r.path}`,
    path: r.path,
    method: r.method,
    looksReadOnly: READ_ONLY_HINTS.some((h) => lower.includes(h)),
    used: usedByFrontend(r.path),
  }
})

// Stub sem chamada no frontend = escreve lixo se alguém chamar, e nada depende dele.
const dead = report.filter((r) => !r.used)
const live = report.filter((r) => r.used)

function show(title, rows) {
  console.log(`\n${title} (${rows.length})`)
  for (const r of rows) console.log(`  ${r.route}${r.looksReadOnly ? '   [semântica de consulta/ação]' : ''}`)
}

console.log(`Rotas totais: ${routes.length} · stubs de escrita: ${stubs.length}`)
show('MORTAS — stub sem nenhuma chamada no frontend (converter para 501)', dead)
show('EM USO — stub chamado pelo frontend (revisar uma a uma)', live)

if (process.env.EMIT_DEAD === '1') {
  console.log('\n--- lista para o fixer ---')
  console.log(JSON.stringify(dead.map((r) => ({ method: r.method, path: r.path })), null, 2))
}
