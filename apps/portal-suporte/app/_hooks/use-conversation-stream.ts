'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { WACitacao, WAReacao } from '@/lib/api/whatsapp'
import {
  whatsappApi,
  type WAMessage,
  type WAThreadMessage,
} from '@/lib/api/whatsapp'
import { usePolling, type StreamStatus } from './use-polling'

// ─── useConversationStream ────────────────────────────────────────────────────
// Mensagens da conversa aberta, atualizadas por consulta periódica.
//
// Era um EventSource em /api/whatsapp/[id]/stream; o runtime da plataforma não
// entrega SSE, então a thread ficava parada na carga inicial e mensagem nova só
// aparecia com F5. O intervalo aqui é mais curto que o da lista: é a tela em
// que o atendente está olhando enquanto conversa.

function fromLegacy(m: WAMessage): WAThreadMessage {
  return {
    id: m.id,
    from_me: m.from_me,
    sender_name: m.sender_name,
    body: m.body,
    media_type: m.media_type,
    media_url: m.media_url ?? null,
    media_ref: m.media_ref ?? null,
    media_name: (m as { media_name?: string | null }).media_name ?? null,
    message_id: (m as { message_id?: string | null }).message_id ?? null,
    sender_jid: (m as { sender_jid?: string | null }).sender_jid ?? null,
    reacoes: (m as { reacoes?: WAReacao[] }).reacoes ?? [],
    apagada: (m as { apagada?: boolean }).apagada === true,
    editada: (m as { editada?: boolean }).editada === true,
    citacao: (m as { citacao?: WACitacao | null }).citacao ?? null,
    timestamp: m.timestamp,
  }
}

function byTimestampAsc(a: WAThreadMessage, b: WAThreadMessage): number {
  return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
}

/**
 * Funde as mensagens da consulta com as que já estão na tela.
 *
 * Diferente da lista de conversas, aqui nada é removido: a mensagem otimista
 * que o composer insere antes da confirmação sumiria no ciclo seguinte.
 */
function merge(atual: WAThreadMessage[], novas: WAThreadMessage[]): WAThreadMessage[] {
  const map = new Map(atual.map((m) => [m.id, m]))
  let mudou = false
  for (const n of novas) {
    const antes = map.get(n.id)
    if (!antes || JSON.stringify(antes) !== JSON.stringify(n)) mudou = true
    map.set(n.id, n)
  }
  return mudou ? Array.from(map.values()).sort(byTimestampAsc) : atual
}

interface UseConversationStreamResult {
  messages: WAThreadMessage[]
  loading: boolean
  status: StreamStatus
  /** Atualiza na hora — usado logo após enviar uma mensagem. */
  refresh: () => Promise<void>
}

const INTERVALO_MS = 5_000

export function useConversationStream(
  conversationId: string | null,
): UseConversationStreamResult {
  const [messages, setMessages] = useState<WAThreadMessage[]>([])
  const [loading, setLoading] = useState(false)
  // Quantas mensagens estavam por ler quando a conversa foi ABERTA: é o que
  // desenha o divisor "Mensagens não lidas". Só a primeira consulta traz o
  // número — a partir dela o contador já é zero, e o divisor tem que ficar
  // onde está enquanto a conversa estiver aberta.
  const [naoLidasAoAbrir, setNaoLidasAoAbrir] = useState(0)
  const primeira = useRef(true)

  // Trocar de conversa zera a thread antes da primeira consulta; sem isso as
  // mensagens do contato anterior ficam visíveis por um instante.
  useEffect(() => {
    setMessages([])
    setLoading(Boolean(conversationId))
    setNaoLidasAoAbrir(0)
    primeira.current = true
  }, [conversationId])

  const carregar = useCallback(async () => {
    if (!conversationId) return
    try {
      const res = await whatsappApi.getMessages(conversationId)
      const lista = (res.data ?? []).map(fromLegacy).sort(byTimestampAsc)
      if (primeira.current) {
        primeira.current = false
        setNaoLidasAoAbrir(Number(res.nao_lidas ?? 0) || 0)
      }
      setMessages((prev) => merge(prev, lista))
    } finally {
      setLoading(false)
    }
  }, [conversationId])

  const status = usePolling(carregar, {
    intervalMs: INTERVALO_MS,
    enabled: Boolean(conversationId),
  })

  return { messages, loading, status, refresh: carregar, naoLidasAoAbrir }
}
