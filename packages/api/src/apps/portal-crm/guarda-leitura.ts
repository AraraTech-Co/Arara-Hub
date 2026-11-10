/**
 * Papel "leitura" do CRM: pode abrir todas as telas e não grava nada.
 *
 * Embrulha toda rota que não é GET. Quando a pessoa logada tem perfil com
 * papel `leitura`, responde 403 sem chamar o handler. Os demais papéis seguem
 * sem mudança. Fica fora do routes.generated.ts para valer em todas as rotas
 * de escrita, inclusive as que vierem depois.
 */
import type { AppRouteHandler, HandlerCtx, StaticRoute } from '../../lib/handler-ctx.js'

export const PAPEL_LEITURA = 'leitura'

const METODOS_DE_LEITURA = new Set(['GET', 'HEAD', 'OPTIONS'])

function idDaPessoa(ctx: HandlerCtx): string | null {
  const u = ctx.user as { id?: unknown } | null | undefined
  return u && typeof u.id === 'string' && u.id.length > 0 ? u.id : null
}

export function comGuardaDeLeitura(handler: AppRouteHandler): AppRouteHandler {
  return async (ctx) => {
    const uid = idDaPessoa(ctx)
    if (uid) {
      const Profile = ctx.models.Profile
      let perfil: unknown
      try {
        perfil = Profile ? await Profile.findById(uid) : null
      } catch {
        // Sem saber o papel, não grava.
        return ctx.reply.status(503).send({ error: 'Não foi possível conferir o perfil. Tente de novo.' })
      }
      const papel = (perfil as { role?: unknown } | null)?.role
      if (papel === PAPEL_LEITURA) {
        return ctx.reply.status(403).send({ error: 'Seu acesso ao CRM é somente leitura.' })
      }
    }
    return handler(ctx)
  }
}

export function aplicarGuardaDeLeitura(rotas: StaticRoute[]): StaticRoute[] {
  return rotas.map((r) =>
    METODOS_DE_LEITURA.has(r.method.toUpperCase()) ? r : { ...r, handler: comGuardaDeLeitura(r.handler) },
  )
}
