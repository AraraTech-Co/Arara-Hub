import type { ModelApi } from './models.js'

export type HandlerFilePart = {
  field: string
  filename: string
  contentType: string
  size: number
  data?: string
}

export type HandlerApp = { id: string; slug: string; name: string }

export type HandlerCtx = {
  method: string
  params: Record<string, string>
  query: Record<string, unknown>
  body: unknown
  rawBody: string | null
  files: HandlerFilePart[] | null
  filesTruncated: boolean
  headers: Record<string, string>
  user: unknown
  app: HandlerApp
  models: Record<string, ModelApi>
  secrets: { get: (name: string) => Promise<string | null> }
  users: {
    findByEmail: (email: string) => Promise<{
      id: string
      email: string
      name: string | null
      status: string
    } | null>
    setPassword: (userId: string, password: string) => Promise<{ success: true }>
  }
  fetch: (url: string, init?: Record<string, unknown>) => Promise<unknown>
  notify: (payload: {
    userId?: string
    title?: string
    body?: string
    severity?: string
    href?: string | null
    sourceApp?: string | null
  }) => Promise<unknown>
  /** Cryptographic random bytes from the host (`node:crypto`), as lowercase hex. */
  randomBytes: (n: number) => string
  /** Cryptographic UUID v4 from the host (`node:crypto`). */
  randomUUID: () => string
  reply: {
    status: (code: number) => { send: (value: unknown) => { status: number; body: unknown } }
    send: (value: unknown) => { status: number; body: unknown }
  }
}

export type HandlerResult = { status: number; body: unknown }

export type AppRouteHandler = (ctx: HandlerCtx) => Promise<HandlerResult | unknown>

export type StaticRoute = {
  method: string
  path: string
  authMode: string
  webhookSecretName?: string | null
  requiredPermissions: string[]
  handler: AppRouteHandler
  module?: string
  source?: string
}
