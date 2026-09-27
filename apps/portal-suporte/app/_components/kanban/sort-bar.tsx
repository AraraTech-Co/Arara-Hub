'use client';

import { ArrowUp, ArrowDown } from 'lucide-react';
import { SegmentedControl } from '@/components/ui/segmented-control';

type SortBy = 'position' | 'ticket_number' | 'created_at' | 'sla_risk' | 'priority';
type SortDir = 'asc' | 'desc';

const SORT_OPTIONS: { id: SortBy; label: string }[] = [
  { id: 'position',      label: 'Manual' },
  { id: 'sla_risk',      label: 'Risco SLA' },
  { id: 'priority',      label: 'Prioridade' },
  { id: 'ticket_number', label: 'Nº Ticket' },
  { id: 'created_at',    label: 'Data criação' },
];

export function SortBar({ sortBy, onSortBy, sortDir, onSortDir }: {
  sortBy: SortBy;
  onSortBy: (v: SortBy) => void;
  sortDir: SortDir;
  onSortDir: (v: SortDir) => void;
}) {
  const toggleDir = () => onSortDir(sortDir === 'asc' ? 'desc' : 'asc');

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] font-medium text-muted-foreground/70 shrink-0">Ordenar:</span>
      <SegmentedControl options={SORT_OPTIONS} value={sortBy} onChange={onSortBy} />

      <button
        onClick={toggleDir}
        title={sortDir === 'asc' ? 'Crescente — clique para inverter' : 'Decrescente — clique para inverter'}
        className="flex h-7 items-center gap-1.5 rounded border border-border bg-background px-2.5 text-xs font-medium text-foreground/60 hover:bg-muted/50 transition-colors"
      >
        {sortDir === 'asc'
          ? <><ArrowUp className="h-3 w-3 text-muted-foreground/70" /> Crescente</>
          : <><ArrowDown className="h-3 w-3 text-muted-foreground/70" /> Decrescente</>
        }
      </button>

      {sortBy !== 'position' && (
        <span className="rounded border border-sem-warning-bd bg-sem-warning px-1.5 py-0.5 text-[10px] font-medium text-sem-warning-fg">
          {sortBy === 'sla_risk' ? '⚠️ Ordenado por risco de SLA' : sortBy === 'priority' ? 'Ordenado por prioridade' : 'Reordenação manual desativada'}
        </span>
      )}
    </div>
  );
}
