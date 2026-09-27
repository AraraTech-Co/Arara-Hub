"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useTicketSearch } from "@/hooks/use-ticket-search"
import { Badge } from "@/components/ui/badge"
import { StatusBadge } from "@/_components/ui/status-badge"
import { PriorityBadge } from "@/_components/ui/priority-badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Eye, User, Clock, MessageCircle, ChevronLeft, ChevronRight, Search, X } from "lucide-react"
import Link from "next/link"
import { formatDateShort } from "@/lib/utils"

interface TicketItem {
  id: string
  title: string
  description: string
  status: string
  priority: string
  category: string | null
  created_at: string
  support_replies?: number
  total_messages?: number
  assigned_to: {
    full_name: string | null
    email: string
  } | null
}

interface TicketListProps {
  tickets: TicketItem[]
  page?: number
  totalPages?: number
  total?: number
  currentQ?: string
  currentStatus?: string
}

const statusFilterOptions = [
  { value: "", label: "Todos" },
  { value: "ativos", label: "Novos/Triagem" },
  { value: "andamento", label: "Em Andamento" },
  { value: "resolvidos", label: "Resolvidos" },
]


export function TicketList({ tickets, page = 1, totalPages = 1, total, currentQ = "", currentStatus = "" }: TicketListProps) {
  const { handleSearchInput, handleStatusFilter, buildUrl, searchTimerRef } = useTicketSearch()

  const isEmpty = !tickets || tickets.length === 0

  return (
    <Card className="animate-fade-in border-border">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-2xl">Meus Tickets</CardTitle>
            <CardDescription className="mt-1">
              {total ?? tickets.length} ticket{(total ?? tickets.length) !== 1 ? "s" : ""} no total
            </CardDescription>
          </div>
        </div>

        {/* Search and Filter Controls */}
        <div className="mt-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
            <Input
              placeholder="Buscar tickets por título ou descrição..."
              defaultValue={currentQ}
              onChange={(e) => handleSearchInput(e.target.value)}
              className="pl-9 pr-9"
            />
            {currentQ && (
              <button
                onClick={() => handleSearchInput("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/70 hover:text-foreground/60"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {statusFilterOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleStatusFilter(opt.value)}
                className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                  currentStatus === opt.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground/60 hover:bg-muted"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isEmpty ? (
          <div className="py-12 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <Search className="h-7 w-7 text-muted-foreground/70" />
            </div>
            <p className="font-medium text-foreground/80">
              {currentQ || currentStatus ? "Nenhum ticket encontrado" : "Nenhum ticket ainda"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {currentQ || currentStatus
                ? "Tente ajustar os filtros de busca"
                : "Crie seu primeiro ticket para começar a receber suporte"}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {tickets.map((ticket, index) => (
              <div
                key={ticket.id}
                className="group flex items-start justify-between rounded-xl bg-card p-5 transition-all duration-200 animate-fade-in shadow-[var(--shadow-media)] hover:shadow-[var(--shadow-alta)]"
                style={{ animationDelay: `${index * 30}ms` }}
              >
                <div className="flex-1 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="flex-1">
                      <h3 className="font-semibold text-foreground text-lg group-hover:text-primary transition-colors">
                        {ticket.title}
                      </h3>
                      <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-foreground/60">{ticket.description}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={ticket.status} />
                    <PriorityBadge priority={ticket.priority} />
                    {ticket.category && (
                      <Badge variant="outline" className="border-border text-foreground/80">
                        {ticket.category}
                      </Badge>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                    {ticket.assigned_to && (
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {ticket.assigned_to.full_name || ticket.assigned_to.email}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDateShort(ticket.created_at, { day: "2-digit", month: "short", year: "numeric" })}
                    </span>
                  </div>
                </div>

                <div className="ml-4 flex shrink-0 flex-col items-end gap-2">
                  {(ticket.support_replies ?? 0) > 0 && (
                    <span className="flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
                      <MessageCircle className="h-3 w-3" />
                      {ticket.support_replies} resposta{(ticket.support_replies ?? 0) !== 1 ? 's' : ''}
                    </span>
                  )}
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="transition-all group-hover:bg-primary group-hover:text-primary-foreground group-hover:border-primary bg-transparent"
                  >
                    <Link href={`/dashboard/tickets/_/?id=${encodeURIComponent(ticket.id)}`}>
                      <Eye className="mr-2 h-4 w-4 transition-transform group-hover:scale-110" />
                      Ver Detalhes
                    </Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Paginação */}
        {totalPages > 1 && (
          <div className="mt-6 flex items-center justify-between border-t border-border/50 pt-4">
            <p className="text-sm text-muted-foreground">
              Página {page} de {totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                asChild={page > 1}
                variant="outline"
                size="sm"
                disabled={page <= 1}
              >
                {page > 1 ? (
                  <Link href={buildUrl({ page: String(page - 1) })}>
                    <ChevronLeft className="mr-1 h-4 w-4" />
                    Anterior
                  </Link>
                ) : (
                  <span><ChevronLeft className="mr-1 h-4 w-4 inline" />Anterior</span>
                )}
              </Button>
              <Button
                asChild={page < totalPages}
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
              >
                {page < totalPages ? (
                  <Link href={buildUrl({ page: String(page + 1) })}>
                    Próxima
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Link>
                ) : (
                  <span>Próxima<ChevronRight className="ml-1 h-4 w-4 inline" /></span>
                )}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
