'use client'

import { useState } from 'react'
import { Settings2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { CloseReasonsAdmin } from '@/components/inbox/close-reasons-admin'
import type { WAAnalytics } from '@/lib/api/whatsapp'

/**
 * "Por que os atendimentos foram encerrados" — a leitura do motivo que o
 * atendente escolhe ao concluir.
 *
 * A edição da lista mora AQUI, num diálogo, e não num item próprio da barra
 * lateral: mexer nos motivos é uma tarefa de duas vezes por ano, e o momento em
 * que se percebe que falta um motivo (ou que dois dizem a mesma coisa) é
 * justamente olhando este gráfico.
 */
export function WACloseReasonsCard({
  closeReasons,
  canEdit,
}: {
  closeReasons: WAAnalytics['closeReasons']
  canEdit: boolean
}) {
  const [editOpen, setEditOpen] = useState(false)
  const total = closeReasons.reduce((s, r) => s + r.closed, 0)
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0)

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2 pb-3">
        <CardTitle className="text-base">
          Motivos de encerramento
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {total} encerrada{total === 1 ? '' : 's'} no período
          </span>
        </CardTitle>
        {canEdit && (
          <Button size="sm" variant="ghost" onClick={() => setEditOpen(true)}>
            <Settings2 className="mr-1.5 h-3.5 w-3.5" />
            Editar motivos
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-2.5">
        {total === 0 ? (
          <EmptyState icon="✅" title="Nenhum atendimento encerrado no período" size="sm" />
        ) : (
          closeReasons.map((r) => (
            <div key={r.reasonId ?? 'sem-motivo'} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className={r.reasonId ? 'text-foreground/70' : 'italic text-muted-foreground'}>
                  {r.reasonName}
                </span>
                <span className="shrink-0 font-medium text-foreground">
                  {r.closed} <span className="text-muted-foreground">({pct(r.closed)}%)</span>
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  // A barra do legado fica apagada: é ausência de dado, não um
                  // motivo real, e não deve competir visualmente com os outros.
                  className={`h-full rounded-full ${r.reasonId ? 'bg-sem-info-fg' : 'bg-muted-foreground/40'}`}
                  style={{ width: `${pct(r.closed)}%` }}
                />
              </div>
            </div>
          ))
        )}

        {closeReasons.some((r) => r.reasonId === null) && (
          <p className="pt-1 text-xs text-muted-foreground">
            “Sem motivo informado” são atendimentos encerrados antes de o portal passar a
            perguntar o motivo — a fatia tende a encolher com o tempo.
          </p>
        )}
      </CardContent>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Motivos de encerramento</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            O atendente escolhe um destes ao concluir uma conversa. Motivo já usado não pode ser
            apagado — desative-o para tirá-lo da lista sem perder o histórico.
          </p>
          <CloseReasonsAdmin canEdit={canEdit} />
        </DialogContent>
      </Dialog>
    </Card>
  )
}
