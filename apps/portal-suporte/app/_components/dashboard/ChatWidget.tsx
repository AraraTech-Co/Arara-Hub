'use client'

import { useState, useCallback } from 'react'
import { Bot, X, Minus, Maximize2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ChatAssistant } from '@/components/dashboard/ChatAssistant'
import { useRouter } from 'next/navigation'
import { useToast } from '@/hooks/use-toast'
import { araraApiFetch } from '@/lib/arara/arara-api-fetch'

interface ChatWidgetProps {
  userName?: string
}

type WidgetState = 'closed' | 'minimized' | 'open'

export function ChatWidget({ userName }: ChatWidgetProps) {
  const [state,       setState]      = useState<WidgetState>('closed')
  const [unread,      setUnread]     = useState(0)
  const [isCreating,  setIsCreating] = useState(false)
  const router  = useRouter()
  const { toast } = useToast()

  const handleOpen = () => {
    setState('open')
    setUnread(0)
  }

  // Cria ticket automaticamente a partir dos dados coletados pelo ticket-agent
  const handleOpenTicket = useCallback(async (prefill?: { title?: string; description?: string }) => {
    if (!prefill?.title || !prefill?.description) {
      router.push('/dashboard?openTicket=1')
      return
    }

    setIsCreating(true)
    try {
      const res = await araraApiFetch('/api/ai/auto-create-ticket', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          title:       prefill.title,
          description: prefill.description,
          priority:    'medium',
          category:    'other',
        }),
      })

      if (!res.ok) throw new Error('Falha ao criar chamado')

      const data = await res.json()
      toast({
        title:       `✅ Chamado #${data.ticketNumber || ''} criado!`,
        description: 'Você receberá atualizações por aqui.',
      })
      setState('minimized')
      router.refresh()
    } catch {
      toast({
        title:       'Erro ao criar chamado',
        description: 'Tente abrir manualmente.',
        variant:     'destructive',
      })
      router.push('/dashboard?openTicket=1')
    } finally {
      setIsCreating(false)
    }
  }, [router, toast])

  return (
    <>
      {/* ── Botão flutuante ───────────────────────────────────────────── */}
      {state === 'closed' && (
        <button
          onClick={handleOpen}
          className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 hover:shadow-xl transition-all duration-200 hover:scale-105"
          aria-label="Abrir assistente IA"
        >
          <Bot className="h-6 w-6" />
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
              {unread}
            </span>
          )}
        </button>
      )}

      {/* ── Widget minimizado ─────────────────────────────────────────── */}
      {state === 'minimized' && (
        <button
          onClick={handleOpen}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-primary-foreground shadow-lg hover:bg-primary/90 transition-all duration-200"
        >
          <Bot className="h-4 w-4" />
          <span className="text-sm font-medium">Assistente IA</span>
          {unread > 0 && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold">
              {unread}
            </span>
          )}
        </button>
      )}

      {/* ── Painel do chat ────────────────────────────────────────────── */}
      {state === 'open' && (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col w-[420px] max-w-[calc(100vw-2rem)] h-[600px] max-h-[calc(100vh-5rem)] rounded-2xl border bg-background shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-primary text-primary-foreground shrink-0">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              <div>
                <p className="font-semibold text-sm leading-none">Assistente IA</p>
                <p className="text-xs opacity-80 mt-0.5">Suporte inteligente 24/7</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-primary-foreground hover:bg-white/20"
                onClick={() => setState('minimized')}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-primary-foreground hover:bg-white/20"
                onClick={() => setState('closed')}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Chat Content */}
          <div className="flex-1 overflow-hidden p-4">
            <ChatAssistant
              userName={userName}
              onOpenTicket={isCreating ? undefined : handleOpenTicket}
            />
          </div>
        </div>
      )}
    </>
  )
}
