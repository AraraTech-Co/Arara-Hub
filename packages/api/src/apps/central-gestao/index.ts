/** Static routes for central-gestao */
import { registerAppRoutes } from '../../lib/static-registry.js'
import { CentralGestaoRoutes } from './routes.generated.js'

export function loadCentralGestaoRoutes() {
  registerAppRoutes('central-gestao', CentralGestaoRoutes)
  return CentralGestaoRoutes
}

export { CentralGestaoRoutes }
