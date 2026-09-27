'use client'

import { CrmUsersManager } from '@/components/admin/crm-users-manager'

/**
 * Usuários do CRM administrados a partir daqui — PRD do hub de login central
 * (portal-crm/docs/plans/PRD-hub-login-central-e-admin-crm.md).
 *
 * Tela própria, e não uma aba dentro de `users-manager.tsx`: aquele arquivo já
 * passa de mil linhas, são públicos diferentes e credenciais diferentes.
 */
export default function CrmUsuariosPage() {
  return <CrmUsersManager />
}
