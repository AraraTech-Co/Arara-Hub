/** Static routes for portal-horas */
import { registerAppRoutes } from '../../lib/static-registry.js'
import { PortalHorasRoutes } from './routes.generated.js'

export function loadPortalHorasRoutes() {
  registerAppRoutes('portal-horas', PortalHorasRoutes)
  return PortalHorasRoutes
}

export { PortalHorasRoutes }
