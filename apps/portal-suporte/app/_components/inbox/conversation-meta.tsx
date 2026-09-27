'use client'

// =============================================================================
// Apresentação compartilhada da conversa — usada pela lista e pelo kanban.
//
// Nome exibido, hora relativa, prévia da última mensagem e chips de
// prioridade/responsável/departamento. Estavam inline na conversation-list;
// com o kanban passaram a ter dois consumidores.
// =============================================================================

import { Badge } from '@/components/ui/badge'
import { rotuloDoContato } from '@/lib/wa-contato'
import { PRIORITY_LABELS } from '@/lib/ticket-priority'
import { cn, formatDateShort } from '@/lib/utils'
import type { WAInboxConversation, WAPriority } from '@/lib/api/whatsapp'
import { splitAuthor } from './message-list'

export const PRIORITY_LABEL: Record<WAPriority, string> = PRIORITY_LABELS

export const PRIORITY_CLASS: Record<WAPriority, string> = {
  very_low: 'border border-dashed border-border bg-transparent text-muted-foreground',
  low: 'bg-muted text-muted-foreground',
  medium: 'bg-sem-info text-sem-info-fg',
  high: 'bg-sem-warning text-sem-warning-fg',
  urgent: 'bg-sem-error text-sem-error-fg',
}

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diff = Math.floor((Date.now() - then) / 1000)
  if (diff < 60) return 'agora'
  if (diff < 3600) return `${Math.floor(diff / 60)}min`
  if (diff < 86_400) return `${Math.floor(diff / 3600)}h`
  if (diff < 604_800) return `${Math.floor(diff / 86_400)}d`
  return formatDateShort(iso, { day: '2-digit', month: '2-digit' })
}

export function displayName(c: WAInboxConversation): string {
  return rotuloDoContato(c.contact?.name, c.contact_name, c.remote_jid)
}

export function previewText(c: WAInboxConversation): string {
  if (!c.last_message) return 'Sem mensagens'
  if (c.last_message.body) {
    // Tira o autor embutido (assinatura do atendente ou nome do remetente em
    // grupo) — no preview ele só rouba espaço do que interessa.
    const { author, text } = splitAuthor(c.last_message.body)
    if (c.last_message.from_me) return `Você: ${text}`
    return author ? `${author}: ${text}` : text
  }
  return c.last_message.media_type ? `[${c.last_message.media_type}]` : ''
}

/** Fila: não atribuída, não resolvida e não fechada. */
export function isInQueue(c: WAInboxConversation): boolean {
  return c.assigned_to == null && c.phase !== 'resolvido' && c.status !== 'closed'
}

/**
 * Chips do rodapé do card. Só o que muda o comportamento do atendente:
 * prioridade não-média, etiquetas, quem atende e o departamento. Chip para tudo
 * vira ruído.
 */
export function ConversationChips({
  conversation: c,
  className,
}: {
  conversation: WAInboxConversation
  className?: string
}) {
  const tags = c.tags ?? []
  if (c.priority === 'medium' && tags.length === 0 && !c.assigned_to && !c.department) return null

  return (
    <span className={cn('flex flex-wrap items-center gap-1', className)}>
      {c.priority !== 'medium' && (
        <Badge className={cn('px-1.5 py-0 text-[10px] leading-4', PRIORITY_CLASS[c.priority])}>
          {PRIORITY_LABEL[c.priority]}
        </Badge>
      )}

      {/* Etiqueta é o que a equipe usa para separar assunto; sem ela na lista,
          a pessoa tinha de abrir a conversa para saber o que já foi marcado.
          Cor como ponto, pelo mesmo motivo do departamento. */}
      {tags.map((tag) => (
        <Badge
          key={tag.id}
          className="max-w-[10rem] items-center gap-1 truncate border border-border bg-card px-1.5 py-0 text-[10px] leading-4 text-foreground"
        >
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: tag.color ?? 'var(--muted-foreground)' }}
            aria-hidden
          />
          {tag.name}
        </Badge>
      ))}

      {c.assigned_to && (
        <Badge className="max-w-[10rem] truncate bg-muted px-1.5 py-0 text-[10px] leading-4 text-muted-foreground">
          {c.assigned_to.name ?? 'Atribuída'}
        </Badge>
      )}

      {c.department && (
        <Badge className="max-w-[10rem] items-center gap-1 truncate border border-border bg-card px-1.5 py-0 text-[10px] leading-4 text-foreground">
          {/* Cor do departamento como ponto, não como fundo: fundo colorido
              arbitrário quebra o contraste no tema escuro. */}
          {c.department.color && (
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: c.department.color }}
              aria-hidden
            />
          )}
          {c.department.name}
        </Badge>
      )}
    </span>
  )
}
