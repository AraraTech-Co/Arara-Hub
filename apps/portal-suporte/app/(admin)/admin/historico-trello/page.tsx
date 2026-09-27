'use client'

import { TrelloHistoricoBoard } from '@/components/trello-historico/trello-historico-board'

/** Histórico do Trello. O board busca sozinho. */
export default function HistoricoTrelloPage() {
  return (
    <div className="pt-14 lg:pt-0">
      <TrelloHistoricoBoard />
    </div>
  )
}
