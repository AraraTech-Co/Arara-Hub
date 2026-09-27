'use client'

import DevOpsManager from '@/components/devops/DevOpsManager'
import { AdminHeader } from '@/components/admin/admin-header'
import { useAuth } from '@/lib/arara/AuthProvider'

export default function DevOpsPage() {
  const { user } = useAuth()
  return (
    <div className="flex flex-col">
      <AdminHeader user={{ email: user?.email, fullName: user?.name || user?.email }} />
      <div className="devops-theme min-h-screen bg-devops-surface">
        <div className="px-6 pb-4 pt-6">
          <h1 className="mt-1 text-2xl font-bold text-white">DevOps</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Servidores SSH cadastrados via Arara. Terminal/SSH ao vivo depende do backend DevOps.
          </p>
        </div>
        <DevOpsManager />
      </div>
    </div>
  )
}
