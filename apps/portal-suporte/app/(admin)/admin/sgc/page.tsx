'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { getPriorityColor, getPriorityLabel } from '@/lib/ticket-priority'
import { AlertTriangle, RefreshCw, Search, Send, Loader2, ArrowUpCircle, PauseCircle, PlayCircle, CheckCircle } from 'lucide-react'
import { araraApiFetch } from '@/lib/arara/arara-api-fetch'
import { usePolling } from '@/hooks/use-polling'

// ─── Types ─────────────────────────────────────────────────────────────────────
interface SgcConversation {
  id: string
  title: string
  status: string
  priority: string
  ticket_number: string | null
  company_name: string | null
  contact_email: string | null
  updated_at: string
  assignee: { id: string; fullName: string } | null
  sla: { resolution_deadline: string; breached: boolean } | null
  last_message: { body: string; sender: string; from_agent: boolean; timestamp: string } | null
}

interface SgcMessage {
  id: string
  conteudo: string
  remetente: string
  interno: boolean
  criado_em: string
  from_agent: boolean
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
function slaLabel(sla: NonNullable<SgcConversation['sla']>) {
  if (sla.breached) return 'SLA vencido'
  const mins = Math.max(0, Math.floor((new Date(sla.resolution_deadline).getTime() - Date.now()) / 60000))
  const h = Math.floor(mins / 60), m = mins % 60
  return h > 0 ? `${h}h ${m}m` : `${m}min`
}

function slaColor(sla: NonNullable<SgcConversation['sla']>) {
  if (sla.breached) return 'text-sem-error-fg font-semibold'
  const mins = Math.floor((new Date(sla.resolution_deadline).getTime() - Date.now()) / 60000)
  return mins <= 30 ? 'text-sem-error-fg font-semibold' : mins <= 120 ? 'text-sem-warning-fg font-semibold' : 'text-foreground/60'
}

const statusBadge: Record<string, string> = {
  novos_chamados:         'bg-sem-info text-sem-info-fg border-sem-info-bd',
  triagem:                'bg-purple-100 text-purple-700 border-purple-200',
  em_atendimento:         'bg-sem-success text-sem-success-fg border-sem-success-bd',
  aguardando_cliente:     'bg-sem-warning text-sem-warning-fg border-sem-warning-bd',
  resolvido_com_manual:   'bg-muted text-foreground/60 border-border',
  resolvido_sem_manual:   'bg-muted text-foreground/60 border-border',
}
const statusLabel: Record<string, string> = {
  novos_chamados:         'Novo',
  triagem:                'Triagem',
  em_atendimento:         'Em atendimento',
  em_teste:               'Em teste',
  aguardando_cliente:     'Aguardando',
  resolvido_com_manual:   'Resolvido',
  resolvido_sem_manual:   'Resolvido',
  post_mortem:            'Post-mortem',
}

// ─── Page ──────────────────────────────────────────────────────────────────────
export default function SgcPage() {
  const [conversations, setConversations] = useState<SgcConversation[]>([])
  const [messages,      setMessages]      = useState<SgcMessage[]>([])
  const [selectedId,    setSelectedId]    = useState<string | null>(null)
  const [reply,         setReply]         = useState('')
  const [sending,       setSending]       = useState(false)
  const [search,        setSearch]        = useState('')
  const [loading,       setLoading]       = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [slaPaused,     setSlaPaused]     = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const selected = conversations.find(c => c.id === selectedId) ?? null

  // ── Carregar conversas ──────────────────────────────────────────────────────
  const loadConversations = useCallback(async () => {
    const res = await araraApiFetch('/api/sgc/conversations')
    if (res.ok) {
      const j = await res.json()
      setConversations(j.data ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadConversations() }, [loadConversations])
  useEffect(() => {
    const iv = setInterval(loadConversations, 15_000)
    return () => clearInterval(iv)
  }, [loadConversations])

  // ── Mensagens da conversa selecionada ──────────────────────────────────────
  // Havia aqui um EventSource em `/api/tickets/${id}/stream`: caminho sem a
  // reescrita para a API central (batia no host estático) e, de todo modo, o
  // runtime da plataforma não entrega SSE. Vira consulta periódica, no mesmo
  // molde da lista de conversas logo acima.
  const carregarMensagens = useCallback(async () => {
    if (!selectedId) return
    const r = await araraApiFetch(`/api/tickets/${selectedId}/messages`)
    const j = await r.json()
    const msgs: SgcMessage[] = (j.data ?? [])
      .filter((m: { is_internal: boolean }) => !m.is_internal)
      .map((m: { id: string; message: string; guestName?: string; user?: { full_name?: string } | null; is_internal: boolean; created_at: string; user_id?: string }) => ({
        id: m.id,
        conteudo: m.message,
        remetente: m.guestName ?? m.user?.full_name ?? 'Suporte',
        interno: m.is_internal,
        criado_em: m.created_at,
        from_agent: !!m.user_id,
      }))
    setMessages(msgs)
  }, [selectedId])

  useEffect(() => { setMessages([]) }, [selectedId])
  usePolling(carregarMensagens, { intervalMs: 15_000, enabled: Boolean(selectedId) })

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Enviar resposta ─────────────────────────────────────────────────────────
  async function sendReply() {
    const text = reply.trim()
    if (!text || !selectedId || sending) return
    setSending(true)
    setReply('')

    const res = await araraApiFetch(`/api/tickets/${selectedId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text }),
    })

    if (res.ok) {
      const j = await res.json()
      if (j.data) {
        setMessages(prev => [...prev, {
          id: j.data.id,
          conteudo: text,
          remetente: 'Suporte',
          interno: false,
          criado_em: new Date().toISOString(),
          from_agent: true,
        }])
      }
    }

    setSending(false)
    loadConversations()
  }

  async function escalateN2() {
    if (!selectedId || actionLoading) return
    setActionLoading('escalar')
    try {
      const res = await araraApiFetch(`/api/sla/tracking/${selectedId}/escalate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (res.ok) {
        setConversations(prev => prev.map(c =>
          c.id === selectedId ? { ...c, status: 'pendencia_suporte' } : c
        ))
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
    if (!selectedId || actionLoading) return
    setActionLoading('sla')
    try {
      const res = await araraApiFetch(`/api/sla/tracking/${selectedId}/pause`, {
        method: 'POST',
      })
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
    if (!selectedId || actionLoading) return
    if (!confirm('Finalizar atendimento e fechar este ticket?')) return
    setActionLoading('finalizar')
    try {
      const res = await araraApiFetch(`/api/tickets/${selectedId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'fechado' }),
      })
      if (res.ok) {
        setConversations(prev => prev.map(c =>
          c.id === selectedId ? { ...c, status: 'fechado' } : c
        ))
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
      c.title.toLowerCase().includes(q) ||
      c.company_name?.toLowerCase().includes(q) ||
      c.contact_email?.toLowerCase().includes(q) ||
      c.ticket_number?.includes(q) ||
      c.last_message?.body.toLowerCase().includes(q)
    )
  })

  return (
    <div className="pt-14 lg:pt-0 min-h-screen bg-muted/50">
      {/* Header */}
      <div className="border-b bg-background">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-600 text-xl font-bold text-white shadow-sm">S</div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">SGC · Chat de Suporte</h1>
              <p className="text-sm text-muted-foreground">Chamados abertos pelo portal do cliente · respostas em tempo real via SSE</p>
            </div>
          </div>
          <button
            onClick={loadConversations}
            className="flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium shadow-sm hover:bg-muted/50"
          >
            <RefreshCw className="h-4 w-4" /> Atualizar
          </button>
        </div>
      </div>

      <div className="px-6 py-6 space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            { t: 'Em aberto',      v: conversations.filter(c => !['resolvido_com_manual','resolvido_sem_manual','post_mortem'].includes(c.status)).length, c: 'text-foreground' },
            { t: 'Em atendimento', v: conversations.filter(c => c.status === 'em_atendimento').length, c: 'text-sem-success-fg' },
            { t: 'SLA vencido',    v: conversations.filter(c => c.sla?.breached).length, c: 'text-sem-error-fg' },
            { t: 'Resolvidos',     v: conversations.filter(c => c.status.startsWith('resolvido')).length, c: 'text-muted-foreground' },
          ].map(({ t, v, c }) => (
            <div key={t} className="rounded-2xl bg-card p-5 shadow-[var(--shadow-media)]">
              <p className="text-sm text-muted-foreground">{t}</p>
              <div className={`mt-2 text-3xl font-bold ${c}`}>{v}</div>
            </div>
          ))}
        </div>

        {/* Layout 3 colunas */}
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[360px_minmax(0,1fr)_280px]">
          {/* Lista de conversas */}
          <section className="rounded-2xl border border-border bg-background shadow-sm flex flex-col">
            <div className="border-b border-border/50 px-4 py-3 space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">Chamados SGC</h2>
                <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground/60">{filtered.length}</span>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/70" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar chamado..."
                  className="w-full rounded-xl border border-border bg-muted/50 pl-9 pr-3 py-2 text-sm outline-none placeholder:text-muted-foreground/70"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 max-h-[70vh]">
              {loading && <p className="p-4 text-center text-sm text-muted-foreground/70">Carregando...</p>}
              {!loading && filtered.length === 0 && (
                <div className="flex flex-col items-center gap-3 p-8 text-center">
                  <div className="h-12 w-12 rounded-2xl bg-muted flex items-center justify-center">
                    <AlertTriangle className="h-5 w-5 text-muted-foreground/70" />
                  </div>
                  <p className="text-sm text-muted-foreground">Nenhum chamado do SGC ainda.<br />Quando um cliente abrir chamado, aparece aqui.</p>
                </div>
              )}

              {filtered.map(c => (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={`mb-2 w-full rounded-2xl border p-4 text-left transition hover:border-border hover:bg-muted/50 ${
                    c.id === selectedId ? 'border-indigo-300 bg-indigo-50/40' : 'border-transparent bg-background'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-sm">{c.title}</p>
                      {c.ticket_number && <p className="text-xs text-muted-foreground/70">{c.ticket_number}</p>}
                    </div>
                    <span className="text-xs text-muted-foreground/70 shrink-0">
                      {new Date(c.updated_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${statusBadge[c.status] ?? 'bg-muted text-foreground/60 border-border'}`}>
                      {statusLabel[c.status] ?? c.status}
                    </span>
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${getPriorityColor(c.priority)}`}>
                      {getPriorityLabel(c.priority)}
                    </span>
                  </div>

                  {c.last_message && (
                    <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                      <span className="font-medium">{c.last_message.from_agent ? 'Suporte' : c.last_message.sender}:</span>{' '}
                      {c.last_message.body}
                    </p>
                  )}

                  {c.sla && (
                    <p className={`mt-1 text-xs ${slaColor(c.sla)}`}>SLA: {slaLabel(c.sla)}</p>
                  )}
                </button>
              ))}
            </div>
          </section>

          {/* Chat */}
          <section className="flex flex-col rounded-2xl border border-border bg-background shadow-sm overflow-hidden">
            {!selected ? (
              <div className="flex flex-1 items-center justify-center py-32 text-muted-foreground/70 text-sm">
                Selecione um chamado para iniciar o atendimento
              </div>
            ) : (
              <>
                {/* Header do chat */}
                <div className="border-b border-border/50 px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-semibold">{selected.title}</h2>
                        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusBadge[selected.status] ?? 'bg-muted text-foreground/60 border-border'}`}>
                          {statusLabel[selected.status] ?? selected.status}
                        </span>
                        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${getPriorityColor(selected.priority)}`}>
                          {getPriorityLabel(selected.priority)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {selected.contact_email}
                        {selected.company_name && ` · ${selected.company_name}`}
                        {selected.ticket_number && ` · ${selected.ticket_number}`}
                      </p>
                    </div>
                    <a
                      href={`/admin/tickets/view/?id=${encodeURIComponent(selected.id)}`}
                      className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100"
                    >
                      Ver ticket completo
                    </a>
                  </div>
                </div>

                {/* Mensagens */}
                <div className="flex-1 overflow-y-auto space-y-4 px-5 py-5 min-h-80 max-h-[50vh]">
                  {messages.length === 0 && (
                    <p className="text-center text-sm text-muted-foreground/70">Nenhuma mensagem ainda.</p>
                  )}
                  {messages.map(msg => (
                    <div key={msg.id} className={`flex ${msg.from_agent ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[75%] rounded-3xl px-4 py-3 shadow-sm ${
                        msg.from_agent
                          ? 'rounded-br-md bg-indigo-600 text-white'
                          : 'rounded-bl-md bg-background border border-border'
                      }`}>
                        <div className="mb-1 text-xs font-medium opacity-70">
                          {msg.from_agent ? 'Suporte' : msg.remetente}
                        </div>
                        <p className="text-sm leading-6 whitespace-pre-wrap">{msg.conteudo}</p>
                        <div className={`mt-1 text-right text-xs ${msg.from_agent ? 'text-indigo-200' : 'text-muted-foreground/70'}`}>
                          {new Date(msg.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div ref={bottomRef} />
                </div>

                {/* Input de resposta */}
                <div className="border-t border-border bg-background p-4">
                  <div className="rounded-2xl border border-border bg-muted/50 p-3">
                    <textarea
                      rows={3}
                      value={reply}
                      onChange={e => setReply(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply() } }}
                      placeholder="Responder o cliente... (Enter para enviar, Shift+Enter para nova linha)"
                      className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
                    />
                    <div className="mt-3 flex items-center justify-end gap-2">
                      <button
                        onClick={sendReply}
                        disabled={sending || !reply.trim()}
                        className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
                      >
                        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        {sending ? 'Enviando...' : 'Enviar'}
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </section>

          {/* Painel direito */}
          <aside className="space-y-4">
            {selected ? (
              <>
                <div className="rounded-2xl bg-card p-5 shadow-[var(--shadow-media)]">
                  <h3 className="font-semibold text-sm">Dados do chamado</h3>
                  <div className="mt-4 space-y-3 text-sm text-foreground/60">
                    <div className="flex items-center justify-between">
                      <span>Status</span>
                      <span className="font-medium text-foreground text-xs">{statusLabel[selected.status] ?? selected.status}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Prioridade</span>
                      <span className="font-medium text-foreground">{getPriorityLabel(selected.priority)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Responsável</span>
                      <span className="font-medium text-foreground text-xs">{selected.assignee?.fullName ?? 'Não atribuído'}</span>
                    </div>
                    {selected.sla && (
                      <div className="flex items-center justify-between">
                        <span>SLA</span>
                        <span className={`text-xs ${slaColor(selected.sla)}`}>{slaLabel(selected.sla)}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span>Canal</span>
                      <span className="font-medium text-foreground">SGC Chat</span>
                    </div>
                    {selected.company_name && (
                      <div className="flex items-center justify-between">
                        <span>Empresa</span>
                        <span className="font-medium text-foreground text-xs truncate max-w-28">{selected.company_name}</span>
                      </div>
                    )}
                    {selected.contact_email && (
                      <div className="flex items-center justify-between">
                        <span>E-mail</span>
                        <span className="font-medium text-foreground text-xs truncate max-w-28">{selected.contact_email}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl bg-card p-5 shadow-[var(--shadow-media)]">
                  <h3 className="font-semibold text-sm">Ações rápidas</h3>
                  <div className="mt-4 grid gap-2">
                    <button
                      onClick={escalateN2}
                      disabled={!!actionLoading}
                      className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-left text-sm font-medium text-foreground/80 hover:bg-muted/50 transition disabled:opacity-50"
                    >
                      {actionLoading === 'escalar' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpCircle className="h-4 w-4 text-orange-500" />}
                      Escalar para N2
                    </button>
                    <button
                      onClick={toggleSla}
                      disabled={!!actionLoading}
                      className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-left text-sm font-medium text-foreground/80 hover:bg-muted/50 transition disabled:opacity-50"
                    >
                      {actionLoading === 'sla' ? <Loader2 className="h-4 w-4 animate-spin" /> : slaPaused ? <PlayCircle className="h-4 w-4 text-green-500" /> : <PauseCircle className="h-4 w-4 text-blue-500" />}
                      {slaPaused ? 'Retomar SLA' : 'Pausar SLA'}
                    </button>
                    <button
                      onClick={finalizarAtendimento}
                      disabled={!!actionLoading}
                      className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-left text-sm font-medium text-foreground/80 hover:bg-muted/50 transition disabled:opacity-50"
                    >
                      {actionLoading === 'finalizar' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4 text-muted-foreground/70" />}
                      Finalizar atendimento
                    </button>
                    <a
                      href={`/admin/tickets/view/?id=${encodeURIComponent(selected.id)}`}
                      className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-left text-sm font-medium text-indigo-700 hover:bg-indigo-100 transition"
                    >
                      Abrir ticket completo
                    </a>
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-2xl bg-card p-5 text-sm text-muted-foreground/70 text-center shadow-[var(--shadow-media)]">
                Selecione um chamado
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  )
}
