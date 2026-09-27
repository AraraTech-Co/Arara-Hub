"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/_components/ui/status-badge";
import { PriorityBadge } from "@/_components/ui/priority-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  ExternalLink,
  CheckCircle,
  Archive,
  Building2,
  Mail,
  Hash,
} from "lucide-react";
import Link from "next/link";
import { formatDateShort } from "@/lib/utils";
import { araraApiFetch } from '@/lib/arara/arara-api-fetch'

interface Ticket {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  category: string | null;
  company_name: string | null;
  company_cnpj: string | null;
  contact_email: string | null;
  ticket_number: string | null;
  created_at: string;
  assignee: { id: string; full_name: string | null } | null;
}

interface Agent {
  id: string;
  full_name: string | null;
  email: string;
}

interface Stats {
  total: number;
  novo: number;
  em_andamento: number;
  resolvido: number;
}

interface PublicTicketsTableProps {
  tickets: Ticket[];
  agents: Agent[];
  stats: Stats;
}


const isNew = (status: string) =>
  status === "novos_chamados" || status === "triagem";

const isResolved = (status: string) =>
  ["resolvido_com_manual", "resolvido_sem_manual", "post_mortem"].includes(status);

export function PublicTicketsTable({ tickets, agents, stats }: PublicTicketsTableProps) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const patchStatus = async (ticketId: string, status: string) => {
    setLoadingId(ticketId);
    try {
      await araraApiFetch(`/api/tickets/${ticketId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      router.refresh();
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground hover:text-foreground">
            <Link href="/admin">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar ao Painel
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Tickets Públicos</h1>
            <p className="text-sm text-muted-foreground">Chamados enviados pelo portal público (sem login)</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total</p>
            <p className="mt-1 text-3xl font-bold text-foreground">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Novos</p>
            <p className="mt-1 text-3xl font-bold text-sem-warning-fg">{stats.novo}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Em Andamento</p>
            <p className="mt-1 text-3xl font-bold text-yellow-600">{stats.em_andamento}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Resolvidos</p>
            <p className="mt-1 text-3xl font-bold text-green-600">{stats.resolvido}</p>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      {tickets.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Building2 className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">Nenhum ticket público encontrado.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Ticket</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Prioridade</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tickets.map((ticket) => (
                  <TableRow key={ticket.id}>
                    <TableCell>
                      <div className="flex items-start gap-2">
                        <Building2 className="mt-0.5 h-4 w-4 text-blue-400 shrink-0" />
                        <div>
                          <p className="font-medium text-foreground text-sm">
                            {ticket.company_name || "Não informada"}
                          </p>
                          {ticket.company_cnpj && (
                            <p className="text-xs text-muted-foreground">CNPJ: {ticket.company_cnpj}</p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        {ticket.ticket_number && (
                          <div className="flex items-center gap-1 mb-0.5">
                            <Hash className="h-3 w-3 text-muted-foreground" />
                            <span className="font-mono text-xs text-muted-foreground">{ticket.ticket_number}</span>
                          </div>
                        )}
                        <p className="text-sm font-medium text-foreground leading-tight line-clamp-2">
                          {ticket.title}
                        </p>
                        {ticket.category && (
                          <Badge variant="outline" className="mt-1 text-xs">
                            {ticket.category}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {ticket.contact_email && (
                        <div className="flex items-center gap-1">
                          <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-sm text-foreground/60 break-all">{ticket.contact_email}</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={ticket.status} />
                    </TableCell>
                    <TableCell>
                      <PriorityBadge priority={ticket.priority} />
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-foreground/60">
                        {ticket.assignee?.full_name ?? (
                          <span className="text-muted-foreground italic">Sem responsável</span>
                        )}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {formatDateShort(ticket.created_at)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {/* Ver detalhes */}
                        <Button asChild variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                          <Link href={`/admin/tickets/view/?id=${encodeURIComponent(ticket.id)}`} title="Ver detalhes">
                            <ExternalLink className="h-4 w-4" />
                          </Link>
                        </Button>

                        {/* Iniciar atendimento (só se novo/triagem) */}
                        {isNew(ticket.status) && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-yellow-600 hover:text-yellow-700 hover:bg-yellow-50"
                            title="Iniciar atendimento"
                            disabled={loadingId === ticket.id}
                            onClick={() => patchStatus(ticket.id, "em_atendimento")}
                          >
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                        )}

                        {/* Arquivar (se ainda não resolvido) */}
                        {!isResolved(ticket.status) && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground/80 hover:bg-muted"
                            title="Resolver sem manual"
                            disabled={loadingId === ticket.id}
                            onClick={() => patchStatus(ticket.id, "resolvido_sem_manual")}
                          >
                            <Archive className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
