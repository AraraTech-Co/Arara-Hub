'use client'

import { useState, useEffect, useMemo } from 'react'
import { Building2, MapPin, MessageCircle, Monitor, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { CaixasPanel } from '@/components/units/caixas-panel'
import { WhatsappsPanel } from '@/components/units/whatsapps-panel'

interface Company { id: string; name: string }
interface UnitWithCompany {
  id: string
  companyId: string
  name: string
  city: string | null
  state: string | null
  product: string | null
  pdvCount: number | null
  code: string | null
  company: Company
}

export function UnitsGlobalClient({ isAdmin }: { isAdmin: boolean }) {
  const [units, setUnits] = useState<UnitWithCompany[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [loaded, setLoaded] = useState(false)

  const [filterCompanyId, setFilterCompanyId] = useState('')
  const [filterSearch, setFilterSearch] = useState('')
  const [activePanel, setActivePanel] = useState<Record<string, 'caixas' | 'whatsapps' | null>>({})

  useEffect(() => {
    import('@/lib/api/client')
      .then(({ api }) => api.get<{ success?: boolean; data?: UnitWithCompany[] }>('/api/admin/units'))
      .then((j) => {
        const rows = (j.data || []).map((u) => ({
          ...u,
          companyId: u.companyId || (u as { company_id?: string }).company_id || u.company?.id || '',
          company: u.company || { id: u.companyId || '', name: '—' },
        }))
        setUnits(rows)
        const seen = new Map<string, Company>()
        rows.forEach((u) => {
          if (u.companyId && !seen.has(u.companyId)) seen.set(u.companyId, u.company)
        })
        setCompanies(Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name)))
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [])

  const filtered = useMemo(() => {
    return units.filter(u => {
      if (filterCompanyId && u.companyId !== filterCompanyId) return false
      if (filterSearch) {
        const q = filterSearch.toLowerCase()
        if (!u.name.toLowerCase().includes(q) && !u.company.name.toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [units, filterCompanyId, filterSearch])

  function togglePanel(unitId: string, panel: 'caixas' | 'whatsapps') {
    setActivePanel(prev => ({ ...prev, [unitId]: prev[unitId] === panel ? null : panel }))
  }

  const grouped = useMemo(() => {
    const map = new Map<string, { company: Company; units: UnitWithCompany[] }>()
    filtered.forEach(u => {
      if (!map.has(u.companyId)) map.set(u.companyId, { company: u.company, units: [] })
      map.get(u.companyId)!.units.push(u)
    })
    return Array.from(map.values())
  }, [filtered])

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
          <Input
            className="pl-8 h-9 text-sm"
            placeholder="Buscar por empresa ou unidade..."
            value={filterSearch}
            onChange={e => setFilterSearch(e.target.value)}
          />
        </div>
        <select
          className="h-9 rounded-md border border-border bg-background px-3 text-sm min-w-48"
          value={filterCompanyId}
          onChange={e => setFilterCompanyId(e.target.value)}
        >
          <option value="">Todas as empresas</option>
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {(filterCompanyId || filterSearch) && (
          <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={() => { setFilterCompanyId(''); setFilterSearch('') }}>
            Limpar filtros
          </Button>
        )}
      </div>

      {/* Contagem */}
      {loaded && (
        <p className="text-xs text-muted-foreground/60">
          {filtered.length} unidade{filtered.length !== 1 ? 's' : ''} encontrada{filtered.length !== 1 ? 's' : ''}
          {filterCompanyId || filterSearch ? ' com os filtros aplicados' : ''}
        </p>
      )}

      {/* Lista */}
      {!loaded ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-lg bg-muted/40 animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<MapPin className="h-8 w-8 text-muted-foreground/50" />}
          title="Nenhuma unidade encontrada"
          description="Tente ajustar os filtros de busca."
          size="sm"
        />
      ) : (
        <div className="space-y-4">
          {grouped.map(({ company, units: groupUnits }) => (
            <div key={company.id} className="space-y-1.5">
              {/* Cabeçalho da empresa (só aparece se não filtrado por empresa) */}
              {!filterCompanyId && (
                <div className="flex items-center gap-2 px-1 pb-1">
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                  <p className="text-xs font-semibold text-muted-foreground/70">{company.name}</p>
                  <span className="text-xs text-muted-foreground/40">({groupUnits.length})</span>
                </div>
              )}

              {groupUnits.map(u => {
                const panel = activePanel[u.id] ?? null
                return (
                  <div key={u.id} className="rounded-lg border border-border bg-background overflow-hidden">
                    <div className="flex items-start justify-between gap-3 p-3">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground mt-0.5">
                          <MapPin className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">{u.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {[u.city, u.state].filter(Boolean).join(', ')}{u.code && ` • ${u.code}`}
                          </p>
                          <div className="mt-0.5 flex flex-wrap gap-2 text-xs text-muted-foreground/60">
                            {filterCompanyId && <span>{company.name}</span>}
                            {u.product && <span>{u.product}</span>}
                            {u.pdvCount != null && <span>{u.pdvCount} PDVs</span>}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant={panel === 'caixas' ? 'secondary' : 'outline'}
                          size="sm"
                          className="h-7 gap-1.5 text-xs px-2.5"
                          onClick={() => togglePanel(u.id, 'caixas')}
                        >
                          <Monitor className="h-3 w-3" />
                          Gerenciar RustDesk
                        </Button>
                        <Button
                          variant={panel === 'whatsapps' ? 'secondary' : 'outline'}
                          size="sm"
                          className="h-7 gap-1.5 text-xs px-2.5"
                          onClick={() => togglePanel(u.id, 'whatsapps')}
                        >
                          <MessageCircle className="h-3 w-3" />
                          Gerenciar Usuários
                        </Button>
                      </div>
                    </div>

                    {panel === 'caixas' && (
                      <div className="border-t border-border/40 px-4 py-3 bg-muted/20">
                        <CaixasPanel companyId={u.companyId} unit={u} isAdmin={isAdmin} />
                      </div>
                    )}
                    {panel === 'whatsapps' && (
                      <div className="border-t border-border/40 px-4 py-3 bg-muted/20">
                        <WhatsappsPanel companyId={u.companyId} unit={u} isAdmin={isAdmin} />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
