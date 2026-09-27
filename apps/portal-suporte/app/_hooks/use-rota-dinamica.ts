'use client'

// =============================================================================
// Lê um parâmetro de rota dinâmica de forma que sobreviva ao export estático.
//
// O problema: com `output: 'export'`, `generateStaticParams()` devolve
// `[{ id: '_' }]` e o build gera UM arquivo — `/admin/.../_/index.html`. Quando
// alguém abre `/admin/whatsapp/flow/waf_abc` direto (ou recarrega a página), a
// hospedagem entrega aquele mesmo arquivo — verifiquei: os dois endereços
// devolvem bytes idênticos. O Next hidrata com o parâmetro embutido ali, e
// `useParams()` passa a valer `'_'`.
//
// O sintoma é sempre o mesmo: a tela busca `/api/.../_`, leva 404 e mostra
// "não foi possível carregar" — sem nenhuma pista de que o id se perdeu.
//
// A barra de endereço, essa, sempre tem o valor certo. Então a ordem é:
//   1. `?id=` na query — quando a navegação já usa o formato de query
//   2. `useParams()` — vale na navegação interna do Next
//   3. o caminho da URL — o último recurso, e o único confiável num F5
//
// A query é lida de `window.location`, e NÃO de `useSearchParams()`: esse hook
// exige um limite de Suspense na exportação estática, e sem ele o build quebra
// ao pré-renderizar (foi o que aconteceu com /avaliar/_). A inbox já evitava o
// mesmo hook, pelo mesmo motivo.
// =============================================================================

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

/** Placeholder que o `generateStaticParams` usa; nunca é um id de verdade. */
const PLACEHOLDER = '_'

function daUrl(chave: string, pai: string): string {
  if (typeof window === 'undefined') return ''

  const naQuery = new URLSearchParams(window.location.search).get(chave)
  if (naQuery) return naQuery

  // /admin/whatsapp/flow/waf_abc → o segmento logo depois de "flow"
  const partes = window.location.pathname.split('/').filter(Boolean)
  const i = partes.lastIndexOf(pai)
  const valor = i >= 0 ? partes[i + 1] : partes[partes.length - 1]
  return valor && valor !== PLACEHOLDER ? decodeURIComponent(valor) : ''
}

/**
 * @param chave  nome do parâmetro (`id`, `token`, `serverId`…)
 * @param pai    segmento que vem ANTES do parâmetro na URL (`flow`, `tickets`…),
 *               usado para achá-lo no caminho sem depender da posição.
 */
export function useRotaDinamica(chave: string, pai: string): string {
  const params = useParams()
  const doParams = String(params?.[chave] ?? '')
  const valido = doParams && doParams !== PLACEHOLDER ? doParams : ''

  // `window` não existe na pré-renderização; o valor da URL só entra depois de
  // montar. Começar pelo `params` evita um render vazio na navegação interna.
  const [daJanela, setDaJanela] = useState('')
  useEffect(() => {
    if (!valido) setDaJanela(daUrl(chave, pai))
  }, [valido, chave, pai])

  return valido || daJanela
}
