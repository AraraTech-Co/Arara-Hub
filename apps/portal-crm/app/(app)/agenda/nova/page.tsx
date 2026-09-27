'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { arara, useAuth } from '@/lib/arara'

function NovaAtividadeForm() {
  const router = useRouter()
  const { user, role } = useAuth()
  const searchParams = useSearchParams()
  const clientId = searchParams.get('clientId') ?? ''

  const [clients, setClients] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    arara
      .clients({
        scopeOwner: role === 'admin' ? 'admin' : user?.id,
      })
      .then((c) => setClients((c.data || []).map((x) => ({ id: String(x.id), name: String(x.name) }))))
      .catch(() => setError('Não foi possível carregar os clientes.'))
  }, [user, role])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const form = new FormData(e.currentTarget)
    const rawDate = String(form.get('scheduledAt') || '')
    const body = {
      type: form.get('type'),
      clientId: form.get('clientId') || null,
      scheduledAt: rawDate ? new Date(rawDate).toISOString() : null,
      notes: form.get('notes') || null,
    }
    try {
      await arara.createActivity(body)
      router.push('/agenda')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar atividade.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">Nova Atividade</h1>
      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
            {error}
          </div>
        )}
        <div>
          <label htmlFor="type" className="block text-sm font-medium text-gray-700 mb-1">
            Tipo *
          </label>
          <select
            id="type"
            name="type"
            required
            className="w-full h-11 px-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="call">Ligação</option>
            <option value="visit">Visita</option>
            <option value="email">E-mail</option>
            <option value="meeting">Reunião</option>
            <option value="follow_up">Follow-up</option>
          </select>
        </div>
        <div>
          <label htmlFor="clientId" className="block text-sm font-medium text-gray-700 mb-1">
            Cliente
          </label>
          <select
            id="clientId"
            name="clientId"
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
          <label htmlFor="scheduledAt" className="block text-sm font-medium text-gray-700 mb-1">
            Data e hora *
          </label>
          <input
            id="scheduledAt"
            name="scheduledAt"
            type="datetime-local"
            required
            className="w-full h-11 px-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
            Notas
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
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

export default function NovaAtividadePage() {
  return (
    <Suspense>
      <NovaAtividadeForm />
    </Suspense>
  )
}
