/** Static routes for portal-suporte */
import { registerAppRoutes } from '../../lib/static-registry.js'
import { PortalSuporteRoutes } from './routes.generated.js'

export function loadPortalSuporteRoutes() {
  registerAppRoutes('portal-suporte', PortalSuporteRoutes)
  return PortalSuporteRoutes
}

export { PortalSuporteRoutes }
