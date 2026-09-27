'use client'

// =============================================================================
// Sinal do WhatsApp para a barra lateral: quantas conversas abertas e quando
// chega coisa nova.
//
// Fonte única: `GET /api/whatsapp/metrics`, que já varria as conversas e agora
// devolve também `naoLidas` e `ultimoEventoEm` (scripts/wa-metrics-sinal.py).
// Reaproveitar essa rota evita mais uma consulta rodando em toda tela do
// portal — a barra lateral está montada o tempo inteiro.
//
// O gatilho do aviso é o CARIMBO, não o contador: mensagem nova numa conversa
// que já estava aberta não muda `open`, e um aviso que só dispara em conversa
// inédita deixaria passar justamente o cliente que está esperando resposta.
//
// Duas proteções contra aviso indevido:
//   - a primeira leitura nunca toca (senão tocaria a cada troca de página);
//   - quem já está no /inbox não ouve nada — a conversa aparece na frente
//     dele, e o som viraria ruído a cada mensagem de uma conversa aberta.
// =============================================================================

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { araraApiFetch } from '@/lib/arara/arara-api-fetch'
import { prepararSom, tocarAviso } from '@/lib/wa-som'

const INTERVALO_MS = 20_000

export type WaSinal = {
  /** Conversas ativas (não fechadas, não resolvidas). */
  abertas: number
  /** Conversas abertas com mensagem não lida — o número que o atendente persegue. */
  naoLidas: number
  /** Ligado por alguns segundos quando chega mensagem, para o item pulsar. */
  novidade: boolean
}

export function useWaSinal(ativo: boolean): WaSinal {
  const pathname = usePathname()
  const [sinal, setSinal] = useState<WaSinal>({ abertas: 0, naoLidas: 0, novidade: false })
  const ultimoEvento = useRef<string | null>(null)
  const primeira = useRef(true)
  const noInbox = useRef(false)
  // `usePathname` pode vir nulo no primeiro render do export estático.
  noInbox.current = (pathname ?? '').startsWith('/inbox')

  useEffect(() => {
    if (!ativo) return
    prepararSom()

    let vivo = true
    let apagarPulso: ReturnType<typeof setTimeout> | undefined

    async function ler() {
      // Aba em segundo plano não consulta: o atendente não está olhando, e o
      // navegador já reduz timers aí. Na volta, o listener abaixo relê.
      if (document.visibilityState === 'hidden') return
      try {
        const res = await araraApiFetch('/api/whatsapp/metrics')
        if (!res.ok || !vivo) return
        const j = await res.json()
        const d = (j?.data ?? {}) as { open?: number; naoLidas?: number; ultimoEventoEm?: string | null }
        const carimbo = d.ultimoEventoEm ?? null

        const chegou =
          !primeira.current && !!carimbo && carimbo !== ultimoEvento.current && !noInbox.current
        ultimoEvento.current = carimbo
        primeira.current = false

        setSinal({
          abertas: Number(d.open ?? 0),
          naoLidas: Number(d.naoLidas ?? 0),
          novidade: chegou,
        })

        if (chegou) {
          void tocarAviso()
          clearTimeout(apagarPulso)
          apagarPulso = setTimeout(() => {
            if (vivo) setSinal((s) => ({ ...s, novidade: false }))
          }, 6000)
        }
      } catch {
        /* rede instável não é motivo para derrubar a barra lateral */
      }
    }

    void ler()
    const timer = setInterval(() => void ler(), INTERVALO_MS)
    const aoVoltar = () => { if (document.visibilityState === 'visible') void ler() }
    document.addEventListener('visibilitychange', aoVoltar)

    return () => {
      vivo = false
      clearInterval(timer)
      clearTimeout(apagarPulso)
      document.removeEventListener('visibilitychange', aoVoltar)
    }
  }, [ativo])

  return sinal
}
