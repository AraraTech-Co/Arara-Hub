'use client'

import { PermissionsClient } from '@/components/admin/permissions-client'

/** Permissões (RBAC). O client busca sozinho — só precisa estar montado. */
export default function PermissionsPage() {
  return (
    <div className="pt-14 lg:pt-0">
      <PermissionsClient />
    </div>
  )
}
