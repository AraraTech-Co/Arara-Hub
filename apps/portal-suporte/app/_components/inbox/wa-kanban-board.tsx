'use client'

// =============================================================================
// Kanban das conversas de WhatsApp — colunas = fases (lib/wa-phase.ts).
//
// Vive só dentro da tela do WhatsApp: é a visão de operação do atendimento
// ("o que já foi pego, o que está parado"), não um board de chamados.
//
// Conversa que virou chamado SAI daqui: o acompanhamento passa para o kanban
// de chamados em /admin/kanban. O rodapé do board leva até lá.
//
// Arrastar usa exatamente a mesma rota dos chips de fase do thread-pane
// (PATCH /api/whatsapp/[id]), então a permissão e as automações são as mesmas.
// =============================================================================

import { useCallback, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { ExternalLink, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'
import { CloseReasonDialog } from './close-reason-dialog'
import { whatsappApi, type WAInboxConversation, type WAPhase } from '@/lib/api/whatsapp'
import { WA_PHASES, isWAPhase, waPhaseLabel } from '@/lib/wa-phase'
import { cn } from '@/lib/utils'
import { displayName } from './conversation-meta'
import { WAKanbanCard, WAKanbanCardPreview } from './wa-kanban-card'

interface WAKanbanBoardProps {
  conversations: WAInboxConversation[]
  selectedId: string | null
  onSelect: (id: string) => void
  loading: boolean
  /** Mudar fase exige developer+, igual aos chips do thread-pane. */
  canMovePhase: boolean
}

export function WAKanbanBoard({
  conversations,
  selectedId,
  onSelect,
  loading,
  canMovePhase,
}: WAKanbanBoardProps) {
  const { toast } = useToast()
  const [query, setQuery] = useState('')
  const [draggingId, setDraggingId] = useState<string | null>(null)
  // Fase otimista por conversa: o stream leva até 3s para confirmar, e sem isto
  // o card voltaria para a coluna de origem logo depois do drop.
  const [pending, setPending] = useState<Record<string, WAPhase>>({})
  // Drop em "Resolvido" esperando o motivo de encerramento.
  const [pendingClose, setPendingClose] = useState<{ id: string; target: WAPhase } | null>(null)
  const [closing, setClosing] = useState(false)

  // Arrasto só começa após 8px — abaixo disso continua sendo clique, que abre
  // a conversa.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  // Só vale o otimista que o servidor ainda não confirmou. Sem esta poda, uma
  // fase mudada depois por outra via (chips do thread, automação) ficaria presa
  // no valor do último arrasto.
  const unconfirmed = useMemo(() => {
    const map = new Map<string, WAPhase>()
    for (const c of conversations) {
      const optimistic = pending[c.id]
      if (optimistic !== undefined && optimistic !== c.phase) map.set(c.id, optimistic)
    }
    return map
  }, [pending, conversations])

  const phaseOf = useCallback(
    (c: WAInboxConversation): WAPhase => unconfirmed.get(c.id) ?? c.phase,
    [unconfirmed],
  )

  // Conversas que já viraram chamado saem do board.
  const { visible, withTicket } = useMemo(() => {
    const q = query.trim().toLowerCase()
    const visible: WAInboxConversation[] = []
    let withTicket = 0
    for (const c of conversations) {
      if (c.ticket) {
        withTicket += 1
        continue
      }
      if (q) {
        const haystack = `${displayName(c)} ${c.company?.name ?? ''} ${c.remote_jid}`.toLowerCase()
        if (!haystack.includes(q)) continue
      }
      visible.push(c)
    }
    return { visible, withTicket }
  }, [conversations, query])

  const byPhase = useMemo(() => {
    const map = new Map<WAPhase, WAInboxConversation[]>(WA_PHASES.map((p) => [p.key, []]))
    for (const c of visible) {
      map.get(phaseOf(c))?.push(c)
    }
    return map
  }, [visible, phaseOf])

  const dragging = draggingId ? visible.find((c) => c.id === draggingId) ?? null : null

  function handleDragStart(event: DragStartEvent) {
    setDraggingId(String(event.active.id))
  }

  async function handleDragEnd(event: DragEndEvent) {
    setDraggingId(null)
    const { active, over } = event
    if (!over) return

    const id = String(active.id)
    const target = String(over.id)
    if (!isWAPhase(target)) return

    const conversation = conversations.find((c) => c.id === id)
    if (!conversation) return
    const from = phaseOf(conversation)
    if (from === target) return

    // Arrastar para "Resolvido" é uma conclusão — o motivo é obrigatório. Abre o
    // mesmo diálogo do botão Concluir em vez de deixar o servidor recusar com um
    // toast de erro depois que o card já pulou de coluna.
    if (target === 'resolvido' && !conversation.close_reason) {
      setPendingClose({ id, target })
      return
    }

    await moverConversa(id, target, conversation)
  }

  /** Move de fato. Separado do drop porque a conclusão passa antes pelo diálogo. */
  async function moverConversa(
    id: string,
    target: WAPhase,
    conversation: WAInboxConversation,
    closeReasonId?: string,
  ) {
    setPending((p) => ({ ...p, [id]: target }))
    try {
      await whatsappApi.updateConversation(id, { phase: target, closeReasonId })
      toast({
        title: 'Fase atualizada',
        description: `${displayName(conversation)} → ${waPhaseLabel(target)}`,
      })
    } catch (err) {
      // Volta o card para a coluna de origem — o servidor não aceitou.
      setPending((p) => {
        const next = { ...p }
        delete next[id]
        return next
      })
      toast({
        title: 'Não foi possível mover a conversa',
        description: err instanceof Error ? err.message : 'Tente novamente.',
        variant: 'destructive',
      })
    }
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex h-full min-h-0 flex-col gap-3 p-3">
        <div className="flex shrink-0 items-center gap-3">
          <div className="relative max-w-xs flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nome, empresa ou telefone…"
              className="pl-8"
            />
          </div>
          {withTicket > 0 && (
            <Link
              href="/admin/kanban"
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              {withTicket} {withTicket === 1 ? 'virou chamado' : 'viraram chamado'}
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </Link>
          )}
        </div>

        <p className="flex shrink-0 items-center justify-center text-[11px] text-muted-foreground/60 md:hidden">
          ← deslize para ver as {WA_PHASES.length} colunas →
        </p>

        <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-1">
          {WA_PHASES.map((phase) => (
            <PhaseColumn
              key={phase.key}
              phaseKey={phase.key}
              label={phase.label}
              accent={phase.accent}
              conversations={byPhase.get(phase.key) ?? []}
              selectedId={selectedId}
              onSelect={onSelect}
              canMovePhase={canMovePhase}
              loading={loading && conversations.length === 0}
            />
          ))}
        </div>
      </div>

      {/* O card que segue o cursor. Sem overlay, o arrasto some ao sair da coluna. */}
      <DragOverlay dropAnimation={null}>
        {dragging && (
          <div className="w-[264px]">
            <WAKanbanCardPreview conversation={dragging} />
          </div>
        )}
      </DragOverlay>
      <CloseReasonDialog
        open={pendingClose !== null}
        onOpenChange={(v) => !v && setPendingClose(null)}
        busy={closing}
        onConfirm={async (closeReasonId) => {
          if (!pendingClose) return
          const conv = conversations.find((c) => c.id === pendingClose.id)
          if (!conv) return setPendingClose(null)
          setClosing(true)
          await moverConversa(pendingClose.id, pendingClose.target, conv, closeReasonId)
          setClosing(false)
          setPendingClose(null)
        }}
      />
    </DndContext>
  )
}

// ─── Coluna ───────────────────────────────────────────────────────────────────

interface PhaseColumnProps {
  phaseKey: WAPhase
  label: string
  accent: string
  conversations: WAInboxConversation[]
  selectedId: string | null
  onSelect: (id: string) => void
  canMovePhase: boolean
  loading: boolean
}

function PhaseColumn({
  phaseKey,
  label,
  accent,
  conversations,
  selectedId,
  onSelect,
  canMovePhase,
  loading,
}: PhaseColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: phaseKey })

  return (
    <section
      ref={setNodeRef}
      aria-label={`${label} — ${conversations.length} conversas`}
      className={cn(
        'flex w-[280px] shrink-0 flex-col rounded-xl border border-border bg-muted/30 transition-colors',
        isOver && 'border-primary bg-muted/70',
      )}
    >
      <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <span className={cn('rounded-full border px-2 py-0.5 text-xs font-medium', accent)}>
          {label}
        </span>
        <Badge className="bg-muted px-1.5 py-0 text-[10px] leading-4 text-muted-foreground">
          {conversations.length}
        </Badge>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
        {loading ? (
          <p className="px-1 py-2 text-xs text-muted-foreground">Carregando…</p>
        ) : conversations.length === 0 ? (
          <p className="px-1 py-2 text-xs text-muted-foreground/70">Nenhuma conversa aqui.</p>
        ) : (
          conversations.map((c) => (
            <WAKanbanCard
              key={c.id}
              conversation={c}
              selected={c.id === selectedId}
              onSelect={onSelect}
              draggable={canMovePhase}
            />
          ))
        )}
      </div>
    </section>
  )
}
