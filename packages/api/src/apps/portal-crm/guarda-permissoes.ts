/**
 * Permissões do CRM aprovadas pelo André em 24/11:
 * 1. Chave de app não grava: rota que não é GET recusa quem chama por chave.
 *    Webhook (ex.: formulário do site) não é chave e segue gravando.
 * 2. Algumas ações são só do gestor (perfil gerente ou admin).
 * Fica fora do routes.generated.ts para valer mesmo se as rotas forem regeradas.
 */
import type { AppRouteHandler, HandlerCtx, StaticRoute } from '../../lib/handler-ctx.js'

const METODOS_DE_LEITURA = new Set(['GET', 'HEAD', 'OPTIONS'])
const PAPEIS_DE_GESTOR = new Set(['gerente', 'admin'])

/** Rotas que só o gestor pode chamar (método + caminho, como registrados). */
export const ROTAS_SO_GESTOR: ReadonlyArray<readonly [string, string]> = [
  ['DELETE', '/Client/:id'],
  ['DELETE', '/Deal/:id'],
  ['PATCH', '/Client/:id'],
  ['PUT', '/Client/:id'],
  ['POST', '/stages'],
  ['PATCH', '/stages/:id'],
  ['POST', '/Stage'],
  ['PATCH', '/Stage/:id'],
  ['PUT', '/Stage/:id'],
  ['DELETE', '/Stage/:id'],
  ['POST', '/termo/reset'],
  ['POST', '/termo/publish'],
]

const chave = (metodo: string, caminho: string) => `${metodo.toUpperCase()} ${caminho}`
const SO_GESTOR = new Set(ROTAS_SO_GESTOR.map(([m, p]) => chave(m, p)))

function ehChaveDeApp(ctx: HandlerCtx): boolean {
  const u = ctx.user as { type?: unknown } | null | undefined
  return !!u && u.type === 'apiKey'
}

function idDaPessoa(ctx: HandlerCtx): string | null {
  const u = ctx.user as { id?: unknown } | null | undefined
  return u && typeof u.id === 'string' && u.id.length > 0 ? u.id : null
}

export function semGravacaoPorChave(handler: AppRouteHandler): AppRouteHandler {
  return async (ctx) => {
    if (ehChaveDeApp(ctx)) {
      return ctx.reply.status(403).send({ error: 'O CRM não aceita gravação por chave de app. Entre com o login da pessoa.' })
    }
    return handler(ctx)
  }
}

export function soGestor(handler: AppRouteHandler): AppRouteHandler {
  return async (ctx) => {
    const uid = idDaPessoa(ctx)
    if (!uid) return ctx.reply.status(401).send({ error: 'Auth necessaria' })
    const Profile = ctx.models.Profile
    let perfil: unknown
    try {
      perfil = Profile ? await Profile.findById(uid) : null
    } catch {
      return ctx.reply.status(503).send({ error: 'Não foi possível conferir o perfil. Tente de novo.' })
    }
    const papel = (perfil as { role?: unknown } | null)?.role
    if (!PAPEIS_DE_GESTOR.has(papel as string)) {
      return ctx.reply.status(403).send({ error: 'Só o gestor pode fazer isso.' })
    }
    return handler(ctx)
  }
}

export function aplicarGuardasDePermissao(rotas: StaticRoute[]): StaticRoute[] {
  return rotas.map((r) => {
    if (METODOS_DE_LEITURA.has(r.method.toUpperCase())) return r
    let handler = r.handler
    if (SO_GESTOR.has(chave(r.method, r.path))) handler = soGestor(handler)
    handler = semGravacaoPorChave(handler)
    return { ...r, handler }
  })
}
