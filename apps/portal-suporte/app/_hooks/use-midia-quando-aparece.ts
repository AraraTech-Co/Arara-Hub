'use client'

import { useEffect, useRef, useState } from 'react'

// ─── useMidiaQuandoAparece ────────────────────────────────────────────────────
// A mídia de uma bolha (foto, áudio, vídeo) é pedida ao servidor só quando a
// bolha aparece na tela, e não quando a conversa abre. Uma conversa pode ter
// dezenas de mídias; quem lê as últimas mensagens não precisa baixar as do topo.
//
// "Aparecer" é ficar visível por PERMANENCIA_MS seguidos. A lista desce até o fim
// com rolagem suave, passando por todas as bolhas no caminho; sem a permanência,
// essa descida pediria todas as mídias de novo. A margem (MARGEM) começa a
// carregar um pouco antes da bolha entrar, para a mídia já estar lá ao rolar.
//
// Sem IntersectionObserver (navegador antigo), pede na hora, como antes.

export const PERMANENCIA_MS = 200
export const MARGEM = '400px 0px'

export interface MidiaQuandoAparece<E> {
  /** Vai no elemento da bolha: é ele que é observado. */
  ref: { current: E | null }
  url: string | null
  erro: boolean
}

export function useMidiaQuandoAparece<E extends Element = HTMLDivElement>(
  id: string,
  buscar: (id: string) => Promise<string>,
): MidiaQuandoAparece<E> {
  const ref = useRef<E | null>(null)
  const [visivel, setVisivel] = useState(false)
  const [url, setUrl] = useState<string | null>(null)
  const [erro, setErro] = useState(false)

  // Observa a bolha até ela ficar visível por PERMANENCIA_MS; depois, para.
  useEffect(() => {
    if (visivel) return
    if (typeof IntersectionObserver === 'undefined') {
      setVisivel(true)
      return
    }
    const el = ref.current
    if (!el) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const obs = new IntersectionObserver((entradas) => {
      const dentro = entradas.some((e) => e.isIntersecting)
      if (dentro && timer === null) {
        timer = setTimeout(() => { timer = null; obs.disconnect(); setVisivel(true) }, PERMANENCIA_MS)
      } else if (!dentro && timer !== null) {
        clearTimeout(timer)
        timer = null
      }
    }, { rootMargin: MARGEM })
    obs.observe(el)
    return () => {
      if (timer !== null) clearTimeout(timer)
      obs.disconnect()
    }
  }, [id, visivel])

  // Pede a mídia uma vez, quando a bolha apareceu.
  useEffect(() => {
    if (!visivel) return
    let vivo = true
    buscar(id)
      .then((u) => { if (vivo) setUrl(u) })
      .catch(() => { if (vivo) setErro(true) })
    return () => { vivo = false }
    // `buscar` fica fora de propósito: o componente passa uma função nova a cada
    // render, e incluí-la pediria a mídia de novo a cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, visivel])

  return { ref, url, erro }
}
