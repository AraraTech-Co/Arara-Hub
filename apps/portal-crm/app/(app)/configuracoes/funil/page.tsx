'use client'

import { useEffect, useState } from 'react'
import { arara } from '@/lib/arara'
import { ConfigTabs } from '../config-tabs'

export default function FunilPage() {
  const [stages, setStages] = useState<Record<string, unknown>[]>([])
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  function refresh() {
    return arara.stages().then((r) => setStages(r.data || []))
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false))
  }, [])

  async function addStage(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      await arara.createStage({
        name: name.trim(),
        order: stages.length + 1,
        color: '#6366f1',
        active: true,
      })
      setName('')
      await refresh()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold text-gray-900">Configurações</h1>
      <ConfigTabs />
      {loading ? (
        <p className="text-sm text-gray-500">Carregando funil…</p>
      ) : (
        <>
          <ul className="bg-white rounded-xl border divide-y">
            {stages.map((s) => (
              <li key={String(s.id)} className="flex items-center gap-3 px-4 py-3">
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: String(s.color || '#6366f1') }}
                />
                <span className="text-sm font-medium flex-1">{String(s.name)}</span>
                <span className="text-xs text-gray-400">#{String(s.order)}</span>
              </li>
            ))}
          </ul>
          <form onSubmit={addStage} className="flex gap-2 max-w-md">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nova etapa"
              className="flex-1 h-10 px-3 border rounded-lg text-sm"
            />
            <button
              type="submit"
              disabled={saving}
              className="bg-indigo-600 text-white text-sm px-4 rounded-lg disabled:opacity-60"
            >
              Adicionar
            </button>
          </form>
        </>
      )}
    </div>
  )
}
