'use client'

import type { ReactNode } from 'react'
import { AdminLayoutShell } from '@/components/admin/admin-layout-shell'
import { RequireAuth } from '@/lib/arara/RequireAuth'

/**
 * Inbox usa o mesmo shell do portal (sidebar). Auth via Arara JWT (client-only).
 */
export default function InboxLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth staffOnly>
      <AdminLayoutShell>{children}</AdminLayoutShell>
    </RequireAuth>
  )
}
