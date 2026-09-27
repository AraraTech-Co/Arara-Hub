'use client'

import { useEffect, useState } from 'react'
import { arara } from '@/lib/arara'
import { roleLabels, roleBadgeClass } from '@/lib/labels'
import { ConfigTabs } from '../config-tabs'

/** Lista de Profiles CRM (criação de user/senha fica na platform auth). */
export default function UsuariosConfigPage() {
  const [profiles, setProfiles] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    arara
      .profiles()
      .then((r) => setProfiles(r.data || []))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold text-gray-900">Configurações</h1>
      <ConfigTabs />
      <p className="text-sm text-gray-500">
        Usuários do CRM (perfil local). Contas e senhas são geridas na Arara Platform.
      </p>
      {loading ? (
        <p className="text-sm text-gray-500">Carregando…</p>
      ) : (
        <div className="bg-white rounded-xl border divide-y">
          {profiles.map((p) => {
            const role = String(p.role || 'vendedor') as 'vendedor' | 'gerente' | 'admin'
            return (
              <div key={String(p.id)} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {String(p.fullName || p.email || '—')}
                  </p>
                  <p className="text-xs text-gray-500 truncate">{String(p.email || '')}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${roleBadgeClass[role] || ''}`}>
                  {roleLabels[role] || role}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
