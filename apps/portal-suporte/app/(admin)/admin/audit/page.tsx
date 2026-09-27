'use client'

import { AuditLogViewer } from '@/components/admin/audit-log-viewer'

/** Auditoria. O viewer busca e pagina sozinho. */
export default function AuditPage() {
  return (
    <div className="pt-14 lg:pt-0">
      <div className="container mx-auto space-y-4 p-6">
        <div>
          <h1 className="text-3xl font-bold">Auditoria</h1>
          <p className="mt-1 text-muted-foreground">Registro de ações realizadas no portal</p>
        </div>
        <AuditLogViewer />
      </div>
    </div>
  )
}
