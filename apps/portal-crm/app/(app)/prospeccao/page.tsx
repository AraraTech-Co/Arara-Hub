'use client'

import { useEffect, useState } from 'react'
import { arara } from '@/lib/arara'
import { ProspeccaoList } from './prospeccao-client'

export default function ProspeccaoPage() {
  const [leads, setLeads] = useState<
    {
      id: string
      name: string
      company: string | null
      email: string | null
      phone: string | null
      type: 'lead' | 'cliente'
      tags: string[]
      source: string | null
      createdAt: string
    }[]
  >([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    arara
      .leads()
      .then((r) => {
        if (cancelled) return
        setLeads(
          (r.data || []).map((row) => ({
            id: String(row.id),
            name: String(row.name || ''),
            company: row.company ? String(row.company) : null,
            email: row.email ? String(row.email) : null,
            phone: row.phone ? String(row.phone) : null,
            type: (row.type === 'cliente' ? 'cliente' : 'lead') as 'lead' | 'cliente',
            tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
            source: row.source ? String(row.source) : null,
            createdAt: String(row.createdAt || new Date().toISOString()),
          })),
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

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Prospecção</h1>
        <p className="text-sm text-gray-500 mt-1">
          Leads sem dono no pool — pegue um e inicie o contato.
        </p>
      </div>
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {loading ? (
        <p className="text-sm text-gray-500">Carregando pool…</p>
      ) : (
        <ProspeccaoList initialLeads={leads} />
      )}
    </div>
  )
}
