/** Static routes for portal-crm */
import { registerAppRoutes } from '../../lib/static-registry.js'
import { aplicarGuardaDeLeitura } from './guarda-leitura.js'
import { rotasDoFunil } from './funil.js'
import { PortalCrmRoutes as rotasGeradas } from './routes.generated.js'

const PortalCrmRoutes = aplicarGuardaDeLeitura([...rotasGeradas, ...rotasDoFunil])

export function loadPortalCrmRoutes() {
  registerAppRoutes('portal-crm', PortalCrmRoutes)
  return PortalCrmRoutes
}

export { PortalCrmRoutes }
