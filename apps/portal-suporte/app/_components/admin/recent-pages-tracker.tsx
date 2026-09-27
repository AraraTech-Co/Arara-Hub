'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { findNavItem } from './admin-sidebar'
import { pushRecentPageToStorage } from '@/lib/admin/dashboard-from-arara'

// Registra silenciosamente a tela do admin visitada (vira atalho no dashboard).
// Só grava telas conhecidas do menu — páginas de detalhe (ex.: /admin/companies/123) são ignoradas.
export function RecentPagesTracker() {
  const pathname = usePathname()
  const lastSent = useRef<string | null>(null)

  useEffect(() => {
    if (!pathname || pathname === lastSent.current) return
    const item = findNavItem(pathname)
    if (!item) return

    lastSent.current = pathname
    pushRecentPageToStorage({ href: item.href, label: item.label })
  }, [pathname])

  return null
}
