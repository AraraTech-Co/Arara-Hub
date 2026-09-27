'use client'

import { useEffect, useState } from 'react'
import { arara } from '@/lib/arara'
import { roleLabels, roleBadgeClass } from '@/lib/labels'

export default function EquipePage() {
  const [profiles, setProfiles] = useState<Record<string, unknown>[]>([])
  const [teams, setTeams] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([arara.profiles(), arara.teams()])
      .then(([p, t]) => {
        setProfiles(p.data || [])
        setTeams(t.data || [])
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p className="text-sm text-gray-500">Carregando equipe…</p>

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold text-gray-900">Equipe</h1>
      {teams.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {teams.map((t) => (
            <span
              key={String(t.id)}
              className="bg-indigo-50 text-indigo-700 text-xs font-medium px-3 py-1 rounded-full"
            >
              {String(t.name)}
            </span>
          ))}
        </div>
      )}
      <div className="bg-white rounded-xl border border-gray-200 divide-y">
        {profiles.map((p) => {
          const role = String(p.role || 'vendedor') as 'vendedor' | 'gerente' | 'admin'
          return (
            <div key={String(p.id)} className="flex items-center gap-4 px-5 py-4">
              <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-sm">
                {String(p.fullName || p.email || '?')[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 truncate">
                  {String(p.fullName || p.email || '—')}
                </p>
                <p className="text-sm text-gray-500 truncate">{String(p.email || '')}</p>
              </div>
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${roleBadgeClass[role] || ''}`}>
                {roleLabels[role] || role}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
