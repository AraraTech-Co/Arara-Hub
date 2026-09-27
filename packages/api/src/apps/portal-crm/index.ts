/** Static routes for portal-crm */
import { registerAppRoutes } from '../../lib/static-registry.js'
import { PortalCrmRoutes } from './routes.generated.js'

export function loadPortalCrmRoutes() {
  registerAppRoutes('portal-crm', PortalCrmRoutes)
  return PortalCrmRoutes
}

export { PortalCrmRoutes }
