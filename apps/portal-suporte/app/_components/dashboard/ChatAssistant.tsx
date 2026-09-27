'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { aiApi } from '@/lib/api/ai'
import {
  Send, Bot, User, Loader2, ThumbsUp, ThumbsDown,
  TicketPlus, Sparkles, RotateCcw, Star,
} from 'lucide-react'
import { araraApiFetch } from '@/lib/arara/arara-api-fetch'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface ChatAssistantProps {
  onOpenTicket?: (prefill?: { title?: string; description?: string }) => void
  userName?: string
}

const QUICK_ACTIONS = [
  'Como emitir NF-e?',
  'Estou com um erro no sistema',
  'Quero abrir um chamado',
  'Dúvida sobre configuração',
  'Problema com boleto',
]

const AGENT_LABELS: Record<string, string> = {
  orchestrator:      '🧠 Triagem',
  'knowledge-agent': '📚 Conhecimento',
  'ticket-agent':    '🎫 Chamados',
}

export function ChatAssistant({ onOpenTicket, userName }: ChatAssistantProps) {
  const { toast } = useToast()
  const [messages,     setMessages]     = useState<Message[]>([])
  const [input,        setInput]        = useState('')
  const [isLoading,    setIsLoading]    = useState(false)
  const [conversationId, setConvId]     = useState<string | null>(null)
  const [currentAgent, setCurrentAgent] = useState<string | null>(null)
  const [ticketReady,  setTicketReady]  = useState(false)
  const [feedbackGiven, setFeedbackGiven] = useState(false)
  const [ratingOpen,   setRatingOpen]   = useState(false)
  const [rating,       setRating]       = useState(0)
  const [comment,      setComment]      = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    const last = messages[messages.length - 1]
    setTicketReady(last?.role === 'assistant' && last.content.includes('[CHAMADO_PRONTO]'))
  }, [messages])

  const streamChat = useCallback(async (text: string) => {
    const res = await araraApiFetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, conversationId }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      if (res.status === 429) { toast({ title: '⏳ Muitas solicitações', description: 'Aguarde alguns segundos.' }); return }
      throw new Error(err.error || `Erro ${res.status}`)
    }

    const newConvId = res.headers.get('X-Conversation-Id')
    if (newConvId) setConvId(newConvId)
    const agentKey = res.headers.get('X-Agent-Key')
    if (agentKey) setCurrentAgent(agentKey)

    const reader  = res.body?.getReader()
    const decoder = new TextDecoder()
    let assistantSoFar = ''

    if (reader) {
      let buf = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        let newline: number
        while ((newline = buf.indexOf('\n')) !== -1) {
          const line = buf.slice(0, newline).replace(/\r$/, '')
          buf = buf.slice(newline + 1)
          if (!line.startsWith('data: ')) continue
          const json = line.slice(6).trim()
          if (json === '[DONE]') break
          try {
            const delta = JSON.parse(json).choices?.[0]?.delta?.content
            if (delta) {
              assistantSoFar += delta
              setMessages(prev => {
                const last = prev[prev.length - 1]
                if (last?.role === 'assistant') {
                  return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantSoFar } : m)
                }
                return [...prev, { role: 'assistant', content: assistantSoFar }]
              })
            }
          } catch {}
        }
      }
    }
  }, [conversationId, toast])

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return
    setMessages(prev => [...prev, { role: 'user', content: text.trim() }])
    setInput('')
    setIsLoading(true)
    setFeedbackGiven(false)
    try {
      await streamChat(text.trim())
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message || 'Falha ao conectar.', variant: 'destructive' })
    } finally {
      setIsLoading(false)
    }
  }

  const handleFeedback = async (resolved: boolean) => {
    setFeedbackGiven(true)
    if (resolved) {
      await aiApi.submitFeedback({ conversationId, rating: 'positive' })
      toast({ title: 'Obrigado! 😊', description: 'Ficamos felizes em ajudar!' })
    } else {
      setRatingOpen(true)
    }
  }

  const submitRating = async () => {
    await aiApi.submitFeedback({ conversationId, rating: 'negative', comment })
    setRatingOpen(false); setRating(0); setComment('')
    toast({ title: 'Feedback registrado', description: 'Considere abrir um chamado.' })
  }

  const handleNewChat = () => {
    setMessages([]); setConvId(null); setCurrentAgent(null)
    setTicketReady(false); setFeedbackGiven(false)
  }

  const extractTicketData = () => {
    const last = [...messages].reverse().find(m => m.role === 'assistant' && m.content.includes('[CHAMADO_PRONTO]'))
    if (!last) return {}
    const content = last.content.replace('[CHAMADO_PRONTO]', '').trim()
    const titleMatch = content.match(/\*\*Título:\*\*\s*(.+)/)
    const descMatch  = content.match(/\*\*Descrição:\*\*\s*(.+)/)
    const summary = messages.slice(-8).map(m => `${m.role === 'user' ? 'Cliente' : 'Assistente'}: ${m.content.slice(0, 200)}`).join('\n\n')
    return {
      title: titleMatch?.[1]?.trim() || 'Chamado via assistente',
      description: `${descMatch?.[1]?.trim() || ''}\n\n---\nHistórico da conversa:\n${summary}`,
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-16rem)]">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-primary/10">
            <Bot className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="font-medium text-sm">Assistente Inteligente</p>
            <p className="text-xs text-muted-foreground">Canal de suporte com IA</p>
          </div>
          {currentAgent && (
            <Badge variant="outline" className="text-[10px] ml-2">
              {AGENT_LABELS[currentAgent] || currentAgent}
            </Badge>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={handleNewChat}>
          <RotateCcw className="h-4 w-4 mr-1" /> Nova conversa
        </Button>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 py-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4 py-8">
            <Sparkles className="h-12 w-12 text-primary/30 mb-4" />
            <p className="text-lg font-medium mb-1">
              Olá{userName ? `, ${userName.split(' ')[0]}` : ''}! 👋
            </p>
            <p className="text-sm text-muted-foreground max-w-md mb-6">
              Sou o assistente inteligente. Me conte o que precisa e vou te ajudar a encontrar a melhor solução.
            </p>
            <div className="flex flex-wrap justify-center gap-2 max-w-lg">
              {QUICK_ACTIONS.map(faq => (
                <button key={faq} onClick={() => sendMessage(faq)}
                  className="px-3 py-1.5 rounded-full border bg-muted/50 text-sm hover:bg-primary/10 hover:border-primary/30 transition-colors">
                  {faq}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-4 px-1">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'assistant' && (
                <div className="shrink-0 h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
              )}
              <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted/50 border text-foreground'
              }`}>
                <p className="text-sm whitespace-pre-wrap leading-relaxed">
                  {msg.role === 'assistant' ? msg.content.replace('[CHAMADO_PRONTO]', '') : msg.content}
                </p>
              </div>
              {msg.role === 'user' && (
                <div className="shrink-0 h-8 w-8 rounded-full bg-secondary/10 flex items-center justify-center">
                  <User className="h-4 w-4" />
                </div>
              )}
            </div>
          ))}

          {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
            <div className="flex gap-3">
              <div className="shrink-0 h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Bot className="h-4 w-4 text-primary" />
              </div>
              <div className="bg-muted/50 border rounded-2xl px-4 py-3">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            </div>
          )}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      {/* Ticket ready banner */}
      {ticketReady && onOpenTicket && !isLoading && (
        <div className="flex items-center gap-3 py-3 px-4 border border-primary/30 bg-primary/5 rounded-lg mx-1 mb-2">
          <TicketPlus className="h-5 w-5 text-primary shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium">Chamado preparado!</p>
            <p className="text-xs text-muted-foreground">Clique para confirmar a abertura.</p>
          </div>
          <Button size="sm" onClick={() => { onOpenTicket(extractTicketData()); setTicketReady(false) }}>
            <TicketPlus className="h-3.5 w-3.5 mr-1" /> Confirmar Abertura
          </Button>
        </div>
      )}

      {/* Feedback row */}
      {messages.length > 0 && !isLoading && !feedbackGiven && !ticketReady && (
        <div className="flex items-center gap-2 py-2 border-t">
          <span className="text-xs text-muted-foreground">Isso resolveu?</span>
          <Button variant="ghost" size="sm" onClick={() => handleFeedback(true)}>
            <ThumbsUp className="h-3.5 w-3.5 mr-1" /> Sim
          </Button>
          <Button variant="ghost" size="sm" onClick={() => handleFeedback(false)}>
            <ThumbsDown className="h-3.5 w-3.5 mr-1" /> Não
          </Button>
          {onOpenTicket && (
            <Button variant="outline" size="sm" className="ml-auto"
              onClick={() => {
                const userMsgs = messages.filter(m => m.role === 'user')
                const summary  = messages.slice(-6).map(m => `${m.role === 'user' ? 'Cliente' : 'Assistente'}: ${m.content.slice(0, 200)}`).join('\n\n')
                onOpenTicket({ title: userMsgs[0]?.content.slice(0, 80) || 'Chamado via assistente', description: summary })
              }}>
              <TicketPlus className="h-3.5 w-3.5 mr-1" /> Abrir Chamado
            </Button>
          )}
        </div>
      )}

      {/* Input */}
      <div className="pt-3 border-t">
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage(input)}
            placeholder="Descreva sua dúvida ou problema..."
            disabled={isLoading}
            className="flex-1"
          />
          <Button onClick={() => sendMessage(input)} disabled={isLoading || !input.trim()} size="icon" className="shrink-0">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Rating Dialog */}
      <Dialog open={ratingOpen} onOpenChange={setRatingOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Avalie o atendimento</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-1">
              {[1, 2, 3, 4, 5].map(star => (
                <button key={star} onClick={() => setRating(star)} className="p-1 hover:scale-110 transition-transform">
                  <Star className={`h-8 w-8 ${star <= rating ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'}`} />
                </button>
              ))}
            </div>
            <Textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="Conte-nos como podemos melhorar..." rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRatingOpen(false)}>Cancelar</Button>
            <Button onClick={submitRating}>Enviar Avaliação</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
