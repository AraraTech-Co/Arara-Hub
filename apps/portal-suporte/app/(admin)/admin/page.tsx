'use client'

import { useEffect, useMemo, useState } from 'react'
import { arara } from '@/lib/arara/client'
import { useAuth } from '@/lib/arara/AuthProvider'
import { AdminDashboard } from '@/components/admin/admin-dashboard'
import { Button } from '@/components/ui/button'
import {
  deriveDashboardFromArara,
  readRecentPagesFromStorage,
  type DashboardDerived,
} from '@/lib/admin/dashboard-from-arara'

export default function AdminPage() {
  const { user, ready } = useAuth()
  const [tickets, setTickets] = useState<Record<string, unknown>[]>([])
  const [profiles, setProfiles] = useState<Record<string, unknown>[]>([])
  const [incidents, setIncidents] = useState<Record<string, unknown>[]>([])
  const [recentPages, setRecentPages] = useState(() =>
    typeof window !== 'undefined' ? readRecentPagesFromStorage() : [],
  )
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setRecentPages(readRecentPagesFromStorage())
  }, [])

  useEffect(() => {
    if (!ready) return
    let cancelled = false
    setLoading(true)
    Promise.all([
      arara.tickets(),
      arara.profiles().catch(() => ({ data: [] as Record<string, unknown>[] })),
      arara.incidents().catch(() => ({ data: [] as Record<string, unknown>[] })),
    ])
      .then(([t, p, i]) => {
        if (cancelled) return
        setTickets(t.data || [])
        setProfiles(p.data || [])
        setIncidents(i.data || [])
        setError('')
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || 'Falha ao carregar dashboard')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [ready])

  const props: DashboardDerived | null = useMemo(() => {
    if (!user) return null
    return deriveDashboardFromArara({
      tickets,
      profiles,
      incidents,
      userId: user.id,
      userEmail: user.email,
      userRole: user.roles?.[0] || 'user',
      recentPages,
    })
  }, [tickets, profiles, incidents, user, recentPages])

  if (!ready || loading || !props) {
    return (
      <div className="pt-14 lg:pt-0">
        <main className="mx-auto w-full max-w-[1800px] px-4 py-8 sm:px-6 lg:px-8 2xl:px-12">
          <p className="text-sm text-muted-foreground">Carregando Painel Operacional…</p>
        </main>
      </div>
    )
  }

  if (error) {
    return (
      <div className="pt-14 lg:pt-0">
        <main className="mx-auto w-full max-w-[1800px] px-4 py-8 sm:px-6 lg:px-8 2xl:px-12">
          {/* Media 1,23:1 no tema claro — a mensagem de erro era literalmente
              invisível para quem não estava no tema escuro. E sem `role="alert"`
              o leitor de tela não anunciava nada. */}
          <div role="alert" className="rounded-lg border border-sem-error-bd bg-sem-error px-4 py-3 text-sm text-sem-error-fg">
            <p className="font-medium">Não foi possível carregar o painel.</p>
            <p className="mt-1 text-sem-error-fg/90">{error}</p>
            <Button size="sm" variant="outline" className="mt-3 h-11" onClick={() => window.location.reload()}>
              Tentar novamente
            </Button>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="pt-14 lg:pt-0">
      <AdminDashboard {...(props as any)} />
    </div>
  )
}
