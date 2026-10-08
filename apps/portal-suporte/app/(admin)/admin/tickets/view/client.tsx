'use client'

// =============================================================================
// Detalhe do chamado (client-only / Arara).
//
// Esta tela é aberta por /admin/tickets/[id] e /dashboard/tickets/[id], que
// redirecionam para cá com ?id= — rota dinâmica não sobrevive ao export
// estático, então o id viaja na query.
//
// Ela monta os componentes ricos que já existiam no portal (detalhes, mensagens,
// anexos, checklist, timeline, comentários internos). Antes da migração para a
// plataforma esses componentes recebiam os dados do servidor (Prisma); agora a
// tela busca tudo na API central e passa por props. Os componentes em si não
// mudaram de contrato.
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { arara, araraFetch } from '@/lib/arara/client'
import { voltarAoQuadro } from '@/lib/voltar-ao-quadro'
import { useAuth } from '@/lib/arara/AuthProvider'
import { Button } from '@/components/ui/button'
import { TicketSummaryCard } from '@/components/tickets/ticket-summary-card'
import { AdminTicketDetails } from '@/components/tickets/admin-ticket-details'
import { TicketActionsCard } from '@/components/tickets/ticket-actions-card'
import { TicketMessages } from '@/components/tickets/ticket-messages'
import { TicketAttachments, type AttachmentItem } from '@/components/tickets/ticket-attachments'
import { TicketTimeline } from '@/components/tickets/ticket-timeline'
import { TicketInternalComments } from '@/components/tickets/ticket-internal-comments'
import { companiesApi } from '@/lib/api/companies'
import { ehAgenteAtivo } from '@/lib/arara/auth-storage'

type Row = Record<string, unknown>

/** Perfil como a plataforma devolve em /profiles. */
interface ProfileRow {
  id: string
  full_name: string | null
  email: string
  role: string
}

/** Lista da API pode vir como `{data:[…]}` ou como array puro. */
function rows(res: unknown): Row[] {
  if (Array.isArray(res)) return res as Row[]
  if (res && typeof res === 'object') {
    const d = (res as { data?: unknown }).data
    if (Array.isArray(d)) return d as Row[]
    // /tickets/:id/events devolve { data: { data: [...], total } }
    if (d && typeof d === 'object' && Array.isArray((d as { data?: unknown }).data)) {
      return (d as { data: Row[] }).data
    }
  }
  return []
}

export default function AdminTicketViewPage() {
  const params = useSearchParams()
  const router = useRouter()
  const id = params?.get('id') || ''
  const { user } = useAuth()

  const [ticket, setTicket] = useState<Row | null>(null)
  const [messages, setMessages] = useState<Row[]>([])
  const [agents, setAgents] = useState<ProfileRow[]>([])
  const [companies, setCompanies] = useState<string[]>([])
  const [attachments, setAttachments] = useState<AttachmentItem[]>([])
  const [coResponsaveis, setCoResponsaveis] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!id || id === '_') {
      setLoading(false)
      return
    }
    setError('')
    try {
      // O ticket é o único obrigatório; o resto é contexto e não pode derrubar a
      // tela se uma rota falhar (ex.: anexos indisponíveis).
      const t = await arara.ticket(id)
      setTicket(t)

      const [msgs, profs, comps, atts] = await Promise.all([
        araraFetch.get(`/api/tickets/${id}/messages`).catch(() => []),
        araraFetch.get('/api/profiles').catch(() => []),
        // Pelo cliente da API, não por fetch cru: é ele que aplica as duas
        // regras do cadastro — pedir tudo (o padrão da rota é 50) e devolver
        // só as cadastradas, sem as 122 de legado. Ver lib/api/companies.ts.
        companiesApi.list().then((r) => r.data ?? []).catch(() => []),
        araraFetch.get(`/api/tickets/${id}/attachments`).catch(() => []),
      ])
      // Co-responsáveis vivem numa rota própria — a listagem do chamado não os
      // traz, e sem eles o card de ações abre o seletor sempre vazio.
      setCoResponsaveis(rows(await araraFetch.get(`/api/tickets/${id}/co-assignees`).catch(() => [])))

      setMessages(rows(msgs))
      setAgents(
        rows(profs)
          // `support` é agente de suporte e precisa poder ser responsável.
          .filter((p) => ehAgenteAtivo(p))
          .map((p) => ({
            id: String(p.id),
            full_name: (p.full_name as string) ?? null,
            email: String(p.email || ''),
            role: String(p.role || ''),
          })),
      )
      setCompanies(
        rows(comps)
          .map((c) => String(c.name || c.company_name || ''))
          .filter(Boolean),
      )
      setAttachments(rows(atts) as unknown as AttachmentItem[])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível carregar o chamado.')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  // O ticket traz `assigned_to` como id; a ficha mostra o nome.
  const assigneeName =
    agents.find((a) => a.id === String(ticket?.assigned_to || ''))?.full_name ?? null

  // A API devolve `assigned_to` como id cru; o card de ações espera o objeto
  // com nome. Sem resolver aqui, o campo Responsável abre em branco mesmo
  // quando o chamado TEM responsável — foi o que apareceu na tela.
  const ticketParaAcoes = ticket
    ? {
        id: String(ticket.id),
        status: String(ticket.status || ''),
        priority: String(ticket.priority || ''),
        assigned_to:
          agents.find((a) => a.id === String(ticket.assigned_to || '')) ?? null,
        co_assignees: coResponsaveis.map((c) => ({
          id: String(c.id),
          full_name: (c.full_name as string) ?? null,
          email: String(c.email || ''),
          role: String(c.role || ''),
        })),
      }
    : null

  const userRole = user?.roles?.[0] ?? 'developer'
  const currentUserId = user?.id ?? ''

  if (loading) {
    return (
      <div className="flex flex-col">
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  if (!id || id === '_') {
    return (
      <Aviso titulo="Chamado não informado">
        Abra um chamado pela lista ou pelo kanban.
      </Aviso>
    )
  }

  if (error || !ticket) {
    return (
      <Aviso titulo="Não foi possível abrir o chamado">
        {error || 'Chamado não encontrado.'}
        <div className="pt-3">
          <Button size="sm" variant="secondary" onClick={() => void load()}>
            Tentar novamente
          </Button>
        </div>
      </Aviso>
    )
  }

  // Mensagens públicas (conversa com o cliente) e internas (só equipe) vivem na
  // mesma rota, separadas por `is_internal`.
  const publicas = messages.filter((m) => !m.is_internal)
  const internas = messages.filter((m) => m.is_internal)

  return (
    <div className="flex flex-col">
      <main className="space-y-4 p-4 lg:p-6">
        {/* Voltar PELO HISTÓRICO, não por href fixo: o quadro guarda os
            filtros na URL, e um link fixo os jogava fora. */}
        <button
          type="button"
          onClick={() => voltarAoQuadro(router)}
          className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Voltar ao kanban
        </button>

        <TicketSummaryCard
          ticket={ticket}
          assigneeName={assigneeName}
          onSaved={load}
        />

        {/* Edição completa (status, prioridade, responsável, empresa…). Fica
            recolhida para a ficha acima ser o que se lê primeiro. */}
        <details className="rounded-2xl border border-border bg-card">
          <summary className="cursor-pointer select-none px-5 py-3 text-sm font-semibold text-foreground">
            Editar chamado
          </summary>
          <div className="border-t border-border p-2">
            <AdminTicketDetails
              ticket={ticket as never}
              agents={agents}
              companies={companies}
              userRole={userRole}
              ocultarAcoes
            />
          </div>
        </details>

        {/* Status, prioridade, responsável, escalar e co-responsáveis ficam
            SEMPRE visíveis. Estavam dentro de "Editar chamado", escondidos
            atrás de um clique, no espaço que o checklist ocupava sem uso. */}
        <div className="grid gap-4 lg:grid-cols-2">
          {ticketParaAcoes && (
            <TicketActionsCard
              ticket={ticketParaAcoes}
              agents={agents}
              userRole={userRole}
              onRefresh={load}
            />
          )}
          <TicketTimeline ticketId={id} />
        </div>

        <TicketAttachments
          ticketId={id}
          attachments={attachments}
          canUpload
          canDelete
        />

        <TicketInternalComments
          ticketId={id}
          comments={internas as never}
          currentUserId={currentUserId}
          // Recarrega a tela: sem isto o comentário enviado só aparecia no F5
          // (router.refresh não recarrega nada num export estático).
          onChanged={() => void load()}
        />

        <TicketMessages
          ticketId={id}
          messages={publicas as never}
          currentUserId={currentUserId}
          agents={agents}
        />
      </main>
    </div>
  )
}

function Aviso({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="m-6 space-y-2 rounded-xl bg-card p-6 shadow-[var(--shadow-media)]">
      <h1 className="text-lg font-semibold text-foreground">{titulo}</h1>
      <div className="text-sm text-muted-foreground">{children}</div>
    </div>
  )
}
