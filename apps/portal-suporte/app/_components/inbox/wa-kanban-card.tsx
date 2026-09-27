'use client'

import { memo } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { WAInboxConversation } from '@/lib/api/whatsapp'
import { ContactAvatar } from './contact-avatar'
import {
  ConversationChips,
  displayName,
  isInQueue,
  previewText,
  relativeTime,
} from './conversation-meta'

// ─── Corpo do card ────────────────────────────────────────────────────────────
// Puramente visual: o board reusa isto no DragOverlay, onde registrar o mesmo
// id no dnd-kit uma segunda vez quebraria o arrasto.

interface CardBodyProps {
  conversation: WAInboxConversation
  selected?: boolean
  onSelect?: (id: string) => void
  className?: string
  style?: React.CSSProperties
  innerRef?: (node: HTMLElement | null) => void
  dragProps?: Record<string, unknown>
}

function CardBody({
  conversation: c,
  selected,
  onSelect,
  className,
  style,
  innerRef,
  dragProps,
}: CardBodyProps) {
  const name = displayName(c)

  return (
    <button
      ref={innerRef}
      type="button"
      onClick={onSelect ? () => onSelect(c.id) : undefined}
      aria-current={selected ? 'true' : undefined}
      aria-label={`Conversa com ${name}. Abrir para responder ou mudar a fase.`}
      style={style}
      className={cn(
        // select-none/touch-none: sem isto o arrasto vira seleção de texto no
        // desktop e rolagem da coluna no toque (recomendação do dnd-kit).
        'w-full select-none touch-none rounded-lg border border-border bg-card p-2.5 text-left',
        'transition-colors duration-150 hover:bg-muted/60',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        selected && 'border-primary bg-muted',
        className,
      )}
      {...dragProps}
    >
      <span className="flex items-start gap-2">
        <ContactAvatar name={name} seed={c.remote_jid} />

        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate text-sm font-medium text-foreground">{name}</span>
            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
              {relativeTime(c.updated_at)}
            </span>
          </span>

          {c.company?.name && (
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
              {c.company.name}
            </span>
          )}

          <span className="mt-1 flex items-center justify-between gap-2">
            <span className="truncate text-xs text-muted-foreground/80">{previewText(c)}</span>
            {c.unread_count > 0 && (
              <Badge className="shrink-0 bg-primary px-1.5 py-0 text-[10px] leading-4 text-primary-foreground">
                {c.unread_count}
              </Badge>
            )}
          </span>
        </span>
      </span>

      <span className="mt-1.5 flex flex-wrap items-center gap-1">
        {/* O ponto do board: enxergar de longe o que ninguém pegou ainda. */}
        {isInQueue(c) && (
          <Badge className="border border-sem-warning-bd bg-sem-warning px-1.5 py-0 text-[10px] leading-4 text-sem-warning-fg">
            Sem atendente
          </Badge>
        )}
        <ConversationChips conversation={c} />
      </span>
    </button>
  )
}

/** Cópia estática que segue o cursor durante o arrasto. */
export function WAKanbanCardPreview({ conversation }: { conversation: WAInboxConversation }) {
  return <CardBody conversation={conversation} className="rotate-1 shadow-lg" />
}

// ─── Card do board ────────────────────────────────────────────────────────────

interface WAKanbanCardProps {
  conversation: WAInboxConversation
  selected: boolean
  onSelect: (id: string) => void
  /** Falso para quem não tem permissão de mudar fase — o card só abre a conversa. */
  draggable: boolean
}

/**
 * Clicar abre a conversa; o arrasto só começa depois de 8px, então o clique
 * continua funcionando normalmente.
 */
export const WAKanbanCard = memo(function WAKanbanCard({
  conversation,
  selected,
  onSelect,
  draggable,
}: WAKanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: conversation.id,
    disabled: !draggable,
  })

  return (
    <CardBody
      conversation={conversation}
      selected={selected}
      onSelect={onSelect}
      innerRef={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      dragProps={{ ...attributes, ...listeners }}
      className={cn(
        draggable && 'cursor-grab active:cursor-grabbing',
        // Enquanto arrasta, o original vira fantasma — o DragOverlay desenha
        // o card que segue o cursor.
        isDragging && 'opacity-40',
      )}
    />
  )
})
