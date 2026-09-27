'use client'

// =============================================================================
// Ficha do chamado — o cabeçalho visual da tela de detalhe.
//
// Mostra a identificação do chamado em campos de leitura rápida, no lugar de
// um formulário: quem é o cliente, quem pediu, quando entrou e quando o
// atendimento aconteceu de fato.
//
// "Atendimento em" é editável aqui porque é a única data que o portal não sabe
// sozinho: `created_at` é quando o chamado foi cadastrado, `occurred_at` é
// quando o problema aconteceu. Um atendimento registrado depois (plantão,
// telefone) precisa poder corrigir isso sem perder a data de cadastro.
// =============================================================================

import { useState } from 'react'
import { getPriorityLabel } from '@/lib/ticket-priority'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { araraFetch } from '@/lib/arara/client'
import { formatDate } from '@/lib/utils'

type Row = Record<string, unknown>

const str = (v: unknown): string => (v == null || v === '' ? '' : String(v))

/** Data legível; vazio vira travessão para o campo não parecer quebrado. */
function humano(v: unknown): string {
  const s = str(v)
  if (!s) return '—'
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return '—'
  return formatDate(s, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

/** `datetime-local` exige `YYYY-MM-DDTHH:mm` no fuso local. */
function paraInput(v: unknown): string {
  const s = str(v)
  if (!s) return ''
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

const ORIGEM: Record<string, string> = {
  portal: 'Portal',
  whatsapp: 'WhatsApp',
  email: 'E-mail',
  phone: 'Telefone',
  chat: 'Chat',
}

export function TicketSummaryCard({
  ticket,
  assigneeName,
  onSaved,
}: {
  ticket: Row
  /** Nome do responsável já resolvido (o ticket traz só o id). */
  assigneeName?: string | null
  onSaved?: () => void
}) {
  const { toast } = useToast()
  const [occurred, setOccurred] = useState(paraInput(ticket.occurred_at))
  const [saving, setSaving] = useState(false)

  const inicial = paraInput(ticket.occurred_at)
  const mudou = occurred !== inicial

  async function salvarAtendimento() {
    if (!mudou) return
    setSaving(true)
    try {
      await araraFetch.patch(`/api/tickets/${str(ticket.id)}`, {
        occurred_at: occurred ? new Date(occurred).toISOString() : null,
      })
      toast({ title: 'Data do atendimento atualizada' })
      onSaved?.()
    } catch (err) {
      toast({
        title: 'Não foi possível salvar',
        description: err instanceof Error ? err.message : 'Tente novamente.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const badges = [
    str(ticket.priority) ? getPriorityLabel(str(ticket.priority)) : '',
    ORIGEM[str(ticket.source)] || str(ticket.source),
    str(ticket.ticket_type),
    str(ticket.severity),
  ].filter(Boolean)

  return (
    <section className="rounded-2xl bg-card p-5 md:p-6 shadow-[var(--shadow-media)]">
      {/* Identificação */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
          #{str(ticket.ticket_number) || '—'}
        </span>
        {badges.map((b) => (
          <span
            key={b}
            className="rounded-full bg-muted px-3 py-1 text-sm text-muted-foreground"
          >
            {b}
          </span>
        ))}
      </div>

      <h1 className="mt-4 text-2xl font-bold leading-tight text-foreground md:text-3xl">
        {str(ticket.title) || 'Sem título'}
      </h1>

      {/* Campos */}
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Campo rotulo="Empresa" valor={str(ticket.company_name)} />
        <Campo rotulo="Solicitante" valor={str(ticket.requester)} />
        {/* Vínculo Usuário/Unidade ainda não existe no chamado — entra com a
            reestruturação de cadastros (Cliente/Servidor → Unidade → Usuário). */}
        <Campo rotulo="Usuário (cadastro)" valor="" />
        <Campo rotulo="Unidade" valor="" />
        <Campo rotulo="Responsável" valor={str(assigneeName)} />
        <Campo rotulo="Categoria" valor={str(ticket.category)} />
        <Campo rotulo="Cadastro em" valor={humano(ticket.created_at)} />

        <div className="rounded-xl bg-muted/40 p-3">
          <p className="text-xs text-muted-foreground">Atendimento em</p>
          <input
            type="datetime-local"
            value={occurred}
            onChange={(e) => setOccurred(e.target.value)}
            className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground"
            aria-label="Data e hora em que o atendimento aconteceu"
          />
          {mudou && (
            <Button size="sm" className="mt-2" onClick={() => void salvarAtendimento()} disabled={saving}>
              {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Salvar
            </Button>
          )}
        </div>

        <Campo rotulo="Atualizado em" valor={humano(ticket.updated_at)} />
      </div>

      {/* Descrição */}
      <div className="mt-5">
        <p className="mb-2 text-sm font-semibold text-foreground">Descrição</p>
        <div className="rounded-xl border border-border bg-muted/20 p-4">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
            {str(ticket.description) || 'Sem descrição.'}
          </p>
        </div>
      </div>
    </section>
  )
}

function Campo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="rounded-xl bg-muted/40 p-3">
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className="mt-1 break-words text-sm font-medium text-foreground">{valor || '—'}</p>
    </div>
  )
}
