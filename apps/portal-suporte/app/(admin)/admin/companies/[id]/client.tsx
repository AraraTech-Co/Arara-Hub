'use client'

// =============================================================================
// Ficha da empresa — carrega e entrega ao hub que já existia.
//
// Esta tela era um placeholder: mostrava oito campos em somente-leitura e uma
// lista de chamados, sem editar nada. Enquanto isso, `company-hub-client.tsx`
// (987 linhas, com as abas Dados / Técnico / Contatos / Unidades, health score
// e desativação) estava no repositório sem ninguém renderizar. Clicar no lápis
// abria o placeholder, e é por isso que a tela parecia "sem sentido".
//
// O que esta camada faz, e por que precisa existir: a plataforma devolve o
// registro em snake_case (`trade_name`, `server_ip_interno`), e o hub — escrito
// antes da migração, contra o Prisma — espera camelCase. Traduzir aqui mantém
// as 987 linhas intactas; o contrário seria reescrever o hub inteiro para
// ganhar nada.
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { arara } from '@/lib/arara/client'
import { useAuth } from '@/lib/arara/AuthProvider'
import { Button } from '@/components/ui/button'
import { useRotaDinamica } from '@/hooks/use-rota-dinamica'
import { hasMinRole } from '@/lib/arara/auth-storage'
import { CompanyHubClient } from './company-hub-client'

type Bruto = Record<string, unknown>

const texto = (v: unknown): string | null => {
  const s = v == null ? '' : String(v)
  return s.trim() === '' ? null : s
}
const bool = (v: unknown): boolean => v === true || v === 'true'
const num = (v: unknown): number | null => {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
const lista = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.map(String)
  if (typeof v === 'string' && v.trim()) return v.split(',').map((s) => s.trim()).filter(Boolean)
  return []
}

/** Aceita as duas grafias do mesmo campo — a API mudou, o hub não. */
const de = (c: Bruto, ...nomes: string[]): unknown => {
  for (const n of nomes) if (c[n] !== undefined && c[n] !== null) return c[n]
  return undefined
}

function paraHub(c: Bruto) {
  return {
    id: String(c.id),
    name: String(c.name ?? 'Empresa'),
    cnpj: texto(c.cnpj),
    contactEmail: texto(de(c, 'contact_email', 'contactEmail')),
    phone: texto(c.phone),
    city: texto(c.city),
    state: texto(c.state),
    segment: texto(c.segment),
    active: c.active !== false,
    // Grupo e contrato de SLA ainda não têm rota na plataforma; o hub trata
    // ausência como "nenhum" e os campos aparecem vazios em vez de quebrar.
    group: null,
    slaContractId: texto(de(c, 'sla_contract_id', 'slaContractId')),
    slaContract: null,
    tradeName: texto(de(c, 'trade_name', 'tradeName')),
    stateRegistration: texto(de(c, 'state_registration', 'stateRegistration')),
    operationType: texto(de(c, 'operation_type', 'operationType')),
    whatsapp: texto(c.whatsapp),
    product: texto(c.product),
    hasPdv: bool(de(c, 'has_pdv', 'hasPdv')),
    pdvCount: num(de(c, 'pdv_count', 'pdvCount')),
    storeCount: num(de(c, 'store_count', 'storeCount')),
    usesTef: bool(de(c, 'uses_tef', 'usesTef')),
    usesSat: bool(de(c, 'uses_sat', 'usesSat')),
    usesNfce: bool(de(c, 'uses_nfce', 'usesNfce')),
    activeModules: lista(de(c, 'active_modules', 'activeModules')),
    integrationPartners: lista(de(c, 'integration_partners', 'integrationPartners')),
    operationalNotes: texto(de(c, 'operational_notes', 'operationalNotes')),
    serverName: texto(de(c, 'server_name', 'serverName')),
    serverType: texto(de(c, 'server_type', 'serverType')),
    serverIpInternal: texto(de(c, 'server_ip_internal', 'serverIpInternal')),
    serverIpExternal: texto(de(c, 'server_ip_external', 'serverIpExternal')),
    serverOs: texto(de(c, 'server_os', 'serverOs')),
    dbSystem: texto(de(c, 'db_system', 'dbSystem')),
    vpnEnabled: bool(de(c, 'vpn_enabled', 'vpnEnabled')),
    backupEnabled: bool(de(c, 'backup_enabled', 'backupEnabled')),
    hasHomologEnv: bool(de(c, 'has_homolog_env', 'hasHomologEnv')),
    technicalNotes: texto(de(c, 'technical_notes', 'technicalNotes')),
    sshServerId: texto(de(c, 'ssh_server_id', 'sshServerId')),
    sshServer: null,
    _count: { tickets: 0, profiles: 0, units: 0 },
  }
}

export default function CompanyDetailPage() {
  const id = useRotaDinamica('id', 'companies')
  const { isAdmin, appRole } = useAuth()
  const [company, setCompany] = useState<ReturnType<typeof paraHub> | null>(null)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(true)

  const carregar = useCallback(async () => {
    if (!id) {
      setCarregando(false)
      return
    }
    setErro('')
    setCarregando(true)
    try {
      const c = (await arara.company(id)) as Bruto
      // A rota devolve ora o registro, ora `{ data: registro }`.
      setCompany(paraHub((c.data as Bruto) ?? c))
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar a empresa.')
    } finally {
      setCarregando(false)
    }
  }, [id])

  useEffect(() => {
    void carregar()
  }, [carregar])

  if (carregando) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (erro || !company) {
    return (
      <main className="space-y-3 p-6">
        <Link href="/admin/companies" className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Empresas
        </Link>
        <div className="rounded-lg border border-sem-error-bd bg-sem-error px-4 py-3 text-sm text-sem-error-fg">
          {erro || 'Empresa não encontrada.'}
        </div>
        <Button size="sm" variant="secondary" onClick={() => void carregar()}>
          Tentar novamente
        </Button>
      </main>
    )
  }

  return (
    <div className="pt-14 lg:pt-0">
      <div className="px-4 pt-4 lg:px-6">
        <Link href="/admin/companies" className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Empresas
        </Link>
      </div>
      <CompanyHubClient
        company={company}
        groups={[]}
        slaContracts={[]}
        isAdmin={isAdmin}
        // Credencial de servidor é outro patamar de acesso: fica com admin,
        // não com quem só pode editar o cadastro.
        canManageSsh={appRole === 'admin'}
        // Filial é cadastro operacional: quem atende descobre a unidade nova
        // no meio do chamado. Exigir admin é o que mantém o cadastro velho.
        podeEditarFiliais={hasMinRole(appRole, 'support')}
      />
    </div>
  )
}
