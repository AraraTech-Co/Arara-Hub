'use client'

import { useEffect, useState } from 'react'
import { araraFetch } from '@/lib/arara/client'
import { ehAgenteAtivo } from '@/lib/arara/auth-storage'
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
      // Quem pode entrar num time: equipe, e não desativado. A rota devolve
      // todo perfil do portal, e desativar não tirava a pessoa daqui.
      setAgents(rows(a).filter((p) => ehAgenteAtivo(p as { role?: unknown; active?: boolean | null })))
      setLoading(false)
    })
  }, [])

  if (loading) return <p className="p-6 text-sm text-muted-foreground">Carregando times…</p>
  return <TeamsClient initialTeams={teams as never} agents={agents as never} />
}
