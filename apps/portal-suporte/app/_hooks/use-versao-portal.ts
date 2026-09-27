// =============================================================================
// Aviso de versão nova do portal.
//
// O portal é um SPA num export estático: quem deixa a aba aberta continua
// rodando o bundle do dia em que a abriu — dias, às vezes. Cada deploy só
// chegava a quem desse F5, e "a função não aparece para o fulano" virava
// diagnóstico recorrente quando era só bundle velho.
//
// O build grava `/versao.json` (script `postbuild` do package.json, que roda
// sozinho depois do `next build` — inclusive no CI do monorepo). Este hook lê o
// carimbo na carga, reconsulta a cada 5 min e quando a aba volta ao foco; se o
// carimbo mudou, expõe `novaVersao` para a tela oferecer o recarregar.
// =============================================================================

'use client'

import { useEffect, useRef, useState } from 'react'

export function useVersaoPortal(): { novaVersao: boolean; recarregar: () => void } {
  const [novaVersao, setNovaVersao] = useState(false)
  const inicial = useRef<string | null>(null)

  useEffect(() => {
    let vivo = true
    const ler = async () => {
      try {
        const r = await fetch(`/versao.json?t=${Date.now()}`, { cache: 'no-store' })
        // 200 NÃO garante o arquivo: a hospedagem devolve o index.html do SPA
        // para caminho inexistente. Sem esta checagem o `r.json()` estourava e
        // o catch engolia — o aviso ficou meses sem aparecer, sem sinal nenhum.
        if (!r.ok) return
        if (!(r.headers.get('content-type') || '').includes('json')) return
        const { versao } = (await r.json()) as { versao?: string }
        if (!versao || !vivo) return
        if (inicial.current === null) inicial.current = versao
        else if (versao !== inicial.current) setNovaVersao(true)
      } catch {
        // Sem rede ou arquivo ausente (deploys antigos): silêncio — o aviso é
        // cortesia, não pode virar erro.
      }
    }
    ler()
    const timer = setInterval(ler, 5 * 60 * 1000)
    const aoFocar = () => { if (document.visibilityState === 'visible') ler() }
    document.addEventListener('visibilitychange', aoFocar)
    return () => {
      vivo = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', aoFocar)
    }
  }, [])

  return { novaVersao, recarregar: () => window.location.reload() }
}
