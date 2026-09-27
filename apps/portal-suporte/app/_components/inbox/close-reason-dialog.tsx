'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { whatsappApi, type WAInboxRef } from '@/lib/api/whatsapp'

/**
 * Pergunta o motivo antes de concluir uma conversa.
 *
 * Existe um único diálogo para os DOIS caminhos de conclusão (botão "Concluir"
 * no painel e arrasto para a coluna Resolvido no kanban) — se cada tela tivesse
 * o seu, um deles acabaria ficando para trás e a obrigatoriedade furaria.
 *
 * A lista vem da API (motivos ativos, editáveis em Configurações). Se ela vier
 * vazia, o diálogo diz o que fazer em vez de mostrar um select vazio.
 */
export function CloseReasonDialog({
  open,
  onOpenChange,
  onConfirm,
  busy,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onConfirm: (closeReasonId: string) => void | Promise<void>
  busy?: boolean
}) {
  const [reasons, setReasons] = useState<WAInboxRef[] | null>(null)
  const [selected, setSelected] = useState<string>('')

  useEffect(() => {
    if (!open) return
    let active = true
    whatsappApi
      .listCloseReasons()
      .then((res) => {
        if (!active) return
        setReasons(res.data)
        setSelected((s) => s || res.data[0]?.id || '')
      })
      .catch(() => active && setReasons([]))
    return () => {
      active = false
    }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Concluir conversa</DialogTitle>
          <DialogDescription>
            Escolha o motivo do encerramento. Ele alimenta o filtro de conversas concluídas e os
            relatórios de atendimento.
          </DialogDescription>
        </DialogHeader>

        {reasons === null ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : reasons.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">
            Nenhum motivo cadastrado. Um administrador precisa cadastrar os motivos em
            Configurações → Motivos de encerramento antes de concluir conversas.
          </p>
        ) : (
          <ul className="space-y-1 py-1">
            {reasons.map((r) => (
              <li key={r.id}>
                <label
                  className="flex cursor-pointer items-center gap-2.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/60 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                >
                  <input
                    type="radio"
                    name="close-reason"
                    value={r.id}
                    checked={selected === r.id}
                    onChange={() => setSelected(r.id)}
                    className="h-4 w-4 accent-[var(--primary)]"
                  />
                  {r.name}
                </label>
              </li>
            ))}
          </ul>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={() => selected && onConfirm(selected)} disabled={!selected || !!busy}>
            {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Concluir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
