'use client'

import { useEffect, useState } from 'react'
import { araraFetch } from '@/lib/arara/client'
import { AutomationClient } from './automation-client'

type Row = Record<string, unknown>
const rows = (r: unknown): Row[] =>
  Array.isArray(r) ? (r as Row[]) : Array.isArray((r as { data?: unknown })?.data) ? ((r as { data: Row[] }).data) : []

/** Automações. O client recarrega sozinho depois; aqui só o estado inicial. */
export default function AutomationPage() {
  const [rules, setRules] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    araraFetch.get('/api/admin/automation').catch(() => []).then((r) => {
      setRules(rows(r))
      setLoading(false)
    })
  }, [])

  if (loading) return <p className="p-6 text-sm text-muted-foreground">Carregando automações…</p>
  return <AutomationClient initialRules={rules as never} />
}
