'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { HistoricoClient } from './historico-client'
import { api } from '@/lib/api/client'
import { AdminHeader } from '@/components/admin/admin-header'
import { useAuth } from '@/lib/arara/AuthProvider'
import { Suspense } from 'react'

type Item = {
  id: string
  cnpj: string
  periodo: string
  cod_ver: string
  status: string
  total_erros: number
  total_avisos: number
  created_at: string
}

function HistoricoBody() {
  const { user } = useAuth()
  const params = useSearchParams()
  const cnpj = params.get('cnpj') || undefined
  const limit = Number(params.get('limit') || 20)
  const offset = Number(params.get('offset') || 0)
  const [items, setItems] = useState<Item[]>([])
  const [error, setError] = useState<string>()

  useEffect(() => {
    const qs = new URLSearchParams()
    if (cnpj) qs.set('cnpj', cnpj)
    qs.set('limit', String(limit))
    qs.set('offset', String(offset))
    api
      .get<{ data?: Item[] }>(`/api/sped-validations?${qs}`)
      .then((r) => setItems(r.data || []))
      .catch((e) => setError(e.message))
  }, [cnpj, limit, offset])

  return (
    <div className="flex flex-col">
      <AdminHeader user={{ email: user?.email, fullName: user?.name || user?.email }} />
      <div className="space-y-4 p-4 lg:p-6">
        <div>
          <h1 className="text-2xl font-bold">Histórico SPED</h1>
          <p className="text-sm text-muted-foreground">Validações persistidas via Arara</p>
        </div>
        <HistoricoClient items={items} error={error} limit={limit} offset={offset} cnpjFilter={cnpj} />
      </div>
    </div>
  )
}

export default function HistoricoPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Carregando…</div>}>
      <HistoricoBody />
    </Suspense>
  )
}
