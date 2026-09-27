'use client'

import { useEffect } from 'react'
import { useAuth } from '@/lib/arara'
import { getHubModules } from '@/config/hub-modules'
import { HubHeader } from '@/components/hub/HubHeader'
import { ModuleCard } from '@/components/hub/ModuleCard'
import { QuickLinks } from '@/components/hub/QuickLinks'

export default function HubPage() {
  const { ready, user, memberships } = useAuth()

  useEffect(() => {
    if (ready && !user) window.location.replace('/login/')
  }, [ready, user])

  if (!ready || !user) {
    return <div className="min-h-screen grid place-items-center text-slate-400">Carregando…</div>
  }

  const modules = getHubModules(memberships)
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'
  const firstName = (user.name || user.email || 'você').split(' ')[0]

  return (
    <div className="min-h-screen bg-slate-50">
      <HubHeader />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">{greeting}, {firstName} 👋</h1>
          <p className="text-slate-500 mt-1">O que você precisa hoje?</p>
        </div>
        {modules.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <p className="text-slate-500">Você ainda não tem acesso a nenhum sistema.</p>
            <p className="text-sm text-slate-400 mt-1">Fale com o administrador para liberar seu acesso.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {modules.map((m) => <ModuleCard key={m.id} module={m} />)}
          </div>
        )}
        <QuickLinks />
      </main>
    </div>
  )
}
