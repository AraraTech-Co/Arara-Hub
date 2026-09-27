'use client'

import type { ReactNode } from 'react'
import { AdminLayoutShell } from '@/components/admin/admin-layout-shell'
import { RequireAuth } from '@/lib/arara/RequireAuth'

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth staffOnly>
      <AdminLayoutShell>{children}</AdminLayoutShell>
    </RequireAuth>
  )
}
