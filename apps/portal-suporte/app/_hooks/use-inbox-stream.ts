'use client'

import { useCallback, useRef, useState } from 'react'
import {
  whatsappApi,
  type WAConversation,
  type WAInboxConversation,
} from '@/lib/api/whatsapp'
import { usePolling, type StreamStatus } from './use-polling'
import { mostrarAviso, tocarAviso } from '@/lib/wa-som'

// ─── useInboxStream ───────────────────────────────────────────────────────────
// Lista de conversas da inbox, atualizada por consulta periódica.
//
// Era um EventSource em /api/whatsapp/stream. O runtime da plataforma não faz
// SSE (a rota responde JSON avisando isso), então a lista congelava na carga
// inicial. Agora `listConversations()` é a única fonte, chamada em ciclo — o
// merge por id continua para não recriar objetos que já estão iguais na tela.

function fromLegacy(c: WAConversation): WAInboxConversation {
  return {
    id: c.id,
    remote_jid: c.remote_jid,
    contact_name: c.contact_name,
    status: c.status,
    unread_count: c.unread_count ?? 0,
    updated_at: c.updated_at,
    company:
      c.company ??
      (c.ticket?.company_name ? { id: c.ticket.id, name: c.ticket.company_name } : null),
    contact: c.contact ?? null,
    last_message: c.last_message
      ? {
          id: c.last_message.id,
          from_me: c.last_message.from_me,
          body: c.last_message.body,
          media_type: c.last_message.media_type,
          timestamp: c.last_message.timestamp,
        }
      : null,
    phase: c.phase ?? 'novo',
    priority: c.priority ?? 'medium',
    assigned_to: c.assigned_to ?? null,
    department: c.department ?? null,
    ticket: c.ticket ? { id: c.ticket.id, ticket_number: c.ticket.ticket_number } : null,
    tags: (c as { tags?: WAInboxConversation['tags'] }).tags ?? [],
    close_reason: (c as { close_reason?: WAInboxConversation['close_reason'] }).close_reason ?? null,
  }
}

function byUpdatedAtDesc(a: WAInboxConversation, b: WAInboxConversation): number {
  return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
}

/**
 * Funde a resposta nova sobre a lista atual.
 *
 * Uma conversa que sumiu da resposta é removida — sem isso, uma conversa
 * arquivada continuaria na tela até o F5. Objetos idênticos são preservados
 * por referência para não repintar a lista inteira a cada ciclo.
 */
function merge(
  atual: WAInboxConversation[],
  novas: WAInboxConversation[],
): WAInboxConversation[] {
  const anterior = new Map(atual.map((c) => [c.id, c]))
  let mudou = atual.length !== novas.length
  const saida = novas.map((n) => {
    const antes = anterior.get(n.id)
    if (antes && JSON.stringify(antes) === JSON.stringify(n)) return antes
    mudou = true
    return n
  })
  return mudou ? saida.sort(byUpdatedAtDesc) : atual
}

interface UseInboxStreamResult {
  conversations: WAInboxConversation[]
  loading: boolean
  status: StreamStatus
  /** Força uma atualização imediata (após atribuir, concluir, etc.). */
  refresh: () => Promise<void>
}

/** Conversas mudam de mão o tempo todo; 10s é o compromisso entre frescor e carga. */
const INTERVALO_MS = 10_000

/**
 * Assinatura do que está por ler: id da conversa + quantas não lidas.
 *
 * Comparar só o total não basta — se uma conversa é lida e outra recebe no
 * mesmo ciclo de 10s, o total não muda e a chegada passa batida.
 */
function porLer(lista: WAInboxConversation[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const c of lista) m.set(c.id, c.unread_count ?? 0)
  return m
}

export function useInboxStream(): UseInboxStreamResult {
  const [conversations, setConversations] = useState<WAInboxConversation[]>([])
  const [loading, setLoading] = useState(true)

  // O aviso sonoro NUNCA tocava aqui dentro. O sinal da barra lateral
  // (use-wa-sinal) toca só quando `!noInbox` — o inbox foi excluído de
  // propósito, presumindo que ele teria som próprio. Não tinha: o botão de
  // ligar/desligar o som mora na lista de conversas, ou seja, na única tela
  // onde o som nunca saía.
  const anterior = useRef<Map<string, number> | null>(null)

  const carregar = useCallback(async () => {
    // `finally` e não só o caminho feliz: se a primeira consulta falhar, o
    // erro sobe para o polling marcar 'offline', mas a lista precisa sair do
    // estado de carregamento — senão fica um spinner eterno sem explicação.
    try {
      const res = await whatsappApi.listConversations()
      const lista = (res.data ?? []).map(fromLegacy).sort(byUpdatedAtDesc)

      const agora = porLer(lista)
      const antes = anterior.current
      // `antes === null` é a primeira carga: tudo parece novo e tocaria sem
      // ter chegado nada. Só compara a partir do segundo ciclo.
      if (antes) {
        const novas = lista.filter((c) => (c.unread_count ?? 0) > (antes.get(c.id) ?? 0))
        if (novas.length > 0) {
          void tocarAviso()
          // O aviso do sistema só quando a aba NÃO está à vista. Com a tela
          // aberta a conversa já pulou para o topo com o contador — avisar por
          // fora seria repetir o que a pessoa está olhando.
          if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
            if (novas.length === 1) {
              const c = novas[0]
              const quem = c.contact_name || c.company?.name || c.remote_jid || 'Cliente'
              const texto = c.last_message?.body?.slice(0, 140) || 'Nova mensagem no WhatsApp'
              mostrarAviso(quem, texto, c.id)
            } else {
              mostrarAviso(
                `${novas.length} conversas com mensagem nova`,
                novas.map((c) => c.contact_name || c.remote_jid).filter(Boolean).slice(0, 4).join(', '),
                'inbox-varias',
              )
            }
          }
        }
      }
      anterior.current = agora

      setConversations((prev) => merge(prev, lista))
    } finally {
      setLoading(false)
    }
  }, [])

  const status = usePolling(carregar, { intervalMs: INTERVALO_MS })

  return { conversations, loading, status, refresh: carregar }
}
