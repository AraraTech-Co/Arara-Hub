'use client'

import { useEffect, useState } from 'react'
import { arara } from '@/lib/arara/client'
import { useAuth } from '@/lib/arara/AuthProvider'
import { useMeuAcesso } from '@/hooks/use-meu-acesso'
import { CompaniesClient } from './companies-client'

export default function CompaniesPage() {
  const { isAdmin } = useAuth()
  // Cadastrar empresa também é liberável por pessoa (grant `cadastro_empresa`),
  // sem promover ninguém a admin. Editar e desativar continuam só de admin.
  const { podeCadastrarEmpresa } = useMeuAcesso()
  const [companies, setCompanies] = useState<any[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    arara
      .companies()
      .then((r) => {
        const rows = (r.data || []).map((c) => ({
          id: c.id,
          name: c.name || 'Sem nome',
          cnpj: c.cnpj ?? null,
          contactEmail: c.contact_email ?? c.contactEmail ?? null,
          phone: c.phone ?? null,
          city: c.city ?? null,
          state: c.state ?? null,
          segment: c.segment ?? null,
          active: c.active !== false,
          group: null,
          tradeName: c.trade_name ?? c.tradeName ?? null,
          product: c.product ?? null,
          serverName: c.server_name ?? c.serverName ?? null,
          // Esta é a ÚNICA tela que mostra as duas faixas, então precisa da
          // marca que separa cadastro de legado. Sem ela, as 122 vindas da
          // carga de chamados apareceriam como cadastro real.
          synced_from_tickets: (c as { synced_from_tickets?: boolean }).synced_from_tickets === true,
          name_aliases: (c as { name_aliases?: string[] }).name_aliases ?? null,
          _count: { tickets: 0, profiles: 0, units: 0 },
        }))
        setCompanies(rows)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Carregando empresas…</div>
  }

  if (error) {
    return (
      <div className="m-6 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm">
        {error}
      </div>
    )
  }

  return (
    <CompaniesClient
      companies={companies}
      groups={[]}
      slaContracts={[]}
      isAdmin={isAdmin}
      podeCadastrar={isAdmin || podeCadastrarEmpresa}
    />
  )
}
