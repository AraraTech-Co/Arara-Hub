/** Static routes for arara-hub */
import { registerAppRoutes } from '../../lib/static-registry.js'
import { AraraHubRoutes } from './routes.generated.js'

export function loadAraraHubRoutes() {
  registerAppRoutes('arara-hub', AraraHubRoutes)
  return AraraHubRoutes
}

export { AraraHubRoutes }
