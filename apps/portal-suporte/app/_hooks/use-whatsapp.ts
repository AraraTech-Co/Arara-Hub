'use client'

import { useState, useEffect, useCallback } from 'react'
import { whatsappApi, type WAConversation, type WAMessage } from '@/lib/api/whatsapp'
import { ApiError } from '@/lib/api/client'

// ─── useWhatsappConversations ─────────────────────────────────────────────────

interface UseWhatsappConversationsResult {
  conversations: WAConversation[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function useWhatsappConversations(): UseWhatsappConversationsResult {
  const [conversations, setConversations] = useState<WAConversation[]>([])
  const [loading, setLoading]             = useState(true)
  const [error, setError]                 = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const result = await whatsappApi.listConversations()
      setConversations(result.data ?? [])
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao carregar conversas')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const iv = setInterval(load, 10_000)
    return () => clearInterval(iv)
  }, [load])

  return { conversations, loading, error, refresh: load }
}

// ─── useWhatsappMessages ──────────────────────────────────────────────────────

interface UseWhatsappMessagesResult {
  messages: WAMessage[]
  loading: boolean
  error: string | null
  sendMessage: (content: string) => Promise<WAMessage | null>
  refresh: () => Promise<void>
}

export function useWhatsappMessages(conversationId: string | null): UseWhatsappMessagesResult {
  const [messages, setMessages] = useState<WAMessage[]>([])
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!conversationId) return
    setLoading(true)
    try {
      const result = await whatsappApi.getMessages(conversationId)
      setMessages(result.data ?? [])
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao carregar mensagens')
    } finally {
      setLoading(false)
    }
  }, [conversationId])

  useEffect(() => {
    setMessages([])
    load()
  }, [load])

  const sendMessage = useCallback(async (content: string): Promise<WAMessage | null> => {
    if (!conversationId) return null
    try {
      const result = await whatsappApi.sendMessage(conversationId, content)
      const newMsg = result.data
      setMessages(prev => [...prev, newMsg])
      return newMsg
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao enviar mensagem')
      return null
    }
  }, [conversationId])

  return { messages, loading, error, sendMessage, refresh: load }
}
