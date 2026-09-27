'use client'

import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, ChevronDown } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TrelloHistoricoCardItem } from './trello-historico-card-item'
import type { TrelloList, TrelloCard } from './trello-historico-board'
import { araraApiFetch } from '@/lib/arara/arara-api-fetch'

interface Props {
  list: TrelloList
  icon: string
  labelColors: Record<string, string>
  severityColors: Record<string, string>
  search: string
  filterSeverity: string
  filterLabel: string
  onCardClick: (card: TrelloCard) => void
}

export function TrelloHistoricoColumn({
  list, icon, labelColors, severityColors,
  search, filterSeverity, filterLabel, onCardClick,
}: Props) {
  const [cards, setCards]       = useState<TrelloCard[]>([])
  const [total, setTotal]       = useState(list.cardCount)
  const [page, setPage]         = useState(1)
  const [loading, setLoading]   = useState(false)
  const [hasMore, setHasMore]   = useState(false)

  const load = useCallback(async (pg: number, reset: boolean) => {
    setLoading(true)
    const params = new URLSearchParams({ listId: list.trelloId, page: String(pg) })
    if (search)         params.set('search',   search)
    if (filterSeverity) params.set('severity', filterSeverity)
    if (filterLabel)    params.set('label',    filterLabel)

    const res = await araraApiFetch(`/api/admin/trello-historico?${params}`)
    if (res.ok) {
      const data = await res.json()
      setCards(prev => reset ? data.cards : [...prev, ...data.cards])
      setTotal(data.total)
      setHasMore(pg * data.perPage < data.total)
      setPage(pg)
    }
    setLoading(false)
  }, [list.trelloId, search, filterSeverity, filterLabel])

  // Recarrega quando filtros mudam
  useEffect(() => { load(1, true) }, [load])

  // Cor do cabeçalho por tipo de lista
  const headerColor = list.name.startsWith('RESOLVIDO') || list.name === 'Resolvido'
    ? 'bg-sem-success border-sem-success-bd'
    : list.name.includes('POST-MORTEM')
    ? 'bg-sem-error border-sem-error-bd'
    : list.name.includes('Migra')
    ? 'bg-sky-50 border-sky-200'
    : list.closed
    ? 'bg-muted/50 border-border'
    : 'bg-background border-border'

  return (
    <div className="flex-shrink-0 w-72 flex flex-col rounded-xl border bg-muted/50 shadow-sm">
      {/* Cabeçalho da coluna */}
      <div className={`rounded-t-xl border-b px-3 py-2.5 ${headerColor}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-base">{icon}</span>
            <h3 className="text-sm font-semibold text-foreground truncate">{list.name}</h3>
          </div>
          <Badge variant="secondary" className="text-xs shrink-0">
            {total}
          </Badge>
        </div>
        {list.closed && (
          <span className="mt-1 inline-block text-xs text-muted-foreground/70">Lista arquivada</span>
        )}
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto max-h-[70vh] p-2 space-y-2">
        {cards.map(card => (
          <TrelloHistoricoCardItem
            key={card.id}
            card={card}
            labelColors={labelColors}
            severityColors={severityColors}
            onClick={() => onCardClick(card)}
          />
        ))}

        {loading && (
          <div className="flex justify-center py-4">
            <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground/70" />
          </div>
        )}

        {!loading && cards.length === 0 && (
          <p className="text-center text-xs text-muted-foreground/70 py-6">
            Nenhum card encontrado
          </p>
        )}

        {!loading && hasMore && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs text-muted-foreground"
            onClick={() => load(page + 1, false)}
          >
            <ChevronDown className="mr-1 h-3.5 w-3.5" />
            Ver mais ({total - cards.length} restantes)
          </Button>
        )}
      </div>
    </div>
  )
}
