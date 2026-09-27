'use client'

import { useState } from 'react'
import { PRIORITY_OPTIONS, getPriorityEmoji } from '@/lib/ticket-priority'
import { SlidersHorizontal, RefreshCw, Wand2, ArrowUp, ArrowDown, X, Search } from 'lucide-react'
import {
  Drawer, DrawerClose, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle,
} from '@/components/ui/drawer'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { TICKET_SOURCES } from '@/lib/ticket-source'

type SortBy  = 'position' | 'ticket_number' | 'created_at'
type SortDir = 'asc' | 'desc'
type GroupBy = 'status' | 'company' | 'team' | 'assignee'

interface MobileFiltersDrawerProps {
  // grouping
  groupBy: GroupBy
  setGroupBy: (v: GroupBy) => void
  // filters
  agents: any[]
  agentFilter: string
  setAgentFilter: (v: string) => void
  priorityFilter: string
  setPriorityFilter: (v: string) => void
  slaFilter: string
  setSlaFilter: (v: string) => void
  search: string
  setSearch: (v: string) => void
  companies: string[]
  companyFilter: string
  setCompanyFilter: (v: string) => void
  escalatedFilter: boolean
  sourceFilter: string
  setSourceFilter: (value: string) => void
  setEscalatedFilter: (v: boolean) => void
  // sort
  sortBy: SortBy
  onSortBy: (v: SortBy) => void
  sortDir: SortDir
  onSortDir: (v: SortDir) => void
  // actions
  onRefresh: () => void
  onWizard: () => void
  onClearAll: () => void
  refreshing?: boolean
  // badge
  activeFiltersCount: number
}

const GROUP_OPTIONS: { id: GroupBy; label: string }[] = [
  { id: 'status',   label: 'Status' },
  { id: 'company',  label: 'Empresa' },
  { id: 'team',     label: 'Time' },
  { id: 'assignee', label: 'Agente' },
]

const SORT_OPTIONS: { id: SortBy; label: string }[] = [
  { id: 'position',      label: 'Manual' },
  { id: 'ticket_number', label: 'Nº Ticket' },
  { id: 'created_at',    label: 'Data criação' },
]

export function MobileFiltersDrawer({
  groupBy, setGroupBy,
  agents, agentFilter, setAgentFilter,
  priorityFilter, setPriorityFilter,
  slaFilter, setSlaFilter,
  search, setSearch,
  companies, companyFilter, setCompanyFilter,
  escalatedFilter, setEscalatedFilter,
  sourceFilter, setSourceFilter,
  sortBy, onSortBy, sortDir, onSortDir,
  onRefresh, onWizard, onClearAll,
  refreshing = false,
  activeFiltersCount,
}: MobileFiltersDrawerProps) {
  const [open, setOpen] = useState(false)

  return (
    <Drawer direction="bottom" open={open} onOpenChange={setOpen}>
      {/* Trigger */}
      <button
        onClick={() => setOpen(true)}
        className="relative flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground/60 hover:bg-muted/50 active:bg-muted transition-colors"
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
        Filtros
        {activeFiltersCount > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white leading-none">
            {activeFiltersCount}
          </span>
        )}
      </button>

      <DrawerContent className="max-h-[85vh] overflow-y-auto">
        <DrawerHeader className="pb-2">
          <DrawerTitle className="text-base">Filtros & Configurações</DrawerTitle>
        </DrawerHeader>

        <div className="px-4 pb-2 space-y-5">
          {/* Agrupar por */}
          <section>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">Agrupar por</p>
            <SegmentedControl fullWidth value={groupBy} onChange={setGroupBy} options={GROUP_OPTIONS} />
          </section>

          {/* Busca */}
          <section>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">Busca</p>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/70" />
              <Input
                placeholder="Buscar título, TCK…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="h-9 pl-8 text-sm border-border bg-background"
              />
            </div>
          </section>

          {/* Filtros */}
          <section>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">Filtros</p>
            <div className="space-y-2">
              {/* Empresa */}
              <Select value={companyFilter} onValueChange={setCompanyFilter}>
                <SelectTrigger className="h-9 w-full text-sm border-border bg-background">
                  <SelectValue placeholder="Todas as empresas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as empresas</SelectItem>
                  {companies.map((c: string) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Agente */}
              <Select value={agentFilter} onValueChange={setAgentFilter}>
                <SelectTrigger className="h-9 w-full text-sm border-border bg-background">
                  <SelectValue placeholder="Responsável" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os agentes</SelectItem>
                  <SelectItem value="unassigned">Sem responsável</SelectItem>
                  {agents.map((a: any) => (
                    <SelectItem key={a.id} value={a.id}>{a.full_name || a.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Prioridade */}
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className="h-9 w-full text-sm border-border bg-background">
                  <SelectValue placeholder="Prioridade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as prioridades</SelectItem>
                  {[...PRIORITY_OPTIONS].reverse().map((o) => (
                    <SelectItem key={o.value} value={o.value}>{getPriorityEmoji(o.value)} {o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* SLA */}
              <Select value={slaFilter} onValueChange={setSlaFilter}>
                <SelectTrigger className="h-9 w-full text-sm border-border bg-background">
                  <SelectValue placeholder="SLA" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os SLAs</SelectItem>
                  <SelectItem value="breached">⛔ Vencido</SelectItem>
                  <SelectItem value="warning">⚠️ Crítico (&lt;2h)</SelectItem>
                  <SelectItem value="ok">✅ No prazo</SelectItem>
                </SelectContent>
              </Select>

              {/* Origem */}
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger className="h-9 w-full text-sm border-border bg-background">
                  <SelectValue placeholder="Origem" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as origens</SelectItem>
                  {TICKET_SOURCES.map((src) => (
                    <SelectItem key={src.value} value={src.value}>{src.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Escalado */}
              <button
                onClick={() => setEscalatedFilter(!escalatedFilter)}
                className={`flex h-9 w-full items-center justify-center gap-2 rounded-md border text-xs font-medium transition-colors ${
                  escalatedFilter
                    ? 'border-red-600 bg-red-600 text-white hover:bg-red-700'
                    : 'border-border bg-background text-foreground/60 hover:bg-muted/50'
                }`}
              >
                🚨 Escalado
                {escalatedFilter && <span className="text-[10px] opacity-80">(ativo)</span>}
              </button>
            </div>
          </section>

          {/* Ordenar */}
          <section>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">Ordenar</p>
            <div className="flex gap-2">
              <SegmentedControl fullWidth className="flex-1" value={sortBy} onChange={onSortBy} options={SORT_OPTIONS} />
              <button
                onClick={() => onSortDir(sortDir === 'asc' ? 'desc' : 'asc')}
                className="flex h-9 items-center gap-1 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground/60 hover:bg-muted/50 transition-colors"
              >
                {sortDir === 'asc'
                  ? <><ArrowUp className="h-3 w-3" /> Cresc.</>
                  : <><ArrowDown className="h-3 w-3" /> Decres.</>
                }
              </button>
            </div>
          </section>
        </div>

        <DrawerFooter className="pt-2 gap-2">
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => { onRefresh(); setOpen(false) }}
              disabled={refreshing}
              className="flex-1 h-9 gap-1.5 text-xs"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { onWizard(); setOpen(false) }}
              className="flex-1 h-9 gap-1.5 text-xs border-indigo-300 text-indigo-600 hover:bg-indigo-50"
            >
              <Wand2 className="h-3.5 w-3.5" />
              Novo chamado
            </Button>
          </div>
          {activeFiltersCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { onClearAll(); setOpen(false) }}
              className="h-9 gap-1.5 text-xs text-muted-foreground/70 hover:text-foreground/80"
            >
              <X className="h-3.5 w-3.5" />
              Limpar {activeFiltersCount} filtro{activeFiltersCount !== 1 ? 's' : ''}
            </Button>
          )}
          <DrawerClose asChild>
            <Button variant="outline" size="sm" className="h-9 text-xs">
              Fechar
            </Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
