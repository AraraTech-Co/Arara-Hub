'use client'

import { useEffect, useState } from 'react'
import { araraFetch } from '@/lib/arara/client'
import { useAuth } from '@/lib/arara/AuthProvider'
import { SlaContractsClient } from './sla-contracts-client'

type Row = Record<string, unknown>
const rows = (r: unknown): Row[] =>
  Array.isArray(r) ? (r as Row[]) : Array.isArray((r as { data?: unknown })?.data) ? ((r as { data: Row[] }).data) : []

/** Contratos de SLA. Editar é admin+ — o servidor reforça. */
export default function SlaContractsPage() {
  const { user } = useAuth()
  const [contracts, setContracts] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const isAdmin = (user?.roles ?? []).some((r) => ['admin', 'master'].includes(r))

  useEffect(() => {
    araraFetch.get('/api/admin/sla-contracts').catch(() => []).then((r) => {
      setContracts(rows(r))
      setLoading(false)
    })
  }, [])

  if (loading) return <p className="p-6 text-sm text-muted-foreground">Carregando contratos…</p>
  return <SlaContractsClient contracts={contracts as never} isAdmin={isAdmin} />
}
