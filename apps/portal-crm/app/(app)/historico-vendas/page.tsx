'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { arara, useAuth } from '@/lib/arara'
import { formatBRL, formatDate } from '@/lib/format'

export default function HistoricoVendasPage() {
  const { user, role } = useAuth()
  const [deals, setDeals] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    arara
      .deals({ status: 'won' })
      .then((r) => {
        if (cancelled) return
        let rows = r.data || []
        if (role !== 'admin' && user) {
          rows = rows.filter((d) => String(d.ownerId) === user.id)
        }
        setDeals(rows)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [user, role])

  if (loading) return <p className="text-sm text-gray-500">Carregando histórico…</p>

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold text-gray-900">Histórico de Vendas</h1>
      {deals.length === 0 ? (
        <p className="text-sm text-gray-500 py-12 text-center">Nenhuma venda ganha ainda.</p>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 divide-y">
          {deals.map((d) => {
            const client = d.client as { name?: string } | undefined
            return (
              <Link
                key={String(d.id)}
                href={`/pipeline/view?id=${d.id}`}
                className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">{String(d.title)}</p>
                  <p className="text-sm text-gray-500">{client?.name || '—'}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold tabular-nums">
                    {d.value != null ? formatBRL(Number(d.value)) : '—'}
                  </p>
                  <p className="text-xs text-gray-500">
                    {d.closedAt ? formatDate(String(d.closedAt)) : '—'}
                  </p>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
