'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { arara, useAuth } from '@/lib/arara'

function NovaNegociacaoForm() {
  const router = useRouter()
  const { user, role } = useAuth()
  const searchParams = useSearchParams()
  const clientId = searchParams.get('clientId') ?? ''

  const [clients, setClients] = useState<{ id: string; name: string }[]>([])
  const [stages, setStages] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      arara.clients({
        scopeOwner: role === 'admin' ? 'admin' : user?.id,
      }),
      arara.stages(),
    ])
      .then(([c, s]) => {
        setClients((c.data || []).map((x) => ({ id: String(x.id), name: String(x.name) })))
        setStages((s.data || []).map((x) => ({ id: String(x.id), name: String(x.name) })))
      })
      .catch(() => setError('Não foi possível carregar clientes/etapas.'))
  }, [user, role])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const form = new FormData(e.currentTarget)
    const body = {
      title: form.get('title'),
      clientId: form.get('clientId'),
      stageId: form.get('stageId'),
      value: form.get('value') ? Number(form.get('value')) : null,
      expectedClose: form.get('expectedClose') || null,
    }
    try {
      const data = await arara.createDeal(body)
      router.push(`/pipeline/view?id=${data.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar negociação.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">Nova Negociação</h1>
      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
            {error}
          </div>
        )}
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
            Título *
          </label>
          <input
            id="title"
            name="title"
            required
            className="w-full h-11 px-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="ex: Licença SGC — Empresa ABC"
          />
        </div>
        <div>
          <label htmlFor="clientId" className="block text-sm font-medium text-gray-700 mb-1">
            Cliente *
          </label>
          <select
            id="clientId"
            name="clientId"
            required
            defaultValue={clientId}
            className="w-full h-11 px-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">Selecionar cliente...</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="stageId" className="block text-sm font-medium text-gray-700 mb-1">
            Etapa *
          </label>
          <select
            id="stageId"
            name="stageId"
            required
            className="w-full h-11 px-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">Selecionar etapa...</option>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="value" className="block text-sm font-medium text-gray-700 mb-1">
              Valor (R$)
            </label>
            <input
              id="value"
              name="value"
              type="number"
              step="0.01"
              min="0"
              className="w-full h-11 px-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label htmlFor="expectedClose" className="block text-sm font-medium text-gray-700 mb-1">
              Previsão de fechamento
            </label>
            <input
              id="expectedClose"
              name="expectedClose"
              type="date"
              className="w-full h-11 px-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-medium text-sm px-5 py-2.5 rounded-lg"
          >
            {loading ? 'Salvando...' : 'Salvar'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="text-gray-600 hover:text-gray-900 font-medium text-sm px-4 py-2.5 rounded-lg hover:bg-gray-100"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  )
}

export default function NovaNegociacaoPage() {
  return (
    <Suspense>
      <NovaNegociacaoForm />
    </Suspense>
  )
}
