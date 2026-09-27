'use client'

// =============================================================================
// Abrir chamado a partir da conversa.
//
// Uma tela só, de propósito: isto é preenchido no meio de um atendimento ao
// vivo. O que dá para saber pela conversa (empresa, solicitante, quem atende)
// vem pronto e é só conferido; o atendente escreve o que a conversa não sabe
// dizer — o que aconteceu.
//
// A descrição é o campo que, no futuro, a IA vai propor a partir do histórico.
// =============================================================================

import { useEffect, useState } from 'react'
import { rotuloDoContato } from '@/lib/wa-contato'
import { PRIORITY_OPTIONS } from '@/lib/ticket-priority'
import { Loader2, Ticket as TicketIcon } from 'lucide-react'
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
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { whatsappApi, type WAConversationDetail, type WAPriority } from '@/lib/api/whatsapp'

const PRIORIDADES = PRIORITY_OPTIONS

function nomeDoSolicitante(d: WAConversationDetail): string {
  return rotuloDoContato(d.contact?.name, d.contactName, d.remoteJid)
}

interface WACreateTicketDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  conversation: WAConversationDetail
  /** Nome de quem está com a inbox aberta — vira responsável se ninguém assumiu. */
  meName?: string | null
  onCreated: () => void
}

export function WACreateTicketDialog({
  open,
  onOpenChange,
  conversation,
  meName,
  onCreated,
}: WACreateTicketDialogProps) {
  const { toast } = useToast()
  const solicitante = nomeDoSolicitante(conversation)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [priority, setPriority] = useState<WAPriority>('medium')
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // Reabrir a janela recomeça do zero — senão sobrava o rascunho de outra conversa.
  useEffect(() => {
    if (!open) return
    setTitle(`WhatsApp: ${solicitante}`)
    setDescription('')
    setCategory('')
    setPriority((conversation.priority as WAPriority) ?? 'medium')
    setErro(null)
  }, [open, solicitante, conversation.priority])

  // Quem atende a conversa fica com o chamado; sem ninguém, quem está abrindo.
  const responsavel = conversation.assignedTo?.fullName ?? meName ?? 'você'

  async function handleSubmit() {
    if (saving) return
    if (!description.trim()) {
      setErro('Descreva o que o cliente relatou — é o que o time vai ler para resolver.')
      return
    }
    setSaving(true)
    setErro(null)
    try {
      const res = await whatsappApi.createTicket(conversation.id, {
        title: title.trim() || `WhatsApp: ${solicitante}`,
        description: description.trim(),
        category: category.trim() || null,
        priority,
      })
      toast({
        title: res.data.created ? 'Chamado aberto' : 'Conversa já tinha chamado',
        description: res.data.created
          ? 'O chamado entrou no kanban, em Backlog.'
          : 'A conversa foi vinculada ao chamado que já existia.',
      })
      onOpenChange(false)
      onCreated()
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível abrir o chamado.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TicketIcon className="h-4 w-4" aria-hidden />
            Abrir chamado
          </DialogTitle>
          <DialogDescription>
            O chamado entra na mesma numeração do kanban, marcado como vindo do WhatsApp.
          </DialogDescription>
        </DialogHeader>

        {/* O que a conversa já sabe — conferência, não digitação. */}
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-lg border border-border bg-muted/40 p-3 text-sm">
          <dt className="text-muted-foreground">Solicitante</dt>
          <dd className="truncate font-medium text-foreground">{solicitante}</dd>

          <dt className="text-muted-foreground">Empresa</dt>
          <dd className="truncate text-foreground">
            {conversation.company?.name ?? <span className="text-muted-foreground">—</span>}
          </dd>

          <dt className="text-muted-foreground">Quem atendeu</dt>
          <dd className="truncate text-foreground">{responsavel}</dd>
        </dl>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="wa-ticket-title">Título</Label>
            <Input
              id="wa-ticket-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={255}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wa-ticket-description">
              Descrição <span className="text-sem-error-fg">*</span>
            </Label>
            <Textarea
              id="wa-ticket-description"
              value={description}
              onChange={(e) => {
                setDescription(e.target.value)
                if (erro) setErro(null)
              }}
              rows={6}
              placeholder="O que o cliente relatou, o que já foi verificado e o que falta resolver."
              aria-invalid={erro ? true : undefined}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="wa-ticket-category">Categoria</Label>
              <Input
                id="wa-ticket-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Ex: fiscal, PDV, financeiro…"
                maxLength={100}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="wa-ticket-priority">Prioridade</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as WAPriority)}>
                <SelectTrigger id="wa-ticket-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORIDADES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {erro && (
            <p role="alert" className="text-sm text-sem-error-fg">
              {erro}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
            Abrir chamado
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
