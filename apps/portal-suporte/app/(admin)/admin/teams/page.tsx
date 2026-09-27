'use client'

import { useEffect, useState } from 'react'
import { araraFetch } from '@/lib/arara/client'
import { TeamsClient } from './teams-client'

type Row = Record<string, unknown>
const rows = (r: unknown): Row[] =>
  Array.isArray(r) ? (r as Row[]) : Array.isArray((r as { data?: unknown })?.data) ? ((r as { data: Row[] }).data) : []

/** Times. O TeamsClient recebe times + agentes por props (antes vinham do servidor). */
export default function TeamsPage() {
  const [teams, setTeams] = useState<Row[]>([])
  const [agents, setAgents] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      araraFetch.get('/api/admin/teams').catch(() => []),
      araraFetch.get('/api/profiles/agents').catch(() => []),
    ]).then(([t, a]) => {
      setTeams(rows(t))
      setAgents(rows(a))
      setLoading(false)
    })
  }, [])

  if (loading) return <p className="p-6 text-sm text-muted-foreground">Carregando times…</p>
  return <TeamsClient initialTeams={teams as never} agents={agents as never} />
}
