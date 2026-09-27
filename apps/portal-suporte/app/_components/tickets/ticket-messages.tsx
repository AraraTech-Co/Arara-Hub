"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { formatDate, getInitials } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { MessageCircle, Building2, BrainCircuit, CornerUpLeft } from "lucide-react"
import { MessageForm, type ReplyTarget } from "./message-form"
import type { AgentOption } from "./rich-message-editor"
import DOMPurify from 'dompurify'
import { araraFetch } from '@/lib/arara/client'
import { usePolling } from '@/hooks/use-polling'

interface Message {
  id: string
  message: string
  is_internal: boolean
  is_ai_message?: boolean
  created_at: string
  reply_to_id?: string | null
  mentions?: string[]
  user: {
    id: string
    full_name: string | null
    email: string
    role: string
  } | null
  guest_email?: string | null
  guest_name?: string | null
}

interface TicketMessagesProps {
  messages: Message[]
  currentUserId: string
  ticketId: string
  agents?: AgentOption[]
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60)  return "agora mesmo"
  const m = Math.floor(s / 60)
  if (m < 60)  return `há ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24)  return `há ${h}h`
  const d = Math.floor(h / 24)
  if (d === 1) return "ontem"
  if (d < 7)   return `há ${d} dias`
  return formatDate(dateStr, { day: "2-digit", month: "short" })
}

function isRichHtml(text: string): boolean {
  return text.trimStart().startsWith('<')
}

function sanitize(html: string): string {
  if (typeof window === 'undefined') return html
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'code', 'ul', 'li', 'ol', 'blockquote', 'span', 'a'],
    ALLOWED_ATTR: ['class', 'href', 'target', 'rel', 'data-id', 'data-label', 'data-type'],
  })
}

function MessageBody({ text }: { text: string }) {
  if (isRichHtml(text)) {
    return (
      <div
        className="tiptap-rendered text-sm leading-relaxed"
        dangerouslySetInnerHTML={{ __html: sanitize(text) }}
      />
    )
  }
  return <p className="whitespace-pre-wrap text-sm leading-relaxed">{text}</p>
}

function stripHtml(html: string): string {
  if (typeof document === 'undefined') return html
  const tmp = document.createElement('div')
  tmp.innerHTML = html
  return tmp.textContent ?? tmp.innerText ?? ''
}

function previewText(msg: Message): string {
  const raw = isRichHtml(msg.message) ? stripHtml(msg.message) : msg.message
  return raw.slice(0, 100)
}

export function TicketMessages({
  messages: initialMessages,
  currentUserId,
  ticketId,
  agents = [],
}: TicketMessagesProps) {
  const [messages, setMessages]   = useState<Message[]>(initialMessages)
  const [replyTo, setReplyTo]     = useState<ReplyTarget | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Mensagens novas por consulta periódica.
  //
  // Aqui havia um EventSource em `/api/tickets/${id}/stream`. Dois problemas:
  // o caminho não passava pela reescrita para a API central, então batia no
  // próprio host estático e recebia o index.html; e o runtime da plataforma
  // não entrega SSE de todo jeito. A thread ficava congelada sem sinal algum.
  const carregarMensagens = useCallback(async () => {
    const res = await araraFetch.get(`/api/tickets/${ticketId}/messages`)
    const lista = (Array.isArray(res) ? res : (res as { data?: unknown })?.data) as
      | Message[]
      | undefined
    if (!Array.isArray(lista)) return
    setMessages((prev) => {
      const ids = new Set(prev.map((m) => m.id))
      // Sem o filtro de internas, o polling despejava os comentários da equipe
      // aqui dentro: a página abria separada e, 15s depois, "duplicava" — foi o
      // defeito reportado em 20/08. A conversa é a parte NÃO interna.
      const novas = lista.filter((m) => !ids.has(m.id) && !m.is_internal)
      return novas.length > 0 ? [...prev, ...novas] : prev
    })
  }, [ticketId])

  usePolling(carregarMensagens, { intervalMs: 15_000 })

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const msgById = Object.fromEntries(messages.map(m => [m.id, m]))

  if (!messages || messages.length === 0) {
    return (
      <>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageCircle className="h-5 w-5" />
              Conversas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-center text-sm text-muted-foreground py-4">
              Nenhuma mensagem ainda. Seja o primeiro a enviar uma mensagem.
            </p>
          </CardContent>
        </Card>
        <MessageForm
          ticketId={ticketId}
          userId={currentUserId}
          isAdmin={true}
          agents={agents}
          replyTo={replyTo}
          onClearReply={() => setReplyTo(null)}
        />
      </>
    )
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageCircle className="h-5 w-5" />
            Conversas ({messages.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {messages.map((msg) => {
            const isAi          = !!msg.is_ai_message
            const isGuest       = !msg.user && !isAi && (msg.guest_email || msg.guest_name)
            const isCurrentUser = msg.user?.id === currentUserId
            const isSupport     = msg.user && (msg.user.role === "admin" || msg.user.role === "agent")
            const parentMsg     = msg.reply_to_id ? msgById[msg.reply_to_id] : null

            if (isAi) {
              return (
                <div key={msg.id} className="rounded-lg border border-status-migration-bd bg-status-migration px-4 py-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-status-migration-fg">
                      <BrainCircuit className="h-4 w-4 text-background" />
                    </div>
                    <span className="text-sm font-semibold text-status-migration-fg">Assistente IA · Primeiro Atendimento</span>
                    <span className="text-xs text-status-migration-fg/70 ml-auto" title={formatDate(msg.created_at)}>
                      {relativeTime(msg.created_at)}
                    </span>
                  </div>
                  <MessageBody text={msg.message} />
                </div>
              )
            }

            const displayName = isGuest
              ? (msg.guest_name || msg.guest_email || "Cliente")
              : (msg.user?.full_name || msg.user?.email || "?")

            const alignRight = isCurrentUser

            const roleLabel = isGuest
              ? "Cliente"
              : msg.user?.role === "admin" ? "Admin"
              : msg.user?.role === "agent" ? "Agente"
              : "Cliente"

            const roleColor = isGuest || msg.user?.role === "client"
              ? "bg-muted text-foreground/60"
              : msg.user?.role === "admin"
              ? "bg-status-triage text-status-triage-fg"
              : "bg-sem-info text-sem-info-fg"

            const handleReply = () => {
              setReplyTo({
                id: msg.id,
                preview: previewText(msg),
                authorName: String(displayName),
              })
              bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
            }

            return (
              <div key={msg.id} className={`flex gap-3 group ${alignRight ? "flex-row-reverse" : "flex-row"}`}>
                <Avatar className="h-9 w-9 shrink-0">
                  <AvatarFallback
                    className={
                      isGuest
                        ? "bg-sem-warning text-sem-warning-fg text-xs"
                        : alignRight
                        ? "bg-primary text-primary-foreground text-xs"
                        : isSupport
                        ? "bg-sem-info-fg text-background text-xs"
                        : "bg-muted text-foreground/80 text-xs"
                    }
                  >
                    {isGuest
                      ? <Building2 className="h-4 w-4" />
                      : getInitials(String(displayName))}
                  </AvatarFallback>
                </Avatar>

                <div className={`flex-1 flex flex-col ${alignRight ? "items-end" : "items-start"}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-foreground">
                      {alignRight ? "Você" : displayName}
                    </span>
                    <Badge variant="outline" className={`text-xs py-0 ${roleColor}`}>
                      {roleLabel}
                    </Badge>
                    {isGuest && msg.guest_email && (
                      <span className="text-xs text-muted-foreground/70">{msg.guest_email}</span>
                    )}
                    {msg.is_internal && (
                      <Badge variant="outline" className="text-xs py-0 bg-sem-warning text-sem-warning-fg border-sem-warning-bd">
                        Interno
                      </Badge>
                    )}
                  </div>

                  <div
                    className={`max-w-[80%] rounded-lg px-4 py-2.5 ${
                      alignRight
                        ? "bg-primary text-primary-foreground"
                        : isGuest
                        ? "bg-sem-warning text-foreground border border-sem-warning-bd"
                        : msg.is_internal
                        ? "bg-sem-warning text-foreground border border-sem-warning-bd"
                        : "bg-muted text-foreground"
                    }`}
                  >
                    {/* Reply context */}
                    {parentMsg && (
                      <div className="mb-2 flex items-start gap-1.5 rounded border-l-2 border-current/30 bg-black/5 px-2 py-1">
                        <CornerUpLeft className="h-3 w-3 mt-0.5 shrink-0 opacity-50" />
                        <div className="min-w-0">
                          <p className="text-[11px] font-medium opacity-70">
                            {parentMsg.user?.full_name ?? parentMsg.user?.email ?? parentMsg.guest_name ?? "?"}
                          </p>
                          <p className="text-xs opacity-60 truncate">{previewText(parentMsg)}</p>
                        </div>
                      </div>
                    )}
                    <MessageBody text={msg.message} />
                  </div>

                  <div className="mt-1 flex items-center gap-3">
                    <span className="text-xs text-muted-foreground/70" title={formatDate(msg.created_at)}>
                      {relativeTime(msg.created_at)}
                    </span>
                    {/* Reply button — visible on hover, keyboard focus, or touch */}
                    <button
                      type="button"
                      onClick={handleReply}
                      className="flex items-center gap-1 text-[11px] text-muted-foreground/70 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity hover:text-status-migration-fg"
                    >
                      <CornerUpLeft className="h-3 w-3" />
                      Responder
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
          <div ref={bottomRef} />
        </CardContent>
      </Card>

      <MessageForm
        ticketId={ticketId}
        userId={currentUserId}
        isAdmin={true}
        agents={agents}
        replyTo={replyTo}
        onClearReply={() => setReplyTo(null)}
      />
    </>
  )
}
