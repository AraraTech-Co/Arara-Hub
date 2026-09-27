/** Static routes for portal-araratech */
import { registerAppRoutes } from '../../lib/static-registry.js'
import { PortalAraratechRoutes } from './routes.generated.js'

export function loadPortalAraratechRoutes() {
  registerAppRoutes('portal-araratech', PortalAraratechRoutes)
  return PortalAraratechRoutes
}

export { PortalAraratechRoutes }
