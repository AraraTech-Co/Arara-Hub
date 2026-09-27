import type { HandlerCtx, HandlerResult } from './handler-ctx.js'

type Compiled = (ctx: HandlerCtx) => Promise<HandlerResult>

/**
 * Compile a legacy CommonJS sandbox controller (module.exports = { handler })
 * into a host-side async function. Code lives in the repo (generated TS modules),
 * not loaded from Postgres at request time.
 */
export function compileController(controllerCode: string): Compiled {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const factory = new Function(
    'module',
    'exports',
    `${controllerCode}\n;return module.exports;`,
  ) as (module: { exports: unknown }, exports: unknown) => unknown

  const module = { exports: {} as Record<string, unknown> }
  const exported = factory(module, module.exports)
  const bag =
    exported && typeof exported === 'object'
      ? (exported as Record<string, unknown>)
      : (module.exports as Record<string, unknown>)

  let resolved: unknown = bag
  if (typeof bag === 'function') resolved = bag
  else if (bag && typeof bag.default === 'function') resolved = bag.default
  else if (bag && typeof bag.handler === 'function') resolved = bag.handler

  if (typeof resolved !== 'function') {
    throw new Error('Controller must export handler(ctx) via module.exports')
  }

  const userHandler = resolved as (ctx: HandlerCtx) => Promise<unknown>

  return async (ctx: HandlerCtx): Promise<HandlerResult> => {
    let status = 200
    let sent: unknown
    const reply = {
      send(value: unknown) {
        sent = value
        return { status, body: value }
      },
      status(code: number) {
        status = code
        return this
      },
    }

    const result = await userHandler({ ...ctx, reply })
    if (sent !== undefined) return { status, body: sent }
    if (result && typeof result === 'object' && 'body' in (result as object)) {
      const r = result as { status?: number; body: unknown }
      return { status: r.status || status, body: r.body }
    }
    return { status, body: result == null ? null : result }
  }
}
