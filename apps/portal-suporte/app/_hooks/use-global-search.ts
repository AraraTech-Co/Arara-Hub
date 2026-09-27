'use client'

// =============================================================================
// Busca global — hook único, consumido pelo Cmd+K e pelo botão "Pergunte a I.A.".
//
// O mapeamento dos resultados vivia dentro do global-search.tsx. Duplicá-lo no
// popup novo daria duas verdades sobre o que é um ticket, uma empresa e um
// usuário — e elas divergiriam na primeira mudança do índice.
//
// A busca é o `/api/search` que já existe (Meilisearch), não um array em
// código: o popup original da documentação fazia `.includes()` sobre 181
// entradas fixas e errava o básico — "nfe" achava 14, "NF-e" achava 6, e
// qualquer erro de digitação achava zero.
// =============================================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { araraApiFetch } from '@/lib/arara/arara-api-fetch'

export interface SearchResult {
  id: string
  type: 'ticket' | 'company' | 'user'
  title: string
  subtitle?: string
  href: string
}

/**
 * O índice devolve o registro cru, sem dizer de que tipo é. A inferência é por
 * campo característico — a mesma regra que o Cmd+K já usava.
 */
function mapear(r: Record<string, unknown>): SearchResult {
  if (r.ticket_number || r.ticketNumber) {
    return {
      id: r.id as string,
      type: 'ticket',
      title: `#${r.ticket_number || r.ticketNumber} — ${r.title}`,
      subtitle: (r.company_name || r.status) as string | undefined,
      href: `/admin/tickets/view/?id=${encodeURIComponent(r.id)}`,
    }
  }
  if (r.cnpj !== undefined) {
    return {
      id: r.id as string,
      type: 'company',
      title: (r.name || r.trade_name) as string,
      subtitle: r.cnpj ? `CNPJ: ${r.cnpj}` : (r.city as string | undefined),
      href: `/admin/companies`,
    }
  }
  return {
    id: r.id as string,
    type: 'user',
    title: (r.full_name || r.fullName || r.email) as string,
    subtitle: r.email as string | undefined,
    href: `/admin/users`,
  }
}

export const TIPO_ICONE: Record<SearchResult['type'], string> = {
  ticket: '🎫',
  company: '🏢',
  user: '👤',
}

export const TIPO_ROTULO: Record<SearchResult['type'], string> = {
  ticket: 'Ticket',
  company: 'Empresa',
  user: 'Usuário',
}

/** Abaixo disto a API devolve 400 — não vale a viagem. */
const MINIMO = 2

/**
 * Uma busca avulsa, sem hook. O popup do "Pergunte a I.A." consulta sob
 * demanda (ao enviar a pergunta), não a cada tecla — hook com debounce não
 * serve ali, e duplicar o mapeamento serviria menos ainda.
 */
export async function buscarGlobal(q: string): Promise<SearchResult[]> {
  if (q.trim().length < MINIMO) return []
  const res = await araraApiFetch(`/api/search?q=${encodeURIComponent(q)}&limit=8`)
  const data = await res.json()
  const brutos = (data?.data ?? data?.results ?? []) as Record<string, unknown>[]
  return Array.isArray(brutos) ? brutos.map(mapear) : []
}

export function useGlobalSearch(query: string, { debounceMs = 300 } = {}) {
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  // Resposta lenta de uma consulta antiga não pode sobrescrever a nova.
  const geracao = useRef(0)

  const buscar = useCallback(async (q: string) => {
    const minha = ++geracao.current
    if (q.trim().length < MINIMO) {
      setResults([])
      setLoading(false)
      setErro('')
      return
    }
    setLoading(true)
    try {
      const res = await araraApiFetch(`/api/search?q=${encodeURIComponent(q)}&limit=8`)
      const data = await res.json()
      if (minha !== geracao.current) return
      const brutos = (data?.data ?? data?.results ?? []) as Record<string, unknown>[]
      setResults(Array.isArray(brutos) ? brutos.map(mapear) : [])
      setErro('')
    } catch (e) {
      if (minha !== geracao.current) return
      setResults([])
      setErro(e instanceof Error ? e.message : 'Não foi possível buscar.')
    } finally {
      if (minha === geracao.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => void buscar(query), debounceMs)
    return () => clearTimeout(t)
  }, [query, debounceMs, buscar])

  return {
    results,
    loading,
    erro,
    /** `true` quando o termo é curto demais para consultar. */
    curto: query.trim().length > 0 && query.trim().length < MINIMO,
  }
}
