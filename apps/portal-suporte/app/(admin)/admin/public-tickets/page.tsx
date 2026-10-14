'use client'

// Chamados abertos pelo site, com triagem pela equipe.
//
// A tela espera uma LISTA, e sempre esperou — mas o `.catch(() => [])` que
// havia aqui engolia a resposta e a tabela ficava vazia com os números em
// zero, sem nada na tela dizendo que a busca falhou. Agora a falha aparece,
// com o motivo e um botão para tentar de novo: tela vazia que parece "não há
// chamados" é pior que erro visível.
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
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
  const [erro, setErro] = useState<string | null>(null)
  const [tentativa, setTentativa] = useState(0)

  useEffect(() => {
    let vivo = true
    setLoading(true)
    setErro(null)
    Promise.all([
      araraFetch.get('/api/tickets/public'),
      // A lista de agentes é acessório da tabela: se ela falhar, a tela ainda
      // serve, então esta é a única que continua tolerando erro.
      araraFetch.get('/api/profiles/agents').catch(() => []),
    ])
      .then(([t, a]) => {
        if (!vivo) return
        setTickets(rows(t))
        setAgents(rows(a))
      })
      .catch((err: unknown) => {
        if (!vivo) return
        setErro(err instanceof Error ? err.message : 'Não deu para carregar os chamados do site.')
      })
      .finally(() => { if (vivo) setLoading(false) })
    return () => { vivo = false }
  }, [tentativa])

  const stats = {
    total: tickets.length,
    novos: tickets.filter((t) => ABERTOS.has(String(t.status || ''))).length,
    resolvidos: tickets.filter((t) => RESOLVIDOS.has(String(t.status || ''))).length,
  }

  if (loading) return <p className="p-6 text-sm text-muted-foreground">Carregando chamados públicos…</p>
  if (erro) {
    return (
      <div className="pt-14 lg:pt-0">
        <div className="m-6 rounded-lg border border-destructive/40 bg-destructive/10 p-4">
          <p className="text-sm font-medium text-destructive">Os chamados do site não carregaram.</p>
          <p className="mt-1 text-xs text-destructive/90">{erro}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => setTentativa((n) => n + 1)}
          >
            Tentar de novo
          </Button>
        </div>
      </div>
    )
  }
  return (
    <div className="pt-14 lg:pt-0">
      <PublicTicketsTable tickets={tickets as never} agents={agents as never} stats={stats as never} />
    </div>
  )
}
