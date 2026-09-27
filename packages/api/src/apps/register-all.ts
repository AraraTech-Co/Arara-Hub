/** @generated — loads all static app route registries */
import { loadAraraHubRoutes } from './arara-hub/index.js'
import { loadPortalAraratechRoutes } from './portal-araratech/index.js'
import { loadPortalCrmRoutes } from './portal-crm/index.js'
import { loadPortalCursosRoutes } from './portal-cursos/index.js'
import { loadPortalHorasRoutes } from './portal-horas/index.js'
import { loadPortalSuporteRoutes } from './portal-suporte/index.js'

export function registerAllStaticApps(): void {
  loadAraraHubRoutes()
  loadPortalAraratechRoutes()
  loadPortalCrmRoutes()
  loadPortalCursosRoutes()
  loadPortalHorasRoutes()
  loadPortalSuporteRoutes()
}
