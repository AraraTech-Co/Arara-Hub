'use client'

import { useEffect, useRef, useState } from 'react'

// ─── usePolling ───────────────────────────────────────────────────────────────
// Substitui o useSseStream da inbox.
//
// O runtime da plataforma Arara não suporta SSE: `/whatsapp/stream` responde
// um JSON comum — `{"stream":false,"hint":"SSE não suportado no runtime Arara;
// use polling REST."}` — e o EventSource, que exige `text/event-stream`,
// derrubava a conexão na hora. Resultado: a inbox ficava marcada como offline
// para sempre e só atualizava com F5, sem nenhum aviso de que estava parada.
//
// Aqui a atualização é por consulta periódica. O contrato de status é o mesmo
// do hook antigo, então o indicador de conexão da inbox continua valendo:
// 'live' = a última consulta funcionou, 'offline' = falhou.
//
// Duas economias que importam num painel que fica aberto o dia todo:
//  • aba escondida não consulta (nada muda na tela que ninguém está vendo);
//  • ao voltar o foco, consulta na hora em vez de esperar o próximo ciclo.

export type StreamStatus = 'connecting' | 'live' | 'offline'

export interface PollingOptions {
  /** Intervalo entre consultas. */
  intervalMs?: number
  /** `false` desliga o ciclo (ex.: nenhuma conversa selecionada). */
  enabled?: boolean
  /**
   * O ALVO da consulta: a conversa aberta, a aba de conta.
   *
   * Existe porque trocar de alvo não mudava nem `enabled` nem `intervalMs`, e
   * o ciclo só reiniciava quando um desses mudava. Trocar de conversa não
   * disparava consulta nenhuma: a tela ficava em "Carregando mensagens…" até o
   * próximo tique — 0 a 5 s, média 2,5 s. Na troca de aba de conta, até 10 s
   * de lista vazia.
   *
   * Com a chave nas dependências, trocar de alvo reinicia o ciclo, e reiniciar
   * consulta na hora (ver `iniciar`). O caso de nenhuma conversa para alguma
   * já funcionava, porque ali `enabled` ia de `false` para `true`.
   */
  chave?: string | number | null
}

const PADRAO_MS = 10_000

export function usePolling(
  fetcher: () => Promise<void>,
  { intervalMs = PADRAO_MS, enabled = true, chave = null }: PollingOptions = {},
): StreamStatus {
  const [status, setStatus] = useState<StreamStatus>('connecting')

  // O fetcher costuma ser recriado a cada render do componente pai; guardá-lo
  // em ref evita reiniciar o ciclo sem necessidade.
  const fetcherRef = useRef(fetcher)
  useEffect(() => {
    fetcherRef.current = fetcher
  })

  useEffect(() => {
    if (!enabled) {
      setStatus('connecting')
      return
    }

    let descartado = false
    let timer: ReturnType<typeof setInterval> | null = null
    // Uma consulta lenta não pode empilhar com a próxima.
    let emVoo = false

    async function consultar() {
      if (descartado || emVoo) return
      emVoo = true
      try {
        await fetcherRef.current()
        if (!descartado) setStatus('live')
      } catch {
        if (!descartado) setStatus('offline')
      } finally {
        emVoo = false
      }
    }

    function visivel() {
      return typeof document === 'undefined' || document.visibilityState === 'visible'
    }

    function iniciar() {
      if (timer) return
      void consultar()
      timer = setInterval(() => {
        if (visivel()) void consultar()
      }, intervalMs)
    }

    function parar() {
      if (!timer) return
      clearInterval(timer)
      timer = null
    }

    function aoMudarVisibilidade() {
      if (visivel()) void consultar()
    }

    iniciar()
    document.addEventListener('visibilitychange', aoMudarVisibilidade)
    window.addEventListener('focus', aoMudarVisibilidade)

    return () => {
      descartado = true
      parar()
      document.removeEventListener('visibilitychange', aoMudarVisibilidade)
      window.removeEventListener('focus', aoMudarVisibilidade)
    }
    // `chave` entra aqui: é o que faz trocar de alvo consultar na hora.
  }, [enabled, intervalMs, chave])

  return status
}
