import React, { Fragment, useMemo, useState } from "react";
import { Card, Table, Message, Button } from "@/components/lib";
import { useAPITyped } from "@/hooks/useAPITyped";
import type { TicketListResponse } from "@/types/tickets";
import {
  TICKET_PRIORITY_OPTIONS,
  TICKET_STATUS_OPTIONS,
} from "@/types/tickets";

function formatDate(iso: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("pt-BR");
}

function buildTicketsUrl(filters: {
  status: string;
  priority: string;
  page: number;
}): string {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.priority) params.set("priority", filters.priority);
  if (filters.page > 1) params.set("page", String(filters.page));
  const qs = params.toString();
  return qs ? `/api/tickets?${qs}` : "/api/tickets";
}

export function Tickets() {
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [page, setPage] = useState(1);

  const url = useMemo(
    () => buildTicketsUrl({ status, priority, page }),
    [status, priority, page],
  );

  const tickets = useAPITyped<TicketListResponse>(url);

  const rows =
    tickets.data?.data?.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status_label || t.status,
      priority: t.priority,
      sla: t.sla_breached ? "SLA estourado" : "",
      created_at: formatDate(t.created_at),
      actions: {
        view: { url: "/tickets", col: "id" },
      },
    })) ?? [];

  const meta = tickets.data?.meta;
  const hasPrev = meta && meta.page > 1;
  const hasNext = meta && meta.page < meta.total_pages;

  function resetFilters() {
    setStatus("");
    setPriority("");
    setPage(1);
  }

  return (
    <Fragment>
      <Message
        title="Chamados de Suporte"
        type="info"
        text="Lista de chamados abertos no portal de suporte. Os dados são consultados em tempo real e não são armazenados localmente."
      />

      <Card title="Filtros" restrictWidth>
        <div className="flex flex-wrap gap-4 items-end">
          <div className="min-w-[200px]">
            <label className="block text-sm text-slate-600 mb-1" htmlFor="ticket-status">
              Status
            </label>
            <select
              id="ticket-status"
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Todos</option>
              {TICKET_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[200px]">
            <label className="block text-sm text-slate-600 mb-1" htmlFor="ticket-priority">
              Prioridade
            </label>
            <select
              id="ticket-priority"
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
              value={priority}
              onChange={(e) => {
                setPriority(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Todas</option>
              {TICKET_PRIORITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <Button text="Limpar filtros" action={resetFilters} />
        </div>
      </Card>

      <Card title="Chamados" restrictWidth>
        <Table
          search
          loading={tickets.loading}
          data={rows}
          badge={{
            col: "status",
            color: "blue",
          }}
          show={["title", "status", "priority", "sla", "created_at", "actions"]}
        />
      </Card>

      {meta && (
        <div className="flex items-center justify-between mt-4 text-sm text-slate-500">
          <span>
            Página {meta.page} de {meta.total_pages} — {meta.total} chamado(s)
          </span>
          <div className="flex gap-2">
            {hasPrev && (
              <Button
                text="Anterior"
                action={() => setPage((p) => Math.max(1, p - 1))}
              />
            )}
            {hasNext && (
              <Button
                text="Próxima"
                action={() => setPage((p) => p + 1)}
              />
            )}
          </div>
        </div>
      )}
    </Fragment>
  );
}
