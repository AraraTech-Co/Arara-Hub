'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/lib/arara'
import { Sidebar } from '@/components/crm/Sidebar'

export function AppShell({ children }: { children: React.ReactNode }) {
  const { ready, user } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (!ready) return
    if (!user) router.replace('/login')
  }, [ready, user, router])

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-gray-500">
        Carregando…
      </div>
    )
  }

  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-gray-500">
        Redirecionando para login…
      </div>
    )
  }

  // Avoid flash of shell on login
  if (pathname === '/login') return <>{children}</>

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-slate-50 p-4 sm:p-6 pt-18 lg:pt-6">{children}</main>
    </div>
  )
}
