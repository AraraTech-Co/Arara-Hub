#!/usr/bin/env node
/**
 * Static host for Next `output: 'export'` (trailingSlash) + SPA fallback.
 * Env: HOST_ROOT, PORT, ENTRY_FILE (default index.html)
 *
 * For dynamic segments exported as `/path/_/`, unknown IDs resolve to that placeholder HTML
 * so the client router can hydrate with the real URL.
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(process.env.HOST_ROOT || process.cwd())
const port = Number(process.env.PORT || 10000)
const entry = process.env.ENTRY_FILE || 'index.html'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
}

function safeJoin(base, reqPath) {
  const decoded = decodeURIComponent((reqPath || '/').split('?')[0])
  const joined = path.normalize(path.join(base, decoded))
  if (!joined.startsWith(base)) return null
  return joined
}

function existsFile(filePath) {
  try {
    return fs.statSync(filePath).isFile()
  } catch {
    return false
  }
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase()
  const type = MIME[ext] || 'application/octet-stream'
  const stream = fs.createReadStream(filePath)
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' })
  stream.pipe(res)
  stream.on('error', () => {
    if (!res.headersSent) res.writeHead(500)
    res.end('Error reading file')
  })
}

/** Resolve Next export paths, including `/segment/_/` placeholders for dynamic routes. */
function resolveExportFile(urlPath) {
  const clean = (urlPath.split('?')[0] || '/').replace(/\/+/g, '/')
  const candidates = []

  const direct = safeJoin(root, clean === '/' ? `/${entry}` : clean)
  if (direct) {
    candidates.push(direct)
    candidates.push(path.join(direct, entry))
  }

  // Walk segments: try replacing trailing dynamic parts with `_`
  const parts = clean.replace(/^\/|\/$/g, '').split('/').filter(Boolean)
  for (let i = parts.length; i >= 1; i--) {
    const withPlaceholder = [...parts.slice(0, i - 1), '_', ...parts.slice(i)].filter(Boolean)
    // only replace the last unknown segment(s) with _
    const replaced = [...parts.slice(0, i - 1), '_']
    candidates.push(safeJoin(root, '/' + replaced.join('/') + '/' + entry))
    candidates.push(safeJoin(root, '/' + withPlaceholder.join('/') + '/' + entry))
  }

  // Parent index.html walk
  for (let i = parts.length; i >= 0; i--) {
    const prefix = parts.slice(0, i)
    const p = prefix.length ? '/' + prefix.join('/') + '/' + entry : '/' + entry
    candidates.push(safeJoin(root, p))
  }

  for (const c of candidates) {
    if (c && existsFile(c)) return c
  }
  return null
}

const server = http.createServer((req, res) => {
  const urlPath = req.url || '/'
  // Assets / exact files first
  const exact = safeJoin(root, urlPath === '/' ? `/${entry}` : urlPath)
  if (exact) {
    try {
      const st = fs.statSync(exact)
      if (st.isFile()) {
        sendFile(res, exact)
        return
      }
      if (st.isDirectory()) {
        const idx = path.join(exact, entry)
        if (existsFile(idx)) {
          sendFile(res, idx)
          return
        }
      }
    } catch {
      // continue
    }
  }

  const resolved = resolveExportFile(urlPath)
  if (resolved) {
    sendFile(res, resolved)
    return
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' })
  res.end('Not found')
})

server.listen(port, '0.0.0.0', () => {
  console.log(`static-host root=${root} port=${port} entry=${entry}`)
})

process.on('SIGTERM', () => server.close(() => process.exit(0)))
process.on('SIGINT', () => server.close(() => process.exit(0)))

void fileURLToPath
