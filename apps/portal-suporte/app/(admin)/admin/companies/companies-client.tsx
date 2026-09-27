'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  Building2, Plus, Pencil, Trash2, ChevronDown, ChevronUp,
  MapPin, Mail, Phone, Package, Users, Ticket, X, Server,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { EmptyState } from '@/components/ui/empty-state'
import { companiesApi } from '@/lib/api/companies'
import { chaveEmpresa, ehCadastrada, type EmpresaBruta } from '@/lib/empresas'

interface Group { id: string; name: string }
interface Unit {
  id: string; companyId: string; name: string; city: string | null
  state: string | null; active: boolean
}
interface SlaContract { id: string; name: string; tier: string }
interface Company {
  id: string; name: string; cnpj: string | null; contactEmail: string | null
  phone: string | null; city: string | null; state: string | null
  segment: string | null; active: boolean; group: Group | null
  slaContractId?: string | null
  tradeName?: string | null; product?: string | null
  serverName?: string | null
  /** Veio da carga que varreu o texto livre dos chamados, não do cadastro. */
  synced_from_tickets?: boolean
  name_aliases?: string[] | null
  _count: { tickets: number; profiles: number; units: number }
}

export function CompaniesClient({
  companies: initial, isAdmin, podeCadastrar,
}: {
  companies: Company[]
  groups: Group[]
  slaContracts: SlaContract[]
  isAdmin: boolean
  /** admin OU o grant `cadastro_empresa` — só o botão de cadastrar. */
  podeCadastrar: boolean
}) {
  const [companies, setCompanies] = useState<Company[]>(initial)
  const [expanded, setExpanded]   = useState<string | null>(null)
  const [units, setUnits]         = useState<Record<string, Unit[]>>({})
  const [deleteDialog, setDeleteDialog] = useState(false)
  const [selected, setSelected]   = useState<Company | null>(null)
  const [saving, setSaving]       = useState(false)
  const [search, setSearch]       = useState('')
  // Das 142 linhas, 122 têm `synced_from_tickets`: nasceram de uma carga que
  // varreu o texto livre do campo Empresa dos chamados antigos. Misturadas com
  // o cadastro real, é impossível saber o que é cliente e o que é grafia
  // errada — daí a separação em duas abas. Ver lib/empresas.ts.
  const [aba, setAba] = useState<'cadastradas' | 'chamados'>('cadastradas')

  async function loadUnits(companyId: string, force = false) {
    if (units[companyId] && !force) return
    const json = await companiesApi.listUnits(companyId)
    if (json.success) setUnits(u => ({ ...u, [companyId]: json.data }))
  }

  function toggleExpand(id: string) {
    if (expanded === id) { setExpanded(null); return }
    setExpanded(id)
    loadUnits(id)
  }

  function openDelete(c: Company) { setSelected(c); setDeleteDialog(true) }

  async function deactivate() {
    setSaving(true)
    try {
      await companiesApi.deactivate(selected!.id)
      setCompanies(prev => prev.map(c => c.id === selected!.id ? { ...c, active: false } : c))
      setDeleteDialog(false)
    } finally { setSaving(false) }
  }

  const cadastradas = companies.filter(c => ehCadastrada(c as EmpresaBruta))
  const deChamados  = companies.filter(c => !ehCadastrada(c as EmpresaBruta))
  const daAba       = aba === 'cadastradas' ? cadastradas : deChamados

  const filtered = daAba.filter(c => {
    if (!search.trim()) return true
    const q = chaveEmpresa(search)
    // Mesma normalização do seletor: "2 a 20" tem que achar "2a20".
    return [c.name, c.tradeName ?? '', c.city ?? ''].some(t => chaveEmpresa(String(t)).includes(q))
      || (c.cnpj?.replace(/\D/g, '').includes(search.replace(/\D/g, '')) ?? false)
  })

  const active   = cadastradas.filter(c => c.active).length
  // Sem CNPJ o cliente não consegue vincular a conta a esta empresa ao criar
  // login — ver scripts/cadastro-acesso.py.
  const semCnpj  = cadastradas.filter(c => (c.cnpj ?? '').replace(/\D/g, '').length !== 14).length

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Building2 className="h-6 w-6 text-sem-info-fg" /> Empresas
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Gerencie clientes, grupos e unidades</p>
        </div>
        {podeCadastrar && (
          <Link href="/admin/companies/new">
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700 gap-1.5">
              <Plus className="h-4 w-4" /> Nova Empresa
            </Button>
          </Link>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Cadastradas', value: cadastradas.length, icon: Building2 },
          { label: 'Ativas', value: active, icon: Building2 },
          // Conta o que bloqueia cadastro de cliente, no lugar de um total de
          // tickets que aqui sempre vem zerado (a listagem não traz contagem).
          { label: 'Sem CNPJ', value: semCnpj, icon: Building2 },
        ].map(s => (
          <div key={s.label} className="rounded-xl bg-card p-4 text-center shadow-[var(--shadow-media)]">
            <div className="text-2xl font-bold text-foreground">{s.value}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Abas — cadastro real x resíduo das cargas de chamado */}
      <div className="flex items-center gap-2 border-b border-border">
        {([
          ['cadastradas', 'Cadastradas', cadastradas.length],
          ['chamados', 'Vindas de chamados', deChamados.length],
        ] as const).map(([id, rotulo, n]) => (
          <button
            key={id}
            type="button"
            onClick={() => setAba(id)}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm transition-colors',
              aba === id
                ? 'border-sem-info-fg font-medium text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground/80',
            )}
          >
            {rotulo} <span className="ml-1 text-xs text-muted-foreground/70">({n})</span>
          </button>
        ))}
      </div>

      {aba === 'chamados' && (
        <p className="rounded-lg border border-sem-warning-bd bg-sem-warning px-3 py-2 text-xs text-sem-warning-fg">
          Estes nomes vieram do texto livre do campo Empresa de chamados antigos, não de um
          cadastro. Eles não aparecem para escolha ao abrir chamado nem no filtro do Kanban —
          ficam aqui só para o histórico não se perder. Quando o nome for grafia de uma empresa
          já cadastrada, registre-o como apelido dela na tela da empresa.
        </p>
      )}

      {/* Search bar */}
      <div>
        <input
          type="text"
          placeholder="Buscar por nome, CNPJ ou cidade..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full rounded-lg border border-border bg-background px-4 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-sem-info-bd"
        />
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-background">
          <EmptyState
            icon="🏢"
            title={search ? 'Nenhuma empresa encontrada' : 'Nenhuma empresa cadastrada'}
            description={search ? 'Tente uma busca diferente.' : 'Adicione empresas para organizar seus clientes por grupo e unidade.'}
            action={podeCadastrar && !search && (
              <Link href="/admin/companies/new">
                <Button size="sm" className="bg-blue-600 hover:bg-blue-700 gap-1.5">
                  <Plus className="h-4 w-4" /> Nova Empresa
                </Button>
              </Link>
            )}
          />
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(company => (
            <div key={company.id} className={cn("rounded-xl border bg-background shadow-sm overflow-hidden", !company.active && "opacity-60")}>
              <div className="flex items-start gap-4 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sem-info text-sem-info-fg">
                  <Building2 className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-foreground">{company.name}</span>
                    {company.tradeName && <span className="text-xs text-muted-foreground">({company.tradeName})</span>}
                    {/* CNPJ ausente precisa APARECER. Ele deixou de ser um
                        campo opcional de ficha: é por ele que o cliente se
                        vincula à empresa ao criar conta, então empresa sem CNPJ
                        é empresa cujo cliente não consegue se cadastrar. Antes
                        o campo só existia quando preenchido, e os 16 vazios
                        eram invisíveis nesta tela. */}
                    {company.cnpj
                      ? <span className="font-mono text-[11px] text-muted-foreground/70">{company.cnpj}</span>
                      : aba === 'cadastradas' && (
                        <Link
                          href={`/admin/companies/_/?id=${encodeURIComponent(company.id)}`}
                          className="rounded border border-sem-warning-bd bg-sem-warning px-1.5 py-0.5 text-[10px] font-medium text-sem-warning-fg hover:opacity-90"
                          title="Sem CNPJ o cliente desta empresa não consegue criar conta"
                        >
                          sem CNPJ
                        </Link>
                      )}
                    {company.group && <Badge variant="outline" className="text-[10px] border-sem-info-bd text-sem-info-fg">{company.group.name}</Badge>}
                    {company.segment && <Badge variant="outline" className="text-[10px]">{company.segment}</Badge>}
                    {company.product && <Badge variant="outline" className="text-[10px] border-sem-success-bd text-sem-success-fg">{company.product}</Badge>}
                    {!company.active && <Badge variant="outline" className="text-[10px] border-border/50 text-muted-foreground/70">Inativa</Badge>}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                    {(company.city || company.state) && (
                      <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{[company.city, company.state].filter(Boolean).join(', ')}</span>
                    )}
                    {company.contactEmail && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{company.contactEmail}</span>}
                    {company.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{company.phone}</span>}
                    {company.serverName && <span className="flex items-center gap-1"><Server className="h-3 w-3" />{company.serverName}</span>}
                  </div>
                  <div className="mt-2 flex gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Ticket className="h-3 w-3" />{company._count.tickets} tickets</span>
                    <span className="flex items-center gap-1"><Users className="h-3 w-3" />{company._count.profiles} usuários</span>
                    <span className="flex items-center gap-1"><Package className="h-3 w-3" />{company._count.units} unidades</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground/70 hover:text-sem-info-fg"
                    onClick={() => toggleExpand(company.id)} title="Ver unidades">
                    {expanded === company.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
                  <Link href={`/admin/companies/_/?id=${encodeURIComponent(company.id)}`} title="Editar empresa">
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground/70 hover:text-foreground/80">
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </Link>
                  {isAdmin && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground/70 hover:text-sem-error-fg"
                      onClick={() => openDelete(company)} title="Desativar">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Units accordion */}
              {expanded === company.id && (
                <div className="border-t border-border/50 bg-muted/50 px-4 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-foreground/60 uppercase tracking-wide">Unidades</span>
                    <Link href={`/admin/companies/_/?id=${encodeURIComponent(company.id)}&tab=unidades`} className="text-xs text-sem-info-fg hover:underline">
                      Gerenciar
                    </Link>
                  </div>
                  {(units[company.id] ?? []).length === 0 ? (
                    <p className="text-xs text-muted-foreground/70">Nenhuma unidade cadastrada.</p>
                  ) : (
                    <ul className="space-y-1">
                      {(units[company.id] ?? []).map(u => (
                        <li key={u.id} className="flex items-center gap-2 text-sm text-foreground/80">
                          <MapPin className="h-3 w-3 text-muted-foreground/70 shrink-0" />
                          <span className="font-medium">{u.name}</span>
                          {(u.city || u.state) && (
                            <span className="text-xs text-muted-foreground/70">— {[u.city, u.state].filter(Boolean).join(', ')}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Deactivate confirmation */}
      <Dialog open={deleteDialog} onOpenChange={o => !o && setDeleteDialog(false)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sem-error-fg">
              <X className="h-5 w-5" /> Desativar Empresa
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-foreground/60 py-2">
            Desativar <strong>{selected?.name}</strong>? Os tickets vinculados não serão afetados.
          </p>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteDialog(false)}>Cancelar</Button>
            <Button size="sm" variant="destructive" onClick={deactivate} disabled={saving}>
              {saving ? 'Desativando...' : 'Desativar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}
