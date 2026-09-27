'use client'

import { useState, useEffect, useCallback } from 'react'
import { reportsApi, type ReportData, type ReportPeriod, type ReportSnapshot } from '@/lib/api/reports'
import { ApiError } from '@/lib/api/client'

// ── useReport ─────────────────────────────────────────────────────────────────

interface UseReportResult {
  data:    ReportData | null
  loading: boolean
  error:   string | null
  reload:  () => void
}

/**
 * Carrega o relatório completo para um dado período.
 * Recarrega automaticamente quando `period` muda.
 */
export function useReport(period: ReportPeriod, date?: string, companyName?: string): UseReportResult {
  const [data, setData]       = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await reportsApi.get(period, date, companyName)
      setData(res.data)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha na conexão com o servidor.')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [period, date, companyName])

  useEffect(() => { load() }, [load])

  return { data, loading, error, reload: load }
}

// ── useReportHistory ──────────────────────────────────────────────────────────

interface UseReportHistoryResult {
  snapshots: ReportSnapshot[]
  loading:   boolean
  error:     string | null
  reload:    () => void
}

/**
 * Carrega o histórico de snapshots para um dado período.
 * Carrega de forma lazy — não dispara automaticamente na montagem.
 * Chame `reload()` para buscar os dados quando necessário.
 */
export function useReportHistory(period: ReportPeriod, limit = 24): UseReportHistoryResult {
  const [snapshots, setSnapshots] = useState<ReportSnapshot[]>([])
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await reportsApi.getHistory(period, limit)
      setSnapshots(res.data ?? [])
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao carregar histórico.')
    } finally {
      setLoading(false)
    }
  }, [period, limit])

  return { snapshots, loading, error, reload }
}
