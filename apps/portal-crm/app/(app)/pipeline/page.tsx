'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { arara } from '@/lib/arara'
import { KanbanBoard } from '@/components/crm/KanbanBoard'

export default function PipelinePage() {
  const [stages, setStages] = useState<{ id: string; name: string; color: string }[]>([])
  const [deals, setDeals] = useState<
    {
      id: string
      title: string
      stageId: string
      value: number | null
      expectedClose: string | null
      client: { name: string }
    }[]
  >([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    Promise.all([arara.stages(), arara.deals({ status: 'open' })])
      .then(([s, d]) => {
        if (cancelled) return
        setStages(
          (s.data || []).map((x) => ({
            id: String(x.id),
            name: String(x.name),
            color: String(x.color || '#6366f1'),
          })),
        )
        setDeals(
          (d.data || []).map((x) => {
            const client = x.client as { name?: string } | undefined
            return {
              id: String(x.id),
              title: String(x.title),
              stageId: String(x.stageId),
              value: x.value != null ? Number(x.value) : null,
              expectedClose: x.expectedClose ? String(x.expectedClose) : null,
              client: { name: client?.name || '—' },
            }
          }),
        )
      })
      .catch((e) => {
        if (!cancelled) setError(e.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) return <p className="text-sm text-gray-500">Carregando pipeline…</p>
  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {error}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Pipeline de Vendas</h1>
        <Link
          href="/pipeline/novo"
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 rounded-lg transition-colors inline-flex items-center min-h-[44px]"
        >
          + Nova Negociação
        </Link>
      </div>

      {stages.length === 0 ? (
        <div className="text-center py-12 text-gray-500 text-sm">
          Nenhuma etapa configurada. Configure em Configurações → Funil.
        </div>
      ) : (
        <KanbanBoard stages={stages} initialDeals={deals} />
      )}
    </div>
  )
}
