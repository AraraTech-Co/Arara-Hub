'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Building2,
  Check,
  CheckCircle2,
  ExternalLink,
  Link2,
  Loader2,
  Mail,
  Phone,
  RotateCcw,
  Tag as TagIcon,
  Ticket as TicketIcon,
  UserPlus,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { whatsappApi, type WAConversationDetail } from '@/lib/api/whatsapp'
import { schedulesApi, type QuemAvisarAgora } from '@/lib/api/schedules'
import { formatDate, mascaraTelefone } from '@/lib/utils'
import { ehGrupo, rotuloDoContato, telefoneDaConversa } from '@/lib/wa-contato'
import { CadastrarContatoDialog } from './cadastrar-contato-dialog'
import { RenomearGrupo } from './renomear-grupo'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { useAssignment } from '@/hooks/use-assignment'
import { AssignMenu } from './assign-menu'
import { WACreateTicketDialog } from './wa-create-ticket-dialog'
import { WALinkTicketDialog } from './wa-link-ticket-dialog'
import { TagPicker } from './tag-picker'
import { CloseReasonDialog } from './close-reason-dialog'

interface CrmContextPanelProps {
  conversationId: string | null
}

function formatSlaTime(iso: string): string {
  if (Number.isNaN(new Date(iso).getTime())) return ''
  return formatDate(iso, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function initialOf(name: string | null | undefined): string {
  const t = (name ?? '').trim()
  return t ? t[0]!.toUpperCase() : '?'
}

export function CrmContextPanel({ conversationId }: CrmContextPanelProps) {
  const { toast } = useToast()
  const [detail, setDetail] = useState<WAConversationDetail | null>(null)
  // Estado do plantão AGORA: é o que decide se o botão de backup técnico
  // aparece. Vem do servidor porque a janela mora na configuração de horário,
  // e porque quem decide de verdade é ele — a tela só evita oferecer o que
  // seria recusado.
  const [plantao, setPlantao] = useState<QuemAvisarAgora | null>(null)
  const [backupBusy, setBackupBusy] = useState(false)
  const [backupAvisadoEm, setBackupAvisadoEm] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [ticketDialogOpen, setTicketDialogOpen] = useState(false)
  const [vincularDialogOpen, setVincularDialogOpen] = useState(false)
  const [desvincularAberto, setDesvincularAberto] = useState(false)
  const [busy, setBusy] = useState(false)
  const [closeOpen, setCloseOpen] = useState(false)

  const load = useCallback(
    async (id: string, signal?: { cancelled: boolean }) => {
      setLoading(true)
      try {
        const res = await whatsappApi.getConversation(id)
        if (!signal?.cancelled) setDetail(res.data)
      } catch {
        if (!signal?.cancelled) setDetail(null)
      } finally {
        if (!signal?.cancelled) setLoading(false)
      }
    },
    [],
  )

  // O estado do plantão vale para a tela toda, não para uma conversa: carrega
  // uma vez e vale enquanto o painel estiver aberto.
  useEffect(() => {
    let cancelado = false
    schedulesApi.quemAvisarAgora()
      .then((r) => { if (!cancelado) setPlantao(r.data) })
      .catch(() => { if (!cancelado) setPlantao(null) })
    return () => { cancelado = true }
  }, [])

  // Refetch ao trocar de conversa.
  useEffect(() => {
    // A trava de 10 min é por CONVERSA: trocar de conversa limpa o aviso de
    // "backup avisado às HH:MM" da anterior.
    setBackupAvisadoEm(null)
    if (!conversationId) {
      setDetail(null)
      return
    }
    const signal = { cancelled: false }
    void load(conversationId, signal)
    return () => {
      signal.cancelled = true
    }
  }, [conversationId, load])

  // Atribuição compartilhada com o header do thread (mesmo tratamento de 409).
  // Recarrega o detalhe ao final porque este painel não é alimentado por SSE.
  const {
    busy: assignBusy,
    assign,
    reassign,
    unassign,
  } = useAssignment(conversationId, {
    onDone: () => (conversationId ? load(conversationId) : undefined),
  })

  /**
   * Chama o backup técnico do dia.
   *
   * Confirma antes porque isso toca o telefone de alguém: dentro da janela de
   * plantão, quem recebe não está no portal — está em casa, de prontidão.
   */
  async function chamarBackup() {
    if (!conversationId) return
    const nomes = (plantao?.backup_do_dia ?? []).map((b) => b.nome ?? b.id).join(', ')
    if (!window.confirm(`Avisar ${nomes || 'o backup técnico'} agora?`)) return
    setBackupBusy(true)
    try {
      const r = await whatsappApi.chamarBackupTecnico(conversationId)
      setBackupAvisadoEm(r.data.avisado_em)
      toast({
        title: r.data.enviado ? 'Backup técnico avisado' : 'Registrado, mas o envio falhou',
        // O provedor não confirma entrega: dizer "avisado" sem a ressalva seria
        // prometer o que não dá para saber.
        description: r.data.enviado
          ? `${r.data.avisado?.nome ?? 'O backup'} recebeu a mensagem. O provedor não confirma entrega.`
          : 'O aviso ficou registrado na conversa, mas o provedor não aceitou o envio.',
        variant: r.data.enviado ? undefined : 'destructive',
      })
    } catch (err) {
      // As recusas do servidor explicam o motivo (fora da janela, sem backup,
      // avisado há menos de 10 min) — vale mostrar o texto dele.
      toast({
        title: 'Não foi possível chamar o backup',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      })
    } finally {
      setBackupBusy(false)
    }
  }

  /** Executa uma ação e recarrega o detalhe (refetch) ao final. */
  const runAction = useCallback(
    async (
      action: () => Promise<unknown>,
      errTitle: string,
      onError?: (err: unknown) => boolean,
    ) => {
      if (!conversationId || busy) return
      setBusy(true)
      try {
        await action()
        await load(conversationId)
      } catch (err) {
        if (onError?.(err)) return
        toast({
          title: errTitle,
          description: err instanceof Error ? err.message : 'Tente novamente.',
          variant: 'destructive',
        })
      } finally {
        setBusy(false)
      }
    },
    [conversationId, busy, load, toast],
  )


  if (!conversationId) {
    return (
      <div className="flex h-full items-center justify-center bg-card p-4">
        <p className="text-sm text-muted-foreground">Nenhuma conversa selecionada</p>
      </div>
    )
  }

  if (loading && !detail) {
    return (
      <div className="flex h-full items-center justify-center bg-card p-4">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="flex h-full items-center justify-center bg-card p-4">
        <p className="text-sm text-muted-foreground">
          Não foi possível carregar o contexto.
        </p>
      </div>
    )
  }

  const slaPending = detail.slaDueAt != null && detail.firstResponseAt == null
  const slaOverdue =
    slaPending && new Date(detail.slaDueAt!).getTime() < Date.now()

  const displayName = rotuloDoContato(detail.contact?.name, detail.contactName, detail.remoteJid)
  // Telefone do cadastro primeiro; senão o da conversa; sem nenhum (LID), diz.
  const telCadastro = detail.contact?.whatsapp || detail.contact?.phone
  const phone = telCadastro
    ? mascaraTelefone(`+${String(telCadastro).replace(/\D/g, '')}`)
    : telefoneDaConversa(detail.remoteJid) ?? (ehGrupo(detail.remoteJid) ? 'Grupo do WhatsApp' : 'Número oculto pelo WhatsApp')

  const isResolved = detail.status === 'closed' || detail.phase === 'resolvido'
  const assigned = detail.assignedTo
  const attachedTagIds = (detail.tags ?? []).map((t) => t.id)

  return (
    <div className="h-full overflow-y-auto bg-card">
      <div className="space-y-3 p-4">
        {/* 1. Cabeçalho do contato */}
        <div className="flex items-start gap-3">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-base font-semibold text-primary-foreground"
            aria-hidden
          >
            {initialOf(displayName)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">
              {displayName}
            </p>
            {detail.providerContactId && (
              <p className="truncate text-xs text-muted-foreground">
                ID {detail.providerContactId}
              </p>
            )}
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              <Phone className="h-3 w-3" />
              {phone}
            </p>
            {ehGrupo(detail.remoteJid) ? (
              <RenomearGrupo
                conversaId={detail.id}
                nomeAtual={detail.contactName}
                onSalvo={() => void load(detail.id)}
              />
            ) : (
              <CadastrarContatoDialog conversa={detail} onSalvo={() => void load(detail.id)} />
            )}
          </div>
        </div>

        {/* 2. Status + concluir */}
        <section className="rounded-lg bg-card p-4 shadow-[var(--shadow-media)]">
          <div className="flex items-center justify-between gap-2">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
                isResolved
                  ? 'border-sem-success-bd bg-sem-success text-sem-success-fg'
                  : 'border-border bg-muted text-muted-foreground',
              )}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {isResolved ? 'Atendimento concluído' : 'Atendimento aberto'}
            </span>
          </div>
          {/* Conversa concluída com chamado pendente: reabrir devolve o assunto
              com o ticket que já estava vinculado, em vez de começar do zero. */}
          {isResolved && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-2.5 w-full"
              disabled={busy}
              onClick={() =>
                void runAction(
                  () => whatsappApi.reopenConversation(detail.id),
                  'Erro ao reabrir',
                )
              }
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
              <span className="ml-1.5">Reabrir conversa</span>
            </Button>
          )}
          {!isResolved && (
            <Button
              type="button"
              size="sm"
              className="mt-2.5 w-full border-sem-success-bd bg-sem-success text-sem-success-fg hover:bg-sem-success/80"
              disabled={busy}
              // Não conclui direto: o motivo é obrigatório, então o diálogo é a
              // única porta. (O servidor recusa sem motivo de qualquer forma.)
              onClick={() => setCloseOpen(true)}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              <span className="ml-1.5">Marcar como concluído</span>
            </Button>
          )}

          <CloseReasonDialog
            open={closeOpen}
            onOpenChange={setCloseOpen}
            busy={busy}
            onConfirm={async (closeReasonId) => {
              await runAction(
                () => whatsappApi.resolveConversation(detail.id, closeReasonId),
                'Erro ao concluir',
              )
              setCloseOpen(false)
            }}
          />
        </section>

        {/* 3. Atribuição — grupo não tem dono: é fixo na aba Grupos, e quem
            responde já vai nomeado na mensagem. */}
        {ehGrupo(detail.remoteJid) ? (
          <section className="rounded-lg bg-card p-4 shadow-[var(--shadow-media)]">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Grupo</p>
            <p className="text-sm text-muted-foreground">
              Grupo não tem responsável: fica fixo na aba Grupos e cada resposta sai com o nome de quem enviou.
            </p>
          </section>
        ) : (
        <section className="rounded-lg bg-card p-4 shadow-[var(--shadow-media)]">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Atribuição
          </p>
          {assigned ? (
            <div className="space-y-2">
              <p className="text-sm text-foreground">
                Atribuído a{' '}
                <span className="font-medium">
                  {assigned.fullName ?? 'Sem nome'}
                </span>
              </p>
              <AssignMenu
                currentAgentId={assigned.id}
                disabled={busy || assignBusy}
                onReassign={(agentId) => reassign(agentId)}
              />
              <button
                type="button"
                disabled={busy || assignBusy}
                onClick={() => void unassign()}
                className="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline disabled:opacity-50"
              >
                Remover atribuição
              </button>

              {/* Backup técnico: retaguarda de quem atende, chamada À MÃO.
                  Só aparece dentro da janela de plantão e quando há backup com
                  telefone no dia — e o servidor recusa nos mesmos casos, então
                  esconder aqui é cortesia, não proteção. */}
              {plantao?.agora.em_plantao && (plantao.backup_do_dia?.length ?? 0) > 0 && (
                backupAvisadoEm ? (
                  <p className="text-xs text-muted-foreground">
                    Backup avisado às{' '}
                    {new Date(backupAvisadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                ) : (
                  <button
                    type="button"
                    disabled={busy || assignBusy || backupBusy}
                    onClick={() => void chamarBackup()}
                    className="text-xs font-medium text-sem-warning-fg hover:underline disabled:opacity-50"
                  >
                    {backupBusy ? 'Chamando…' : 'Chamar backup técnico'}
                  </button>
                )
              )}
            </div>
          ) : (
            <Button
              type="button"
              size="sm"
              className="w-full"
              disabled={busy || assignBusy}
              onClick={() => void assign()}
            >
              {assignBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UserPlus className="h-4 w-4" />
              )}
              <span className="ml-1.5">Vincular a mim</span>
            </Button>
          )}
        </section>
        )}

        {/* 4. Etiquetas */}
        <section className="rounded-lg bg-card p-4 shadow-[var(--shadow-media)]">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <TagIcon className="h-3.5 w-3.5" />
            Etiquetas
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {/* A API devolve a etiqueta PLANA (`{id, name, color}`), não o
                vínculo do Prisma (`{id, tag:{…}}`) — ver WAConversationTag. */}
            {(detail.tags ?? []).map((tag) => (
              <span
                key={tag.id}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-foreground"
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: tag.color ?? 'var(--muted-foreground)' }}
                  aria-hidden
                />
                {tag.name}
                <button
                  type="button"
                  disabled={busy}
                  aria-label={`Remover etiqueta ${tag.name}`}
                  onClick={() =>
                    void runAction(
                      () => whatsappApi.detachTag(detail.id, tag.id),
                      'Erro ao remover etiqueta',
                    )
                  }
                  className="ml-0.5 rounded-full text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <TagPicker
              attachedTagIds={attachedTagIds}
              onAttach={(tagId) =>
                runAction(
                  () => whatsappApi.attachTag(detail.id, tagId),
                  'Erro ao adicionar etiqueta',
                )
              }
            />
          </div>
        </section>

        {/* 5. CRM */}
        <section className="rounded-lg bg-card p-4 shadow-[var(--shadow-media)]">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Detalhes
          </p>
          <dl className="space-y-1.5 text-sm">
            <Field
              label="Telefone"
              value={detail.contact?.whatsapp ?? detail.contact?.phone ?? phone}
              icon={<Phone className="h-3.5 w-3.5" />}
            />
            <Field
              label="E-mail"
              value={detail.contact?.email}
              icon={<Mail className="h-3.5 w-3.5" />}
            />
            <Field
              label="Empresa"
              value={detail.company?.name}
              icon={<Building2 className="h-3.5 w-3.5" />}
            />
            <div className="flex items-start justify-between gap-2">
              <dt className="text-xs text-muted-foreground">SLA</dt>
              <dd className="min-w-0 text-right">
                {slaPending ? (
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
                      slaOverdue
                        ? 'border-sem-error-bd bg-sem-error text-sem-error-fg'
                        : 'border-border bg-muted text-muted-foreground',
                    )}
                  >
                    {slaOverdue
                      ? 'SLA estourado'
                      : `Prazo ${formatSlaTime(detail.slaDueAt!)}`}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {detail.firstResponseAt != null
                      ? 'Respondido'
                      : 'Sem SLA'}
                  </span>
                )}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-2">
              <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                <TicketIcon className="h-3.5 w-3.5" />
                Ticket
              </dt>
              <dd className="min-w-0 text-right">
                {detail.ticket ? (
                  <div className="flex flex-col items-end gap-1">
                    <span className="inline-flex items-center gap-1.5 text-sm">
                      <span className="font-medium text-foreground">
                        {detail.ticket.ticketNumber ?? detail.ticket.title}
                      </span>
                      <span className="inline-flex items-center rounded-full border border-border bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                        {detail.ticket.status}
                      </span>
                    </span>
                    <Link
                      href={`/admin/tickets/view/?id=${encodeURIComponent(detail.ticket.id)}`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      Abrir ticket
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                    {/* Vínculo errado se desfaz ou se troca aqui; desvincular
                        pede confirmação porque a conversa deixa de aparecer no
                        chamado e o fluxo com condição `hasTicket` muda de ramo
                        nas mensagens seguintes. */}
                    <span className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-xs"
                        onClick={() => setVincularDialogOpen(true)}
                      >
                        Trocar
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-xs"
                        onClick={() => setDesvincularAberto(true)}
                      >
                        Desvincular
                      </Button>
                    </span>
                  </div>
                ) : (
                  // Duas saídas para a conversa sem chamado: abrir um, ou
                  // ligar ao que já existe. Sem a segunda, o cliente que volta
                  // dois dias depois sobre o mesmo assunto ganhava um chamado
                  // duplicado (PRD 06).
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => setTicketDialogOpen(true)}
                    >
                      <TicketIcon className="h-3.5 w-3.5" />
                      <span className="ml-1">Criar ticket</span>
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => setVincularDialogOpen(true)}
                    >
                      <Link2 className="h-3.5 w-3.5" />
                      <span className="ml-1">Vincular ticket</span>
                    </Button>
                  </div>
                )}
              </dd>
            </div>
          </dl>
        </section>
      </div>

      <WACreateTicketDialog
        open={ticketDialogOpen}
        onOpenChange={setTicketDialogOpen}
        conversation={detail}
        onCreated={() => void load(detail.id)}
      />

      <WALinkTicketDialog
        open={vincularDialogOpen}
        onOpenChange={setVincularDialogOpen}
        conversationId={detail.id}
        trocando={!!detail.ticket}
        onLinked={() => void load(detail.id)}
      />

      <AlertDialog
        open={desvincularAberto}
        onOpenChange={(aberto) => !aberto && setDesvincularAberto(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desvincular o chamado desta conversa?</AlertDialogTitle>
            <AlertDialogDescription>
              A conversa deixa de aparecer no chamado. O chamado em si não é
              alterado, e você pode vincular outro depois.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setDesvincularAberto(false)
                void runAction(
                  () => whatsappApi.unlinkTicket(detail.id),
                  'Erro ao desvincular o chamado',
                )
              }}
            >
              Desvincular
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ─── Subcomponentes ───────────────────────────────────────────────────────────

function Field({
  label,
  value,
  icon,
}: {
  label: string
  value: string | null | undefined
  icon?: React.ReactNode
}) {
  if (!value) return null
  return (
    <div className="flex items-start justify-between gap-2">
      <dt className="flex items-center gap-1 text-xs text-muted-foreground">
        {icon}
        {label}
      </dt>
      <dd className="min-w-0 break-words text-right text-foreground">{value}</dd>
    </div>
  )
}
