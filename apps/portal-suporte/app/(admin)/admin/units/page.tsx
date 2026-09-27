'use client'

import { UnitsGlobalClient } from './units-global-client'
import { AdminHeader } from '@/components/admin/admin-header'
import { useAuth } from '@/lib/arara/AuthProvider'

export default function UnitsPage() {
  const { user } = useAuth()
  return (
    <div className="flex flex-col">
      <AdminHeader user={{ email: user?.email, fullName: user?.name || user?.email }} />
      <div className="space-y-5 p-4 lg:p-6">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Unidades / Filiais</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Lista de todas as unidades cadastradas por empresa · via Arara
          </p>
        </div>
        <UnitsGlobalClient isAdmin />
      </div>
    </div>
  )
}
