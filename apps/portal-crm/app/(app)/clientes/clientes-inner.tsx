'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { arara, useAuth } from '@/lib/arara'
import { clientTypeLabels as typeLabels, clientTypeBadgeClass } from '@/lib/labels'
import { ClientesFilters } from './clientes-filters'

export default function ClientesPageInner() {
  const { user, role } = useAuth()
  const searchParams = useSearchParams()
  const q = searchParams.get('q') || ''
  const tipo = searchParams.get('tipo') || ''
  const [clientes, setClientes] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user) return
    let cancelled = false
    setLoading(true)
    const qs: Record<string, string | undefined> = {
      q: q || undefined,
      tipo: tipo || undefined,
        scopeOwner: role === 'admin' ? 'admin' : user.id,
    }
    arara
      .clients(qs)
      .then((r) => {
        if (!cancelled) setClientes(r.data || [])
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
  }, [user, role, q, tipo])

  const list = useMemo(() => clientes, [clientes])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Clientes &amp; Leads</h1>
        <Link
          href="/clientes/novo"
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg min-h-[44px] inline-flex items-center"
        >
          + Novo Cliente
        </Link>
      </div>

      <ClientesFilters initialQ={q} initialTipo={tipo} />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Carregando…</p>
      ) : list.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <p className="text-sm font-medium text-gray-700">Nenhum cliente encontrado</p>
          <Link
            href="/clientes/novo"
            className="mt-1 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-5 py-2.5 rounded-lg min-h-[44px] inline-flex items-center"
          >
            + Novo Cliente
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {list.map((c) => {
            const id = String(c.id)
            const name = String(c.name || '—')
            const type = String(c.type || 'lead') as 'lead' | 'cliente'
            const tags = Array.isArray(c.tags) ? (c.tags as string[]) : []
            return (
              <Link
                key={id}
                href={`/clientes/view?id=${id}`}
                className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors"
              >
                <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-sm shrink-0">
                  {name[0]?.toUpperCase() || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">{name}</p>
                  <p className="text-sm text-gray-500 truncate">
                    {String(c.company || c.email || '—')}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {tags.slice(0, 2).map((t) => (
                    <span key={t} className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">
                      {t}
                    </span>
                  ))}
                  <span
                    className={`text-xs px-2.5 py-1 rounded-full font-medium ${clientTypeBadgeClass[type] || ''}`}
                  >
                    {typeLabels[type] ?? type}
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
