'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useRotaDinamica } from '@/hooks/use-rota-dinamica'
import Link from 'next/link'
import { api } from '@/lib/api/client'
import { ResultadoSuporteView } from '@/components/validador-sped/resultado-suporte'
import type { ValidationResult } from '@/lib/sped/validator'
import { AdminHeader } from '@/components/admin/admin-header'
import { useAuth } from '@/lib/arara/AuthProvider'

export default function SpedDetailClient() {
  const id = useRotaDinamica('id', 'validador-sped')
  const { user } = useAuth()
  const [result, setResult] = useState<ValidationResult | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id || id === '_') return
    api
      .get<{ result?: ValidationResult; data?: { result?: ValidationResult } & ValidationResult }>(
        `/api/sped-validations/${id}`,
      )
      .then((r) => {
        const res = r.result || r.data?.result || (r.data as ValidationResult) || null
        setResult(res)
      })
      .catch((e) => setError(e.message))
  }, [id])

  return (
    <div className="flex flex-col">
      <AdminHeader user={{ email: user?.email, fullName: user?.name || user?.email }} />
      <div className="space-y-4 p-4 lg:p-6">
        <Link href="/admin/validador-sped/historico" className="text-sm text-primary hover:underline">
          ← Histórico
        </Link>
        {error && <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm">{error}</div>}
        {!result && !error && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {result && <ResultadoSuporteView result={result} />}
      </div>
    </div>
  )
}
