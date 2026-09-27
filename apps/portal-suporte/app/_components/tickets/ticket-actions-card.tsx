"use client";

import { useState, useRef } from "react";
import { PRIORITY_OPTIONS } from "@/lib/ticket-priority";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BrainCircuit,
  UserX,
  UserPlus,
  Users,
  X,
  ArrowUpCircle,
} from "lucide-react";
import { PendenciaSubTypeDialog, type PendencySubSelection } from '@/components/kanban/pendencia-subtype-dialog';
import { PendencyDialog } from "@/components/kanban/pendency-dialog";
import {
  getStatusLabel,
  getStatusColor,
  isTerminalStatus,
  STATUS_LABELS,
  COLUNAS_DO_QUADRO,
  getKanbanColumnId,
} from "@/lib/ticket-status";
import { isValidTransition } from "@/lib/ticket-transitions";
import { verify } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { PriorityBadge } from "@/_components/ui/priority-badge";
import { ticketsApi } from "@/lib/api/tickets";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Agent {
  id: string;
  full_name: string | null;
  email: string;
  role: string;
}

interface CoAssignee {
  id: string;
  full_name: string | null;
  email: string;
  role: string;
}

interface TicketActionsCardTicket {
  id: string;
  status: string;
  priority: string;
  ai_priority?: string | null;
  client_priority?: string | null;
  ai_justification?: string | null;
  assigned_to: { id: string; full_name: string | null; email: string } | null;
  co_assignees?: CoAssignee[];
}

interface TicketActionsCardProps {
  ticket: TicketActionsCardTicket;
  agents: Agent[];
  userRole?: string;
  onRefresh: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_CO_ASSIGNEES = 4;


// ─── Component ────────────────────────────────────────────────────────────────

export function TicketActionsCard({ ticket, agents, userRole = "developer", onRefresh }: TicketActionsCardProps) {
  const { toast } = useToast();

  const [pendencyOpen, setPendencyOpen]             = useState(false);
  const [subTypeOpen, setSubTypeOpen]               = useState(false);
  const [pendencyTargetStatus, setPendencyTargetStatus] = useState("");
  const pendingStatusRef = useRef<{ toStatus: string; pendencyType: string | null } | null>(null);
  const [coAssigneeError, setCoAssigneeError]       = useState<string | null>(null);

  // Escalação: escalar PARA um responsável (reatribui + histórico + marca escalado)
  const [escalateOpen, setEscalateOpen] = useState(false);
  const [escalateTarget, setEscalateTarget] = useState("");
  const [escalateReason, setEscalateReason] = useState("");
  const [escalating, setEscalating] = useState(false);

  const coAssignees  = ticket.co_assignees ?? [];
  const coAssigneeIds = new Set(coAssignees.map(c => c.id));
  const eligibleForCo = agents.filter(
    a => a.id !== ticket.assigned_to?.id && !coAssigneeIds.has(a.id)
  );

  // ── Status ──────────────────────────────────────────────────────────────────
  // O seletor fala em COLUNAS do quadro, não em status do banco: são sete, as
  // mesmas sete que estão no quadro. "Pendência" agrupa três status e por isso
  // pergunta o tipo antes de gravar — no mesmo diálogo que o quadro usa ao
  // arrastar, para as duas telas não divergirem.
  const handleColumnChange = async (columnId: string) => {
    if (columnId === getKanbanColumnId(ticket.status)) return;
    const coluna = COLUNAS_DO_QUADRO.find(c => c.id === columnId);
    if (!coluna) return;

    if (coluna.perguntaSubtipo) {
      setSubTypeOpen(true);
      return;
    }

    const userIsAdmin = verify('admin', { role: userRole });
    const { allowed, reason } = isValidTransition(ticket.status, coluna.statusPadrao, userIsAdmin);
    if (!allowed) {
      toast({ title: "Transição não permitida", description: reason ?? "Esta movimentação não é permitida.", variant: "destructive" });
      return;
    }
    await ticketsApi.patchStatus(ticket.id, { status: coluna.statusPadrao });
    onRefresh();
  };

  // Escolhido o tipo de pendência, o caminho é o mesmo do quadro: o tipo define
  // o status do banco, e em seguida vem o diálogo do MOTIVO.
  const handleSubTypeConfirm = (selection: PendencySubSelection) => {
    const userIsAdmin = verify('admin', { role: userRole });
    const { allowed, reason } = isValidTransition(ticket.status, selection.dbStatus, userIsAdmin);
    if (!allowed) {
      toast({ title: "Transição não permitida", description: reason ?? "Esta movimentação não é permitida.", variant: "destructive" });
      setSubTypeOpen(false);
      return;
    }
    pendingStatusRef.current = { toStatus: selection.dbStatus, pendencyType: selection.pendencyType };
    setPendencyTargetStatus(selection.dbStatus);
    setSubTypeOpen(false);
    setPendencyOpen(true);
  };

  const handlePendencyConfirm = async (reason: string, followUpDate: string) => {
    const pending = pendingStatusRef.current;
    if (!pending) return;
    try {
      await ticketsApi.patchStatus(ticket.id, { status: pending.toStatus, pendency_reason: reason, pendency_type: pending.pendencyType, follow_up_date: followUpDate });
    } catch (err: any) {
      toast({ title: "Erro ao alterar status", description: err?.message ?? "Transição rejeitada.", variant: "destructive" });
      return;
    }
    setPendencyOpen(false);
    pendingStatusRef.current = null;
    onRefresh();
  };

  const handlePendencyCancel = () => {
    setPendencyOpen(false);
    pendingStatusRef.current = null;
  };

  // ── Priority ─────────────────────────────────────────────────────────────────
  const handlePriorityChange = async (newPriority: string) => {
    await ticketsApi.update(ticket.id, { priority: newPriority });
    onRefresh();
  };

  // ── Assignee ─────────────────────────────────────────────────────────────────
  const handleAssignAgent = async (agentId: string) => {
    await ticketsApi.assign(ticket.id, agentId === "unassigned" ? null : agentId);
    onRefresh();
  };

  // ── Escalação ─────────────────────────────────────────────────────────────────
  const eligibleForEscalate = agents.filter(a => a.id !== ticket.assigned_to?.id);

  const handleEscalate = async () => {
    if (!escalateTarget) return;
    setEscalating(true);
    try {
      await ticketsApi.escalate(ticket.id, escalateTarget, escalateReason.trim() || undefined);
      toast({ title: "Ticket escalado", description: "Responsável atualizado e registrado no histórico." });
      setEscalateOpen(false);
      setEscalateTarget("");
      setEscalateReason("");
      onRefresh();
    } catch (err: any) {
      toast({ title: "Erro ao escalar", description: err?.message ?? "Tente novamente.", variant: "destructive" });
    } finally {
      setEscalating(false);
    }
  };

  // ── Co-assignees ──────────────────────────────────────────────────────────────
  const handleAddCoAssignee = async (agentId: string) => {
    if (!agentId || agentId === "_placeholder") return;
    setCoAssigneeError(null);
    try {
      await ticketsApi.addCoAssignee(ticket.id, agentId);
      onRefresh();
    } catch (err) {
      setCoAssigneeError(err instanceof Error ? err.message : "Erro inesperado");
    }
  };

  const handleRemoveCoAssignee = async (userId: string) => {
    setCoAssigneeError(null);
    try {
      await ticketsApi.removeCoAssignee(ticket.id, userId);
      onRefresh();
    } catch (err) {
      setCoAssigneeError(err instanceof Error ? err.message : "Erro inesperado");
    }
  };

  return (
    <>
      <div className="rounded-lg bg-card p-4 space-y-4 shadow-[var(--shadow-media)]">
        {/* Status */}
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Status</p>
          <Select
            value={getKanbanColumnId(ticket.status)}
            onValueChange={handleColumnChange}
            disabled={isTerminalStatus(ticket.status)}
          >
            <SelectTrigger className="w-full border-border bg-muted/50 hover:bg-muted transition-colors">
              {/* O gatilho mostra o status EXATO ("Pendência DEV"), que é a
                  informação útil; a lista fala em colunas. */}
              <Badge variant="outline" className={getStatusColor(ticket.status)}>
                {getStatusLabel(ticket.status)}
              </Badge>
            </SelectTrigger>
            <SelectContent>
              {COLUNAS_DO_QUADRO.map(col => (
                <SelectItem
                  key={col.id}
                  value={col.id}
                  disabled={col.id === "fechado" && ticket.status !== "fechado"}
                >
                  {col.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Priority */}
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Prioridade</p>
          <Select value={ticket.priority} onValueChange={handlePriorityChange}>
            <SelectTrigger className="w-full border-border bg-muted/50 hover:bg-muted transition-colors">
              <PriorityBadge priority={ticket.priority} />
            </SelectTrigger>
            <SelectContent>
              {PRIORITY_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {ticket.ai_priority && (
            <div className="mt-2 rounded-md bg-status-migration border border-status-migration-bd px-3 py-2 space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-status-migration-fg font-medium">
                <BrainCircuit className="h-3.5 w-3.5" />
                Triagem IA
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">IA:</span>
                <PriorityBadge priority={ticket.ai_priority} size="sm" />
                {ticket.client_priority && ticket.client_priority !== ticket.ai_priority && (
                  <>
                    <span className="text-muted-foreground/70">·</span>
                    <span className="text-muted-foreground">Cliente informou:</span>
                    <PriorityBadge priority={ticket.client_priority} size="sm" />
                  </>
                )}
              </div>
              {ticket.ai_justification && (
                <p className="text-[11px] text-muted-foreground leading-snug">{ticket.ai_justification}</p>
              )}
            </div>
          )}
        </div>

        {/* Assignee */}
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Responsável</p>
          <Select value={ticket.assigned_to?.id || "unassigned"} onValueChange={handleAssignAgent}>
            <SelectTrigger className="w-full border-border bg-muted/50 hover:bg-muted transition-colors">
              <SelectValue asChild>
                <span className="flex items-center gap-2 text-sm">
                  {ticket.assigned_to ? (
                    ticket.assigned_to.full_name || ticket.assigned_to.email
                  ) : (
                    <>
                      <UserX className="h-4 w-4 text-muted-foreground/70" />
                      <span className="text-muted-foreground/70">Sem responsável</span>
                    </>
                  )}
                </span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unassigned">
                <span className="flex items-center gap-2">
                  <UserX className="h-4 w-4 text-muted-foreground/70" />
                  Sem responsável
                </span>
              </SelectItem>
              {agents.map(agent => (
                <SelectItem key={agent.id} value={agent.id}>
                  {agent.full_name || agent.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Escalar para — reatribui + registra no histórico de responsável */}
          {!isTerminalStatus(ticket.status) && (
            escalateOpen ? (
              <div className="mt-2 rounded-md border border-sem-warning-bd bg-sem-warning/60 p-2.5 space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-sem-warning-fg flex items-center gap-1">
                  <ArrowUpCircle className="h-3.5 w-3.5" /> Escalar para
                </p>
                <Select value={escalateTarget || "_none"} onValueChange={(v) => setEscalateTarget(v === "_none" ? "" : v)}>
                  <SelectTrigger className="w-full border-sem-warning-bd bg-background text-sm">
                    <SelectValue placeholder="Escolher responsável…" />
                  </SelectTrigger>
                  <SelectContent>
                    {eligibleForEscalate.map(agent => (
                      <SelectItem key={agent.id} value={agent.id}>
                        {agent.full_name || agent.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <input
                  type="text"
                  value={escalateReason}
                  onChange={(e) => setEscalateReason(e.target.value)}
                  placeholder="Motivo (opcional)"
                  className="w-full border border-sem-warning-bd rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-amber-200"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleEscalate}
                    disabled={!escalateTarget || escalating}
                    className="flex-1 rounded-md bg-sem-warning-fg px-2 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50 transition-colors"
                  >
                    {escalating ? "Escalando…" : "Confirmar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEscalateOpen(false); setEscalateTarget(""); setEscalateReason(""); }}
                    disabled={escalating}
                    className="rounded-md border border-sem-warning-bd bg-background px-2 py-1.5 text-xs text-sem-warning-fg hover:bg-sem-warning transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setEscalateOpen(true)}
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-sem-warning-bd bg-background px-2 py-1.5 text-xs font-medium text-sem-warning-fg hover:bg-sem-warning transition-colors"
              >
                <ArrowUpCircle className="h-3.5 w-3.5" /> Escalar para…
              </button>
            )
          )}

          {/* Escalar para o DEV — diferente do "Escalar para" acima (que só
              reatribui a pessoa): cria um card novo no Kanban Dev e move este
              chamado para Pendência DEV. Regras no servidor
              (POST /tickets/:id/escalar-dev — scripts/kanban-dev-regras.py). */}
          {ticket.status === "pendencia_dev" ? (
            // Já escalado: o botão SUMIR aqui fazia a equipe achar que a função
            // não existia (aconteceu em 20/08). Estado dito, não escondido.
            <div className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-status-pending-dev-bd bg-status-pending-dev/40 px-2 py-1.5 text-xs font-medium text-status-pending-dev-fg">
              <ArrowUpCircle className="h-3.5 w-3.5" />
              Já escalado — aguardando o Dev
            </div>
          ) : (
            <button
              type="button"
              onClick={async () => {
                const motivo = window.prompt(
                  "Motivo da escalada — é o que o Dev vai ler primeiro:"
                );
                if (!motivo?.trim()) return;
                try {
                  const { kanbanDevApi } = await import("@/lib/api/kanban-dev");
                  await kanbanDevApi.escalar(ticket.id, motivo.trim());
                  toast({ title: "Escalado para o Dev", description: "Card criado no Kanban Dev; o chamado aguarda em Pendência DEV." });
                  onRefresh();
                } catch (err: any) {
                  toast({ title: "Erro ao escalar para o Dev", description: err?.message ?? "Tente novamente.", variant: "destructive" });
                }
              }}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-status-pending-dev-bd bg-background px-2 py-1.5 text-xs font-medium text-status-pending-dev-fg hover:bg-status-pending-dev transition-colors"
            >
              <ArrowUpCircle className="h-3.5 w-3.5" /> Escalar para o Dev
            </button>
          )}
        </div>

        {/* Co-assignees */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <Users className="h-3 w-3" />
              Co-responsáveis
            </p>
            <span className="text-[10px] text-muted-foreground/70">{coAssignees.length}/{MAX_CO_ASSIGNEES}</span>
          </div>

          {coAssignees.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {coAssignees.map(ca => (
                <span
                  key={ca.id}
                  className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-status-migration border border-status-migration-bd text-xs text-status-migration-fg"
                >
                  <span className="truncate max-w-[140px]">{ca.full_name || ca.email}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveCoAssignee(ca.id)}
                    className="rounded-full hover:bg-status-migration p-0.5 text-status-migration-fg hover:opacity-80 transition-colors"
                    aria-label={`Remover ${ca.full_name || ca.email}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {coAssignees.length < MAX_CO_ASSIGNEES && eligibleForCo.length > 0 && (
            <Select value="_placeholder" onValueChange={handleAddCoAssignee}>
              <SelectTrigger className="w-full border-dashed border-border bg-background hover:bg-muted/50 transition-colors text-xs">
                <SelectValue asChild>
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <UserPlus className="h-3.5 w-3.5" />
                    Adicionar co-responsável
                  </span>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {eligibleForCo.map(agent => (
                  <SelectItem key={agent.id} value={agent.id}>
                    {agent.full_name || agent.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {coAssigneeError && (
            <p className="text-xs text-sem-error-fg mt-1.5">{coAssigneeError}</p>
          )}
        </div>
      </div>

      <PendenciaSubTypeDialog
        open={subTypeOpen}
        onPick={handleSubTypeConfirm}
        onCancel={() => setSubTypeOpen(false)}
      />

      <PendencyDialog
        open={pendencyOpen}
        status={pendencyTargetStatus}
        onConfirm={handlePendencyConfirm}
        onCancel={handlePendencyCancel}
      />
    </>
  );
}
