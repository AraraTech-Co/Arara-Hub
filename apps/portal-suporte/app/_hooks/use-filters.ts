"use client"

import { useCallback, useEffect, useState } from "react"
import { filtersApi } from "@/lib/api/filters"
import type { FilterConfig, SavedFilter } from "@/lib/api/filters"

export type { FilterConfig, SavedFilter } from "@/lib/api/filters"

export function useFilters() {
  const [filters, setFilters] = useState<SavedFilter[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const resp = await filtersApi.list()
      const data = (resp as any).data ?? resp
      setFilters(data.filters ?? [])
    } catch {
      // silently ignore load errors (same behaviour as before)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const saveFilter = useCallback(async (name: string, filterConfig: FilterConfig, isDefault = false) => {
    const resp = await filtersApi.create({ name, filterConfig, isDefault })
    const filter = ((resp as any).data ?? resp).filter
    setFilters(prev => [...prev, filter])
    return filter
  }, [])

  const deleteFilter = useCallback(async (id: string) => {
    await filtersApi.delete(id)
    setFilters(prev => prev.filter(f => f.id !== id))
  }, [])

  const setDefault = useCallback(async (id: string) => {
    await filtersApi.setDefault(id)
    setFilters(prev => prev.map(f => ({ ...f, isDefault: f.id === id })))
  }, [])

  const defaultFilter = filters.find(f => f.isDefault) ?? null

  return { filters, loading, saveFilter, deleteFilter, setDefault, defaultFilter, reload: load }
}
