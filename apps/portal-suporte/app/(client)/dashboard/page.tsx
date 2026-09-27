'use client'

// =============================================================================
// Painel do cliente (client-only / Arara).
//
// Tinha virado uma lista simples com link para /acompanhar. Volta a ter os
// contadores, a lista de chamados com busca/filtro, "abrir chamado" e o chat.
//
// O recorte "meus chamados" é feito aqui: a API devolve os chamados visíveis, e
// a tela filtra pelo usuário logado (id ou e-mail do solicitante).
// =============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import { araraFetch } from '@/lib/arara/client'
import { useAuth } from '@/lib/arara/AuthProvider'
import { RequireAuth } from '@/lib/arara/RequireAuth'
import { DashboardStats } from '@/components/dashboard/dashboard-stats'
import { TicketList } from '@/components/dashboard/ticket-list'
import { CreateTicketDialog } from '@/components/dashboard/create-ticket-dialog'
import { ChatWidget } from '@/components/dashboard/ChatWidget'

type Row = Record<string, unknown>

function rows(res: unknown): Row[] {
  if (Array.isArray(res)) return res as Row[]
  const d = (res as { data?: unknown })?.data
  return Array.isArray(d) ? (d as Row[]) : []
}

const ABERTOS = ['novos_chamados', 'triagem']
const ANDAMENTO = ['em_atendimento', 'em_teste', 'aguardando_cliente']
const RESOLVIDOS = [
  'resolvido',
  'resolvido_com_manual',
  'resolvido_sem_manual',
  'post_mortem',
  'migracao_concluida',
]

function DashboardBody() {
  const { user } = useAuth()
  const [tickets, setTickets] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await araraFetch.get('/api/tickets')
      // Sem recorte no servidor, o cliente não pode ver chamado de terceiros:
      // o vínculo confiável é `user_id` (o id da plataforma). `contact_email`
      // não existe nos chamados, e `requester` guarda um NOME, não e-mail —
      // comparar com o e-mail do logado nunca casaria.
      const meus = rows(res).filter((t) => !!user?.id && t.user_id === user.id)
      setTickets(meus)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível carregar seus chamados.')
    } finally {
      setLoading(false)
    }
  }, [user?.id, user?.email])

  useEffect(() => {
    void load()
  }, [load])

  const stats = useMemo(() => {
    const conta = (lista: string[]) =>
      tickets.filter((t) => lista.includes(String(t.status || ''))).length
    return {
      total: tickets.length,
      open: conta(ABERTOS),
      inProgress: conta(ANDAMENTO),
      closed: conta(RESOLVIDOS),
    }
  }, [tickets])

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 pb-8 pt-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Meus chamados</h1>
          <p className="mt-1 text-muted-foreground">{user?.email}</p>
        </div>
        <CreateTicketDialog userId={user?.id ?? ''} />
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <DashboardStats
        open={stats.open}
        inProgress={stats.inProgress}
        closed={stats.closed}
        total={stats.total}
      />

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando seus chamados…</p>
      ) : (
        <TicketList tickets={tickets as never} total={stats.total} />
      )}

      <ChatWidget />
    </main>
  )
}

export default function ClientDashboardPage() {
  return (
    <RequireAuth>
      <DashboardBody />
    </RequireAuth>
  )
}
