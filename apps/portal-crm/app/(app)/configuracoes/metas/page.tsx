'use client'

import { useEffect, useState } from 'react'
import { arara, useAuth } from '@/lib/arara'
import { ConfigTabs } from '../config-tabs'

export default function MetasPage() {
  const { user } = useAuth()
  const now = new Date()
  const [targetValue, setTargetValue] = useState('0')
  const [targetDeals, setTargetDeals] = useState('0')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (!user) return
    arara
      .goals({
        userId: user.id,
        periodMonth: String(now.getMonth() + 1),
        periodYear: String(now.getFullYear()),
      })
      .then((r) => {
        const g = (r.data || [])[0]
        if (g) {
          setTargetValue(String(g.targetValue ?? 0))
          setTargetDeals(String(g.targetDeals ?? 0))
        }
      })
      .finally(() => setLoading(false))
  }, [user])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    setSaving(true)
    setMsg('')
    try {
      await arara.createGoal({
        userId: user.id,
        periodMonth: now.getMonth() + 1,
        periodYear: now.getFullYear(),
        targetValue: Number(targetValue),
        targetDeals: Number(targetDeals),
      })
      setMsg('Meta salva.')
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold text-gray-900">Configurações</h1>
      <ConfigTabs />
      {loading ? (
        <p className="text-sm text-gray-500">Carregando…</p>
      ) : (
        <form onSubmit={save} className="bg-white rounded-xl border p-5 max-w-md space-y-4">
          <p className="text-sm text-gray-500">
            Meta de {now.getMonth() + 1}/{now.getFullYear()}
          </p>
          <div>
            <label className="block text-sm font-medium mb-1">Valor (R$)</label>
            <input
              type="number"
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
              className="w-full h-10 px-3 border rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Qtd. deals</label>
            <input
              type="number"
              value={targetDeals}
              onChange={(e) => setTargetDeals(e.target.value)}
              className="w-full h-10 px-3 border rounded-lg text-sm"
            />
          </div>
          {msg && <p className="text-sm text-gray-600">{msg}</p>}
          <button
            type="submit"
            disabled={saving}
            className="bg-indigo-600 text-white text-sm px-4 py-2 rounded-lg disabled:opacity-60"
          >
            {saving ? 'Salvando…' : 'Salvar meta'}
          </button>
        </form>
      )}
    </div>
  )
}
