'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { PRIORITY_OPTIONS, getPriorityEmoji } from '@/lib/ticket-priority';
import { Button } from '@/components/ui/button';
import { Search, X } from 'lucide-react';
import { CompanyCombobox } from './company-combobox';
import { TICKET_SOURCES } from '@/lib/ticket-source';
import type { KanbanAgent } from './kanban.types';

interface FilterBarProps {
  agents: KanbanAgent[];
  agentFilter: string;
  setAgentFilter: (value: string) => void;
  priorityFilter: string;
  setPriorityFilter: (value: string) => void;
  slaFilter: string;
  setSlaFilter: (value: string) => void;
  search: string;
  setSearch: (value: string) => void;
  companyFilter: string;
  setCompanyFilter: (value: string) => void;
  companies: string[];
  escalatedFilter: boolean;
  setEscalatedFilter: (value: boolean) => void;
  sourceFilter: string;
  setSourceFilter: (value: string) => void;
  onClearAll: () => void;
}

export function FilterBar({ agents, agentFilter, setAgentFilter, priorityFilter, setPriorityFilter, slaFilter, setSlaFilter, search, setSearch, companyFilter, setCompanyFilter, companies, escalatedFilter, setEscalatedFilter, sourceFilter, setSourceFilter, onClearAll }: FilterBarProps) {
  const hasFilters = agentFilter !== 'all' || priorityFilter !== 'all' || slaFilter !== 'all' || search !== '' || companyFilter !== 'all' || escalatedFilter || sourceFilter !== 'all';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <CompanyCombobox value={companyFilter} onChange={setCompanyFilter} companies={companies} />
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/70" />
        <Input
          placeholder="Buscar título, TCK…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="h-8 w-48 pl-8 text-sm border-border bg-background placeholder:text-muted-foreground/70"
        />
      </div>
      <Select value={agentFilter} onValueChange={setAgentFilter}>
        <SelectTrigger className="h-8 w-44 text-sm border-border bg-background">
          <SelectValue placeholder="Responsável" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos os agentes</SelectItem>
          <SelectItem value="unassigned">Sem responsável</SelectItem>
          {agents.map((a) => (
            <SelectItem key={a.id} value={a.id}>{a.full_name || a.email}</SelectItem>
          ))}
          {/* Quem está filtrado mas saiu da lista (preset antigo, pessoa
              removida da equipe) precisa continuar aparecendo: sem esta opção,
              o Select fica em branco e parece que o filtro se perdeu, embora
              siga aplicado. */}
          {agentFilter !== 'all' && agentFilter !== 'unassigned'
            && !agents.some((a) => a.id === agentFilter) && (
            <SelectItem value={agentFilter}>Responsável fora da equipe atual</SelectItem>
          )}
        </SelectContent>
      </Select>
      <Select value={priorityFilter} onValueChange={setPriorityFilter}>
        <SelectTrigger className="h-8 w-36 text-sm border-border bg-background">
          <SelectValue placeholder="Prioridade" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas</SelectItem>
          {[...PRIORITY_OPTIONS].reverse().map((o) => (
            <SelectItem key={o.value} value={o.value}>{getPriorityEmoji(o.value)} {o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={slaFilter} onValueChange={setSlaFilter}>
        <SelectTrigger className="h-8 w-40 text-sm border-border bg-background">
          <SelectValue placeholder="SLA" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos os SLAs</SelectItem>
          <SelectItem value="breached">⛔ Vencido</SelectItem>
          <SelectItem value="warning">⚠️ Crítico (&lt;2h)</SelectItem>
          <SelectItem value="ok">✅ No prazo</SelectItem>
        </SelectContent>
      </Select>
      <Select value={sourceFilter} onValueChange={setSourceFilter}>
        {/* w-40 como o de SLA: com w-36 o rótulo "Todas as origens" era cortado. */}
        <SelectTrigger className="h-8 w-40 text-sm border-border bg-background">
          <SelectValue placeholder="Origem" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas as origens</SelectItem>
          {TICKET_SOURCES.map((s) => (
            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant={escalatedFilter ? 'default' : 'outline'}
        size="sm"
        className={`h-8 gap-1 text-xs ${escalatedFilter ? 'bg-red-600 hover:bg-red-700 border-red-600' : ''}`}
        onClick={() => setEscalatedFilter(!escalatedFilter)}
        title="Mostrar apenas tickets escalados"
      >
        🚨 Escalado
      </Button>
      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1 px-2 text-xs text-muted-foreground/70 hover:text-foreground/80"
          onClick={onClearAll}
        >
          <X className="h-3 w-3" />
          Limpar
        </Button>
      )}
    </div>
  );
}
