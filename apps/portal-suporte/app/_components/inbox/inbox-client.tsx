'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Columns3, List, Loader2, WifiOff } from 'lucide-react'
import { useInboxStream } from '@/hooks/use-inbox-stream'
import { useConversationStream } from '@/hooks/use-conversation-stream'
import { useMeuAcesso } from '@/hooks/use-meu-acesso'
import type { StreamStatus } from '@/hooks/use-polling'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/hooks/use-toast'
import { whatsappApi, type WAMetrics } from '@/lib/api/whatsapp'
import { useAuth } from '@/lib/arara/AuthProvider'
import { hasMinLevel } from '@/lib/auth/access-control'
import type { AccessLevel } from '@/lib/auth/types'
import { cn } from '@/lib/utils'
import { AutoAssignToggle } from './auto-assign-toggle'
import { DefaultOperatorSelect } from './default-operator-select'
import { GruposToggle } from './grupos-toggle'
import { DispositivosPanel } from './dispositivos-panel'
import { BotToggle } from './bot-toggle'
import { MenuToggle } from './menu-toggle'
import { StatusToggle } from './status-toggle'
import { ConversationList, type InboxTab } from './conversation-list'
import { NovaConversaDialog } from './nova-conversa-dialog'
import { ThreadPane } from './thread-pane'
import { useAtalhosInbox } from '@/hooks/use-atalhos-inbox'
import { CrmContextPanel } from './crm-context-panel'
import { WAKanbanBoard } from './wa-kanban-board'

/** Lista (conversa a conversa) ou kanban (visão de operação por fase). */
type InboxView = 'lista' | 'kanban'

const METRICS_REFRESH_MS = 30_000

export function InboxClient() {
  const { toast } = useToast()
  const { user } = useAuth()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const agentFirstName = user?.name?.trim().split(/\s+/)[0] ?? null
  const meId = user?.id ?? null
  // `user.roles[0]` é o papel da PLATAFORMA; quem manda no portal é o
  // `Profile.role` — são tabelas diferentes e divergem. Era por isso que o
  // botão "Situação" não aparecia para o master: a barra lateral lia o Profile
  // e mostrava "Master", e esta tela lia o JWT e via outra coisa.
  // `useMeuAcesso` é a fonte única (Profile, com o JWT só como reserva).
  const { nivel } = useMeuAcesso()
  const role = nivel
  const [view, setView] = useState<InboxView>('lista')
  const [online, setOnline] = useState(false)
  const [presenceBusy, setPresenceBusy] = useState(false)
  // Painel de CRM alternável em telas pequenas.
  const [crmOpen, setCrmOpen] = useState(false)
  const [metrics, setMetrics] = useState<WAMetrics | null>(null)

  // ── Contas de WhatsApp (Fase 3c) ─────────────────────────────────────────
  // Lista vazia é o caso de hoje: nenhuma aba de conta aparece.
  const [contas, setContas] = useState<{ id: string; nome: string }[]>([])
  const [contaAtiva, setContaAtiva] = useState<string | null>(null)
  useEffect(() => {
    let vivo = true
    whatsappApi.listContas()
      .then((r) => { if (vivo) setContas(r.data ?? []) })
      // Sem contas cadastradas a rota devolve lista vazia; falhar aqui não
      // pode tirar a inbox do ar, então o erro só significa "sem abas".
      .catch(() => { if (vivo) setContas([]) })
    return () => { vivo = false }
  }, [])

  const { conversations, loading: listLoading, status: streamStatus } = useInboxStream(contaAtiva)
  const { messages, loading: threadLoading, refresh: refreshThread, naoLidasAoAbrir, historico: historicoThread, falhou: threadFalhou } =
    useConversationStream(selectedId)

  // Link direto para uma conversa (/inbox?c=<id>) — é o que faz o "Ver conversa"
  // da notificação abrir a conversa certa em vez de só a inbox.
  // Lido do window em vez de useSearchParams para não exigir Suspense na página.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('c')
    if (id) setSelectedId(id)
  }, [])

  // Presença real do servidor. Sem isto o toggle assumia `offline` no mount e
  // mostrava o atendente como offline mesmo estando online.
  useEffect(() => {
    let active = true
    whatsappApi
      .getPresence()
      .then((res) => {
        if (active) setOnline(Boolean(res.data?.online))
      })
      .catch(() => {
        /* mantém o default offline */
      })
    return () => {
      active = false
    }
  }, [])

  // Métricas: busca no mount e a cada ~30s.
  const loadMetrics = useCallback(async () => {
    try {
      const res = await whatsappApi.getMetrics()
      setMetrics(res.data)
    } catch {
      /* mantém os últimos valores; barra some se nunca carregou */
    }
  }, [])

  useEffect(() => {
    void loadMetrics()
    const t = setInterval(() => void loadMetrics(), METRICS_REFRESH_MS)
    return () => clearInterval(t)
  }, [loadMetrics])

  // Ao trocar de conversa, fecha o painel de CRM em mobile.
  useEffect(() => {
    setCrmOpen(false)
  }, [selectedId])

  async function handlePresenceToggle(next: boolean) {
    if (presenceBusy) return
    setPresenceBusy(true)
    setOnline(next) // otimista
    try {
      await whatsappApi.setPresence(next)
    } catch (err) {
      setOnline(!next) // reverte
      toast({
        title: 'Erro ao alterar presença',
        description: err instanceof Error ? err.message : 'Tente novamente.',
        variant: 'destructive',
      })
    } finally {
      setPresenceBusy(false)
    }
  }

  const selectedConversation = useMemo(
    () => conversations.find((c) => c.id === selectedId) ?? null,
    [conversations, selectedId],
  )

  // ── Rascunhos por conversa (Fase 1, A1) ────────────────────────────────
  // Em memória, de propósito: é rascunho de atendimento, não dado. Recarregar a
  // página limpa, e isso é o esperado — o que não pode é `Esc` apagar o que a
  // pessoa acabou de escrever.
  const rascunhos = useRef(new Map<string, string>())
  const guardarRascunho = useCallback((id: string, texto: string) => {
    if (texto) rascunhos.current.set(id, texto)
    else rascunhos.current.delete(id)
  }, [])

  // ── Atalhos (Fase 1, A2) ───────────────────────────────────────────────
  // As ações moram aqui porque é aqui que estão a lista filtrada e a seleção.
  const irPara = useCallback((passo: number) => {
    if (!conversations.length) return
    const i = conversations.findIndex((c) => c.id === selectedId)
    // Sem conversa aberta, ] abre a primeira e [ abre a última.
    const alvo = i < 0
      ? (passo > 0 ? 0 : conversations.length - 1)
      : Math.min(Math.max(i + passo, 0), conversations.length - 1)
    setSelectedId(conversations[alvo].id)
  }, [conversations, selectedId])

  const atenderAtual = useCallback(async () => {
    if (!selectedId) return
    const conv = conversations.find((c) => c.id === selectedId)
    // Já tem dono: o atalho não rouba conversa de ninguém em silêncio.
    if (!conv || conv.assigned_to) return
    try {
      await whatsappApi.assignConversation(selectedId)
      toast({ title: 'Conversa atribuída a você' })
    } catch (err) {
      toast({
        title: 'Não foi possível atender',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      })
    }
  }, [selectedId, conversations, toast])

  /**
   * Marca a conversa aberta como não lida e fecha o painel.
   *
   * A ordem importa: grava primeiro, fecha depois. Fechando antes, o ciclo de
   * consulta da thread ainda em tela poderia zerar o contador logo depois da
   * gravação — e a marca duraria menos que o toast.
   */
  const marcarNaoLida = useCallback(async () => {
    if (!selectedId) return
    try {
      await whatsappApi.marcarNaoLida(selectedId)
      setSelectedId(null)
      toast({ title: 'Conversa marcada como não lida' })
    } catch (err) {
      toast({
        title: 'Não foi possível marcar como não lida',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      })
    }
  }, [selectedId, toast])

  // A busca vive na thread; o atalho só levanta a bandeira.
  const [pedidoDeBusca, setPedidoDeBusca] = useState(0)

  // ── Nova conversa (Fase 2) ───────────────────────────────────────────────
  const [novaAberta, setNovaAberta] = useState(false)
  const [abaPedida, setAbaPedida] = useState<InboxTab>('minhas')
  const [pedidoDeAba, setPedidoDeAba] = useState(0)

  const aposNovaConversa = useCallback((id: string, existente: boolean) => {
    setSelectedId(id)
    setView('lista')
    // Criada, ela está em "Minhas" (o servidor atribui a quem criou). Já
    // existente, pode estar em qualquer aba — mandar para "Minhas" esconderia
    // a conversa que a pessoa acabou de pedir para ver.
    if (!existente) {
      setAbaPedida('minhas')
      setPedidoDeAba((n) => n + 1)
    }
    toast({
      title: existente ? 'Esta conversa já existia' : 'Conversa criada',
      description: existente
        ? 'Abri a conversa que já havia com esse número. Nada foi enviado.'
        : 'A mensagem foi enviada e a conversa está em Minhas.',
    })
  }, [toast])

  useAtalhosInbox({
    fechar: () => setSelectedId(null),
    proxima: () => irPara(1),
    anterior: () => irPara(-1),
    atender: () => void atenderAtual(),
    buscar: () => setPedidoDeBusca((n) => n + 1),
    novaConversa: () => setNovaAberta(true),
    naoLida: () => void marcarNaoLida(),
  })

  // Mudar fase exige developer+ no servidor (requireDeveloper). Sem espelhar a
  // regra aqui, o card arrastaria e só falharia no PATCH.
  const canMovePhase = role != null && hasMinLevel(role as AccessLevel, 'developer')

  // Clicar num card do board leva para a conversa — o board é ponto de partida,
  // não um lugar onde se responde.
  const openFromBoard = useCallback((id: string) => {
    setSelectedId(id)
    setView('lista')
  }, [])

  return (
    // Altura explícita: sem isto o h-full colapsava para a altura do conteúdo
    // e a tela toda ficava com ~470px num monitor de 900. Abaixo de lg o shell
    // reserva 3.5rem para a barra superior do menu.
    // min-w-0/overflow-hidden: como filho flex do shell, sem isto as colunas do
    // kanban esticavam a largura e a PÁGINA passava a rolar na horizontal, em
    // vez de rolar só o board.
    <div className="flex h-[calc(100dvh-3.5rem)] min-w-0 flex-col overflow-hidden lg:h-dvh">
      <div className="flex items-center justify-between border-b border-border bg-card px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          {/* O link "Voltar ao painel" saiu daqui: com o menu lateral na tela a
              navegação já está à esquerda, e o botão virava um segundo caminho
              para a mesma coisa. */}
          {/* Em telas estreitas o título quebrava em duas linhas e espremia os
              controles — que é o que o atendente precisa alcançar. */}
          <h1 className="hidden truncate text-lg font-semibold text-foreground sm:block">
            Inbox WhatsApp
          </h1>
        </div>
        <div className="flex items-center gap-3">
          {/* O kanban de conversas só existe aqui dentro: é a visão de operação
              do atendimento, não um board de chamados. */}
          <div
            className="flex items-center rounded-md border border-border p-0.5"
            role="group"
            aria-label="Visualização da inbox"
          >
            <ViewButton
              active={view === 'lista'}
              onClick={() => setView('lista')}
              icon={<List className="h-4 w-4" aria-hidden />}
              label="Lista"
            />
            <ViewButton
              active={view === 'kanban'}
              onClick={() => setView('kanban')}
              icon={<Columns3 className="h-4 w-4" aria-hidden />}
              label="Kanban"
            />
          </div>

          {/* Rodízio é regra da equipe — só admin+ altera. */}
          {(role === 'admin' || role === 'master') && (
            <>
              <MenuToggle />
              <BotToggle />
              <AutoAssignToggle />
              <DefaultOperatorSelect />
              <GruposToggle />
              <DispositivosPanel />
            </>
          )}

          {/* Só MASTER, ao contrário dos vizinhos (que são admin+): desligar
              isto cala o aviso de mudança de etapa para TODOS os clientes de
              uma vez, e o efeito é invisível — a Avisa responde 200 e ninguém
              percebe que parou. Decisão de 11/09/2026. */}
          {role === 'master' && <StatusToggle />}
          <ConnectionIndicator status={streamStatus} />
          {/* Presença do ATENDENTE (não do sistema): diz se você está
              disponível para receber conversa. O rodízio só entrega para quem
              está Online — sem isso, conversa cairia na fila de quem saiu
              para almoçar. Sem explicação em lugar nenhum, era o controle
              mais fácil de confundir com o "Ao vivo" ao lado. */}
          <label
            className="flex cursor-pointer items-center gap-2 text-sm"
            title={
              online
                ? 'Você está disponível: o rodízio pode te atribuir conversas novas. Desligue ao sair.'
                : 'Você está indisponível: o rodízio não te atribui conversas novas. Conversas já suas continuam suas.'
            }
          >
            <span
              className={online ? 'font-medium text-sem-success-fg' : 'text-muted-foreground'}
            >
              {online ? 'Online' : 'Offline'}
            </span>
            <Switch
              checked={online}
              onCheckedChange={(v) => void handlePresenceToggle(v)}
              disabled={presenceBusy}
              aria-label="Alternar presença online"
            />
          </label>
          {/* O botão de tema saiu daqui pelo mesmo motivo do "Painel": o menu
              lateral já tem "Modo claro/escuro", e dois controles para o mesmo
              estado no mesmo ecrã confundem. */}
        </div>
      </div>

      {/* Barra de métricas */}
      {metrics && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-4 py-2">
          <MetricChip label="Abertas" value={metrics.open} />
          <MetricChip label="Na fila" value={metrics.queue} />
          <MetricChip
            label="SLA em risco"
            value={metrics.slaAtRisk}
            tone={metrics.slaAtRisk > 0 ? 'warning' : 'neutral'}
          />
          {/* O servidor diz quando truncou na janela de 500. Número truncado
              SEM aviso é pior que número ausente, porque quem olha decide com
              ele — e com várias contas isso deixa de ser raro. */}
          {metrics.parcial && (
            <span
              title="A contagem bateu no limite de 500 registros por consulta: estes números são parciais."
              className="rounded-full border border-sem-warning-bd bg-sem-warning px-2 py-0.5 text-[11px] font-medium text-sem-warning-fg"
            >
              parcial
            </span>
          )}
        </div>
      )}

      {view === 'kanban' ? (
        <div className="min-h-0 flex-1">
          <WAKanbanBoard
            conversations={conversations}
            selectedId={selectedId}
            onSelect={openFromBoard}
            loading={listLoading}
            canMovePhase={canMovePhase}
          />
        </div>
      ) : (
      <div
        className={cn(
          // Coluna da lista mais larga (o BotConversa usa ~410px): com avatar +
          // empresa + chips, 320px cortava nome de empresa o tempo todo.
          'grid min-h-0 flex-1 grid-cols-1',
          selectedId
            ? 'md:grid-cols-[380px_1fr] xl:grid-cols-[380px_1fr_340px]'
            : 'md:grid-cols-[380px_1fr]',
        )}
      >
        {/* Uma instância só: em telas pequenas a lista some quando há conversa aberta. */}
        <div className={cn('min-h-0', selectedId ? 'hidden md:block' : 'block')}>
          <ConversationList
            conversations={conversations}
            selectedId={selectedId}
            onSelect={setSelectedId}
            loading={listLoading}
            meId={meId}
            onNovaConversa={() => setNovaAberta(true)}
            contas={contas}
            contaAtiva={contaAtiva}
            onContaAtiva={(id) => { setContaAtiva(id); setSelectedId(null) }}
            abaPedida={abaPedida}
            pedidoDeAba={pedidoDeAba}
          />
        </div>

        {/* Thread — em mobile some quando o painel de CRM está aberto */}
        <div
          className={cn(
            'relative min-h-0',
            selectedId ? 'block' : 'hidden md:block',
            crmOpen && 'hidden xl:block',
          )}
        >
          <ThreadPane
            naoLidas={naoLidasAoAbrir}
            falhou={threadFalhou}
            historico={historicoThread}
            onRefresh={refreshThread}
            onSent={refreshThread}
            conversation={selectedConversation}
            messages={messages}
            loading={threadLoading}
            agentFirstName={agentFirstName}
            meId={meId}
            rascunho={selectedId ? (rascunhos.current.get(selectedId) ?? '') : ''}
            onRascunho={(texto) => selectedId && guardarRascunho(selectedId, texto)}
            pedidoDeBusca={pedidoDeBusca}
            onToggleCrm={selectedId ? () => setCrmOpen((v) => !v) : undefined}
            crmOpen={crmOpen}
            onMarcarNaoLida={() => void marcarNaoLida()}
          />
        </div>

        {/* Painel de CRM — 3ª coluna só a partir de xl; abaixo disso é alternável
            pelo botão, senão sobra um terceiro item numa grade de 2 colunas. */}
        {selectedId && (
          <div
            className={cn(
              'h-full min-h-0 flex-col border-l border-border',
              crmOpen ? 'flex xl:flex' : 'hidden xl:flex',
            )}
          >
            {/* Abaixo de xl o painel ocupa o lugar da conversa, e o botão que o
                fecha mora na conversa: sem este, não há como voltar. */}
            <div className="flex shrink-0 items-center border-b border-border bg-card px-2 py-1.5 xl:hidden">
              <button
                type="button"
                onClick={() => setCrmOpen(false)}
                aria-label="Voltar à conversa"
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden />
                Voltar à conversa
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
              <CrmContextPanel conversationId={selectedId} />
            </div>
          </div>
        )}
      </div>
      )}
      <NovaConversaDialog
        aberto={novaAberta}
        onFechar={() => setNovaAberta(false)}
        conversas={conversations}
        onPronto={aposNovaConversa}
      />
    </div>
  )
}

// ─── Seletor de visualização ──────────────────────────────────────────────────

function ViewButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={label}
      className={cn(
        'flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'bg-muted text-foreground'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}

// ─── Conexão ──────────────────────────────────────────────────────────────────

/**
 * Sinal de vida do stream. Antes, uma conexão caída ficava invisível: a lista
 * parava e o atendente concluía que não havia mensagem nova.
 * Fica discreto quando está tudo bem e só chama atenção quando cai.
 */
function ConnectionIndicator({ status }: { status: StreamStatus }) {
  if (status === 'live') {
    return (
      <span
        className="flex items-center gap-1.5 text-xs text-muted-foreground"
        title="Conexão do portal com o servidor: a lista está se atualizando sozinha. Não tem relação com a sua presença — é o estado da tela."
      >
        <span className="h-1.5 w-1.5 rounded-full bg-sem-success-fg" aria-hidden />
        <span className="hidden sm:inline">Ao vivo</span>
      </span>
    )
  }

  const reconnecting = status === 'connecting'
  return (
    <span
      className={cn(
        'flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium',
        reconnecting
          ? 'border-sem-warning-bd bg-sem-warning text-sem-warning-fg'
          : 'border-sem-error-bd bg-sem-error text-sem-error-fg',
      )}
      role="status"
      title={
        reconnecting
          ? 'Reconectando ao servidor'
          : 'Sem conexão em tempo real — as mensagens podem estar atrasadas'
      }
    >
      {reconnecting ? (
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
      ) : (
        <WifiOff className="h-3 w-3" aria-hidden />
      )}
      {reconnecting ? 'Reconectando…' : 'Sem conexão'}
    </span>
  )
}

// ─── Métricas ─────────────────────────────────────────────────────────────────

function MetricChip({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: number
  tone?: 'neutral' | 'warning'
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
        tone === 'warning'
          ? 'border-sem-warning-bd bg-sem-warning text-sem-warning-fg'
          : 'border-border bg-muted text-muted-foreground',
      )}
    >
      {label}
      <span
        className={cn(
          'font-semibold',
          tone === 'warning' ? 'text-sem-warning-fg' : 'text-foreground',
        )}
      >
        {value}
      </span>
    </span>
  )
}
