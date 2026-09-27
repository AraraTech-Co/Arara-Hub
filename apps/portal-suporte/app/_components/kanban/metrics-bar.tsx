'use client';

import { AlertTriangle, Clock, Ticket, Users } from 'lucide-react';
import { Chip } from './chip';
import type { KanbanTicket } from './kanban.types';

export function MetricsBar({ tickets }: { tickets: KanbanTicket[] }) {
  const total      = tickets.length;
  const breached   = tickets.filter(t => t.sla?.breached).length;
  const warning    = tickets.filter(t => !t.sla?.breached && t.sla?.minutes_remaining != null && t.sla.minutes_remaining <= 120).length;
  const unassigned = tickets.filter(t => !t.assigned_to && !t.assignee).length;
  const urgent     = tickets.filter(t => t.priority === 'urgent').length;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Chip icon={<Ticket className="h-3.5 w-3.5 text-muted-foreground" />} label="Total" value={total} />
      {breached > 0 && (
        <Chip icon={<AlertTriangle className="h-3.5 w-3.5 text-sem-error-fg" />} label="SLA vencido" value={breached} className="border-sem-error-bd bg-sem-error text-sem-error-fg" />
      )}
      {warning > 0 && (
        <Chip icon={<Clock className="h-3.5 w-3.5 text-status-waiting-fg" />} label="SLA crítico" value={warning} className="border-status-waiting-bd bg-status-waiting text-status-waiting-fg" />
      )}
      {urgent > 0 && (
        <Chip label="Muito alta" value={urgent} className="border-sem-error-bd bg-sem-error text-sem-error-fg" />
      )}
      {unassigned > 0 && (
        <Chip icon={<Users className="h-3.5 w-3.5 text-muted-foreground" />} label="Sem responsável" value={unassigned} />
      )}
    </div>
  );
}
