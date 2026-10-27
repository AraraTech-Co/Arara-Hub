'use client'

// =============================================================================
// Vincular a conversa a um chamado que já existe (PRD 06).
//
// O cliente volta dois dias depois sobre o mesmo assunto: a conversa é nova, o
// chamado é o mesmo. Sem isto, o atendente abria um segundo chamado do mesmo
// assunto.
//
// A lista NÃO é escolhida aqui: o servidor resolve o escopo pela conversa
// (empresa, ou cliente quando não há empresa) e só manda os chamados ainda não
// resolvidos desse cliente. A busca deste campo filtra o que já veio.
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import { Link2, Loader2, Ticket as TicketIcon } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { STATUS_LABELS } from '@/lib/ticket-status'
import { useToast } from '@/hooks/use-toast'
import { whatsappApi, type WALinkableTicket } from '@/lib/api/whatsapp'

interface WALinkTicketDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  conversationId: string
  onLinked: () => void
}

function rotuloDaSituacao(status: string | null): string {
  if (!status) return '—'
  return (STATUS_LABELS as Record<string, string>)[status] ?? status
}

function combina(t: WALinkableTicket, busca: string): boolean {
  if (!busca) return true
  const alvo = `${t.ticket_number ?? ''} ${t.title ?? ''}`.toLowerCase()
  return alvo.includes(busca.trim().toLowerCase())
}

export function WALinkTicketDialog({
  open,
  onOpenChange,
  conversationId,
  onLinked,
}: WALinkTicketDialogProps) {
  const { toast } = useToast()
  const [carregando, setCarregando] = useState(false)
  const [chamados, setChamados] = useState<WALinkableTicket[]>([])
  const [escolhido, setEscolhido] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro(null)
    try {
      const res = await whatsappApi.listLinkableTickets(conversationId)
      setChamados(res.data ?? [])
    } catch (err) {
      setErro(
        err instanceof Error
          ? err.message
          : 'Não foi possível listar os chamados deste cliente.',
      )
    } finally {
      setCarregando(false)
    }
  }, [conversationId])

  // Reabrir a janela recomeça do zero — senão sobrava a escolha de outra conversa.
  useEffect(() => {
    if (!open) return
    setEscolhido(null)
    setBusca('')
    void carregar()
  }, [open, carregar])

  async function handleSubmit() {
    if (salvando || !escolhido) return
    setSalvando(true)
    setErro(null)
    try {
      const res = await whatsappApi.linkTicket(conversationId, escolhido)
      toast({
        title: 'Conversa vinculada',
        description: res.data.ticket_number
          ? `Esta conversa agora aparece no chamado ${res.data.ticket_number}.`
          : 'Esta conversa agora aparece no chamado escolhido.',
      })
      onOpenChange(false)
      onLinked()
    } catch (err) {
      setErro(
        err instanceof Error ? err.message : 'Não foi possível vincular o chamado.',
      )
    } finally {
      setSalvando(false)
    }
  }

  const visiveis = chamados.filter((t) => combina(t, busca))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4" aria-hidden />
            Vincular chamado
          </DialogTitle>
          <DialogDescription>
            Liga esta conversa a um chamado que já existe, sem abrir outro. O
            chamado não é alterado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="wa-vincular-busca">Buscar por número ou título</Label>
            <Input
              id="wa-vincular-busca"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="TCK000123 ou parte do título"
            />
          </div>

          {carregando ? (
            <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Carregando os chamados deste cliente…
            </p>
          ) : visiveis.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">
              {chamados.length === 0
                ? 'Este cliente não tem chamado em aberto para vincular. Use "Criar ticket".'
                : 'Nenhum chamado casa com a busca.'}
            </p>
          ) : (
            <ul className="max-h-64 space-y-1.5 overflow-y-auto" role="radiogroup">
              {visiveis.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={escolhido === t.id}
                    onClick={() => setEscolhido(t.id)}
                    className={cn(
                      'flex w-full flex-col items-start gap-0.5 rounded-lg border p-2.5 text-left transition-colors',
                      escolhido === t.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:bg-muted/60',
                    )}
                  >
                    <span className="flex w-full items-center gap-2">
                      <TicketIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="font-medium text-foreground">
                        {t.ticket_number ?? t.id}
                      </span>
                      <span className="ml-auto inline-flex shrink-0 items-center rounded-full border border-border bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                        {rotuloDaSituacao(t.status)}
                      </span>
                    </span>
                    <span className="line-clamp-2 text-sm text-muted-foreground">
                      {t.title ?? '—'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {erro && (
            <p role="alert" className="text-sm text-sem-error-fg">
              {erro}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={salvando}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={salvando || !escolhido}
          >
            {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
            Vincular chamado
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
