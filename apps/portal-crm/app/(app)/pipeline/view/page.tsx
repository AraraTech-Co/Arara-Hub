'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { arara } from '@/lib/arara'
import { formatBRL, formatDate } from '@/lib/format'
import { dealStatusLabels, dealStatusTextClass } from '@/lib/labels'
import { DealActions } from '../[id]/deal-actions'

function DealViewInner() {
  const searchParams = useSearchParams()
  const id = searchParams.get('id') || ''
  const [deal, setDeal] = useState<Record<string, unknown> | null>(null)
  const [client, setClient] = useState<Record<string, unknown> | null>(null)
  const [stage, setStage] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id) {
      setError('Negociação não informada')
      setLoading(false)
      return
    }
    let cancelled = false
    arara
      .deal(id)
      .then(async (d) => {
        if (cancelled) return
        setDeal(d)
        const [c, stages] = await Promise.all([
          d.clientId ? arara.client(String(d.clientId)).catch(() => null) : null,
          arara.stages(),
        ])
        if (cancelled) return
        setClient(c)
        setStage((stages.data || []).find((s) => String(s.id) === String(d.stageId)) || null)
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
  }, [id])

  if (loading) return <p className="text-sm text-gray-500">Carregando…</p>
  if (error || !deal) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {error || 'Negociação não encontrada'}
      </div>
    )
  }

  const status = String(deal.status || 'open') as 'open' | 'won' | 'lost'

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Link href="/pipeline" className="text-sm text-gray-500 hover:text-gray-700">
            Pipeline
          </Link>
          <span className="text-gray-300">/</span>
          <span className="text-sm text-gray-900">{String(deal.title)}</span>
        </div>
        <h1 className="text-xl font-semibold text-gray-900">{String(deal.title)}</h1>
        <p className={`text-sm mt-1 ${dealStatusTextClass[status]}`}>{dealStatusLabels[status]}</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-gray-500 uppercase mb-1">Cliente</p>
          {client ? (
            <Link
              href={`/clientes/view?id=${client.id}`}
              className="text-sm text-indigo-600 hover:underline"
            >
              {String(client.name)}
            </Link>
          ) : (
            <p className="text-sm">—</p>
          )}
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase mb-1">Etapa</p>
          <p className="text-sm">{String(stage?.name || '—')}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase mb-1">Valor</p>
          <p className="text-sm font-semibold tabular-nums">
            {deal.value != null ? formatBRL(Number(deal.value)) : '—'}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase mb-1">Previsão</p>
          <p className="text-sm">
            {deal.expectedClose ? formatDate(String(deal.expectedClose)) : '—'}
          </p>
        </div>
      </div>

      {status === 'open' && <DealActions dealId={String(deal.id)} />}
    </div>
  )
}

export default function PipelineViewPage() {
  return (
    <Suspense fallback={<p className="text-sm text-gray-500">Carregando…</p>}>
      <DealViewInner />
    </Suspense>
  )
}
