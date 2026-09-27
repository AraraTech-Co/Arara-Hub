"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Eye, Building2, Download, FileText } from 'lucide-react';
import Link from "next/link";
import { useRouter } from 'next/navigation';
import {
  getStatusLabel,
  getStatusColor,
  STATUS_LABELS,
  COLUNAS_DO_QUADRO,
  getKanbanColumnId,
} from "@/lib/ticket-status";
import { PriorityBadge } from "@/_components/ui/priority-badge";
import { formatDateShort } from "@/lib/utils";
import { araraApiFetch } from '@/lib/arara/arara-api-fetch'
import { PendenciaSubTypeDialog, type PendencySubSelection } from '@/components/kanban/pendencia-subtype-dialog';
import { PendencyDialog } from '@/components/kanban/pendency-dialog';

interface Ticket {
  id: string;
  title: string;
  status: string;
  priority: string;
  category: string | null;
  created_at: string;
  is_public: boolean;
  company_name: string | null;
  contact_email: string | null;
  user: {
    id: string;
    full_name: string | null;
    email: string;
  } | null;
  assigned_to: {
    id: string;
    full_name: string | null;
    email: string;
  } | null;
}

interface Agent {
  id: string;
  full_name: string | null;
  email: string;
  role: string;
}

interface AllTicketsTableProps {
  tickets: Ticket[];
  agents: Agent[];
}

const STATUS_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "all",                  label: "Todos" },
  { value: "novos_chamados",       label: STATUS_LABELS.novos_chamados },
  { value: "triagem",              label: STATUS_LABELS.triagem },
  { value: "em_atendimento",       label: STATUS_LABELS.em_atendimento },
  { value: "pendencia_suporte",    label: STATUS_LABELS.pendencia_suporte },
  { value: "aguardando_cliente",   label: STATUS_LABELS.aguardando_cliente },
  { value: "pendencia_dev",        label: STATUS_LABELS.pendencia_dev },
  { value: "em_teste",             label: STATUS_LABELS.em_teste },
  { value: "resolvido",            label: STATUS_LABELS.resolvido },
  { value: "resolvido_com_manual", label: STATUS_LABELS.resolvido_com_manual },
  { value: "resolvido_sem_manual", label: STATUS_LABELS.resolvido_sem_manual },
  { value: "post_mortem",          label: STATUS_LABELS.post_mortem },
  { value: "fechado",              label: STATUS_LABELS.fechado },
];


export function AllTicketsTable({ tickets, agents }: AllTicketsTableProps) {
  const [filter, setFilter] = useState("all");
  const router = useRouter();

  const filteredTickets = tickets.filter((ticket) => {
    if (filter === "all") return true
    return ticket.status === filter
  })

  // O seletor da linha fala em COLUNAS do quadro — as mesmas sete da tela do
  // chamado e do quadro. "Pendência" agrupa três status e por isso pergunta o
  // tipo e o motivo, no mesmo par de diálogos que o quadro usa.
  const [pendencia, setPendencia] = useState<
    { ticketId: string; dbStatus: string; pendencyType: string } | null
  >(null);
  const [subTipoDe, setSubTipoDe] = useState<string | null>(null);

  const gravarStatus = async (ticketId: string, corpo: Record<string, unknown>) => {
    await araraApiFetch(`/api/tickets/${ticketId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    });
    router.refresh();
  };

  const handleColumnChange = async (ticketId: string, columnId: string) => {
    const coluna = COLUNAS_DO_QUADRO.find(c => c.id === columnId);
    if (!coluna) return;
    if (coluna.perguntaSubtipo) {
      setSubTipoDe(ticketId);
      return;
    }
    await gravarStatus(ticketId, { status: coluna.statusPadrao });
  };

  const handleAssignAgent = async (ticketId: string, agentId: string) => {
    await araraApiFetch(`/api/tickets/${ticketId}/assign`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignee_id: agentId === "unassigned" ? null : agentId }),
    });
    router.refresh();
  };

  if (!tickets || tickets.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Todos os Chamados</CardTitle>
          <CardDescription>Nenhum ticket encontrado no sistema</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <>
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Todos os Chamados</CardTitle>
            <CardDescription>
              {filteredTickets.length} ticket{filteredTickets.length !== 1 ? "s" : ""}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => {
                const params = new URLSearchParams();
                if (filter !== 'all') params.set('status', filter);
                window.open(`/api/tickets/pdf?${params.toString()}`, '_blank');
              }}
            >
              <FileText className="h-3.5 w-3.5" />
              Exportar PDF
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => {
                const params = new URLSearchParams();
                if (filter !== 'all') params.set('status', filter);
                window.open(`/api/tickets/export?${params.toString()}`, '_blank');
              }}
            >
              <Download className="h-3.5 w-3.5" />
              Exportar CSV
            </Button>
            <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTER_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Título</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Prioridade</TableHead>
              <TableHead>Atribuído a</TableHead>
              <TableHead>Data</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredTickets.map((ticket) => (
              <TableRow key={ticket.id}>
                <TableCell className="font-medium">
                  {ticket.is_public && (
                    <Building2 className="mr-2 inline-block h-4 w-4 text-sem-info-fg" />
                  )}
                  {ticket.title}
                  {ticket.category && (
                    <Badge variant="outline" className="ml-2 text-xs">
                      {ticket.category}
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  {ticket.is_public ? (
                    <div className="text-sm">
                      <div className="font-medium">{ticket.company_name || "Empresa não informada"}</div>
                      <div className="text-xs text-muted-foreground">{ticket.contact_email}</div>
                      <Badge variant="secondary" className="mt-1 text-xs">Ticket Público</Badge>
                    </div>
                  ) : (
                    <div className="text-sm">
                      <div>{ticket.user?.full_name || "Sem nome"}</div>
                      <div className="text-xs text-muted-foreground">{ticket.user?.email}</div>
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <Select
                    value={getKanbanColumnId(ticket.status)}
                    onValueChange={(value) => handleColumnChange(ticket.id, value)}
                  >
                    <SelectTrigger className="w-[150px]">
                      <Badge
                        variant="outline"
                        className={getStatusColor(ticket.status)}
                      >
                        {getStatusLabel(ticket.status)}
                      </Badge>
                    </SelectTrigger>
                    <SelectContent>
                      {COLUNAS_DO_QUADRO.map(col => (
                        <SelectItem key={col.id} value={col.id}>
                          {col.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <PriorityBadge priority={ticket.priority} />
                </TableCell>
                <TableCell>
                  <Select
                    value={ticket.assigned_to?.id || "unassigned"}
                    onValueChange={(value) => handleAssignAgent(ticket.id, value)}
                  >
                    <SelectTrigger className="w-[180px]">
                      <SelectValue>
                        {ticket.assigned_to?.full_name || "Não atribuído"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Não atribuído</SelectItem>
                      {agents.map((agent) => (
                        <SelectItem key={agent.id} value={agent.id}>
                          {agent.full_name || agent.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <div className="text-sm">
                    {formatDateShort(ticket.created_at)}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/admin/tickets/view/?id=${encodeURIComponent(ticket.id)}`}>
                      <Eye className="h-4 w-4" />
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>

    <PendenciaSubTypeDialog
      open={!!subTipoDe}
      onPick={(selection: PendencySubSelection) => {
        if (!subTipoDe) return;
        setPendencia({ ticketId: subTipoDe, dbStatus: selection.dbStatus, pendencyType: selection.pendencyType });
        setSubTipoDe(null);
      }}
      onCancel={() => setSubTipoDe(null)}
    />

    <PendencyDialog
      open={!!pendencia}
      status={pendencia?.dbStatus ?? ''}
      onConfirm={async (reason: string, followUpDate: string) => {
        if (!pendencia) return;
        await gravarStatus(pendencia.ticketId, {
          status: pendencia.dbStatus,
          pendency_reason: reason,
          pendency_type: pendencia.pendencyType,
          follow_up_date: followUpDate,
        });
        setPendencia(null);
      }}
      onCancel={() => setPendencia(null)}
    />
    </>
  );
}
