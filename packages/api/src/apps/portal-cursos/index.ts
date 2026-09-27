/** Static routes for portal-cursos */
import { registerAppRoutes } from '../../lib/static-registry.js'
import { PortalCursosRoutes } from './routes.generated.js'

export function loadPortalCursosRoutes() {
  registerAppRoutes('portal-cursos', PortalCursosRoutes)
  return PortalCursosRoutes
}

export { PortalCursosRoutes }
