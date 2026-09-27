'use client'

import { UnitContactsClient } from './unit-contacts-client'
import { AdminHeader } from '@/components/admin/admin-header'
import { useAuth } from '@/lib/arara/AuthProvider'

export default function AvisosWhatsappPage() {
  const { user } = useAuth()
  return (
    <div className="flex flex-col">
      <AdminHeader user={{ email: user?.email, fullName: user?.name || user?.email }} />
      <div className="p-4 lg:p-6">
        <UnitContactsClient isAdmin />
      </div>
    </div>
  )
}
