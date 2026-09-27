'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { arara } from '@/lib/arara'
import { formatBRL } from '@/lib/format'
import {
  clientTypeLabels,
  clientTypeBadgeClass,
  dealStatusLabels,
  dealStatusTextClass,
  activityLabels,
} from '@/lib/labels'

function ClienteDetalheInner() {
  const searchParams = useSearchParams()
  const id = searchParams.get('id') || ''
  const [client, setClient] = useState<Record<string, unknown> | null>(null)
  const [deals, setDeals] = useState<Record<string, unknown>[]>([])
  const [activities, setActivities] = useState<Record<string, unknown>[]>([])
  const [stages, setStages] = useState<Record<string, unknown>[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) {
      setError('Cliente não informado')
      setLoading(false)
      return
    }
    let cancelled = false
    Promise.all([arara.client(id), arara.deals({ status: 'all' }), arara.activities(), arara.stages()])
      .then(([c, d, a, s]) => {
        if (cancelled) return
        setClient(c)
        setDeals((d.data || []).filter((x) => String(x.clientId) === id))
        setActivities((a.data || []).filter((x) => String(x.clientId) === id).slice(0, 10))
        setStages(s.data || [])
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
  if (error || !client) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {error || 'Cliente não encontrado'}
      </div>
    )
  }

  const type = String(client.type || 'lead') as 'lead' | 'cliente'
  const tags = Array.isArray(client.tags) ? (client.tags as string[]) : []
  const stageById = Object.fromEntries(stages.map((s) => [String(s.id), s]))

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/clientes" className="text-sm text-gray-500 hover:text-gray-700">
              Clientes
            </Link>
            <span className="text-gray-300">/</span>
            <span className="text-sm text-gray-900">{String(client.name)}</span>
          </div>
          <h1 className="text-xl font-semibold text-gray-900">{String(client.name)}</h1>
          {client.company ? <p className="text-gray-500 text-sm">{String(client.company)}</p> : null}
        </div>
        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${clientTypeBadgeClass[type]}`}>
          {clientTypeLabels[type]}
        </span>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 grid grid-cols-2 gap-4">
        <Info label="E-mail" value={client.email ? String(client.email) : null} />
        <Info label="Telefone" value={client.phone ? String(client.phone) : null} />
        <Info label="Tags" value={tags.join(', ') || '—'} />
        <Info label="Origem" value={client.source ? String(client.source) : '—'} />
        {client.notes ? (
          <div className="col-span-2">
            <Info label="Notas" value={String(client.notes)} />
          </div>
        ) : null}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-medium text-gray-900">Negociações ({deals.length})</h2>
          <Link
            href={`/pipeline/novo?clientId=${id}`}
            className="text-indigo-600 hover:text-indigo-800 text-sm font-medium"
          >
            + Nova Negociação
          </Link>
        </div>
        {deals.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhuma negociação ainda.</p>
        ) : (
          <ul className="space-y-2">
            {deals.map((d) => {
              const st = stageById[String(d.stageId)]
              const status = String(d.status || 'open') as 'open' | 'won' | 'lost'
              return (
                <li key={String(d.id)}>
                  <Link
                    href={`/pipeline/view?id=${d.id}`}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: String(st?.color || '#6366f1') }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{String(d.title)}</p>
                      <p className="text-xs text-gray-500">{String(st?.name || '—')}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-900 tabular-nums">
                        {d.value != null ? formatBRL(Number(d.value)) : '—'}
                      </p>
                      <span className={`text-xs ${dealStatusTextClass[status]}`}>
                        {dealStatusLabels[status]}
                      </span>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-medium text-gray-900 mb-4">Atividades recentes</h2>
        {activities.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhuma atividade.</p>
        ) : (
          <ul className="space-y-2">
            {activities.map((a) => (
              <li key={String(a.id)} className="text-sm text-gray-700">
                {activityLabels[String(a.type) as keyof typeof activityLabels] || a.type}
                {a.doneAt ? ' · concluída' : ''}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-sm text-gray-900">{value || '—'}</p>
    </div>
  )
}

export default function ClienteViewPage() {
  return (
    <Suspense fallback={<p className="text-sm text-gray-500">Carregando…</p>}>
      <ClienteDetalheInner />
    </Suspense>
  )
}
