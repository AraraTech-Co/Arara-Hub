'use client'

import { useState, useEffect } from 'react'
import { X, ExternalLink, CheckSquare, MessageSquare, Clock, Hash } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { TrelloCard } from './trello-historico-board'
import { formatDate } from '@/lib/utils'
import { araraApiFetch } from '@/lib/arara/arara-api-fetch'

type ChecklistItem = { name: string; state: 'complete' | 'incomplete' }
type Checklist     = { name: string; items: ChecklistItem[] }
type Comment       = { text: string; date: string; memberName: string }

type FullCard = TrelloCard & {
  comments?: Comment[]
  checklists?: Checklist[]
}

interface Props {
  card: TrelloCard
  labelColors: Record<string, string>
  severityColors: Record<string, string>
  onClose: () => void
}

export function TrelloHistoricoCardModal({ card, labelColors, severityColors, onClose }: Props) {
  const [full, setFull]     = useState<FullCard | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Busca detalhes do card via API
    araraApiFetch(`/api/admin/trello-historico/${card.trelloId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setFull(data.card) })
      .finally(() => setLoading(false))
  }, [card.trelloId])

  const displayCard = full ?? card

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl bg-background shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b bg-background px-5 py-4">
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-foreground leading-snug">
              {displayCard.name}
            </h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {displayCard.labels.map(label => (
                <span key={label}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium border
                    ${labelColors[label] ?? 'bg-muted text-foreground/60 border-border'}`}>
                  {label}
                </span>
              ))}
              {displayCard.severity && (
                <span className={`rounded px-2 py-0.5 text-[10px] font-bold
                  ${severityColors[displayCard.severity] ?? 'bg-muted text-foreground/80'}`}>
                  {displayCard.severity}
                </span>
              )}
              {displayCard.ticketNumber && (
                <span className="flex items-center gap-0.5 text-[10px] font-mono text-muted-foreground/70">
                  <Hash className="h-3 w-3" />{displayCard.ticketNumber}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {displayCard.shortLink && (
              <a href={`https://trello.com/c/${displayCard.shortLink}`}
                target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm">
                  <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Trello
                </Button>
              </a>
            )}
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* Metadados */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            {displayCard.clientName && (
              <div>
                <p className="text-xs text-muted-foreground/70 mb-0.5">Cliente</p>
                <p className="font-medium text-foreground">{displayCard.clientName}</p>
              </div>
            )}
            {displayCard.dateLastActivity && (
              <div>
                <p className="text-xs text-muted-foreground/70 mb-0.5">Última atividade</p>
                <p className="font-medium text-foreground">{formatDate(displayCard.dateLastActivity)}</p>
              </div>
            )}
            {displayCard.dueDate && (
              <div>
                <p className="text-xs text-muted-foreground/70 mb-0.5">Prazo</p>
                <p className={`font-medium ${displayCard.dueComplete ? 'text-sem-success-fg' : 'text-red-500'}`}>
                  {formatDate(displayCard.dueDate)}
                  {displayCard.dueComplete && ' ✓'}
                </p>
              </div>
            )}
          </div>

          {/* Descrição */}
          {displayCard.description && (
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Descrição
              </h3>
              <div className="rounded-lg bg-muted/50 px-3 py-2.5 text-sm text-foreground/80 whitespace-pre-wrap">
                {displayCard.description}
              </div>
            </div>
          )}

          {/* Checklists */}
          {full?.checklists && full.checklists.length > 0 && (
            <div>
              <h3 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                <CheckSquare className="h-3.5 w-3.5" /> Checklists
              </h3>
              {full.checklists.map((cl, i) => {
                const done  = cl.items.filter(it => it.state === 'complete').length
                const total = cl.items.length
                const pct   = total > 0 ? Math.round((done / total) * 100) : 0
                return (
                  <div key={i} className="mb-3">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium text-foreground/80">{cl.name}</p>
                      <span className="text-xs text-muted-foreground/70">{done}/{total}</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-muted mb-2">
                      <div className={`h-1.5 rounded-full transition-all ${pct === 100 ? 'bg-emerald-500' : 'bg-indigo-400'}`}
                        style={{ width: `${pct}%` }} />
                    </div>
                    <ul className="space-y-1">
                      {cl.items.map((item, j) => (
                        <li key={j} className="flex items-start gap-2 text-sm">
                          <span className={`mt-0.5 text-base ${item.state === 'complete' ? 'text-emerald-500' : 'text-muted-foreground/50'}`}>
                            {item.state === 'complete' ? '☑' : '☐'}
                          </span>
                          <span className={item.state === 'complete' ? 'line-through text-muted-foreground/70' : 'text-foreground/80'}>
                            {item.name}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
            </div>
          )}

          {/* Comentários */}
          {full?.comments && full.comments.length > 0 && (
            <div>
              <h3 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                <MessageSquare className="h-3.5 w-3.5" />
                Comentários ({full.comments.length})
              </h3>
              <div className="space-y-3">
                {full.comments.map((c, i) => (
                  <div key={i} className="rounded-lg border border-border/50 bg-muted/50 px-3 py-2.5">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-semibold text-foreground/80">{c.memberName}</span>
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground/70">
                        <Clock className="h-3 w-3" />
                        {formatDate(c.date, {
                          day: '2-digit', month: '2-digit', year: '2-digit',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="text-sm text-foreground/80 whitespace-pre-wrap">{c.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {loading && (
            <div className="text-center py-4 text-muted-foreground/70 text-sm">
              Carregando detalhes...
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
