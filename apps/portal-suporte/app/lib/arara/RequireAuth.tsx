'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/lib/arara/AuthProvider'

/** Client-side gate replacing server auth.require / middleware cookies. */
export function RequireAuth({
  children,
  staffOnly = false,
}: {
  children: React.ReactNode
  staffOnly?: boolean
}) {
  const { ready, user, isStaff } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (!ready) return
    if (!user) {
      router.replace(`/auth/login?next=${encodeURIComponent(pathname)}`)
      return
    }
    if (staffOnly && !isStaff) {
      router.replace('/dashboard')
    }
  }, [ready, user, isStaff, staffOnly, router, pathname])

  if (!ready) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        Carregando sessão…
      </div>
    )
  }

  if (!user) return null
  if (staffOnly && !isStaff) return null
  return <>{children}</>
}
