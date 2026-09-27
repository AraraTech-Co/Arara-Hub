'use client'

import { useEffect, useState } from 'react'
import { araraFetch } from '@/lib/arara/client'
import { PublicTicketsTable } from '@/components/admin/public-tickets-table'

type Row = Record<string, unknown>
const rows = (r: unknown): Row[] =>
  Array.isArray(r) ? (r as Row[]) : Array.isArray((r as { data?: unknown })?.data) ? ((r as { data: Row[] }).data) : []

const ABERTOS = new Set(['novos_chamados', 'triagem'])
const RESOLVIDOS = new Set(['resolvido', 'resolvido_com_manual', 'resolvido_sem_manual', 'fechado'])

/** Chamados abertos pelo site (públicos), com triagem pela equipe. */
export default function PublicTicketsPage() {
  const [tickets, setTickets] = useState<Row[]>([])
  const [agents, setAgents] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      araraFetch.get('/api/tickets/public').catch(() => []),
      araraFetch.get('/api/profiles/agents').catch(() => []),
    ]).then(([t, a]) => {
      setTickets(rows(t))
      setAgents(rows(a))
      setLoading(false)
    })
  }, [])

  const stats = {
    total: tickets.length,
    novos: tickets.filter((t) => ABERTOS.has(String(t.status || ''))).length,
    resolvidos: tickets.filter((t) => RESOLVIDOS.has(String(t.status || ''))).length,
  }

  if (loading) return <p className="p-6 text-sm text-muted-foreground">Carregando chamados públicos…</p>
  return (
    <div className="pt-14 lg:pt-0">
      <PublicTicketsTable tickets={tickets as never} agents={agents as never} stats={stats as never} />
    </div>
  )
}
