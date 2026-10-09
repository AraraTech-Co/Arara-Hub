'use client'

import { useEffect, useState } from 'react'
import { rotuloDoContato } from '@/lib/wa-contato'
import { Info, StickyNote } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  whatsappApi,
  type WAThreadMessage,
  type WAInboxConversation,
  type WAPhase,
} from '@/lib/api/whatsapp'
import { WA_PHASES } from '@/lib/wa-phase'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { AssignControls } from './assign-controls'
import { ContactAvatar } from './contact-avatar'
import { MessageList, splitAuthor } from './message-list'
import { Composer } from './composer'
import { NotesPanel } from './notes-panel'

// Fases (camada Pipefy). O BotConversa não tem isto — é vantagem nossa.
// A lista canônica vive em lib/wa-phase.ts, compartilhada com o kanban.
const PHASES = WA_PHASES

function headerName(c: WAInboxConversation): string {
  return rotuloDoContato(c.contact?.name, c.contact_name, c.remote_jid)
}

interface ThreadPaneProps {
  conversation: WAInboxConversation | null
  messages: WAThreadMessage[]
  loading: boolean
  /** Quantas estavam por ler quando a conversa foi aberta — desenha o divisor. */
  naoLidas?: number
  /** A última busca de mensagens falhou — não é conversa vazia. */
  falhou?: boolean
  /** O que o portal tem desta conversa — ver use-conversation-stream. */
  historico?: { total: number; desde: string | null; lacuna: boolean } | null
  /** Tentar buscar de novo depois de uma falha. */
  onRefresh?: () => void
  agentFirstName: string | null
  /** Id do atendente logado (de /api/auth/me). */
  meId: string | null
  /** Atualiza a thread logo após um envio, sem esperar o ciclo de consulta. */
  onSent?: () => void
  /** Alterna o painel de contato onde ele não cabe como 3ª coluna. */
  onToggleCrm?: () => void
  crmOpen?: boolean
}

/**
 * Orquestra o painel da conversa: cabeçalho, fases e a aba ativa.
 * A lista de mensagens, o composer e as notas ficam em componentes próprios —
 * este arquivo passava de 500 linhas fazendo tudo.
 */
export function ThreadPane({
  conversation,
  messages,
  loading,
  naoLidas = 0,
  falhou = false,
  historico = null,
  onRefresh,
  onSent,
  agentFirstName,
  meId,
  onToggleCrm,
  crmOpen,
}: ThreadPaneProps) {
  // Mensagem citada pelo menu → composer. Some ao trocar de conversa e ao enviar.
  const [respondendoA, setRespondendoA] = useState<
    { id: string; message_id?: string | null; autor: string | null; corpo: string } | null
  >(null)
  useEffect(() => setRespondendoA(null), [conversation?.id])

  const { toast } = useToast()
  // Fase otimista: sobrepõe a da conversa até o stream confirmar.
  const [pendingPhase, setPendingPhase] = useState<WAPhase | null>(null)
  const [tab, setTab] = useState<'chat' | 'notes'>('chat')

  const conversationId = conversation?.id ?? null

  useEffect(() => {
    setPendingPhase(null)
    setTab('chat')
  }, [conversationId])

  if (!conversation) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Selecione uma conversa</p>
      </div>
    )
  }

  const currentPhase: WAPhase = pendingPhase ?? conversation.phase

  async function handlePhaseChange(next: WAPhase) {
    if (!conversation || next === currentPhase) return
    const previous = currentPhase
    setPendingPhase(next)
    try {
      await whatsappApi.updateConversation(conversation.id, { phase: next })
    } catch (err) {
      setPendingPhase(previous === next ? null : previous)
      toast({
        title: 'Erro ao mudar a fase',
        description: err instanceof Error ? err.message : 'Tente novamente.',
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="border-b border-border bg-card px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <ContactAvatar
              name={headerName(conversation)}
              seed={conversation.remote_jid}
              size="md"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">
                {headerName(conversation)}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {conversation.company?.name ?? conversation.remote_jid.replace(/@.*$/, '')}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <AssignControls conversation={conversation} meId={meId} />
            {/* Inline, não flutuante: sobreposto ao "Atender" ele cobria o botão. */}
            {onToggleCrm && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={onToggleCrm}
                aria-pressed={crmOpen}
                aria-label={crmOpen ? 'Fechar painel do contato' : 'Abrir painel do contato'}
                title={crmOpen ? 'Fechar painel do contato' : 'Abrir painel do contato'}
                className="h-8 w-8 xl:hidden"
              >
                <Info className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1" role="tablist" aria-label="Fase">
          {PHASES.map((p) => {
            const active = p.key === currentPhase
            return (
              <button
                key={p.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => void handlePhaseChange(p.key)}
                className={cn(
                  'rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
                  active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-muted text-muted-foreground hover:text-foreground',
                )}
              >
                {p.label}
              </button>
            )
          })}
        </div>

        <div className="mt-3 flex gap-4 border-b border-border" role="tablist" aria-label="Painel">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'chat'}
            onClick={() => setTab('chat')}
            className={cn(
              '-mb-px border-b-2 pb-1.5 text-xs font-medium transition-colors',
              tab === 'chat'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            Conversa
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'notes'}
            onClick={() => setTab('notes')}
            className={cn(
              '-mb-px flex items-center gap-1 border-b-2 pb-1.5 text-xs font-medium transition-colors',
              tab === 'notes'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            <StickyNote className="h-3.5 w-3.5" />
            Notas internas
          </button>
        </div>
      </div>

      {tab === 'notes' ? (
        <NotesPanel conversationId={conversation.id} />
      ) : (
        <>
          <MessageList
            messages={messages}
            loading={loading}
            falhou={falhou}
            historico={historico}
            onTentarDeNovo={onRefresh}
            naoLidas={naoLidas}
            meId={meId}
            onResponder={(m) => {
              const { text } = splitAuthor(m.body ?? '')
              setRespondendoA({
                id: m.id,
                message_id: m.message_id,
                autor: m.from_me ? (m.sender_name ?? 'Você') : (m.sender_name ?? null),
                corpo: text || m.body || '[anexo]',
              })
            }}
            onMudou={() => onSent?.()}
          />
          <Composer
            conversationId={conversation.id}
            agentFirstName={agentFirstName}
            onSent={onSent}
            respondendoA={respondendoA}
            onCancelarResposta={() => setRespondendoA(null)}
          />
        </>
      )}
    </div>
  )
}
