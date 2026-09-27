'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/arara'

export default function HomePage() {
  const { ready, user } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!ready) return
    router.replace(user ? '/dashboard' : '/login')
  }, [ready, user, router])

  return (
    <div className="flex h-screen items-center justify-center text-sm text-gray-500">
      Carregando…
    </div>
  )
}
