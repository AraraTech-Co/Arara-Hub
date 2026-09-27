import net from 'node:net'
import type { PrismaClient } from '@prisma/client'

export const PORT_RANGE_START = 10000
export const PORT_RANGE_END = 20000

function canBind(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.unref()
    server.once('error', () => resolve(false))
    server.listen(port, '0.0.0.0', () => {
      server.close(() => resolve(true))
    })
  })
}

/**
 * Allocate a port in [10000, 20000].
 * Ports already stored on any AppHosting are reserved (sticky) until hosting is deleted.
 * `prefer` is the app's own sticky port and is always tried first.
 */
export async function allocatePort(
  prisma: PrismaClient,
  prefer?: number | null,
): Promise<number> {
  const usedRows = await prisma.appHosting.findMany({
    where: { port: { not: null } },
    select: { port: true },
  })
  const used = new Set(usedRows.map((r) => r.port!).filter(Boolean))
  // Own sticky port is not blocked by the reservation set.
  if (prefer) used.delete(prefer)

  if (prefer && prefer >= PORT_RANGE_START && prefer <= PORT_RANGE_END) {
    if (await canBind(prefer)) return prefer
  }

  for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
    if (used.has(port)) continue
    if (await canBind(port)) return port
  }

  throw new Error(`No free port in range ${PORT_RANGE_START}-${PORT_RANGE_END}`)
}
