'use client'

// =============================================================================
// Meu nível e meus grants — numa única fonte.
//
// Três telas já repetiam este mesmo carregamento (menu lateral, membros,
// quadro Dev): buscar `/api/profiles`, achar a própria linha, ler `role` e
// `feature_grants`. Repetir de novo aqui seria a quarta cópia — e a diretriz do
// projeto é consolidar, não ampliar a dívida.
//
// A régua daqui só decide o que a TELA mostra. Quem recusa de verdade é o
// servidor, em cada rota.
// =============================================================================

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/arara/AuthProvider'
import { api } from '@/lib/api/client'
import type { SystemAccessLevel } from '@/lib/auth/types'
import type { FeatureGrant } from '@/lib/auth/feature-grants'

const ORDEM: SystemAccessLevel[] = ['user', 'developer', 'admin', 'master']

export type MeuAcesso = {
  nivel: SystemAccessLevel | null
  grants: string[]
  carregando: boolean
  /** Nível igual ou acima do pedido. */
  temNivel: (min: SystemAccessLevel) => boolean
  tem: (grant: FeatureGrant) => boolean
  /** admin+ ou o grant `planejamento`. Espelha canPlanejar() do servidor. */
  podePlanejar: boolean
  /** admin+ ou o grant `cadastro_empresa`. Espelha a regra de POST /admin/companies. */
  podeCadastrarEmpresa: boolean
}

export function useMeuAcesso(): MeuAcesso {
  const { user } = useAuth()
  const [nivel, setNivel] = useState<SystemAccessLevel | null>(null)
  const [grants, setGrants] = useState<string[]>([])
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    let ativo = true

    // Fallback enquanto o Profile não chega: os papéis do JWT da plataforma.
    const roles = user?.roles || []
    if (roles.includes('master')) setNivel('master')
    else if (roles.includes('admin')) setNivel('admin')
    else if (roles.includes('developer')) setNivel('developer')
    else if (roles.length) setNivel('user')

    if (!user?.id && !user?.email) {
      setCarregando(false)
      return () => { ativo = false }
    }

    api
      .get<{ data?: Record<string, unknown>[] } | Record<string, unknown>[]>('/api/profiles')
      .then((res) => {
        if (!ativo) return
        const linhas = Array.isArray(res) ? res : res?.data || []
        const minha =
          linhas.find((p) => p.id === user?.id) ||
          linhas.find(
            (p) => String(p.email || '').toLowerCase() === String(user?.email || '').toLowerCase(),
          )
        if (!minha) return
        const papel = String(minha.role || '') as SystemAccessLevel
        if (ORDEM.includes(papel)) setNivel(papel)
        const fg = minha.feature_grants ?? minha.featureGrants
        if (Array.isArray(fg)) setGrants(fg.map(String))
      })
      .catch(() => { /* mantém o fallback do JWT */ })
      .finally(() => { if (ativo) setCarregando(false) })

    return () => { ativo = false }
  }, [user?.id, user?.email, user?.roles])

  const temNivel = (min: SystemAccessLevel) =>
    !!nivel && ORDEM.indexOf(nivel) >= ORDEM.indexOf(min)

  return {
    nivel,
    grants,
    carregando,
    temNivel,
    tem: (g: FeatureGrant) => grants.includes(g),
    podePlanejar: temNivel('admin') || grants.includes('planejamento'),
    podeCadastrarEmpresa: temNivel('admin') || grants.includes('cadastro_empresa'),
  }
}
