'use client'

import { useEffect, useState } from 'react'
import { araraFetch } from '@/lib/arara/client'
import { IncidentsClient } from './incidents-client'

type Row = Record<string, unknown>
const rows = (r: unknown): Row[] =>
  Array.isArray(r) ? (r as Row[]) : Array.isArray((r as { data?: unknown })?.data) ? ((r as { data: Row[] }).data) : []

const RESOLVIDOS = new Set(['resolvido', 'resolvido_com_manual', 'resolvido_sem_manual', 'fechado'])

/** Incidentes. Recebe a lista + os chamados vinculáveis por props. */
export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<Row[]>([])
  const [tickets, setTickets] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      araraFetch.get('/api/admin/incidents').catch(() => []),
      araraFetch.get('/api/tickets').catch(() => []),
    ]).then(([i, t]) => {
      setIncidents(rows(i))
      setTickets(rows(t).filter((x) => !RESOLVIDOS.has(String(x.status || ''))))
      setLoading(false)
    })
  }, [])

  if (loading) return <p className="p-6 text-sm text-muted-foreground">Carregando incidentes…</p>
  return <IncidentsClient initialIncidents={incidents as never} availableTickets={tickets as never} />
}
