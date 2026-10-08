'use client'

import { Suspense, useEffect, useState } from 'react'
import { arara, araraFetch } from '@/lib/arara/client'
import { ehAgenteAtivo } from '@/lib/arara/auth-storage'

/** `/tickets/kanban` devolve `{ data: {coluna: [...]}, columns, count }`. */
type Resposta = { data?: unknown; count?: number }

function achatar(res: Resposta): Record<string, any>[] {
  const d = res?.data
  if (Array.isArray(d)) return d as Record<string, any>[]
  if (d && typeof d === 'object') {
    return Object.values(d as Record<string, Record<string, any>[]>).flat()
  }
  return []
}
import { useAuth } from '@/lib/arara/AuthProvider'
import { KanbanBoard } from '@/components/kanban/kanban-board'

export default function KanbanPage() {
  const { user } = useAuth()
  const [tickets, setTickets] = useState<any[]>([])
  const [agents, setAgents] = useState<any[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // `/tickets/kanban` e não `/tickets`: é a rota que resolve responsável,
    // co-responsáveis, escalado, quem recebeu e `envolvidos`. A lista simples
    // devolve só `assigned_to` como id cru — com ela, o card não tinha nome
    // para mostrar e o filtro por agente não achava co-responsável.
    Promise.all([
      araraFetch.get<Resposta>('/api/tickets/kanban'),
      arara.profiles().catch(() => ({ data: [] as Record<string, unknown>[] })),
    ])
      .then(([t, p]) => {
        const serialized = achatar(t).map((row) => ({
          id: row.id,
          title: row.title,
          description: row.description ?? null,
          status: row.status || 'novos_chamados',
          priority: row.priority || 'medium',
          severity: row.severity ?? null,
          category: row.category ?? null,
          ticket_number: row.ticket_number ?? null,
          ticket_type: row.ticket_type ?? null,
          source: row.source ?? null,
          tags: row.tags ?? [],
          recurring: Boolean(row.recurring),
          impact: row.impact ?? null,
          is_public: Boolean(row.is_public),
          company_name: row.company_name ?? null,
          company_cnpj: row.company_cnpj ?? null,
          contact_email: row.contact_email ?? null,
          position: Number(row.position ?? 0),
          created_at: row.created_at || row.createdAt || new Date().toISOString(),
          updated_at: row.updated_at || row.updatedAt || new Date().toISOString(),
          user_id: row.user_id ?? null,
          assigned_to: row.assigned_to ?? null,
          // Vinham fixos em null e apagavam o que a rota já resolve — era este
          // o motivo de o card não mostrar responsável nem co-responsável.
          user: row.user ?? null,
          assignee: row.assignee ?? null,
          co_assignees: row.co_assignees ?? [],
          escalated_to_user: row.escalated_to_user ?? null,
          received_by_user: row.received_by_user ?? null,
          envolvidos: row.envolvidos ?? [],
          message_count: 0,
          attachment_count: 0,
          rating: null,
          requester: row.requester ?? null,
          pendency_reason: row.pendency_reason ?? null,
          pendency_type: row.pendency_type ?? null,
          follow_up_date: row.follow_up_date ?? null,
          is_blocked: Boolean(row.is_blocked),
          blocked_reason: row.blocked_reason ?? null,
          column_entered_at: row.column_entered_at ?? null,
          pull_request_url: row.pull_request_url ?? null,
          // Vinha fixo em null: com isso os filtros Vencido / Crítico / No
          // prazo e o botão Escalado nunca casavam com nada, porque o campo
          // era apagado aqui mesmo depois de o servidor mandá-lo.
          sla: row.sla ?? null,
        }))
        setTickets(serialized)

        // `ehAgenteAtivo` e não a lista literal: `support` é agente de suporte
        // e ficava de fora — 7 dos 11 perfis; e quem foi desativado não pode
        // continuar sendo oferecido. Ver lib/arara/auth-storage.ts.
        const staff = (p.data || [])
          .filter((pr) => ehAgenteAtivo(pr))
          .map((pr) => ({
            id: pr.id,
            full_name: pr.full_name || pr.fullName || pr.name || pr.email || 'Agente',
            email: pr.email || '',
            role: pr.role || 'developer',
          }))
        setAgents(staff)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Carregando kanban…</div>
  }

  if (error) {
    return (
      <div className="m-6 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm">
        {error}
      </div>
    )
  }

  return (
    <div className="flex flex-col overflow-hidden pt-14 lg:pt-0" style={{ height: '100dvh' }}>
      <main className="flex flex-1 min-h-0 flex-col overflow-hidden px-4">
        <div className="flex shrink-0 items-center justify-between py-5">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Kanban de Suporte</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Fluxo via Arara API · {tickets.length} tickets
            </p>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          <Suspense fallback={<div className="h-full animate-pulse rounded-lg bg-muted" />}>
            <KanbanBoard
              tickets={tickets}
              agents={agents}
              currentUser={{ id: user?.id || 'me', role: user?.roles?.[0] || 'developer' }}
            />
          </Suspense>
        </div>
      </main>
    </div>
  )
}
