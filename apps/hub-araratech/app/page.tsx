'use client'

import { useEffect } from 'react'
import { useAuth } from '@/lib/arara'

export default function Home() {
  const { ready, user } = useAuth()
  useEffect(() => {
    if (!ready) return
    window.location.replace(user ? '/hub/' : '/login/')
  }, [ready, user])
  return <div className="min-h-screen grid place-items-center text-slate-400">Carregando…</div>
}
