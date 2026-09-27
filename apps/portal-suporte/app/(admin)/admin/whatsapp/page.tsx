'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { getPriorityColor, getPriorityLabel } from '@/lib/ticket-priority'
import { AlertTriangle, Clock, Search, RefreshCw, ArrowUpCircle, PauseCircle, PlayCircle, CheckCircle, Loader2 } from 'lucide-react'
import { useWhatsappConversations, useWhatsappMessages } from '@/hooks/use-whatsapp'
import { whatsappApi } from '@/lib/api/whatsapp'
import type { WAConversation, WAMessage } from '@/lib/api/whatsapp'
import { araraApiFetch } from '@/lib/arara/arara-api-fetch'

// ─── Helpers ─────────────────────────────────────────────────────────────────
function slaLabel(sla: WAConversation['ticket'] extends null ? never : NonNullable<WAConversation['ticket']>['sla']): string {
  if (!sla) return ''
  if (sla.breached) return 'SLA vencido'
  const mins = Math.max(0, Math.floor((new Date(sla.resolution_deadline).getTime() - Date.now()) / 60000))
  const h = Math.floor(mins / 60), m = mins % 60
  return h > 0 ? `${h}h ${m}m` : `${m}min`
}

function slaColor(sla: WAConversation['ticket'] extends null ? never : NonNullable<WAConversation['ticket']>['sla']): string {
  if (!sla) return 'text-muted-foreground/70'
  if (sla.breached) return 'text-sem-error-fg font-semibold'
  const mins = Math.floor((new Date(sla.resolution_deadline).getTime() - Date.now()) / 60000)
  return mins <= 30 ? 'text-sem-error-fg font-semibold' : mins <= 120 ? 'text-sem-warning-fg font-semibold' : 'text-foreground/60'
}

const statusBadge: Record<string, string> = {
  open:        'bg-sem-success text-sem-success-fg border-sem-success-bd',
  transferred: 'bg-status-migration text-status-migration-fg border-status-migration-bd',
  closed:      'bg-muted text-muted-foreground border-border',
}

// ─── Demo data (shown when no real webhook data exists) ───────────────────────
const DEMO_CONV_ID = 'demo-1'
const DEMO_CONVERSATIONS: WAConversation[] = [
  {
    id: DEMO_CONV_ID,
    remote_jid: '5511999887766@s.whatsapp.net',
    contact_name: 'Carlos Mendes',
    status: 'open',
    updated_at: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
    last_message: {
      id: 'dm-6',
      from_me: false,
      sender_name: 'Carlos Mendes',
      body: 'Perfeito! Mas acabei de notar que o módulo de relatórios também está fora.',
      media_type: null,
      timestamp: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
    },
    ticket: {
      id: 'demo-ticket-1',
      title: 'Sistema de ERP fora do ar — filial SP',
      status: 'em_atendimento',
      priority: 'urgent',
      ticket_number: '#2841',
      company_name: 'Grupo Mendes Ltda',
      assignee: { id: 'agent-1', fullName: 'Ana Souza' },
      sla: {
        resolution_deadline: new Date(Date.now() + 38 * 60 * 1000).toISOString(),
        breached: false,
      },
    },
  },
  {
    id: 'demo-2',
    remote_jid: '5521988776655@s.whatsapp.net',
    contact_name: 'Fernanda Costa',
    status: 'transferred',
    updated_at: new Date(Date.now() - 42 * 60 * 1000).toISOString(),
    last_message: {
      id: 'dm2-3',
      from_me: true,
      sender_name: 'Suporte',
      body: 'Encaminhei para o time de infraestrutura. Eles entrarão em contato em até 30 minutos.',
      media_type: null,
      timestamp: new Date(Date.now() - 42 * 60 * 1000).toISOString(),
    },
    ticket: {
      id: 'demo-ticket-2',
      title: 'Lentidão no acesso VPN',
      status: 'aguardando',
      priority: 'high',
      ticket_number: '#2839',
      company_name: 'TechVision S.A.',
      assignee: { id: 'agent-2', fullName: 'Rodrigo Lima' },
      sla: {
        resolution_deadline: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
        breached: false,
      },
    },
  },
  {
    id: 'demo-3',
    remote_jid: '5531977665544@s.whatsapp.net',
    contact_name: 'Paulo Ribeiro',
    status: 'closed',
    updated_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    last_message: {
      id: 'dm3-5',
      from_me: true,
      sender_name: 'Suporte',
      body: 'Ótimo! Fico feliz que tenha resolvido. Qualquer dúvida estamos à disposição.',
      media_type: null,
      timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    },
    ticket: {
      id: 'demo-ticket-3',
      title: 'Erro ao gerar boletos no sistema',
      status: 'resolvido_com_manual',
      priority: 'medium',
      ticket_number: '#2835',
      company_name: 'Ribeiro & Filhos ME',
      assignee: { id: 'agent-1', fullName: 'Ana Souza' },
      sla: { resolution_deadline: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), breached: false },
    },
  },
]

const DEMO_MESSAGES: Record<string, WAMessage[]> = {
  [DEMO_CONV_ID]: [
    {
      id: 'dm-1',
      from_me: false,
      sender_name: 'Carlos Mendes',
      body: 'Olá, bom dia! Estou tendo um problema sério aqui. O nosso sistema de ERP parou de funcionar completamente na filial de São Paulo. Todos os colaboradores estão sem acesso.',
      media_type: null,
      timestamp: new Date(Date.now() - 32 * 60 * 1000).toISOString(),
    },
    {
      id: 'dm-2',
      from_me: true,
      sender_name: 'Assistente IA',
      body: 'Olá, Carlos! Recebemos seu ticket #2841 com prioridade Muito alta. Nossa equipe já foi notificada e um especialista entrará em contato em até 15 minutos. Enquanto aguarda, pode nos informar: o erro aconteceu após alguma atualização ou manutenção recente?',
      media_type: null,
      timestamp: new Date(Date.now() - 31 * 60 * 1000).toISOString(),
    },
    {
      id: 'dm-3',
      from_me: false,
      sender_name: 'Carlos Mendes',
      body: 'Sim! Ontem à noite nossa TI fez uma atualização no servidor. Hoje de manhã quando os funcionários chegaram ninguém conseguia logar.',
      media_type: null,
      timestamp: new Date(Date.now() - 28 * 60 * 1000).toISOString(),
    },
    {
      id: 'dm-4',
      from_me: true,
      sender_name: 'Ana Souza',
      body: 'Bom dia Carlos, aqui é a Ana da equipe de suporte. Obrigada pela informação sobre a atualização. Já estou analisando os logs do servidor. Você tem acesso ao painel de administração do ERP ou somente os usuários finais estão sem acesso?',
      media_type: null,
      timestamp: new Date(Date.now() - 22 * 60 * 1000).toISOString(),
    },
    {
      id: 'dm-5',
      from_me: false,
      sender_name: 'Carlos Mendes',
      body: 'Eu tenho acesso admin sim! Acabei de tentar e consigo entrar. Mas aparece uma mensagem de erro: "Falha na conexão com banco de dados — código ERR_DB_TIMEOUT_001".',
      media_type: null,
      timestamp: new Date(Date.now() - 18 * 60 * 1000).toISOString(),
    },
    {
      id: 'dm-6',
      from_me: false,
      sender_name: 'Carlos Mendes',
      body: 'Perfeito! Mas acabei de notar que o módulo de relatórios também está fora.',
      media_type: null,
      timestamp: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
    },
  ],
  'demo-2': [
    {
      id: 'dm2-1',
      from_me: false,
      sender_name: 'Fernanda Costa',
      body: 'Boa tarde! Nossa equipe está com muita lentidão no acesso à VPN desde hoje cedo. Já reiniciamos as máquinas e o problema persiste.',
      media_type: null,
      timestamp: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
    },
    {
      id: 'dm2-2',
      from_me: true,
      sender_name: 'Rodrigo Lima',
      body: 'Boa tarde, Fernanda! Registrei seu ticket #2839. Quantos usuários estão sendo afetados e em qual escritório?',
      media_type: null,
      timestamp: new Date(Date.now() - 85 * 60 * 1000).toISOString(),
    },
    {
      id: 'dm2-3',
      from_me: true,
      sender_name: 'Suporte',
      body: 'Encaminhei para o time de infraestrutura. Eles entrarão em contato em até 30 minutos.',
      media_type: null,
      timestamp: new Date(Date.now() - 42 * 60 * 1000).toISOString(),
    },
  ],
  'demo-3': [
    {
      id: 'dm3-1',
      from_me: false,
      sender_name: 'Paulo Ribeiro',
      body: 'Oi, estou tentando gerar boletos aqui no sistema e aparece um erro. Preciso muito disso hoje para fechar o faturamento do mês.',
      media_type: null,
      timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 'dm3-2',
      from_me: true,
      sender_name: 'Ana Souza',
      body: 'Olá Paulo! Já identifiquei o problema. Há uma configuração do certificado digital que expirou ontem. Vou gerar um novo agora.',
      media_type: null,
      timestamp: new Date(Date.now() - 5.5 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 'dm3-3',
      from_me: true,
      sender_name: 'Ana Souza',
      body: 'Pronto! Já atualizamos o certificado. Pode tentar gerar o boleto novamente?',
      media_type: null,
      timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 'dm3-4',
      from_me: false,
      sender_name: 'Paulo Ribeiro',
      body: 'Funcionou!! Muito obrigado, estava desesperado aqui haha',
      media_type: null,
      timestamp: new Date(Date.now() - 4.5 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 'dm3-5',
      from_me: true,
      sender_name: 'Suporte',
      body: 'Ótimo! Fico feliz que tenha resolvido. Qualquer dúvida estamos à disposição.',
      media_type: null,
      timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    },
  ],
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function WhatsAppSuportePage() {
  const [selectedId,    setSelectedId]    = useState<string | null>(null)
  const [isDemo,        setIsDemo]        = useState(false)
  const [message,       setMessage]       = useState('')
  const [search,        setSearch]        = useState('')
  const [sending,       setSending]       = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [slaPaused,     setSlaPaused]     = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  // ── API hooks ─────────────────────────────────────────────────────────────
  const {
    conversations: liveConversations,
    loading,
    refresh: refreshConversations,
  } = useWhatsappConversations()

  const {
    messages: liveMessages,
    sendMessage: sendWhatsappMessage,
  } = useWhatsappMessages(isDemo ? null : selectedId)

  // Decide demo vs live
  const conversations: WAConversation[] = liveConversations.length > 0 ? liveConversations : DEMO_CONVERSATIONS
  const selected: WAConversation | null = conversations.find(c => c.id === selectedId) ?? null
  const messages: WAMessage[]           = isDemo
    ? (DEMO_MESSAGES[selectedId ?? ''] ?? [])
    : liveMessages

  // Sync isDemo and selectedId when live data loads
  useEffect(() => {
    if (liveConversations.length > 0) {
      setIsDemo(false)
      if (!selectedId) setSelectedId(liveConversations[0].id)
    } else if (!loading) {
      setIsDemo(true)
      if (!selectedId) setSelectedId(DEMO_CONV_ID)
    }
  }, [liveConversations, loading, selectedId])

  const loadConversations = useCallback(async () => {
    await refreshConversations()
  }, [refreshConversations])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Send message ──────────────────────────────────────────────────────────
  async function sendMessage() {
    const text = message.trim()
    if (!text || !selectedId || sending) return
    setSending(true)
    setMessage('')
    await sendWhatsappMessage(text)
    setSending(false)
  }

  const ticketId = selected?.ticket?.id ?? null

  async function escalateN2() {
    if (!ticketId || actionLoading) return
    setActionLoading('escalar')
    try {
      const res = await araraApiFetch(`/api/sla/tracking/${ticketId}/escalate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (res.ok) {
        alert('Ticket escalado para N2 com sucesso.')
      } else {
        const j = await res.json().catch(() => ({}))
        alert(j?.error ?? 'Erro ao escalar ticket.')
      }
    } finally {
      setActionLoading(null)
    }
  }

  async function toggleSla() {
    if (!ticketId || actionLoading) return
    setActionLoading('sla')
    try {
      const res = await araraApiFetch(`/api/sla/tracking/${ticketId}/pause`, { method: 'POST' })
      if (res.ok) {
        const j = await res.json()
        setSlaPaused(j.data?.paused ?? !slaPaused)
      } else {
        alert('Erro ao alterar SLA.')
      }
    } finally {
      setActionLoading(null)
    }
  }

  async function finalizarAtendimento() {
    if (!ticketId || actionLoading) return
    if (!confirm('Finalizar atendimento e fechar este ticket?')) return
    setActionLoading('finalizar')
    try {
      const res = await araraApiFetch(`/api/tickets/${ticketId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'fechado' }),
      })
      if (res.ok) {
        await refreshConversations()
        setSelectedId(null)
      } else {
        alert('Erro ao finalizar atendimento.')
      }
    } finally {
      setActionLoading(null)
    }
  }

  const filtered = conversations.filter(c => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      c.contact_name?.toLowerCase().includes(q) ||
      c.remote_jid.includes(q) ||
      c.ticket?.company_name?.toLowerCase().includes(q) ||
      c.last_message?.body.toLowerCase().includes(q)
    )
  })

  const phone = selected?.remote_jid.replace('@s.whatsapp.net', '').replace('@g.us', '') ?? ''

  return (
    <div className="pt-14 lg:pt-0 min-h-screen bg-muted/50">
      {/* Header */}
      <div className="border-b bg-background">
        <div className="mx-auto flex max-w-350 items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500 text-xl font-bold text-white shadow-sm">W</div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">WhatsApp · Suporte Híbrido</h1>
              <p className="text-sm text-muted-foreground">Mensagens do banco de dados · webhook ativo em /api/webhooks/whatsapp</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={loadConversations}
              className="flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium shadow-sm hover:bg-muted/50"
            >
              <RefreshCw className="h-4 w-4" /> Atualizar
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-350 px-6 py-6 space-y-4">
        {/* Demo banner */}
        {isDemo && (
          <div className="flex items-center gap-3 rounded-2xl border border-sem-warning-bd bg-sem-warning px-5 py-3">
            <AlertTriangle className="h-4 w-4 shrink-0 text-sem-warning-fg" />
            <p className="text-sm text-sem-warning-fg">
              <strong>Modo demonstração</strong> — exibindo conversas fictícias. Assim que o webhook receber mensagens reais via Evolution API, elas aparecerão aqui automaticamente.
            </p>
          </div>
        )}
        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            { t: 'Conversas ativas', v: conversations.filter(c => c.status === 'open').length, c: 'text-foreground' },
            { t: 'Transferidas',     v: conversations.filter(c => c.status === 'transferred').length, c: 'text-indigo-700' },
            { t: 'Com SLA vencido',  v: conversations.filter(c => c.ticket?.sla?.breached).length, c: 'text-sem-error-fg' },
            { t: 'Encerradas',       v: conversations.filter(c => c.status === 'closed').length, c: 'text-sem-success-fg' },
          ].map(({ t, v, c }) => (
            <div key={t} className="rounded-2xl bg-card p-5 shadow-[var(--shadow-media)]">
              <p className="text-sm text-muted-foreground">{t}</p>
              <div className={`mt-2 text-3xl font-bold ${c}`}>{v}</div>
            </div>
          ))}
        </div>

        {/* 3-column layout */}
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[360px_minmax(0,1fr)_300px]">
          {/* Conversation list */}
          <section className="rounded-2xl border border-border bg-background shadow-sm flex flex-col">
            <div className="border-b border-border/50 px-4 py-3 space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">Conversas</h2>
                <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground/60">
                  {filtered.length}
                </span>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/70" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar..."
                  className="w-full rounded-xl border border-border bg-muted/50 pl-9 pr-3 py-2 text-sm outline-none placeholder:text-muted-foreground/70"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 max-h-170">
              {loading && <p className="p-4 text-center text-sm text-muted-foreground/70">Carregando...</p>}
              {!loading && filtered.length === 0 && (
                <p className="p-4 text-center text-sm text-muted-foreground/70">Nenhuma conversa encontrada.</p>
              )}
              {filtered.map(c => {
                const sl = c.ticket?.sla ? slaLabel(c.ticket.sla) : null
                const sc = c.ticket?.sla ? slaColor(c.ticket.sla) : 'text-muted-foreground/70'
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    className={`mb-2 w-full rounded-2xl border p-4 text-left transition hover:border-border hover:bg-muted/50 ${
                      c.id === selectedId ? 'border-sem-success-bd bg-emerald-50/40' : 'border-transparent bg-background'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-background text-sm font-semibold text-foreground">
                          {(c.contact_name ?? phone).charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-sm">{c.contact_name ?? c.remote_jid}</p>
                          <p className="text-xs text-muted-foreground">{c.remote_jid.replace('@s.whatsapp.net', '')}</p>
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground/70 shrink-0">
                        {new Date(c.updated_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${statusBadge[c.status] ?? statusBadge.open}`}>
                        {c.status === 'open' ? 'Aberta' : c.status === 'transferred' ? 'Transferida' : 'Encerrada'}
                      </span>
                      {c.ticket?.priority && (
                        <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${getPriorityColor(c.ticket.priority)}`}>
                          {getPriorityLabel(c.ticket.priority)}
                        </span>
                      )}
                    </div>

                    <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                      {c.last_message?.body ?? '—'}
                    </p>

                    {sl && (
                      <p className={`mt-1 text-xs ${sc}`}>SLA: {sl}</p>
                    )}
                  </button>
                )
              })}
            </div>
          </section>

          {/* Chat */}
          <section className="flex flex-col rounded-2xl border border-border bg-background shadow-sm overflow-hidden">
            {!selected ? (
              <div className="flex flex-1 items-center justify-center py-32 text-muted-foreground/70 text-sm">
                Selecione uma conversa
              </div>
            ) : (
              <>
                <div className="border-b border-border/50 px-5 py-4">
                  <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-semibold">{selected.contact_name ?? phone}</h2>
                        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusBadge[selected.status] ?? statusBadge.open}`}>
                          {selected.status === 'open' ? 'Aberta' : selected.status === 'transferred' ? 'Transferida' : 'Encerrada'}
                        </span>
                        {selected.ticket?.priority && (
                          <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${getPriorityColor(selected.ticket.priority)}`}>
                            {getPriorityLabel(selected.ticket.priority)} prioridade
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {phone}
                        {selected.ticket?.ticket_number && ` · Ticket ${selected.ticket.ticket_number}`}
                        {selected.ticket?.company_name  && ` · ${selected.ticket.company_name}`}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button className="rounded-xl border border-border px-3 py-2 text-sm font-medium text-foreground/60 hover:bg-muted/50">
                        Assumir atendimento
                      </button>
                      {selected.ticket && (
                        <a
                          href={`/admin/tickets/view/?id=${encodeURIComponent(selected.ticket.id)}`}
                          className="rounded-xl border border-sem-info-bd bg-sem-info px-3 py-2 text-sm font-medium text-sem-info-fg hover:bg-sem-info/80"
                        >
                          Ver ticket
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto space-y-4 px-5 py-5 min-h-95 max-h-115">
                  {messages.length === 0 && (
                    <p className="text-center text-sm text-muted-foreground/70">Nenhuma mensagem ainda.</p>
                  )}
                  {messages.map(msg => {
                    const isMe = msg.from_me
                    return (
                      <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[78%] rounded-3xl px-4 py-3 shadow-sm ${
                          isMe
                            ? 'rounded-br-md bg-emerald-500 text-white'
                            : 'rounded-bl-md bg-background border border-border'
                        }`}>
                          <div className="mb-1 text-xs font-medium opacity-70">
                            {isMe ? 'Suporte' : (msg.sender_name ?? 'Cliente')}
                          </div>
                          <p className="text-sm leading-6">{msg.body}</p>
                          <div className={`mt-1 text-right text-xs ${isMe ? 'text-emerald-100' : 'text-muted-foreground/70'}`}>
                            {new Date(msg.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  <div ref={bottomRef} />
                </div>

                {/* Input */}
                <div className="border-t border-border bg-background p-4">
                  <div className="rounded-2xl border border-border bg-muted/50 p-3">
                    <textarea
                      rows={3}
                      value={message}
                      onChange={e => setMessage(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                      placeholder="Continue o atendimento. A mensagem será enviada via Evolution API e salva no banco..."
                      className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
                    />
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-xs text-muted-foreground/70">Enter para enviar · Shift+Enter para nova linha</span>
                      <button
                        onClick={sendMessage}
                        disabled={sending || !message.trim()}
                        className="rounded-xl bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-40"
                      >
                        {sending ? 'Enviando...' : 'Enviar'}
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </section>

          {/* Right panel */}
          <aside className="space-y-4">
            {selected?.ticket ? (
              <>
                <div className="rounded-2xl bg-card p-5 shadow-[var(--shadow-media)]">
                  <h3 className="font-semibold">Dados do ticket</h3>
                  <div className="mt-4 space-y-3 text-sm text-foreground/60">
                    <div className="flex items-center justify-between">
                      <span>Status</span>
                      <span className="font-medium text-foreground">{selected.ticket.status}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Responsável</span>
                      <span className="font-medium text-foreground">
                        {selected.ticket.assignee?.fullName ?? 'Não atribuído'}
                      </span>
                    </div>
                    {selected.ticket.sla && (
                      <div className="flex items-center justify-between">
                        <span>SLA</span>
                        <span className={slaColor(selected.ticket.sla)}>
                          {slaLabel(selected.ticket.sla)}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span>Canal</span>
                      <span className="font-medium text-foreground">WhatsApp</span>
                    </div>
                    {selected.ticket.company_name && (
                      <div className="flex items-center justify-between">
                        <span>Empresa</span>
                        <span className="font-medium text-foreground truncate max-w-32">{selected.ticket.company_name}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl bg-card p-5 shadow-[var(--shadow-media)]">
                  <h3 className="font-semibold">Ações rápidas</h3>
                  <div className="mt-4 grid gap-2">
                    <button
                      disabled
                      className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-left text-sm font-medium text-muted-foreground/70 cursor-not-allowed opacity-50"
                    >
                      Criar tarefa vinculada
                    </button>
                    <button
                      onClick={escalateN2}
                      disabled={!!actionLoading || !ticketId}
                      className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-left text-sm font-medium text-foreground/80 hover:bg-muted/50 transition disabled:opacity-50"
                    >
                      {actionLoading === 'escalar' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpCircle className="h-4 w-4 text-orange-500" />}
                      Escalar para N2
                    </button>
                    <button
                      onClick={toggleSla}
                      disabled={!!actionLoading || !ticketId}
                      className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-left text-sm font-medium text-foreground/80 hover:bg-muted/50 transition disabled:opacity-50"
                    >
                      {actionLoading === 'sla' ? <Loader2 className="h-4 w-4 animate-spin" /> : slaPaused ? <PlayCircle className="h-4 w-4 text-green-500" /> : <PauseCircle className="h-4 w-4 text-blue-500" />}
                      {slaPaused ? 'Retomar SLA' : 'Pausar SLA'}
                    </button>
                    <button
                      onClick={finalizarAtendimento}
                      disabled={!!actionLoading || !ticketId}
                      className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-left text-sm font-medium text-foreground/80 hover:bg-muted/50 transition disabled:opacity-50"
                    >
                      {actionLoading === 'finalizar' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4 text-muted-foreground/70" />}
                      Finalizar atendimento
                    </button>
                  </div>
                </div>
              </>
            ) : selected ? (
              <div className="rounded-2xl border border-sem-warning-bd bg-sem-warning p-5">
                <div className="flex items-center gap-2 text-sem-warning-fg">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <p className="text-sm font-medium">Conversa sem ticket vinculado</p>
                </div>
                <p className="mt-2 text-xs text-sem-warning-fg">
                  Esta conversa foi iniciada mas ainda não possui ticket associado.
                </p>
              </div>
            ) : null}
          </aside>
        </div>
      </div>
    </div>
  )
}
