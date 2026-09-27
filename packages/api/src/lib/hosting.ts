import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import AdmZip from 'adm-zip'
import type { AppHosting, PrismaClient } from '@prisma/client'
import { allocatePort } from './ports.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// dist/src/lib → repo root in dev; /app in production (not /app/dist).
const PLATFORM_ROOT = path.resolve(__dirname, process.env.NODE_ENV === 'production' ? '../../..' : '../..')
const HOSTING_ROOT = path.join(PLATFORM_ROOT, 'data', 'hosting')
const STATIC_HOST_SCRIPT = path.join(PLATFORM_ROOT, 'scripts', 'static-host.mjs')

const children = new Map<string, ChildProcess>()

export function publicHost(): string {
  return process.env.PUBLIC_HOST || 'localhost'
}

export function hostingUrl(port: number): string {
  return `http://${publicHost()}:${port}/`
}

export function artifactDirForSlug(slug: string): string {
  return path.join(HOSTING_ROOT, slug)
}

async function emptyDir(dir: string) {
  await fsp.rm(dir, { recursive: true, force: true })
  await fsp.mkdir(dir, { recursive: true })
}

/** Extract zip into target; promote dist/ if index.html only there. */
export async function extractArtifactZip(zipBuffer: Buffer, targetDir: string): Promise<string> {
  await emptyDir(targetDir)
  const zip = new AdmZip(zipBuffer)
  zip.extractAllTo(targetDir, true)

  // If zip has a single top-level folder, unwrap it
  const entries = await fsp.readdir(targetDir, { withFileTypes: true })
  if (entries.length === 1 && entries[0]!.isDirectory()) {
    const nested = path.join(targetDir, entries[0]!.name)
    const tmp = `${targetDir}.__unwrap`
    await fsp.rename(nested, tmp)
    await emptyDir(targetDir)
    const nestedFiles = await fsp.readdir(tmp)
    for (const f of nestedFiles) {
      await fsp.rename(path.join(tmp, f), path.join(targetDir, f))
    }
    await fsp.rm(tmp, { recursive: true, force: true })
  }

  const rootIndex = path.join(targetDir, 'index.html')
  const distIndex = path.join(targetDir, 'dist', 'index.html')
  if (!fs.existsSync(rootIndex) && fs.existsSync(distIndex)) {
    const distDir = path.join(targetDir, 'dist')
    const tmp = `${targetDir}.__dist`
    await fsp.rename(distDir, tmp)
    // clear leftover then move dist contents up
    const leftover = await fsp.readdir(targetDir)
    for (const f of leftover) {
      await fsp.rm(path.join(targetDir, f), { recursive: true, force: true })
    }
    for (const f of await fsp.readdir(tmp)) {
      await fsp.rename(path.join(tmp, f), path.join(targetDir, f))
    }
    await fsp.rm(tmp, { recursive: true, force: true })
  }

  if (!fs.existsSync(path.join(targetDir, 'index.html'))) {
    throw new Error('Artifact must contain index.html at root (or dist/index.html)')
  }

  return targetDir
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function killPid(pid: number) {
  try {
    process.kill(pid, 'SIGTERM')
  } catch {
    /* ignore */
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

/** Kill leftover static-host.mjs processes for this artifact (orphans after API crash/restart). */
export async function killOrphanHostsForArtifact(
  artifactPath: string,
  keepPid?: number | null,
): Promise<number[]> {
  const target = path.resolve(artifactPath)
  const killed: number[] = []
  let procEntries: string[] = []
  try {
    procEntries = await fsp.readdir('/proc')
  } catch {
    return killed
  }

  for (const entry of procEntries) {
    if (!/^\d+$/.test(entry)) continue
    const pid = Number(entry)
    if (!pid || pid === process.pid || (keepPid && pid === keepPid)) continue

    let cmdline = ''
    let environ = ''
    try {
      cmdline = await fsp.readFile(`/proc/${pid}/cmdline`, 'utf8')
      environ = await fsp.readFile(`/proc/${pid}/environ`, 'utf8')
    } catch {
      continue
    }
    if (!cmdline.includes('static-host.mjs')) continue
    const rootMatch = environ.split('\0').find((e) => e.startsWith('HOST_ROOT='))
    const root = rootMatch?.slice('HOST_ROOT='.length)
    if (!root || path.resolve(root) !== target) continue

    killPid(pid)
    killed.push(pid)
  }

  if (killed.length) await sleep(150)
  for (const pid of killed) {
    if (isPidAlive(pid)) {
      try {
        process.kill(pid, 'SIGKILL')
      } catch {
        /* ignore */
      }
    }
  }
  return killed
}

export async function stopHostProcess(
  prisma: PrismaClient,
  hosting: AppHosting,
): Promise<AppHosting> {
  const child = children.get(hosting.appId)
  if (child && !child.killed) {
    child.kill('SIGTERM')
    children.delete(hosting.appId)
  }
  if (hosting.pid && isPidAlive(hosting.pid)) {
    killPid(hosting.pid)
    await sleep(100)
    if (isPidAlive(hosting.pid)) {
      try {
        process.kill(hosting.pid, 'SIGKILL')
      } catch {
        /* ignore */
      }
    }
  }
  // One host per app: sweep orphans serving the same artifact (e.g. after API kill).
  await killOrphanHostsForArtifact(hosting.artifactPath)

  return prisma.appHosting.update({
    where: { id: hosting.id },
    data: {
      status: 'stopped',
      pid: null,
      // Keep port sticky so redeploy/restore reuses the same host port.
      lastError: null,
    },
  })
}

export async function startHostProcess(
  prisma: PrismaClient,
  hosting: AppHosting,
  preferPort?: number | null,
): Promise<AppHosting> {
  if (!fs.existsSync(hosting.artifactPath)) {
    return prisma.appHosting.update({
      where: { id: hosting.id },
      data: { status: 'error', lastError: `Artifact path missing: ${hosting.artifactPath}` },
    })
  }
  const indexPath = path.join(hosting.artifactPath, hosting.entryFile || 'index.html')
  if (!fs.existsSync(indexPath)) {
    return prisma.appHosting.update({
      where: { id: hosting.id },
      data: { status: 'error', lastError: `Entry file missing: ${indexPath}` },
    })
  }

  // One host per app: always stop previous + orphans before binding a port.
  await stopHostProcess(prisma, hosting)
  hosting = await prisma.appHosting.findUniqueOrThrow({ where: { id: hosting.id } })

  await prisma.appHosting.update({
    where: { id: hosting.id },
    data: { status: 'starting', lastError: null },
  })

  let port: number
  try {
    port = await allocatePort(prisma, preferPort ?? hosting.port)
  } catch (err) {
    return prisma.appHosting.update({
      where: { id: hosting.id },
      data: { status: 'error', lastError: (err as Error).message },
    })
  }

  const child = spawn(process.execPath, [STATIC_HOST_SCRIPT], {
    env: {
      ...process.env,
      HOST_ROOT: hosting.artifactPath,
      PORT: String(port),
      ENTRY_FILE: hosting.entryFile || 'index.html',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  })

  children.set(hosting.appId, child)

  let bootError = ''
  child.stderr?.on('data', (buf) => {
    bootError += buf.toString()
  })
  child.stdout?.on('data', (buf) => {
    // keep quiet; useful for debug
    if (process.env.HOSTING_DEBUG) console.log('[host]', buf.toString())
  })

  child.on('exit', async (code) => {
    children.delete(hosting.appId)
    try {
      const current = await prisma.appHosting.findUnique({ where: { id: hosting.id } })
      if (current && current.pid === child.pid) {
        await prisma.appHosting.update({
          where: { id: hosting.id },
          data: {
            status: 'error',
            pid: null,
            // Keep sticky port reserved for this app.
            lastError: bootError || `Process exited with code ${code}`,
          },
        })
      }
    } catch {
      /* ignore */
    }
  })

  // Wait briefly for listen
  await new Promise((r) => setTimeout(r, 200))
  if (child.exitCode !== null) {
    return prisma.appHosting.update({
      where: { id: hosting.id },
      data: {
        status: 'error',
        pid: null,
        port, // keep sticky even if boot failed
        lastError: bootError || 'Static host failed to start',
      },
    })
  }

  return prisma.appHosting.update({
    where: { id: hosting.id },
    data: {
      status: 'running',
      port,
      pid: child.pid ?? null,
      lastError: null,
    },
  })
}

export async function restoreAllHosts(prisma: PrismaClient): Promise<void> {
  await fsp.mkdir(HOSTING_ROOT, { recursive: true })
  const rows = await prisma.appHosting.findMany()
  for (const row of rows) {
    if (!row.artifactPath || !fs.existsSync(row.artifactPath)) continue
    // Kill previous process + orphans before restart (never leave multiple ports per app).
    await stopHostProcess(prisma, row)
    const fresh = await prisma.appHosting.findUniqueOrThrow({ where: { id: row.id } })
    await startHostProcess(prisma, fresh, fresh.port)
  }
}

export function serializeHosting(row: AppHosting) {
  return {
    id: row.id,
    appId: row.appId,
    artifactPath: row.artifactPath,
    entryFile: row.entryFile,
    port: row.port,
    status: row.status,
    pid: row.pid,
    lastError: row.lastError,
    uploadedAt: row.uploadedAt,
    updatedAt: row.updatedAt,
    url: row.port ? hostingUrl(row.port) : null,
    proxyPath: null as string | null,
  }
}
