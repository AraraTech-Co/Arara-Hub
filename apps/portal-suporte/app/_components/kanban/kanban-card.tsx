'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Paperclip, MessageSquare, Building2, User, Copy, ChevronDown, Star, UserCheck, Flag, CheckCircle, GitPullRequest, ExternalLink, MapPin, ArrowDownLeft } from 'lucide-react';
import { SlaIndicator } from '@/components/ui/sla-indicator';
import { memo, useEffect, useState } from 'react';
import Link from 'next/link';
import { cn, formatDate, formatDateShort, getInitials } from '@/lib/utils';
import { validatePullRequestUrl, PULL_REQUEST_URL_ERROR } from '@/lib/pull-request-url';
import { PRIORITY_KEYS,
  getPriorityLabel, getPriorityEmoji, getPriorityDot, getPriorityBorder,
  getSeverityLabel, getSeverityColor,
} from '@/lib/ticket-priority';
import { ticketsApi } from '@/lib/api/tickets'
import { getStatusLabel } from '@/lib/ticket-status';
import type { KanbanTicket } from './kanban.types';

// Prioridade e severidade: fonte canônica em @/lib/ticket-priority

// ─── Impact ──────────────────────────────────────────────────────────────────
const IMPACT_STYLE: Record<string, string> = {
  low:      'bg-sem-success  text-sem-success-fg  border-sem-success-bd  dark:bg-green-900/40  dark:text-green-300  dark:border-green-700',
  medium:   'bg-sem-warning text-sem-warning-fg border-sem-warning-bd dark:bg-yellow-900/40 dark:text-yellow-300 dark:border-yellow-700',
  high:     'bg-priority-high text-priority-high-fg border-priority-high-bd dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-700',
  critical: 'bg-sem-error    text-sem-error-fg    border-sem-error-bd    dark:bg-red-900/40    dark:text-red-300    dark:border-red-700',
};
const IMPACT_SHORT: Record<string, string> = {
  low: 'IMP-L', medium: 'IMP-M', high: 'IMP-H', critical: 'IMP-C',
};

// ─── Pendencia sub-badge — legacy DB statuses ────────────────────────────────
const PENDENCIA_BADGE_BY_STATUS: Record<string, { label: string; className: string }> = {
  pendencia_suporte:  { label: '⏸ Externo', className: 'bg-sem-warning text-sem-warning-fg border-sem-warning-bd dark:bg-yellow-900/40 dark:text-yellow-300 dark:border-yellow-700' },
  pendencia_dev:      { label: '⏸ DEV',     className: 'bg-status-pending-dev text-status-pending-dev-fg border-status-pending-dev-bd dark:bg-violet-900/40 dark:text-violet-300 dark:border-violet-700' },
  aguardando_cliente: { label: '⏳ Cliente', className: 'bg-sem-warning  text-sem-warning-fg  border-sem-warning-bd  dark:bg-amber-900/40  dark:text-amber-300  dark:border-amber-700'  },
};

// ─── Pendency type badge — PRD Sprint A 8 external types ─────────────────────
const PENDENCY_TYPE_BADGE: Record<string, { label: string; className: string }> = {
  cliente:        { label: '⏳ Cliente',    className: 'bg-sem-warning  text-sem-warning-fg  border-sem-warning-bd  dark:bg-amber-900/40  dark:text-amber-300  dark:border-amber-700'  },
  parceiro:       { label: '🤝 Parceiro',   className: 'bg-sem-info   text-sem-info-fg   border-sem-info-bd   dark:bg-blue-900/40   dark:text-blue-300   dark:border-blue-700'   },
  fornecedor:     { label: '📦 Fornecedor', className: 'bg-status-testing text-status-testing-fg border-status-testing-bd dark:bg-cyan-900/40 dark:text-cyan-300 dark:border-cyan-700'   },
  infraestrutura: { label: '🖥️ Infra',      className: 'bg-status-triage text-status-triage-fg border-status-triage-bd dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-700' },
  financeiro:     { label: '💰 Financeiro', className: 'bg-sem-success  text-sem-success-fg  border-sem-success-bd  dark:bg-green-900/40  dark:text-green-300  dark:border-green-700'  },
  fiscal:         { label: '📄 Fiscal',     className: 'bg-status-backlog text-status-backlog-fg border-status-backlog-bd dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-700' },
  operadora:      { label: '📡 Operadora',  className: 'bg-status-pending text-status-pending-fg border-status-pending-bd dark:bg-rose-900/40 dark:text-rose-300 dark:border-rose-700'   },
  outro:          { label: '🔧 Pendente',   className: 'bg-muted text-foreground border-border' },
};

// ─── Type ────────────────────────────────────────────────────────────────────
const TYPE_STYLE: Record<string, string> = {
  suporte:   'bg-sem-info   text-sem-info-fg   border-sem-info-bd   dark:bg-blue-900/30   dark:text-blue-300   dark:border-blue-800',
  duvida:    'bg-sem-warning  text-sem-warning-fg  border-sem-warning-bd  dark:bg-amber-900/30  dark:text-amber-300  dark:border-amber-800',
  incidente: 'bg-sem-error    text-sem-error-fg    border-sem-error-bd    dark:bg-red-900/30    dark:text-red-300    dark:border-red-800',
  bug:       'bg-status-triage text-status-triage-fg border-status-triage-bd dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800',
  evolucao:  'bg-status-testing text-status-testing-fg border-status-testing-bd dark:bg-cyan-900/30 dark:text-cyan-300 dark:border-cyan-800',
};

const TYPE_LABELS: Record<string, string> = {
  suporte: 'Suporte', duvida: 'Dúvida', incidente: 'Incidente', bug: 'Bug', evolucao: 'Evolução',
};

// ─── Column duration ─────────────────────────────────────────────────────────
function formatColumnDuration(enteredAt: string | null): string | null {
  if (!enteredAt) return null
  const ms = Date.now() - new Date(enteredAt).getTime()
  const minutes = Math.floor(ms / 60000)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

// Os estados do dia a dia. A lista completa vive em lib/ticket-status; aqui
// entram só os que a triagem usa, para o menu não virar uma lista rolável.
const STATUS_RAPIDOS = [
  'novos_chamados',
  'triagem',
  'em_atendimento',
  'em_teste',
  'aguardando_cliente',
] as const;

const AVATAR_COLORS = [
  'bg-indigo-500', 'bg-violet-500', 'bg-pink-500', 'bg-teal-500',
  'bg-cyan-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500',
];

function avatarColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// ─── CNPJ group badge ─────────────────────────────────────────────────────────
// Contagem vem pronta do payload do board (cnpj_ticket_count) — evita 1 fetch por card.
function CNPJBadge({ count }: { count: number | null | undefined }) {
  if (!count || count <= 1) return null;
  return (
    <div className="flex items-center gap-1 rounded-full bg-status-migration text-status-migration-fg px-2 py-0.5 text-[10px] font-semibold">
      <Copy className="h-2.5 w-2.5" />
      {count} tickets / CNPJ
    </div>
  );
}

// ─── Inline repriority Popover ────────────────────────────────────────────────
function ReprioritizePopover({
  ticket,
  onUpdate,
}: {
  ticket: KanbanTicket;
  onUpdate: (id: string, changes: { priority?: KanbanTicket['priority']; severity?: KanbanTicket['severity'] }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  async function applyChange(changes: { priority?: KanbanTicket['priority']; severity?: KanbanTicket['severity'] }) {
    setSaving(true);
    setOpen(false);
    onUpdate(ticket.id, changes); // optimistic
    try {
      await ticketsApi.update(ticket.id, changes);
    } catch {
      // Rollback
      onUpdate(ticket.id, { priority: ticket.priority, severity: ticket.severity });
    } finally {
      setSaving(false);
    }
  }

  const dotColor = getPriorityDot(ticket.priority);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={e => { e.preventDefault(); e.stopPropagation(); setOpen(v => !v); }}
          disabled={saving}
          title="Alterar prioridade / severidade"
          className={cn(
            'flex items-center gap-0.5 rounded transition-opacity',
            saving ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-80',
          )}
        >
          <div className={`h-2 w-2 rounded-full shrink-0 ${dotColor}`} />
          <ChevronDown className="h-2.5 w-2.5 text-muted-foreground/70" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-52 p-2"
        side="top"
        align="start"
        onClick={e => e.stopPropagation()}
      >
        {/* Priority section */}
        <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
          Prioridade
        </p>
        <div className="space-y-0.5 mb-2">
          {PRIORITY_KEYS.map(p => (
            <button
              key={p}
              type="button"
              onClick={() => applyChange({ priority: p })}
              className={cn(
                'flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors',
                ticket.priority === p
                  ? 'bg-status-migration text-status-migration-fg font-medium'
                  : 'text-foreground/80 hover:bg-muted/50',
              )}
            >
              <span>{getPriorityEmoji(p)}</span>
              {getPriorityLabel(p)}
              {ticket.priority === p && <span className="ml-auto text-[10px] text-status-migration-fg/70">atual</span>}
            </button>
          ))}
        </div>

        {/* Severity section */}
        <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
          Severidade
        </p>
        <div className="space-y-0.5">
          <button
            type="button"
            onClick={() => applyChange({ severity: null })}
            className={cn(
              'flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors',
              !ticket.severity ? 'bg-status-migration text-status-migration-fg font-medium' : 'text-muted-foreground hover:bg-muted/50',
            )}
          >
            — Nenhuma
            {!ticket.severity && <span className="ml-auto text-[10px] text-status-migration-fg/70">atual</span>}
          </button>
          {(['P0', 'P1', 'P2', 'P3'] as const).map(s => (
            <button
              key={s}
              type="button"
              onClick={() => applyChange({ severity: s })}
              className={cn(
                'flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors',
                ticket.severity === s ? 'bg-status-migration text-status-migration-fg font-medium' : 'text-foreground/80 hover:bg-muted/50',
              )}
            >
              <span className={cn('rounded border px-1 py-0 text-[10px]', getSeverityColor(s))}>{s}</span>
              {getSeverityLabel(s).split(' — ')[1]}
              {ticket.severity === s && <span className="ml-auto text-[10px] text-status-migration-fg/70">atual</span>}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Quick Priority Popover (hover-reveal inline action) ─────────────────────
function QuickPriorityPopover({
  ticket,
  onQuickAction,
}: {
  ticket: KanbanTicket;
  onQuickAction: (id: string, type: 'priority' | 'assign' | 'resolve' | 'status', value?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const dotColor = getPriorityDot(ticket.priority);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={e => { e.preventDefault(); e.stopPropagation(); setOpen(v => !v); }}
          title="Alterar prioridade"
          className="flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-muted"
        >
          <Flag className="h-3.5 w-3.5 text-muted-foreground/70 hover:text-foreground/60" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-44 p-1.5"
        side="top"
        align="end"
        onClick={e => e.stopPropagation()}
      >
        {/* Status primeiro: mover de coluna é o que mais se faz, e até agora
            só dava para arrastar ou abrir "Editar chamado". */}
        <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
          Status
        </p>
        <div className="mb-2 space-y-0.5">
          {STATUS_RAPIDOS.map(st => (
            <button
              key={st}
              type="button"
              onClick={e => {
                e.preventDefault();
                e.stopPropagation();
                setOpen(false);
                onQuickAction(ticket.id, 'status', st);
              }}
              className={cn(
                'flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors',
                ticket.status === st
                  ? 'bg-status-migration text-status-migration-fg font-medium'
                  : 'text-foreground/80 hover:bg-muted/50',
              )}
            >
              {getStatusLabel(st)}
            </button>
          ))}
        </div>

        <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
          Prioridade
        </p>
        <div className="space-y-0.5">
          {PRIORITY_KEYS.map(p => (
            <button
              key={p}
              type="button"
              onClick={e => {
                e.preventDefault();
                e.stopPropagation();
                setOpen(false);
                onQuickAction(ticket.id, 'priority', p);
              }}
              className={cn(
                'flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors',
                ticket.priority === p
                  ? 'bg-status-migration text-status-migration-fg font-medium'
                  : 'text-foreground/80 hover:bg-muted/50',
              )}
            >
              <span>{getPriorityEmoji(p)}</span>
              {getPriorityLabel(p)}
              {ticket.priority === p && <span className="ml-auto text-[10px] text-status-migration-fg/70">atual</span>}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Pull Request URL Popover ────────────────────────────────────────────────
function PullRequestPopover({
  ticket,
  onUpdate,
}: {
  ticket: KanbanTicket;
  onUpdate: (id: string, changes: { pull_request_url?: string | null }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [value, setValue] = useState(ticket.pull_request_url ?? '');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setValue(ticket.pull_request_url ?? '');
      setError(null);
    }
  }, [open, ticket.pull_request_url]);

  async function saveUrl(url: string | null) {
    if (url) {
      const validated = validatePullRequestUrl(url);
      if (!validated) {
        setError(PULL_REQUEST_URL_ERROR);
        return;
      }
      url = validated;
    }

    setSaving(true);
    setError(null);
    const previous = ticket.pull_request_url ?? null;
    onUpdate(ticket.id, { pull_request_url: url });
    setOpen(false);
    try {
      await ticketsApi.update(ticket.id, { pull_request_url: url });
    } catch {
      onUpdate(ticket.id, { pull_request_url: previous });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={e => { e.preventDefault(); e.stopPropagation(); setOpen(v => !v); }}
          disabled={saving}
          title="Link do Pull Request"
          className="flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-status-pending-dev"
        >
          <GitPullRequest className={cn(
            'h-3.5 w-3.5',
            ticket.pull_request_url ? 'text-status-pending-dev-fg' : 'text-muted-foreground/70 hover:text-status-pending-dev-fg',
          )} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-72 p-3 space-y-2"
        side="top"
        align="end"
        onClick={e => e.stopPropagation()}
      >
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
          Link do Pull Request
        </p>
        <Input
          type="url"
          value={value}
          onChange={e => { setValue(e.target.value); setError(null); }}
          placeholder="https://github.com/org/repo/pull/123"
          className="h-8 text-xs"
          disabled={saving}
        />
        {error && <p className="text-[11px] text-sem-error-fg">{error}</p>}
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            className="h-7 flex-1 text-xs"
            disabled={saving}
            onClick={() => saveUrl(value.trim() || null)}
          >
            Salvar
          </Button>
          {ticket.pull_request_url && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={saving}
              onClick={() => saveUrl(null)}
            >
              Limpar
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Card ────────────────────────────────────────────────────────────────────
export const KanbanCard = memo(function KanbanCard({ ticket, isDragging = false, onUpdate, isSelected = false, onToggleSelect, selectionMode = false, currentUserId, onQuickAction, podeReclassificar = false }: {
  ticket: KanbanTicket;
  isDragging?: boolean;
  onUpdate?: (id: string, changes: { priority?: KanbanTicket['priority']; severity?: KanbanTicket['severity']; pull_request_url?: string | null }) => void;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
  selectionMode?: boolean;
  currentUserId?: string;
  onQuickAction?: (id: string, type: 'priority' | 'assign' | 'resolve' | 'status', value?: string) => void;
  /**
   * Pode RECLASSIFICAR (prioridade, severidade, status)? Exige `developer`+.
   * Atender — pegar para si e resolver — é trabalho de quem atende e vale a
   * partir de `support`; separar os dois é o que devolve as ações rápidas aos
   * 7 operadores sem abrir a reclassificação para todo mundo.
   */
  podeReclassificar?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: sortableDragging,
  } = useSortable({ id: ticket.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: sortableDragging ? 0 : 1,
  };

  const borderColor = getPriorityBorder(ticket.priority);
  const slaBreached = ticket.sla?.breached;

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onToggleSelect?.(ticket.id);
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <Link
        href={`/admin/tickets/view?id=${ticket.id}`}
        onClick={e => { if (isDragging || selectionMode) { e.preventDefault(); if (selectionMode) onToggleSelect?.(ticket.id); } }}
        draggable={false}
      >
        <div
          className={cn(
            // O trilho de prioridade FICA: num quadro denso ele é a leitura
            // mais rápida de triagem que existe, e usa token. O que sai é a
            // moldura de 1px em volta — a separação entre cartões passa a ser
            // elevação, que o olho agrupa sem refixar em cada aresta.
            'group relative rounded-lg border-l-4 bg-card',
            'transition-all duration-150 cursor-grab active:cursor-grabbing',
            borderColor,
            isDragging
              ? 'shadow-[var(--shadow-alta)] ring-2 ring-sem-info-bd rotate-1'
              : isSelected
                ? 'shadow-[var(--shadow-media)] ring-2 ring-sem-info-bd bg-sem-info'
                : 'shadow-[var(--shadow-baixa)] hover:shadow-[var(--shadow-media)]',
            slaBreached && !isSelected ? 'ring-1 ring-sem-error-bd' : '',
          )}
        >
          {/* Selection checkbox — visible on hover, focus, touch, or in selection mode */}
          {onToggleSelect && (
            <div
              role="checkbox"
              aria-checked={isSelected}
              aria-label={isSelected ? 'Remover da seleção' : 'Selecionar ticket'}
              tabIndex={0}
              className={cn(
                'absolute left-1.5 top-1.5 z-10 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sem-info-bd rounded',
                selectionMode || isSelected
                  ? 'opacity-100'
                  : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100',
              )}
              onClick={handleCheckboxClick}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  onToggleSelect?.(ticket.id);
                }
              }}
            >
              <div className={cn(
                'flex h-4.5 w-4.5 items-center justify-center rounded border-2 transition-all',
                isSelected
                  ? 'bg-sem-info-fg border-sem-info-fg'
                  : 'bg-background border-border hover:border-sem-info-bd',
              )}>
                {isSelected && (
                  <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 10 10" fill="none">
                    <path d="M2 5l2.5 2.5L8 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
            </div>
          )}
          <div className="p-3 space-y-2">

            {/* Row 1: ticket number + SLA */}
            <div className="flex items-center justify-between gap-1">
              <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                {ticket.ticket_number && (
                  <span
                    className="group/num font-mono text-[10px] text-muted-foreground/70 shrink-0 flex items-center gap-0.5 cursor-pointer select-none"
                    onClick={e => { e.preventDefault(); navigator.clipboard.writeText(ticket.ticket_number!); }}
                    title={`Copiar ${ticket.ticket_number}`}
                  >
                    {ticket.ticket_number}
                    <Copy className="h-2.5 w-2.5 opacity-0 group-hover/num:opacity-60 transition-opacity" />
                  </span>
                )}
                {ticket.severity && (
                  <span className={cn('rounded border px-1.5 py-0 text-[10px] font-semibold', getSeverityColor(ticket.severity ?? ''))}>
                    {ticket.severity}
                  </span>
                )}
                {ticket.impact && (
                  <span className={cn('rounded border px-1.5 py-0 text-[10px] font-semibold', IMPACT_STYLE[ticket.impact] ?? '')}>
                    {IMPACT_SHORT[ticket.impact]}
                  </span>
                )}
                {/* Sprint A: pendency type badge (PRD 8 types takes priority over legacy status badge) */}
                {ticket.pendency_type && PENDENCY_TYPE_BADGE[ticket.pendency_type] ? (
                  <span className={cn('rounded border px-1.5 py-0 text-[10px] font-bold', PENDENCY_TYPE_BADGE[ticket.pendency_type].className)}>
                    {PENDENCY_TYPE_BADGE[ticket.pendency_type].label}
                  </span>
                ) : PENDENCIA_BADGE_BY_STATUS[ticket.status] ? (
                  <span className={cn('rounded border px-1.5 py-0 text-[10px] font-bold', PENDENCIA_BADGE_BY_STATUS[ticket.status].className)}>
                    {PENDENCIA_BADGE_BY_STATUS[ticket.status].label}
                  </span>
                ) : null}
                {/* Sprint A: Bloqueado badge (flag operacional, NÃO é coluna) */}
                {ticket.is_blocked && (
                  <span
                    className="rounded border px-1.5 py-0 text-[10px] font-bold bg-muted text-foreground/80 border-border"
                    title={ticket.blocked_reason ?? 'Ticket bloqueado internamente'}
                  >
                    ⏸ Bloqueado
                  </span>
                )}
                {/* Sprint D: Recorrente badge */}
                {ticket.recurring && (
                  <span
                    className="rounded border px-1.5 py-0 text-[10px] font-bold bg-status-testing text-status-testing-fg border-status-testing-bd"
                    title="Problema recorrente"
                  >
                    🔁 Recorrente
                  </span>
                )}
                {ticket.pull_request_url && (
                  <a
                    href={ticket.pull_request_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="flex items-center gap-0.5 rounded border px-1.5 py-0 text-[10px] font-bold bg-status-pending-dev text-status-pending-dev-fg border-status-pending-dev-bd hover:opacity-80"
                    title={ticket.pull_request_url}
                  >
                    <GitPullRequest className="h-2.5 w-2.5" />
                    PR
                    <ExternalLink className="h-2 w-2 opacity-60" />
                  </a>
                )}
              </div>
              <div className="flex items-center gap-1">
                {ticket.sla && (ticket.sla.breached || ticket.sla.paused || (ticket.sla.minutes_remaining != null && ticket.sla.minutes_remaining <= 1440)) && (
                  <SlaIndicator
                    minutesRemaining={ticket.sla.minutes_remaining}
                    breached={ticket.sla.breached}
                    paused={ticket.sla.paused}
                  />
                )}
                {ticket.sla?.escalated && (
                  <span
                    className="flex items-center gap-0.5 rounded-full bg-sem-error text-sem-error-fg px-1.5 py-0.5 text-[10px] font-bold border border-sem-error-bd"
                    title="Ticket escalado"
                  >
                    🚨 ESC
                  </span>
                )}
                {ticket.rating?.score && (
                  <span
                    className="flex items-center gap-0.5 rounded-full bg-sem-warning border border-sem-warning-bd px-1.5 py-0.5 text-[10px] font-semibold text-sem-warning-fg"
                    title={`Avaliação: ${ticket.rating.score}/5`}
                  >
                    <Star className="h-2.5 w-2.5 fill-sem-warning-fg text-sem-warning-fg" />
                    {ticket.rating.score}/5
                  </span>
                )}
                {ticket.company_cnpj && <CNPJBadge count={ticket.cnpj_ticket_count} />}
              </div>
            </div>

            {/* Row 2: title */}
            <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-foreground">
              {ticket.title}
            </p>

            {/* Row 3: solicitante (quem pediu) */}
            {ticket.requester && (
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground/70">
                <User className="h-3 w-3 shrink-0 text-muted-foreground/50" />
                <span className="truncate">
                  <span className="text-muted-foreground/70">Solic.:</span> <span className="italic">{ticket.requester}</span>
                </span>
              </div>
            )}

            {/* Row 3.5: responsável e co-responsáveis, em texto.
                O avatar no rodapé já existia, mas exige passar o mouse para
                saber de quem é — e num quadro cheio ninguém faz isso. Quem
                está com o chamado é a informação que se lê de relance. */}
            {(ticket.assignee || (ticket.co_assignees?.length ?? 0) > 0) && (
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground/70">
                <UserCheck className="h-3 w-3 shrink-0 text-muted-foreground/50" />
                <span className="truncate">
                  {ticket.assignee
                    ? (ticket.assignee.full_name || ticket.assignee.email)
                    : <span className="italic text-muted-foreground/50">Sem responsável</span>}
                  {(ticket.co_assignees?.length ?? 0) > 0 && (
                    <span className="text-muted-foreground/50">
                      {' '}+{ticket.co_assignees!.length}
                    </span>
                  )}
                </span>
              </div>
            )}

            {/* Row 4: cliente / empresa + filial */}
            {(ticket.is_public || ticket.user || ticket.unit) && (
              <div className="flex flex-col gap-0.5 text-[11px] text-muted-foreground/70">
                {ticket.is_public ? (
                  <div className="flex items-center gap-1">
                    <Building2 className="h-3 w-3 shrink-0" />
                    <span className="truncate">{ticket.company?.name || ticket.company_name || 'Empresa'}</span>
                  </div>
                ) : ticket.user ? (
                  <div className="flex items-center gap-1">
                    <User className="h-3 w-3 shrink-0" />
                    <span className="truncate">{ticket.user.full_name || ticket.user.email}</span>
                  </div>
                ) : null}
                {ticket.unit?.name && (
                  <div className="flex items-center gap-1">
                    <MapPin className="h-3 w-3 shrink-0 text-muted-foreground/50" />
                    <span className="truncate">{ticket.unit.name}{ticket.unit.city ? ` — ${ticket.unit.city}` : ''}</span>
                  </div>
                )}
              </div>
            )}

            {/* Row 4.5: quem recebeu — discreto, só quando difere do responsável atual */}
            {ticket.received_by && ticket.received_by.id !== ticket.assignee?.id && (
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground/50">
                <ArrowDownLeft className="h-2.5 w-2.5 shrink-0" />
                <span className="truncate">Recebeu: {ticket.received_by.full_name || ticket.received_by.email}</span>
              </div>
            )}

            {/* Row 5: type + category badges */}
            {(ticket.ticket_type || ticket.category) && (
              <div className="flex flex-wrap gap-1">
                {ticket.ticket_type && (
                  <span className={cn('rounded border px-1.5 py-0 text-[10px] font-medium', TYPE_STYLE[ticket.ticket_type] ?? 'bg-muted/50 text-foreground/60 border-border')}>
                    {TYPE_LABELS[ticket.ticket_type] ?? ticket.ticket_type}
                  </span>
                )}
                {ticket.category && (
                  <span className="rounded border border-border bg-muted/50 px-1.5 py-0 text-[10px] text-muted-foreground">
                    {ticket.category}
                  </span>
                )}
              </div>
            )}

            {/* Row 5.5: inline quick actions — hidden by default, appear on hover/focus/touch */}
            {(onQuickAction || onUpdate) && (
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity duration-150">
                {/* Assign to me — only when unassigned or assigned to someone else */}
                {onQuickAction && (!ticket.assignee || ticket.assignee.id !== currentUserId) && currentUserId && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={e => {
                            e.preventDefault();
                            e.stopPropagation();
                            onQuickAction(ticket.id, 'assign');
                          }}
                          className="flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-sem-success"
                        >
                          <UserCheck className="h-3.5 w-3.5 text-muted-foreground/70 hover:text-sem-success-fg" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        {ticket.assignee && ticket.assignee.id !== currentUserId ? 'Assumir chamado' : 'Atribuir a mim'}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}

                {/* Pull Request link */}
                {onUpdate && (
                  <PullRequestPopover ticket={ticket} onUpdate={onUpdate} />
                )}

                {/* Quick priority picker */}
                {onQuickAction && podeReclassificar && (
                  <QuickPriorityPopover ticket={ticket} onQuickAction={onQuickAction} />
                )}

                {/* Resolve — only for em_atendimento or em_teste */}
                {onQuickAction && (ticket.status === 'em_atendimento' || ticket.status === 'em_teste') && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={e => {
                            e.preventDefault();
                            e.stopPropagation();
                            onQuickAction(ticket.id, 'resolve');
                          }}
                          className="flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-sem-success"
                        >
                          <CheckCircle className="h-3.5 w-3.5 text-muted-foreground/70 hover:text-sem-success-fg" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top">Resolver ticket</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            )}

            {/* Row 6: footer — priority + date + counters + avatar */}
            <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/50">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
                {/* Priority dot — clickable for admin/agent reprioritize */}
                {onUpdate ? (
                  <ReprioritizePopover ticket={ticket} onUpdate={onUpdate} />
                ) : (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className={cn('h-2 w-2 rounded-full shrink-0', getPriorityDot(ticket.priority))} />
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        Prioridade: {getPriorityLabel(ticket.priority)}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}

                {(() => {
                  // Início do atendimento × cadastro do chamado (TCK000675 3.2).
                  // O início já era gravado — pela conversa do WhatsApp e pelo
                  // campo "Data do atendimento" do formulário —, mas o card só
                  // mostrava "Aberto em". Quando o atendimento começou em outro
                  // dia, é essa a data que importa para quem olha o quadro.
                  const inicio = ticket.occurred_at
                  const outroDia =
                    !!inicio && formatDateShort(inicio) !== formatDateShort(ticket.created_at)
                  const titulo = inicio
                    ? `Atendimento iniciado em ${formatDate(inicio)} · Aberto em ${formatDate(ticket.created_at)}`
                    : `Aberto em ${formatDate(ticket.created_at)}`
                  return (
                    <span className="text-[10px] text-muted-foreground/70" title={titulo}>
                      {outroDia ? `Atend. ${formatDateShort(inicio)}` : formatDateShort(ticket.created_at)}
                    </span>
                  )
                })()}

                {(() => {
                  const duration = formatColumnDuration(ticket.column_entered_at)
                  return duration ? (
                    <span className="text-[10px] text-muted-foreground/70 flex items-center gap-0.5">
                      ⏱ {duration}
                    </span>
                  ) : null
                })()}

                {ticket.message_count > 0 && (
                  <div className="flex items-center gap-0.5 text-[10px] text-muted-foreground/70">
                    <MessageSquare className="h-3 w-3" />
                    <span>{ticket.message_count}</span>
                  </div>
                )}

                {ticket.attachment_count > 0 && (
                  <div className="flex items-center gap-0.5 text-[10px] text-muted-foreground/70">
                    <Paperclip className="h-3 w-3" />
                    <span>{ticket.attachment_count}</span>
                  </div>
                )}
              </div>

              {/* Assignee */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Avatar className="h-6 w-6 shrink-0">
                      {ticket.assignee ? (
                        <AvatarFallback className={cn('text-[10px] font-bold text-white', avatarColor(ticket.assignee.id))}>
                          {getInitials(ticket.assignee.full_name, ticket.assignee.email)}
                        </AvatarFallback>
                      ) : (
                        <AvatarFallback className="bg-muted text-[10px] text-muted-foreground/70">
                          –
                        </AvatarFallback>
                      )}
                    </Avatar>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    {ticket.assignee
                      ? (ticket.assignee.full_name || ticket.assignee.email)
                      : 'Sem responsável'}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

          </div>
        </div>
      </Link>
    </div>
  );
});
