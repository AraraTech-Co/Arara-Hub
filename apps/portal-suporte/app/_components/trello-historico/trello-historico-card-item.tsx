'use client'

import type { TrelloCard } from './trello-historico-board'
import { formatDate } from '@/lib/utils'

interface Props {
  card: TrelloCard
  labelColors: Record<string, string>
  severityColors: Record<string, string>
  onClick: () => void
}

export function TrelloHistoricoCardItem({ card, labelColors, severityColors, onClick }: Props) {
  const date = card.dateLastActivity
    ? formatDate(card.dateLastActivity, { day: '2-digit', month: '2-digit', year: '2-digit' })
    : null

  // Ignora cards máscara (templates)
  const isMask = card.name.includes('CARD MÁSCARA') || card.name.includes('MÁSCARA')

  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-lg border bg-background p-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer
        ${isMask ? 'opacity-50 border-dashed' : 'border-border hover:border-indigo-300'}`}
    >
      {/* Labels */}
      {card.labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {card.labels.map(label => (
            <span
              key={label}
              className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium border
                ${labelColors[label] ?? 'bg-muted text-foreground/60 border-border'}`}
            >
              {label}
            </span>
          ))}
        </div>
      )}

      {/* Nome do card */}
      <p className="text-xs font-medium text-foreground leading-tight line-clamp-2">
        {card.name}
      </p>

      {/* Rodapé: ticket number, severidade, data */}
      <div className="mt-2 flex items-center justify-between gap-1">
        <div className="flex items-center gap-1.5">
          {card.ticketNumber && (
            <span className="text-[10px] font-mono text-muted-foreground/70">
              #{card.ticketNumber}
            </span>
          )}
          {card.severity && (
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${severityColors[card.severity] ?? 'bg-muted text-foreground/80'}`}>
              {card.severity}
            </span>
          )}
        </div>
        {date && (
          <span className="text-[10px] text-muted-foreground/70 shrink-0">{date}</span>
        )}
      </div>
    </button>
  )
}
