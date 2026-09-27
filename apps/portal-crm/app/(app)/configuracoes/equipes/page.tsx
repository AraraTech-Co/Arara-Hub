'use client'

import { useEffect, useState } from 'react'
import { arara } from '@/lib/arara'
import { ConfigTabs } from '../config-tabs'

export default function EquipesConfigPage() {
  const [teams, setTeams] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    arara
      .teams()
      .then((r) => setTeams(r.data || []))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold text-gray-900">Configurações</h1>
      <ConfigTabs />
      {loading ? (
        <p className="text-sm text-gray-500">Carregando…</p>
      ) : teams.length === 0 ? (
        <p className="text-sm text-gray-500">Nenhuma equipe cadastrada.</p>
      ) : (
        <ul className="bg-white rounded-xl border divide-y">
          {teams.map((t) => (
            <li key={String(t.id)} className="px-4 py-3 text-sm font-medium">
              {String(t.name)}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
