'use client'

import { useEffect, useState } from 'react'
import { araraFetch } from '@/lib/arara/client'
import { SlaCalendarClient } from './sla-calendar-client'

type Row = Record<string, unknown>
const rows = (r: unknown): Row[] =>
  Array.isArray(r) ? (r as Row[]) : Array.isArray((r as { data?: unknown })?.data) ? ((r as { data: Row[] }).data) : []

/** Calendário de SLA (feriados/exceções) do ano corrente. */
export default function SlaCalendarPage() {
  const [exceptions, setExceptions] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const year = new Date().getFullYear()

  useEffect(() => {
    araraFetch.get(`/api/admin/sla-calendar?year=${year}`).catch(() => []).then((r) => {
      setExceptions(rows(r))
      setLoading(false)
    })
  }, [year])

  if (loading) return <p className="p-6 text-sm text-muted-foreground">Carregando calendário…</p>
  return <SlaCalendarClient initialExceptions={exceptions as never} currentYear={year} />
}
