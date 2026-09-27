'use client'

import { useEffect, useState, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn, formatDate } from '@/lib/utils'
import { EmptyState } from '@/components/ui/empty-state'
import { araraApiFetch } from '@/lib/arara/arara-api-fetch'

interface AuditEntry {
  id: string
  action: string
  createdAt: string
  details: Record<string, unknown> | null
  user: { id: string; fullName: string | null; email: string } | null
  ticket: { id: string; ticketNumber: string | null; title: string } | null
}

interface AuditMeta {
  total: number
  page: number
  pageSize: number
  totalPages: number
}

const ACTION_OPTIONS = [
  { value: '_all',                    label: 'Todas as ações' },
  { value: 'ticket_created',          label: 'Ticket criado' },
  { value: 'ticket_updated',          label: 'Ticket atualizado' },
  { value: 'status_changed',          label: 'Status alterado' },
  { value: 'ticket_assigned',         label: 'Ticket atribuído' },
  { value: 'message_added',           label: 'Mensagem adicionada' },
  { value: 'ticket_resolved',         label: 'Ticket resolvido' },
  { value: 'impersonation_started',   label: 'Impersonação iniciada' },
  { value: 'impersonation_ended',     label: 'Impersonação encerrada' },
  { value: 'sla_escalated',           label: 'SLA escalado' },
  { value: 'sla_breached',            label: 'SLA violado' },
]

function ActionBadge({ action }: { action: string }) {
  const color =
    action.includes('impersonat')  ? 'bg-sem-error text-sem-error-fg'     :
    action.includes('sla')         ? 'bg-sem-warning text-sem-warning-fg'  :
    action.includes('resolved')    ? 'bg-sem-success text-sem-success-fg' :
    action.includes('created')     ? 'bg-sem-info text-sem-info-fg'   :
    'bg-muted text-foreground/60'

  return (
    <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', color)}>
      {action.replace(/_/g, ' ')}
    </span>
  )
}

export function AuditLogViewer() {
  const [entries, setEntries]   = useState<AuditEntry[]>([])
  const [meta, setMeta]         = useState<AuditMeta | null>(null)
  const [loading, setLoading]   = useState(false)
  const [page, setPage]         = useState(1)
  const [filters, setFilters]   = useState({
    action: '_all',
    since:  '',
    until:  '',
    search: '',
  })

  const pageSize = 50

  const load = useCallback(async (p: number, f: typeof filters) => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(p), pageSize: String(pageSize) })
    if (f.action && f.action !== '_all') params.set('action', f.action)
    if (f.since)  params.set('since', f.since)
    if (f.until)  params.set('until', f.until)
    try {
      const res  = await araraApiFetch(`/api/admin/audit?${params}`)
      const data = await res.json()
      setEntries(data.data  ?? [])
      setMeta(data.meta ?? null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(page, filters) }, [page, filters, load])

  const displayed = filters.search
    ? entries.filter(e =>
        e.user?.fullName?.toLowerCase().includes(filters.search.toLowerCase()) ||
        e.ticket?.title?.toLowerCase().includes(filters.search.toLowerCase()) ||
        e.action.includes(filters.search.toLowerCase())
      )
    : entries

  const totalPages = meta?.totalPages ?? 1
  const total      = meta?.total      ?? 0

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Buscar por ator ou ação…"
          className="h-8 w-56 text-sm"
          value={filters.search}
          onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
        />

        <Select
          value={filters.action}
          onValueChange={v => { setPage(1); setFilters(f => ({ ...f, action: v })) }}
        >
          <SelectTrigger className="h-8 w-48 text-sm">
            <SelectValue placeholder="Ação" />
          </SelectTrigger>
          <SelectContent>
            {ACTION_OPTIONS.map(o => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          type="date"
          className="h-8 w-36 text-sm"
          value={filters.since}
          onChange={e => { setPage(1); setFilters(f => ({ ...f, since: e.target.value })) }}
        />
        <Input
          type="date"
          className="h-8 w-36 text-sm"
          value={filters.until}
          onChange={e => { setPage(1); setFilters(f => ({ ...f, until: e.target.value })) }}
        />

        <Button
          variant="ghost"
          size="sm"
          className="h-8"
          onClick={() => {
            setPage(1)
            setFilters({ action: '_all', since: '', until: '', search: '' })
          }}
        >
          Limpar
        </Button>
      </div>

      <div className="text-xs text-muted-foreground">
        {total.toLocaleString('pt-BR')} entradas encontradas
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground uppercase tracking-wide">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Data/Hora</th>
              <th className="px-4 py-2 text-left font-medium">Ator</th>
              <th className="px-4 py-2 text-left font-medium">Ação</th>
              <th className="px-4 py-2 text-left font-medium">Ticket</th>
              <th className="px-4 py-2 text-left font-medium">Detalhes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {loading && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-muted-foreground">
                  Carregando…
                </td>
              </tr>
            )}
            {!loading && displayed.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <EmptyState
                    icon="🔍"
                    title="Nenhuma entrada encontrada"
                    description="Ajuste os filtros para encontrar registros."
                    size="sm"
                  />
                </td>
              </tr>
            )}
            {!loading && displayed.map(e => (
              <tr key={e.id} className="hover:bg-muted/50">
                <td className="px-4 py-2 text-[11px] text-muted-foreground whitespace-nowrap">
                  {formatDate(e.createdAt)}
                </td>
                <td className="px-4 py-2">
                  <div className="font-medium text-foreground/80 text-xs">
                    {e.user?.fullName ?? '—'}
                  </div>
                  <div className="text-[10px] text-muted-foreground">{e.user?.email}</div>
                </td>
                <td className="px-4 py-2">
                  <ActionBadge action={e.action} />
                </td>
                <td className="px-4 py-2 text-xs text-foreground/60">
                  {e.ticket ? (
                    <a
                      href={`/admin/tickets/view/?id=${encodeURIComponent(e.ticket.id)}`}
                      className="hover:underline"
                    >
                      {e.ticket.ticketNumber ? `#${e.ticket.ticketNumber} — ` : ''}
                      {e.ticket.title.substring(0, 40)}
                    </a>
                  ) : '—'}
                </td>
                <td className="px-4 py-2 text-[10px] text-muted-foreground max-w-[200px] truncate">
                  {e.details ? JSON.stringify(e.details).substring(0, 80) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => setPage(p => p - 1)}
        >
          Anterior
        </Button>
        <span className="text-xs text-muted-foreground">
          Página {page} de {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => setPage(p => p + 1)}
        >
          Próxima
        </Button>
      </div>
    </div>
  )
}
