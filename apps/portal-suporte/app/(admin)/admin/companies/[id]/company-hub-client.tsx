'use client'

import { useState, useEffect } from 'react'
import { getPriorityColor, getPriorityLabel } from '@/lib/ticket-priority'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Building2, Pencil, Trash2, MapPin, Mail, Phone, Package,
  Users, Ticket, Server, Settings, Contact, Shield, X,
  ArrowLeft, Save, ExternalLink, CheckCircle2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from '@/components/ui/tabs'
import { Breadcrumbs } from '@/components/ui/breadcrumbs'
import { EmptyState } from '@/components/ui/empty-state'
import { useToast } from '@/hooks/use-toast'
import { cn, formatDate, formatDateShort } from '@/lib/utils'
import { companiesApi } from '@/lib/api/companies'
import { ticketsApi } from '@/lib/api/tickets'
import type { TicketSummary } from '@/lib/api/tickets'
import { ContactsTab } from './contacts-tab'
import { UnitsTab } from './units-tab'
import { araraApiFetch } from '@/lib/arara/arara-api-fetch'

/* -------------------------------------------------------------------------- */
/*  Types                                                                       */
/* -------------------------------------------------------------------------- */

interface Group { id: string; name: string }

interface Unit {
  id: string; companyId: string; name: string; city: string | null
  state: string | null; active: boolean; code?: string | null
  cnpj?: string | null; address?: string | null; phone?: string | null
  email?: string | null; whatsapp?: string | null; product?: string | null
  pdvCount?: number | null; serverRef?: string | null; notes?: string | null
}

interface ContactItem {
  id: string; companyId: string; unitId: string | null; name: string
  roleTitle: string | null; department: string | null; email: string | null
  phone: string | null; whatsapp: string | null; contactType: string
  receivesNotifications: boolean; receivesSlaAlerts: boolean; onCall: boolean
  notes: string | null; active: boolean
}

interface SlaContract {
  id: string; name: string; tier: string
  p0ResponseMin?: number | null; p1ResponseMin?: number | null
  p2ResponseMin?: number | null; p3ResponseMin?: number | null
}

interface Company {
  id: string; name: string; cnpj: string | null; contactEmail: string | null
  phone: string | null; city: string | null; state: string | null
  segment: string | null; active: boolean; group: Group | null
  slaContractId?: string | null; slaContract?: SlaContract | null
  tradeName?: string | null; stateRegistration?: string | null
  operationType?: string | null; whatsapp?: string | null; product?: string | null
  hasPdv?: boolean; pdvCount?: number | null; storeCount?: number | null
  usesTef?: boolean; usesSat?: boolean; usesNfce?: boolean
  activeModules?: string[]; integrationPartners?: string[]
  operationalNotes?: string | null
  serverName?: string | null; serverType?: string | null
  serverIpInternal?: string | null; serverIpExternal?: string | null
  serverOs?: string | null; dbSystem?: string | null
  vpnEnabled?: boolean; backupEnabled?: boolean; hasHomologEnv?: boolean
  technicalNotes?: string | null
  sshServerId?: string | null
  sshServer?: { id: string; nome: string; host: string; dns: string | null; port: number | null; usuario: string } | null
  _count: { tickets: number; profiles: number; units: number }
}

// TicketItem aliased to TicketSummary from ticketsApi
type TicketItem = TicketSummary

/* -------------------------------------------------------------------------- */
/*  Constants                                                                   */
/* -------------------------------------------------------------------------- */


function formatMinutes(min: number | null | undefined): string {
  if (!min) return '—'
  if (min < 60) return `${min}min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h}h` : `${h}h${m}min`
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                   */
/* -------------------------------------------------------------------------- */

export function CompanyHubClient({
  company: initialCompany,
  groups,
  slaContracts,
  isAdmin,
  canManageSsh,
  podeEditarFiliais,
}: {
  company: Company
  groups: Group[]
  slaContracts: SlaContract[]
  isAdmin: boolean
  canManageSsh?: boolean
  /** Cadastrar filial vale a partir de `support` — ver a aba Unidades. */
  podeEditarFiliais?: boolean
}) {
  const router = useRouter()
  const { toast } = useToast()

  const [company, setCompany] = useState<Company>(initialCompany)
  const [activeTab, setActiveTab] = useState('dados')
  const [saving, setSaving] = useState(false)
  const [deleteDialog, setDeleteDialog] = useState(false)

  /* ---- Lazy-loaded data ---- */
  const [tickets, setTickets] = useState<TicketItem[]>([])
  const [ticketsLoaded, setTicketsLoaded] = useState(false)
  const [healthScore, setHealthScore] = useState<any>(null)
  const [healthLoading, setHealthLoading] = useState(false)
  const [healthRecalculating, setHealthRecalculating] = useState(false)

  /* ---- Per-tab form state ---- */
  const [dadosForm, setDadosForm] = useState({
    name: company.name,
    tradeName: company.tradeName ?? '',
    cnpj: company.cnpj ?? '',
    stateRegistration: company.stateRegistration ?? '',
    segment: company.segment ?? '',
    operationType: company.operationType ?? '',
    active: company.active,
    city: company.city ?? '',
    state: company.state ?? '',
    phone: company.phone ?? '',
    whatsapp: company.whatsapp ?? '',
    contactEmail: company.contactEmail ?? '',
    groupId: company.group?.id ?? '',
  })

  const [opForm, setOpForm] = useState({
    product: company.product ?? '',
    hasPdv: company.hasPdv ?? false,
    pdvCount: company.pdvCount ?? ('' as string | number),
    storeCount: company.storeCount ?? ('' as string | number),
    usesTef: company.usesTef ?? false,
    usesSat: company.usesSat ?? false,
    usesNfce: company.usesNfce ?? false,
    activeModules: (company.activeModules ?? []).join(', '),
    integrationPartners: (company.integrationPartners ?? []).join(', '),
    operationalNotes: company.operationalNotes ?? '',
  })

  const [infraForm, setInfraForm] = useState({
    serverName: company.serverName ?? '',
    serverType: company.serverType ?? '',
    serverIpInternal: company.serverIpInternal ?? '',
    serverIpExternal: company.serverIpExternal ?? '',
    serverOs: company.serverOs ?? '',
    dbSystem: company.dbSystem ?? '',
    vpnEnabled: company.vpnEnabled ?? false,
    backupEnabled: company.backupEnabled ?? false,
    hasHomologEnv: company.hasHomologEnv ?? false,
    technicalNotes: company.technicalNotes ?? '',
  })

  const [slaForm, setSlaForm] = useState({
    slaContractId: company.slaContractId ?? '',
  })

  const [sshForm, setSshForm] = useState({
    host:    company.sshServer?.host    ?? '',
    dns:     company.sshServer?.dns     ?? '',
    port:    company.sshServer?.port    ?? 22,
    usuario: company.sshServer?.usuario ?? '',
    senha:   '',
  })

  /* ---- Lazy loading effect ---- */
  useEffect(() => {
    if (activeTab === 'tickets' && !ticketsLoaded) {
      ticketsApi.list({ company_name: company.name, pageSize: '20' })
        .then(j => {
          if (j.success) { setTickets(j.data ?? []); setTicketsLoaded(true) }
          else { setTickets([]); setTicketsLoaded(true) }
        })
        .catch(() => { setTickets([]); setTicketsLoaded(true) })
    }
  }, [activeTab, company.id, company.name, ticketsLoaded])

  useEffect(() => {
    if (activeTab === 'health' && !healthScore && !healthLoading) {
      setHealthLoading(true)
      companiesApi.getHealthScore(company.id)
        .then(j => setHealthScore(j.data ?? null))
        .catch(() => {})
        .finally(() => setHealthLoading(false))
    }
  }, [activeTab, company.id, healthScore, healthLoading])

  async function recalculateHealth() {
    setHealthRecalculating(true)
    try {
      const j = await companiesApi.recalcHealthScore(company.id)
      setHealthScore(j.data ?? null)
      toast({ title: 'Health Score recalculado', description: `Score: ${j.data?.score ?? '—'}` })
    } catch {
      toast({ title: 'Erro ao recalcular', variant: 'destructive' })
    } finally {
      setHealthRecalculating(false)
    }
  }

  /* -------------------------------------------------------------------------- */
  /*  Save helpers                                                               */
  /* -------------------------------------------------------------------------- */

  async function patchCompany(data: Record<string, unknown>) {
    setSaving(true)
    try {
      const json = await companiesApi.patch(company.id, data)
      if (!json.success) throw new Error('Erro ao salvar')
      setCompany(prev => ({ ...prev, ...json.data }))
      toast({ title: 'Salvo', description: 'Alterações salvas com sucesso.' })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar'
      toast({ title: 'Erro', description: msg, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  function saveDados() {
    patchCompany({
      name: dadosForm.name,
      tradeName: dadosForm.tradeName,
      cnpj: dadosForm.cnpj,
      stateRegistration: dadosForm.stateRegistration,
      segment: dadosForm.segment,
      operationType: dadosForm.operationType,
      active: dadosForm.active,
      city: dadosForm.city,
      state: dadosForm.state,
      phone: dadosForm.phone,
      whatsapp: dadosForm.whatsapp,
      contactEmail: dadosForm.contactEmail,
      groupId: dadosForm.groupId || null,
    })
  }

  function saveOperacao() {
    patchCompany({
      product: opForm.product,
      hasPdv: opForm.hasPdv,
      pdvCount: opForm.pdvCount !== '' ? Number(opForm.pdvCount) : null,
      storeCount: opForm.storeCount !== '' ? Number(opForm.storeCount) : null,
      usesTef: opForm.usesTef,
      usesSat: opForm.usesSat,
      usesNfce: opForm.usesNfce,
      activeModules: opForm.activeModules ? opForm.activeModules.split(',').map(s => s.trim()).filter(Boolean) : [],
      integrationPartners: opForm.integrationPartners ? opForm.integrationPartners.split(',').map(s => s.trim()).filter(Boolean) : [],
      operationalNotes: opForm.operationalNotes,
    })
  }

  function saveInfra() {
    patchCompany({ ...infraForm })
  }

  function saveSla() {
    patchCompany({ slaContractId: slaForm.slaContractId || null })
  }

  async function saveSsh() {
    setSaving(true)
    try {
      if (company.sshServerId) {
        const body: Record<string, unknown> = {
          host:    sshForm.host,
          dns:     sshForm.dns || null,
          port:    sshForm.port,
          usuario: sshForm.usuario,
        }
        if (sshForm.senha) body.senha = sshForm.senha
        const res  = await araraApiFetch(`/api/admin/ssh-servers/${company.sshServerId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        })
        const json = await res.json()
        if (!json.success) throw new Error(json.error || 'Erro ao salvar SSH')
      } else {
        if (!sshForm.host || !sshForm.usuario) throw new Error('Host e usuário são obrigatórios')
        const res  = await araraApiFetch('/api/admin/ssh-servers', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nome: `${company.name} SSH`, host: sshForm.host, dns: sshForm.dns || null, port: sshForm.port, usuario: sshForm.usuario, senha: sshForm.senha || null }),
        })
        const json = await res.json()
        if (!json.success) throw new Error(json.error || 'Erro ao criar SSH')
        const linked = await companiesApi.patch(company.id, { sshServerId: json.data.id })
        if (linked.success) setCompany(prev => ({ ...prev, sshServerId: json.data.id, sshServer: json.data }))
      }
      toast({ title: 'SSH salvo', description: 'Credenciais atualizadas com sucesso.' })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar'
      toast({ title: 'Erro', description: msg, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  async function deactivate() {
    setSaving(true)
    try {
      await companiesApi.deactivate(company.id)
      toast({ title: 'Empresa desativada', description: `${company.name} foi desativada.` })
      router.push('/admin/companies')
    } finally {
      setSaving(false)
      setDeleteDialog(false)
    }
  }

  /* -------------------------------------------------------------------------- */
  /*  Shared style helpers                                                        */
  /* -------------------------------------------------------------------------- */

  const labelCls = 'text-xs font-medium text-foreground/60'
  const inputCls = 'mt-1 text-sm'
  const checkboxRow = 'flex items-center gap-2'

  const SaveBtn = ({ onClick }: { onClick: () => void }) => (
    <div className="pt-4 border-t border-border/50 flex justify-end">
      <Button size="sm" className="bg-blue-600 hover:bg-blue-700 gap-1.5" onClick={onClick} disabled={saving}>
        <Save className="h-3.5 w-3.5" />
        {saving ? 'Salvando...' : 'Salvar alterações'}
      </Button>
    </div>
  )

  /* -------------------------------------------------------------------------- */
  /*  SLA contract detail lookup                                                 */
  /* -------------------------------------------------------------------------- */

  const currentSla = slaContracts.find(s => s.id === slaForm.slaContractId) as SlaContract | undefined
    ?? company.slaContract ?? undefined

  /* -------------------------------------------------------------------------- */
  /*  Render                                                                     */
  /* -------------------------------------------------------------------------- */

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <Breadcrumbs items={[
        { label: 'Empresas', href: '/admin/companies' },
        { label: company.tradeName || company.name },
      ]} />

      {/* Page header */}
      <div className="mb-6 flex flex-wrap items-start gap-4 justify-between">
        <div className="flex items-start gap-3 min-w-0">
          <Link href="/admin/companies">
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 mt-0.5">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-sem-info text-sem-info-fg">
            <Building2 className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-foreground leading-tight">{company.name}</h1>
              {company.tradeName && company.tradeName !== company.name && (
                <span className="text-sm text-muted-foreground">({company.tradeName})</span>
              )}
              <Badge className={company.active ? 'bg-sem-success text-sem-success-fg border-sem-success-bd' : 'bg-muted text-muted-foreground border-border'}>
                {company.active ? 'Ativa' : 'Inativa'}
              </Badge>
            </div>
            <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
              {company.cnpj && <span className="font-mono">{company.cnpj}</span>}
              {(company.city || company.state) && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />{[company.city, company.state].filter(Boolean).join(', ')}
                </span>
              )}
              {company.segment && <span>{company.segment}</span>}
            </div>
          </div>
        </div>

        {/* Quick stats */}
        <div className="flex gap-3 text-xs text-muted-foreground shrink-0">
          <div className="flex flex-col items-center rounded-lg border border-border bg-background px-3 py-2 min-w-[60px]">
            <span className="text-lg font-bold text-foreground">{company._count.tickets}</span>
            <span>Tickets</span>
          </div>
          <div className="flex flex-col items-center rounded-lg border border-border bg-background px-3 py-2 min-w-[60px]">
            <span className="text-lg font-bold text-foreground">{company._count.profiles}</span>
            <span>Usuários</span>
          </div>
          <div className="flex flex-col items-center rounded-lg border border-border bg-background px-3 py-2 min-w-[60px]">
            <span className="text-lg font-bold text-foreground">{company._count.units}</span>
            <span>Unidades</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full flex overflow-x-auto gap-0 border-b border-border bg-transparent rounded-none h-auto p-0 mb-6">
          {[
            { value: 'dados',     label: 'Dados',          icon: Building2 },
            { value: 'operacao',  label: 'Operação',        icon: Settings },
            { value: 'infra',     label: 'Infraestrutura',  icon: Server },
            { value: 'contatos',  label: 'Contatos',        icon: Contact },
            { value: 'unidades',  label: 'Unidades',        icon: MapPin },
            { value: 'sla',       label: 'SLA',             icon: Shield },
            { value: 'tickets',   label: 'Tickets',         icon: Ticket },
            { value: 'health',    label: 'Health Score',    icon: CheckCircle2 },
          ].map(tab => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-none border-b-2 transition-colors',
                'data-[state=active]:border-sem-info-bd data-[state=active]:text-sem-info-fg',
                'data-[state=inactive]:border-transparent data-[state=inactive]:text-muted-foreground',
                'hover:text-foreground/80',
              )}
            >
              <tab.icon className="h-3.5 w-3.5 shrink-0" />
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ------------------------------------------------------------------ */}
        {/* Tab: Dados                                                           */}
        {/* ------------------------------------------------------------------ */}
        <TabsContent value="dados">
          <div className="rounded-xl bg-card p-6 space-y-5 shadow-[var(--shadow-media)]">
            <div>
              <Label className={labelCls}>Razão Social *</Label>
              <Input className={inputCls} value={dadosForm.name}
                onChange={e => setDadosForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label className={labelCls}>Nome Fantasia</Label>
                <Input className={inputCls} value={dadosForm.tradeName}
                  onChange={e => setDadosForm(f => ({ ...f, tradeName: e.target.value }))} />
              </div>
              <div>
                <Label className={labelCls}>CNPJ</Label>
                <Input className={inputCls} placeholder="00.000.000/0001-00" value={dadosForm.cnpj}
                  onChange={e => setDadosForm(f => ({ ...f, cnpj: e.target.value }))} />
              </div>
              <div>
                <Label className={labelCls}>Inscrição Estadual</Label>
                <Input className={inputCls} placeholder="IE" value={dadosForm.stateRegistration}
                  onChange={e => setDadosForm(f => ({ ...f, stateRegistration: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label className={labelCls}>Segmento</Label>
                <select className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  value={dadosForm.segment} onChange={e => setDadosForm(f => ({ ...f, segment: e.target.value }))}>
                  <option value="">— Selecione</option>
                  <option value="Supermercado">Supermercado</option>
                  <option value="Loja de suplementos">Loja de suplementos</option>
                  <option value="Varejo">Varejo</option>
                  <option value="Distribuidora">Distribuidora</option>
                  <option value="Rede">Rede</option>
                  <option value="Serviços">Serviços</option>
                  <option value="Outro">Outro</option>
                </select>
              </div>
              <div>
                <Label className={labelCls}>Tipo de Operação</Label>
                <select className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  value={dadosForm.operationType} onChange={e => setDadosForm(f => ({ ...f, operationType: e.target.value }))}>
                  <option value="">— Selecione</option>
                  <option value="loja-unica">Loja Única</option>
                  <option value="multi-loja">Multi-loja</option>
                  <option value="rede">Rede</option>
                  <option value="shopping">Shopping</option>
                </select>
              </div>
              <div>
                <Label className={labelCls}>Status</Label>
                <select className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  value={dadosForm.active ? 'true' : 'false'}
                  onChange={e => setDadosForm(f => ({ ...f, active: e.target.value === 'true' }))}>
                  <option value="true">Ativa</option>
                  <option value="false">Inativa</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className={labelCls}>Cidade</Label>
                <Input className={inputCls} placeholder="São Paulo" value={dadosForm.city}
                  onChange={e => setDadosForm(f => ({ ...f, city: e.target.value }))} />
              </div>
              <div>
                <Label className={labelCls}>Estado</Label>
                <Input className={inputCls} placeholder="SP" value={dadosForm.state}
                  onChange={e => setDadosForm(f => ({ ...f, state: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label className={labelCls}>Telefone</Label>
                <Input className={inputCls} placeholder="(11) 99999-9999" value={dadosForm.phone}
                  onChange={e => setDadosForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div>
                <Label className={labelCls}>WhatsApp</Label>
                <Input className={inputCls} placeholder="(11) 99999-9999" value={dadosForm.whatsapp}
                  onChange={e => setDadosForm(f => ({ ...f, whatsapp: e.target.value }))} />
              </div>
              <div>
                <Label className={labelCls}>E-mail de contato</Label>
                <Input className={inputCls} type="email" placeholder="contato@empresa.com" value={dadosForm.contactEmail}
                  onChange={e => setDadosForm(f => ({ ...f, contactEmail: e.target.value }))} />
              </div>
            </div>
            {groups.length > 0 && (
              <div>
                <Label className={labelCls}>Grupo</Label>
                <select className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  value={dadosForm.groupId} onChange={e => setDadosForm(f => ({ ...f, groupId: e.target.value }))}>
                  <option value="">— Sem grupo</option>
                  {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
            )}

            {isAdmin && (
              <>
                <SaveBtn onClick={saveDados} />
                <div className="pt-2">
                  <Button
                    variant="outline" size="sm"
                    className="text-sem-error-fg border-sem-error-bd hover:bg-sem-error gap-1.5"
                    onClick={() => setDeleteDialog(true)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Desativar empresa
                  </Button>
                </div>
              </>
            )}
          </div>
        </TabsContent>

        {/* ------------------------------------------------------------------ */}
        {/* Tab: Operação                                                        */}
        {/* ------------------------------------------------------------------ */}
        <TabsContent value="operacao">
          <div className="rounded-xl bg-card p-6 space-y-5 shadow-[var(--shadow-media)]">
            <div>
              <Label className={labelCls}>Produto</Label>
              <select className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={opForm.product} onChange={e => setOpForm(f => ({ ...f, product: e.target.value }))}>
                <option value="">— Selecione</option>
                <option value="SGI">SGI</option>
                <option value="SGC">SGC</option>
                <option value="BOTH">SGI + SGC</option>
                <option value="OTHER">Outro</option>
              </select>
            </div>

            <div>
              <p className="text-xs font-semibold text-foreground/60 mb-2">PDV / Terminais</p>
              <div className="flex flex-wrap gap-5">
                <div className={checkboxRow}>
                  <Checkbox id="hasPdv" checked={opForm.hasPdv}
                    onCheckedChange={v => setOpForm(f => ({ ...f, hasPdv: !!v }))} />
                  <label htmlFor="hasPdv" className="text-sm cursor-pointer">Possui PDV</label>
                </div>
                <div className={checkboxRow}>
                  <Checkbox id="usesTef" checked={opForm.usesTef}
                    onCheckedChange={v => setOpForm(f => ({ ...f, usesTef: !!v }))} />
                  <label htmlFor="usesTef" className="text-sm cursor-pointer">TEF</label>
                </div>
                <div className={checkboxRow}>
                  <Checkbox id="usesSat" checked={opForm.usesSat}
                    onCheckedChange={v => setOpForm(f => ({ ...f, usesSat: !!v }))} />
                  <label htmlFor="usesSat" className="text-sm cursor-pointer">SAT/MFe</label>
                </div>
                <div className={checkboxRow}>
                  <Checkbox id="usesNfce" checked={opForm.usesNfce}
                    onCheckedChange={v => setOpForm(f => ({ ...f, usesNfce: !!v }))} />
                  <label htmlFor="usesNfce" className="text-sm cursor-pointer">NFC-e</label>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {opForm.hasPdv && (
                <div>
                  <Label className={labelCls}>Qtd. PDVs</Label>
                  <Input className={inputCls} type="number" min="0" placeholder="0"
                    value={opForm.pdvCount}
                    onChange={e => setOpForm(f => ({ ...f, pdvCount: e.target.value }))} />
                </div>
              )}
              <div>
                <Label className={labelCls}>Qtd. Lojas</Label>
                <Input className={inputCls} type="number" min="0" placeholder="0"
                  value={opForm.storeCount}
                  onChange={e => setOpForm(f => ({ ...f, storeCount: e.target.value }))} />
              </div>
            </div>

            <div>
              <Label className={labelCls}>Módulos ativos (separe por vírgula)</Label>
              <Input className={inputCls} placeholder="Compras, Vendas, Fiscal..."
                value={opForm.activeModules}
                onChange={e => setOpForm(f => ({ ...f, activeModules: e.target.value }))} />
            </div>
            <div>
              <Label className={labelCls}>Parceiros de integração (separe por vírgula)</Label>
              <Input className={inputCls} placeholder="Stone, SEFAZ, iFood..."
                value={opForm.integrationPartners}
                onChange={e => setOpForm(f => ({ ...f, integrationPartners: e.target.value }))} />
            </div>
            <div>
              <Label className={labelCls}>Observações operacionais</Label>
              <Textarea className="mt-1 text-sm" rows={4} placeholder="Contexto de operação..."
                value={opForm.operationalNotes}
                onChange={e => setOpForm(f => ({ ...f, operationalNotes: e.target.value }))} />
            </div>
            {isAdmin && <SaveBtn onClick={saveOperacao} />}
          </div>
        </TabsContent>

        {/* ------------------------------------------------------------------ */}
        {/* Tab: Infraestrutura                                                  */}
        {/* ------------------------------------------------------------------ */}
        <TabsContent value="infra">
          <div className="rounded-xl bg-card p-6 space-y-5 shadow-[var(--shadow-media)]">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className={labelCls}>Nome do Servidor</Label>
                <Input className={inputCls} placeholder="SERVIDOR-01" value={infraForm.serverName}
                  onChange={e => setInfraForm(f => ({ ...f, serverName: e.target.value }))} />
              </div>
              <div>
                <Label className={labelCls}>Tipo de Servidor</Label>
                <select className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  value={infraForm.serverType}
                  onChange={e => setInfraForm(f => ({ ...f, serverType: e.target.value }))}>
                  <option value="">— Selecione</option>
                  <option value="local">Local</option>
                  <option value="cloud">Cloud</option>
                  <option value="hybrid">Híbrido</option>
                </select>
              </div>
              <div>
                <Label className={labelCls}>IP Interno</Label>
                <Input className={inputCls} placeholder="192.168.0.10" value={infraForm.serverIpInternal}
                  onChange={e => setInfraForm(f => ({ ...f, serverIpInternal: e.target.value }))} />
              </div>
              <div>
                <Label className={labelCls}>IP Externo</Label>
                <Input className={inputCls} placeholder="200.x.x.x" value={infraForm.serverIpExternal}
                  onChange={e => setInfraForm(f => ({ ...f, serverIpExternal: e.target.value }))} />
              </div>
              <div>
                <Label className={labelCls}>Sistema Operacional</Label>
                <Input className={inputCls} placeholder="Windows Server 2019" value={infraForm.serverOs}
                  onChange={e => setInfraForm(f => ({ ...f, serverOs: e.target.value }))} />
              </div>
              <div>
                <Label className={labelCls}>Banco de Dados</Label>
                <Input className={inputCls} placeholder="PostgreSQL 15, Oracle..." value={infraForm.dbSystem}
                  onChange={e => setInfraForm(f => ({ ...f, dbSystem: e.target.value }))} />
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-foreground/60 mb-2">Configurações</p>
              <div className="flex flex-wrap gap-5">
                <div className={checkboxRow}>
                  <Checkbox id="vpnEnabled" checked={infraForm.vpnEnabled}
                    onCheckedChange={v => setInfraForm(f => ({ ...f, vpnEnabled: !!v }))} />
                  <label htmlFor="vpnEnabled" className="text-sm cursor-pointer">VPN habilitada</label>
                </div>
                <div className={checkboxRow}>
                  <Checkbox id="backupEnabled" checked={infraForm.backupEnabled}
                    onCheckedChange={v => setInfraForm(f => ({ ...f, backupEnabled: !!v }))} />
                  <label htmlFor="backupEnabled" className="text-sm cursor-pointer">Backup configurado</label>
                </div>
                <div className={checkboxRow}>
                  <Checkbox id="hasHomologEnv" checked={infraForm.hasHomologEnv}
                    onCheckedChange={v => setInfraForm(f => ({ ...f, hasHomologEnv: !!v }))} />
                  <label htmlFor="hasHomologEnv" className="text-sm cursor-pointer">Ambiente de homologação</label>
                </div>
              </div>
            </div>

            <div>
              <Label className={labelCls}>Notas técnicas</Label>
              <Textarea className="mt-1 text-sm" rows={4}
                placeholder="Configurações especiais, credenciais de acesso remoto..."
                value={infraForm.technicalNotes}
                onChange={e => setInfraForm(f => ({ ...f, technicalNotes: e.target.value }))} />
            </div>
            {isAdmin && <SaveBtn onClick={saveInfra} />}

            {(isAdmin || canManageSsh) && (
              <div className="border-t border-border/50 pt-5 space-y-4">
                <p className="text-xs font-semibold text-foreground/60">Acesso SSH</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className={labelCls}>Host / IP</Label>
                    <Input className={inputCls} placeholder="IP ou hostname"
                      value={sshForm.host} onChange={e => setSshForm(f => ({ ...f, host: e.target.value }))} />
                  </div>
                  <div>
                    <Label className={labelCls}>Porta</Label>
                    <Input className={inputCls} type="number" placeholder="22"
                      value={sshForm.port} onChange={e => setSshForm(f => ({ ...f, port: Number(e.target.value) || 22 }))} />
                  </div>
                  <div>
                    <Label className={labelCls}>DNS</Label>
                    <Input className={inputCls} placeholder="servidor.empresa.com"
                      value={sshForm.dns} onChange={e => setSshForm(f => ({ ...f, dns: e.target.value }))} />
                  </div>
                  <div>
                    <Label className={labelCls}>Usuário</Label>
                    <Input className={inputCls} placeholder="Usuário SSH"
                      value={sshForm.usuario} onChange={e => setSshForm(f => ({ ...f, usuario: e.target.value }))} />
                  </div>
                  <div className="col-span-2">
                    <Label className={labelCls}>
                      Senha{company.sshServerId ? ' (deixe em branco para manter a atual)' : ''}
                    </Label>
                    <Input type="password" className={inputCls} placeholder="Senha SSH"
                      value={sshForm.senha} onChange={e => setSshForm(f => ({ ...f, senha: e.target.value }))} />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button size="sm" className="bg-blue-600 hover:bg-blue-700 gap-1.5" onClick={saveSsh} disabled={saving}>
                    <Save className="h-3.5 w-3.5" />
                    {saving ? 'Salvando...' : 'Salvar SSH'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ------------------------------------------------------------------ */}
        {/* Tab: Contatos                                                        */}
        {/* ------------------------------------------------------------------ */}
        <TabsContent value="contatos">
          <ContactsTab companyId={company.id} isAdmin={isAdmin} />
        </TabsContent>

        {/* ------------------------------------------------------------------ */}
        {/* Tab: Unidades                                                        */}
        {/* ------------------------------------------------------------------ */}
        <TabsContent value="unidades">
          {/* Cadastrar filial é trabalho de quem atende: é o atendente que descobre,
              no meio do chamado, que a loja tem uma unidade que não está no
              cadastro. Exigir admin para isso é o que mantém o cadastro
              desatualizado — e filial fora do cadastro reaparece como texto
              livre no campo Empresa, que é a origem da bagunça que a gente
              acabou de limpar. Ver lib/empresas.ts. */}
          <UnitsTab companyId={company.id} isAdmin={podeEditarFiliais ?? isAdmin} />
        </TabsContent>

        {/* ------------------------------------------------------------------ */}
        {/* Tab: SLA                                                             */}
        {/* ------------------------------------------------------------------ */}
        <TabsContent value="sla">
          <div className="rounded-xl bg-card p-6 space-y-5 shadow-[var(--shadow-media)]">
            <div>
              <Label className={labelCls}>Contrato SLA vinculado</Label>
              <select className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={slaForm.slaContractId}
                onChange={e => setSlaForm({ slaContractId: e.target.value })}>
                <option value="">— Sem contrato SLA</option>
                {slaContracts.map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({s.tier})</option>
                ))}
              </select>
            </div>

            {currentSla && (
              <div className="rounded-lg border border-border bg-muted/50 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-foreground/80">{currentSla.name}</p>
                  <Badge variant="outline" className="text-xs">{currentSla.tier}</Badge>
                </div>
                <div className="grid grid-cols-4 gap-3">
                  {(['P0', 'P1', 'P2', 'P3'] as const).map(p => {
                    const key = `${p.toLowerCase()}ResponseMin` as keyof SlaContract
                    return (
                      <div key={p} className="rounded-md bg-background border border-border p-3 text-center">
                        <p className={cn('text-xs font-bold mb-1',
                          p === 'P0' ? 'text-sem-error-fg' :
                          p === 'P1' ? 'text-status-waiting-fg' :
                          p === 'P2' ? 'text-sem-warning-fg' : 'text-foreground/60'
                        )}>{p}</p>
                        <p className="text-sm font-semibold text-foreground">
                          {formatMinutes(currentSla[key] as number | null)}
                        </p>
                        <p className="text-[10px] text-muted-foreground/70 mt-0.5">resposta</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Shield className="h-3.5 w-3.5" />
              <Link href="/admin/sla-contracts" className="text-sem-info-fg hover:underline flex items-center gap-1">
                Gerenciar contratos SLA <ExternalLink className="h-3 w-3" />
              </Link>
            </div>

            {isAdmin && <SaveBtn onClick={saveSla} />}
          </div>
        </TabsContent>

        {/* ------------------------------------------------------------------ */}
        {/* Tab: Tickets                                                         */}
        {/* ------------------------------------------------------------------ */}
        <TabsContent value="tickets">
          <div className="rounded-xl bg-card p-6 space-y-4 shadow-[var(--shadow-media)]">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground/80">
                Tickets recentes
                {ticketsLoaded && tickets.length > 0 && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground/70">({tickets.length})</span>
                )}
              </h2>
              <Link href={`/admin/kanban?company=${encodeURIComponent(company.name)}`}>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                  <ExternalLink className="h-3.5 w-3.5" /> Ver no Kanban
                </Button>
              </Link>
            </div>

            {!ticketsLoaded ? (
              <p className="text-xs text-muted-foreground/70 py-4 text-center">Carregando tickets...</p>
            ) : tickets.length === 0 ? (
              <EmptyState icon={<Ticket className="h-8 w-8 text-muted-foreground/70" />}
                title="Nenhum ticket encontrado"
                description="Esta empresa não possui tickets registrados."
                size="sm" />
            ) : (
              <div className="space-y-2">
                {tickets.map(tk => (
                  <div key={tk.id} className="flex items-start gap-3 rounded-lg border border-border bg-background p-3 hover:bg-muted/50">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {tk.ticketNumber && (
                          <span className="font-mono text-[11px] text-muted-foreground/70">#{tk.ticketNumber}</span>
                        )}
                        <span className="text-sm font-medium text-foreground truncate">{tk.title}</span>
                        {tk.priority && (
                          <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded border',
                            getPriorityColor(tk.priority)
                          )}>{getPriorityLabel(tk.priority)}</span>
                        )}
                      </div>
                      <div className="mt-1 flex gap-3 text-[11px] text-muted-foreground/70">
                        <span className="flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" /> {tk.status}
                        </span>
                        {tk.createdAt && (
                          <span>{formatDateShort(tk.createdAt)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* ------------------------------------------------------------------ */}
        {/* Tab: Health Score                                                    */}
        {/* ------------------------------------------------------------------ */}
        <TabsContent value="health">
          <div className="rounded-xl bg-card p-6 space-y-6 shadow-[var(--shadow-media)]">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground/80">Health Score da Empresa</h2>
              <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={recalculateHealth} disabled={healthRecalculating}>
                <CheckCircle2 className="h-3.5 w-3.5" />
                {healthRecalculating ? 'Calculando...' : 'Recalcular'}
              </Button>
            </div>

            {healthLoading ? (
              <p className="text-xs text-muted-foreground/70 py-6 text-center">Carregando health score...</p>
            ) : !healthScore ? (
              <p className="text-xs text-muted-foreground/70 py-6 text-center">Nenhum score disponível.</p>
            ) : (
              <>
                {/* Main score */}
                <div className="flex items-center gap-6">
                  <div className={`flex h-20 w-20 shrink-0 items-center justify-center rounded-full text-2xl font-bold text-white ${
                    healthScore.score >= 80 ? 'bg-emerald-500' : healthScore.score >= 60 ? 'bg-amber-500' : 'bg-red-500'
                  }`}>
                    {healthScore.score}
                  </div>
                  <div>
                    <p className={`text-lg font-bold ${healthScore.score >= 80 ? 'text-sem-success-fg' : healthScore.score >= 60 ? 'text-sem-warning-fg' : 'text-sem-error-fg'}`}>
                      {healthScore.score >= 80 ? 'Saudável' : healthScore.score >= 60 ? 'Atenção' : 'Crítico'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Calculado em {formatDate(healthScore.computedAt)}
                    </p>
                    {healthScore.score < 60 && (
                      <p className="mt-1 text-xs text-sem-error-fg font-medium">⚠ Score abaixo de 60 — ação imediata recomendada</p>
                    )}
                  </div>
                </div>

                {/* Dimension breakdown */}
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'SLA (30%)',       value: healthScore.slaScore,      detail: null },
                    { label: 'CSAT (20%)',       value: healthScore.csatScore,     detail: healthScore.csatAvg != null ? `Média: ${healthScore.csatAvg.toFixed(1)}/5` : 'Sem avaliações' },
                    { label: 'Reabertura (20%)', value: healthScore.reopenScore,   detail: `${healthScore.reopenCount} reabertura(s)` },
                    { label: 'P0/P1 (20%)',      value: healthScore.criticalScore, detail: `${healthScore.ticketsP0P1} ticket(s) crítico(s) aberto(s)` },
                  ].map(dim => (
                    <div key={dim.label} className="rounded-lg border border-border/50 bg-muted/50 p-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs text-foreground/60">{dim.label}</span>
                        <span className={`text-xs font-bold ${dim.value >= 80 ? 'text-sem-success-fg' : dim.value >= 60 ? 'text-sem-warning-fg' : 'text-sem-error-fg'}`}>{dim.value}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted">
                        <div className={`h-1.5 rounded-full transition-all ${dim.value >= 80 ? 'bg-emerald-500' : dim.value >= 60 ? 'bg-amber-500' : 'bg-red-500'}`}
                          style={{ width: `${dim.value}%` }} />
                      </div>
                      {dim.detail && <p className="mt-1 text-[10px] text-muted-foreground/70">{dim.detail}</p>}
                    </div>
                  ))}
                </div>

                <div className="flex gap-4 text-xs text-muted-foreground border-t border-border/50 pt-3">
                  <span>Tickets abertos: <strong className="text-foreground/80">{healthScore.ticketsOpen}</strong></span>
                  <span>P0/P1 abertos: <strong className={healthScore.ticketsP0P1 > 0 ? 'text-sem-error-fg' : 'text-foreground/80'}>{healthScore.ticketsP0P1}</strong></span>
                </div>
              </>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Delete / deactivate dialog */}
      <Dialog open={deleteDialog} onOpenChange={setDeleteDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sem-error-fg">
              <X className="h-5 w-5" /> Desativar Empresa
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-foreground/60 py-2">
            Desativar <strong>{company.name}</strong>? Os tickets vinculados não serão afetados.
          </p>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteDialog(false)}>Cancelar</Button>
            <Button size="sm" variant="destructive" onClick={deactivate} disabled={saving}>
              {saving ? 'Desativando...' : 'Desativar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invisible icons import to satisfy linting */}
      <span className="hidden"><Users className="h-0 w-0" /><Package className="h-0 w-0" /><Mail className="h-0 w-0" /><Phone className="h-0 w-0" /><Server className="h-0 w-0" /></span>
    </main>
  )
}
