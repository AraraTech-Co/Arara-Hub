"use client"
// =============================================================================
// useTicketSearch — filtros, busca e paginação do TicketList
//
// Extraído de components/dashboard/ticket-list.tsx para separar lógica de
// estado/navegação da renderização visual.
// =============================================================================

import { useCallback, useRef, useTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"

export interface UseTicketSearchReturn {
  /** Dispara busca com debounce de 400 ms */
  handleSearchInput: (value: string) => void
  /** Aplica filtro de status e reseta para página 1 */
  handleStatusFilter: (status: string) => void
  /** Monta URL preservando todos os params existentes */
  buildUrl: (overrides: Record<string, string>) => string
  /** Ref do timer de debounce (necessário para cancelar no unmount) */
  searchTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>
  isPending: boolean
}

export function useTicketSearch(): UseTicketSearchReturn {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const buildUrl = useCallback(
    (overrides: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString())
      Object.entries(overrides).forEach(([k, v]) => {
        if (v) params.set(k, v)
        else params.delete(k)
      })
      return `/dashboard?${params.toString()}`
    },
    [searchParams]
  )

  const handleSearch = useCallback(
    (value: string) => {
      startTransition(() => {
        const params = new URLSearchParams(searchParams.toString())
        if (value) params.set("q", value)
        else params.delete("q")
        params.delete("page")
        router.push(`/dashboard?${params.toString()}`)
      })
    },
    [router, searchParams]
  )

  const handleSearchInput = useCallback(
    (value: string) => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
      searchTimerRef.current = setTimeout(() => handleSearch(value), 400)
    },
    [handleSearch]
  )

  const handleStatusFilter = useCallback(
    (status: string) => {
      startTransition(() => {
        const params = new URLSearchParams(searchParams.toString())
        if (status) params.set("status", status)
        else params.delete("status")
        params.delete("page")
        router.push(`/dashboard?${params.toString()}`)
      })
    },
    [router, searchParams]
  )

  return { handleSearchInput, handleStatusFilter, buildUrl, searchTimerRef, isPending }
}
