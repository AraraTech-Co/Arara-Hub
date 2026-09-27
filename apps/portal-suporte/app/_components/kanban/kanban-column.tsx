'use client';

import { memo } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { KanbanCard } from './kanban-card';
import { AlertTriangle, Clock, Building2, FileText } from 'lucide-react';
import type { KanbanTicket, KanbanStage, KanbanAgent } from './kanban.types';

interface KanbanColumnProps {
  stage: KanbanStage;
  tickets: KanbanTicket[];
  // Não usado internamente ainda — repassado pelo board para uso futuro (ex.: picker de assignee inline).
  agents?: KanbanAgent[];
  onCardUpdate?: (id: string, changes: { priority?: KanbanTicket['priority']; severity?: KanbanTicket['severity']; pull_request_url?: string | null }) => void;
  groupByCompany: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  currentUserId?: string;
  onQuickAction?: (id: string, type: 'priority' | 'assign' | 'resolve' | 'status', value?: string) => void;
  isDragDisabled?: boolean;
  /** Reclassificar (prioridade/severidade/status) exige `developer`+. */
  podeReclassificar?: boolean;
}

const STAGE_ACCENT: Record<string, string> = {
  novos_chamados:       'border-t-status-backlog-bd',
  triagem:              'border-t-status-triage-bd',
  em_atendimento:       'border-t-status-in-progress-bd',
  pendencia:            'border-t-status-pending-bd',
  em_teste:             'border-t-status-testing-bd',
  resolvido:            'border-t-status-resolved-manual-bd',
  fechado:              'border-t-border',
  aguardando_cliente:   'border-t-status-waiting-bd',
  resolvido_com_manual: 'border-t-status-resolved-manual-bd',
  resolvido_sem_manual: 'border-t-status-resolved-bd',
  post_mortem:          'border-t-sem-error-bd',
};

const STAGE_COUNT_BG: Record<string, string> = {
  novos_chamados:       'bg-sem-warning  text-sem-warning-fg  dark:bg-yellow-900/40  dark:text-yellow-300',
  triagem:              'bg-status-triage text-status-triage-fg dark:bg-violet-900/40 dark:text-violet-300',
  em_atendimento:       'bg-sem-info    text-sem-info-fg    dark:bg-blue-900/40    dark:text-blue-300',
  pendencia:            'bg-status-pending text-status-pending-fg dark:bg-rose-900/40 dark:text-rose-300',
  em_teste:             'bg-status-testing text-status-testing-fg dark:bg-cyan-900/40 dark:text-cyan-300',
  resolvido:            'bg-sem-success   text-sem-success-fg   dark:bg-green-900/40   dark:text-green-300',
  fechado:              'bg-muted text-foreground/60',
  aguardando_cliente:   'bg-status-waiting text-status-waiting-fg dark:bg-amber-900/40 dark:text-amber-300',
  resolvido_com_manual: 'bg-sem-success   text-sem-success-fg   dark:bg-green-900/40   dark:text-green-300',
  resolvido_sem_manual: 'bg-sem-success text-sem-success-fg dark:bg-emerald-900/40 dark:text-emerald-300',
  post_mortem:          'bg-sem-error     text-sem-error-fg     dark:bg-red-900/40     dark:text-red-300',
};

export const KanbanColumn = memo(function KanbanColumn({
  stage,
  tickets,
  onCardUpdate,
  groupByCompany,
  selectedIds,
  onToggleSelect,
  currentUserId,
  onQuickAction,
  isDragDisabled,
  podeReclassificar,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });

  const breached = tickets.filter((t) => t.sla?.breached).length;
  const warning  = tickets.filter((t) => !t.sla?.breached && t.sla?.minutes_remaining != null && t.sla.minutes_remaining <= 120).length;

  const accentClass = STAGE_ACCENT[stage.id]   ?? 'border-t-border';
  const countClass  = STAGE_COUNT_BG[stage.id] ?? 'bg-muted text-foreground/80';
  const isPendency  = stage.id === 'pendencia';

  return (
    // h-full + flex-col: coluna ocupa toda a altura disponível do board.
    // Mobile: largura ~90vw com scroll-snap (1 coluna focada por vez, com "peek" da próxima).
    // sm+: largura fixa de 260px, lado a lado.
    <div className="flex h-full min-w-[90vw] max-w-[90vw] shrink-0 snap-center flex-col rounded-xl shadow-[var(--shadow-baixa)] sm:min-w-[260px] sm:max-w-[260px] sm:snap-align-none">

      {/* Cabeçalho — fixo, não entra no scroll */}
      <div className={`shrink-0 rounded-t-xl bg-card border-t-4 px-3 pt-3 pb-2.5 ${accentClass}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-base leading-none">{stage.icon}</span>
            <div className="min-w-0">
              <h3 className="truncate text-[13px] font-semibold text-foreground/80">{stage.title}</h3>
              <p className="truncate text-[10px] text-muted-foreground/70">{stage.description}</p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {isPendency && (
              <div
                className="flex items-center gap-0.5 rounded-full bg-sem-warning dark:bg-amber-900/40 px-1.5 py-0.5 text-[10px] font-semibold text-sem-warning-fg dark:text-amber-300"
                title="Arrastar para cá exige justificativa"
              >
                <FileText className="h-2.5 w-2.5" />
                JUS
              </div>
            )}
            {breached > 0 && (
              <div className="flex items-center gap-0.5 rounded-full bg-sem-error dark:bg-red-900/40 px-1.5 py-0.5 text-[10px] font-bold text-sem-error-fg dark:text-red-300">
                <AlertTriangle className="h-2.5 w-2.5" />
                {breached}
              </div>
            )}
            {warning > 0 && (
              <div className="flex items-center gap-0.5 rounded-full bg-status-waiting text-status-waiting-fg dark:bg-amber-900/40 px-1.5 py-0.5 text-[10px] font-bold dark:text-amber-300">
                <Clock className="h-2.5 w-2.5" />
                {warning}
              </div>
            )}
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${countClass}`}>
              {tickets.length}
            </span>
          </div>
        </div>
      </div>

      {/* Zona de drop — scroll vertical independente */}
      <div
        ref={setNodeRef}
        className={`
          flex flex-1 overflow-y-auto flex-col gap-2 rounded-b-xl p-2
          transition-all duration-150
          ${isOver
            ? 'bg-sem-info dark:bg-blue-950/40 ring-2 ring-inset ring-blue-300'
            : 'bg-muted/40'}
        `}
      >
        {groupByCompany
          ? renderGrouped(tickets, onCardUpdate, selectedIds, onToggleSelect, currentUserId, onQuickAction)
          : isDragDisabled
            ? tickets.map((ticket) => (
                <KanbanCard
                  key={ticket.id}
                  ticket={ticket}
                  onUpdate={onCardUpdate}
                  isSelected={selectedIds?.has(ticket.id) ?? false}
                  onToggleSelect={onToggleSelect}
                  selectionMode={(selectedIds?.size ?? 0) > 0}
                  currentUserId={currentUserId}
                  onQuickAction={onQuickAction}
                  podeReclassificar={podeReclassificar}
                />
              ))
            : (
              <SortableContext items={tickets.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                {tickets.map((ticket) => (
                  <KanbanCard
                    key={ticket.id}
                    ticket={ticket}
                    onUpdate={onCardUpdate}
                    isSelected={selectedIds?.has(ticket.id) ?? false}
                    onToggleSelect={onToggleSelect}
                    selectionMode={(selectedIds?.size ?? 0) > 0}
                    currentUserId={currentUserId}
                    onQuickAction={onQuickAction}
                  podeReclassificar={podeReclassificar}
                  />
                ))}
              </SortableContext>
            )
        }

        {tickets.length === 0 && (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-[11px] text-muted-foreground/50 select-none">Sem tickets</p>
          </div>
        )}
      </div>
    </div>
  );
});

// ─── Company grouping helper ──────────────────────────────────────────────────
function renderGrouped(
  tickets: KanbanTicket[],
  onCardUpdate: KanbanColumnProps['onCardUpdate'],
  selectedIds?: Set<string>,
  onToggleSelect?: (id: string) => void,
  currentUserId?: string,
  onQuickAction?: (id: string, type: 'priority' | 'assign' | 'resolve' | 'status', value?: string) => void,
) {
  const groups: Record<string, KanbanTicket[]> = {};
  for (const t of tickets) {
    const key = t.company_name ?? 'Sem empresa';
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  }

  const sortedEntries = Object.entries(groups).sort(([a], [b]) => {
    if (a === 'Sem empresa') return 1;
    if (b === 'Sem empresa') return -1;
    return a.localeCompare(b, 'pt-BR');
  });

  return (
    <>
      {sortedEntries.map(([company, groupTickets]) => (
        <div key={company} className="mb-2">
          <div className="mb-1 flex items-center gap-1.5 px-1 py-0.5">
            <Building2 className="h-2.5 w-2.5 shrink-0 text-muted-foreground/70" />
            <span className="truncate text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              {company}
            </span>
            <span className="ml-auto shrink-0 text-[10px] font-bold text-muted-foreground/50">
              {groupTickets.length}
            </span>
          </div>
          <SortableContext items={groupTickets.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            {groupTickets.map((ticket) => (
              <KanbanCard
                key={ticket.id}
                ticket={ticket}
                onUpdate={onCardUpdate}
                isSelected={selectedIds?.has(ticket.id) ?? false}
                onToggleSelect={onToggleSelect}
                selectionMode={(selectedIds?.size ?? 0) > 0}
                currentUserId={currentUserId}
                onQuickAction={onQuickAction}
              />
            ))}
          </SortableContext>
        </div>
      ))}
    </>
  );
}
