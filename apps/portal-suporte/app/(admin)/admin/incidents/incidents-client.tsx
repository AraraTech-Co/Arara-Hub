'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Plus,
  Link2,
  Unlink,
  CheckCircle2,
  Edit2,
} from 'lucide-react'
import { adminIncidentsApi } from '@/lib/api/admin'

// ─── Types ────────────────────────────────────────────────────────────────────

interface IncidentTicket {
  id: string
  ticketNumber: string | null
  title: string
  status: string
  priority: string
  companyName: string | null
  assignee?: { fullName: string | null } | null
}

interface Incident {
  id: string
  title: string
  description: string | null
  status: string
  severity: string | null
  affectedCompanies: string[]
  rootCause: string | null
  resolution: string | null
  startedAt: string | null
  resolvedAt: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
  _count?: { tickets: number }
  tickets?: IncidentTicket[]
}

interface AvailableTicket {
  id: string
  ticketNumber: string | null
  title: string
  status: string
  priority: string
  companyName: string | null
}

// ─── Badge helpers ─────────────────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: string | null }) {
  if (!severity) return null
  const map: Record<string, string> = {
    P0: 'bg-sem-error text-sem-error-fg border-sem-error-bd',
    P1: 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300 border-orange-200 dark:border-orange-700',
    P2: 'bg-sem-warning text-sem-warning-fg border-sem-warning-bd',
    P3: 'bg-sem-info text-sem-info-fg border-sem-info-bd',
  }
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-bold ${map[severity] ?? 'bg-muted text-foreground/80'}`}>
      {severity}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    open: 'bg-sem-error text-sem-error-fg border-sem-error-bd',
    investigating: 'bg-status-waiting text-status-waiting-fg border-status-waiting-bd',
    resolved: 'bg-sem-success text-sem-success-fg border-sem-success-bd',
    closed: 'bg-muted text-foreground/60 border-border',
  }
  const labels: Record<string, string> = {
    open: 'Aberto',
    investigating: 'Investigando',
    resolved: 'Resolvido',
    closed: 'Fechado',
  }
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium ${map[status] ?? 'bg-muted text-foreground/80'}`}>
      {labels[status] ?? status}
    </span>
  )
}

function TicketStatusBadge({ status }: { status: string }) {
  return (
    <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-xs text-foreground/60">
      {status.replace(/_/g, ' ')}
    </span>
  )
}

// ─── Create Incident Dialog ────────────────────────────────────────────────────

function CreateIncidentDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onCreated: (incident: Incident) => void
}) {
  const { toast } = useToast()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [severity, setSeverity] = useState('')
  const [startedAt, setStartedAt] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {
    if (!title.trim()) return
    setLoading(true)
    try {
      const { data } = await adminIncidentsApi.create({
        title,
        description: description || null,
        severity: severity || null,
        started_at: startedAt || null,
      })
      onCreated({ ...data, _count: { tickets: 0 } })
      toast({ title: 'Incidente criado' })
      onOpenChange(false)
      setTitle('')
      setDescription('')
      setSeverity('')
      setStartedAt('')
    } catch {
      toast({ title: 'Erro ao criar incidente', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Criar Incidente</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground/80">Título *</label>
            <Input
              placeholder="Ex: Falha no módulo fiscal para todos os clientes"
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground/80">Descrição</label>
            <Textarea
              placeholder="Descreva o impacto e o contexto do incidente…"
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
            />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-sm font-medium text-foreground/80">Severidade</label>
              <Select value={severity} onValueChange={setSeverity}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="P0">P0 — Crítico</SelectItem>
                  <SelectItem value="P1">P1 — Alta</SelectItem>
                  <SelectItem value="P2">P2 — Média</SelectItem>
                  <SelectItem value="P3">P3 — Baixa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-sm font-medium text-foreground/80">Início</label>
              <Input
                type="datetime-local"
                value={startedAt}
                onChange={e => setStartedAt(e.target.value)}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={loading || !title.trim()}>
            {loading ? 'Criando…' : 'Criar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Edit Incident Dialog ──────────────────────────────────────────────────────

function EditIncidentDialog({
  incident,
  open,
  onOpenChange,
  onUpdated,
}: {
  incident: Incident
  open: boolean
  onOpenChange: (v: boolean) => void
  onUpdated: (incident: Incident) => void
}) {
  const { toast } = useToast()
  const [status, setStatus] = useState(incident.status)
  const [severity, setSeverity] = useState(incident.severity ?? '')
  const [rootCause, setRootCause] = useState(incident.rootCause ?? '')
  const [resolution, setResolution] = useState(incident.resolution ?? '')
  const [resolvedAt, setResolvedAt] = useState(
    incident.resolvedAt ? new Date(incident.resolvedAt).toISOString().slice(0, 16) : ''
  )
  const [loading, setLoading] = useState(false)

  async function handleSave() {
    setLoading(true)
    try {
      const { data } = await adminIncidentsApi.update(incident.id, {
        status,
        severity: severity || null,
        root_cause: rootCause || null,
        resolution: resolution || null,
        resolved_at: resolvedAt || null,
      })
      onUpdated(data)
      toast({ title: 'Incidente atualizado' })
      onOpenChange(false)
    } catch {
      toast({ title: 'Erro ao atualizar incidente', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar Incidente</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-sm font-medium text-foreground/80">Status</label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Aberto</SelectItem>
                  <SelectItem value="investigating">Investigando</SelectItem>
                  <SelectItem value="resolved">Resolvido</SelectItem>
                  <SelectItem value="closed">Fechado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-sm font-medium text-foreground/80">Severidade</label>
              <Select value={severity} onValueChange={setSeverity}>
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="P0">P0 — Crítico</SelectItem>
                  <SelectItem value="P1">P1 — Alta</SelectItem>
                  <SelectItem value="P2">P2 — Média</SelectItem>
                  <SelectItem value="P3">P3 — Baixa</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground/80">Causa raiz</label>
            <Textarea
              placeholder="Descreva a causa raiz identificada…"
              value={rootCause}
              onChange={e => setRootCause(e.target.value)}
              rows={2}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground/80">Resolução</label>
            <Textarea
              placeholder="Como o incidente foi resolvido…"
              value={resolution}
              onChange={e => setResolution(e.target.value)}
              rows={2}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground/80">Data de resolução</label>
            <Input
              type="datetime-local"
              value={resolvedAt}
              onChange={e => setResolvedAt(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? 'Salvando…' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Link Ticket Dialog ────────────────────────────────────────────────────────

function LinkTicketDialog({
  incidentId,
  availableTickets,
  open,
  onOpenChange,
  onLinked,
}: {
  incidentId: string
  availableTickets: AvailableTicket[]
  open: boolean
  onOpenChange: (v: boolean) => void
  onLinked: (ticket: AvailableTicket) => void
}) {
  const { toast } = useToast()
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)

  const filtered = availableTickets.filter(t => {
    const q = search.toLowerCase()
    return (
      t.title.toLowerCase().includes(q) ||
      t.ticketNumber?.toLowerCase().includes(q) ||
      t.companyName?.toLowerCase().includes(q)
    )
  })

  async function handleLink(ticket: AvailableTicket) {
    setLoading(true)
    try {
      await adminIncidentsApi.addTicket(incidentId, ticket.id)
      onLinked(ticket)
      toast({ title: 'Ticket vinculado ao incidente' })
      onOpenChange(false)
    } catch {
      toast({ title: 'Erro ao vincular ticket', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Vincular Ticket ao Incidente</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <Input
            placeholder="Buscar por título, nº ticket, empresa…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <div className="max-h-72 overflow-y-auto space-y-1.5">
            {filtered.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground/70">Nenhum ticket encontrado</p>
            )}
            {filtered.map(t => (
              <div
                key={t.id}
                className="flex items-center justify-between rounded border border-border px-3 py-2 hover:bg-muted/50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{t.title}</p>
                  <p className="text-xs text-muted-foreground/70">
                    {t.ticketNumber ?? t.id.slice(0, 8)} · {t.companyName ?? '—'}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="ml-2 shrink-0 h-7 text-xs"
                  disabled={loading}
                  onClick={() => handleLink(t)}
                >
                  <Link2 className="h-3 w-3 mr-1" />
                  Vincular
                </Button>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Incident Card ─────────────────────────────────────────────────────────────

function IncidentCard({
  incident,
  availableTickets,
  onUpdated,
}: {
  incident: Incident
  availableTickets: AvailableTicket[]
  onUpdated: (incident: Incident) => void
}) {
  const { toast } = useToast()
  const [expanded, setExpanded] = useState(false)
  const [tickets, setTickets] = useState<IncidentTicket[]>(incident.tickets ?? [])
  const [ticketCount, setTicketCount] = useState(incident._count?.tickets ?? 0)
  const [loadingTickets, setLoadingTickets] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)

  async function loadTickets() {
    if (tickets.length > 0) return
    setLoadingTickets(true)
    try {
      const { data } = await adminIncidentsApi.getById(incident.id)
      setTickets((data as unknown as { tickets?: IncidentTicket[] }).tickets ?? [])
    } catch {
      toast({ title: 'Erro ao carregar tickets', variant: 'destructive' })
    } finally {
      setLoadingTickets(false)
    }
  }

  function handleToggle() {
    const next = !expanded
    setExpanded(next)
    if (next && tickets.length === 0) loadTickets()
  }

  async function handleQuickResolve() {
    try {
      const { data } = await adminIncidentsApi.update(incident.id, {
        status: 'resolved',
        resolved_at: new Date().toISOString(),
      })
      onUpdated(data)
      toast({ title: 'Incidente resolvido' })
    } catch {
      toast({ title: 'Erro ao resolver incidente', variant: 'destructive' })
    }
  }

  async function handleUnlink(ticketId: string) {
    try {
      await adminIncidentsApi.removeTicket(incident.id, ticketId)
      setTickets(prev => prev.filter(t => t.id !== ticketId))
      setTicketCount(c => Math.max(0, c - 1))
      toast({ title: 'Ticket desvinculado' })
    } catch {
      toast({ title: 'Erro ao desvincular ticket', variant: 'destructive' })
    }
  }

  function handleLinked(ticket: AvailableTicket) {
    const newTicket: IncidentTicket = {
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      title: ticket.title,
      status: ticket.status,
      priority: ticket.priority,
      companyName: ticket.companyName,
    }
    setTickets(prev => [newTicket, ...prev])
    setTicketCount(c => c + 1)
  }

  const isResolvable = incident.status === 'open' || incident.status === 'investigating'

  return (
    <div className="rounded-xl border border-border bg-background shadow-sm">
      {/* Header */}
      <div className="flex items-start gap-3 p-4">
        <button
          onClick={handleToggle}
          className="mt-0.5 text-muted-foreground/70 hover:text-foreground/80"
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <SeverityBadge severity={incident.severity} />
            <StatusBadge status={incident.status} />
            <span className="text-xs text-muted-foreground/70">{ticketCount} ticket{ticketCount !== 1 ? 's' : ''}</span>
          </div>
          <h3 className="text-sm font-semibold text-foreground truncate">{incident.title}</h3>
          {incident.description && (
            <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{incident.description}</p>
          )}
          {incident.startedAt && (
            <p className="mt-1 text-xs text-muted-foreground/70">
              Início: {formatDate(incident.startedAt)}
              {incident.resolvedAt && (
                <> · Resolvido: {formatDate(incident.resolvedAt)}</>
              )}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {isResolvable && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs text-sem-success-fg border-sem-success-bd hover:bg-sem-success"
              onClick={handleQuickResolve}
            >
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Resolver
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => setLinkOpen(true)}
          >
            <Link2 className="h-3 w-3 mr-1" />
            Vincular
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={() => setEditOpen(true)}
          >
            <Edit2 className="h-3.5 w-3.5 text-muted-foreground/70" />
          </Button>
        </div>
      </div>

      {/* Expanded tickets list */}
      {expanded && (
        <div className="border-t border-border/50 px-4 pb-4 pt-3">
          {loadingTickets ? (
            <p className="text-xs text-muted-foreground/70 py-2">Carregando tickets…</p>
          ) : tickets.length === 0 ? (
            <p className="text-xs text-muted-foreground/70 py-2">Nenhum ticket vinculado ainda.</p>
          ) : (
            <div className="space-y-1.5">
              {tickets.map(t => (
                <div
                  key={t.id}
                  className="flex items-center justify-between rounded bg-muted/50 px-3 py-1.5"
                >
                  <div className="min-w-0">
                    <span className="text-xs font-medium text-foreground/80 mr-1.5">
                      {t.ticketNumber ?? t.id.slice(0, 8)}
                    </span>
                    <span className="text-xs text-foreground/60 truncate">{t.title}</span>
                    {t.companyName && (
                      <span className="ml-1.5 text-xs text-muted-foreground/70">· {t.companyName}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 ml-2 shrink-0">
                    <TicketStatusBadge status={t.status} />
                    <button
                      className="text-muted-foreground/50 hover:text-sem-error-fg"
                      onClick={() => handleUnlink(t.id)}
                      title="Desvincular ticket"
                    >
                      <Unlink className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Edit dialog */}
      <EditIncidentDialog
        incident={incident}
        open={editOpen}
        onOpenChange={setEditOpen}
        onUpdated={updated => {
          onUpdated(updated)
          setEditOpen(false)
        }}
      />

      {/* Link ticket dialog */}
      <LinkTicketDialog
        incidentId={incident.id}
        availableTickets={availableTickets}
        open={linkOpen}
        onOpenChange={setLinkOpen}
        onLinked={handleLinked}
      />
    </div>
  )
}

// ─── Main client component ────────────────────────────────────────────────────

export function IncidentsClient({
  initialIncidents,
  availableTickets,
}: {
  initialIncidents: Incident[]
  availableTickets: AvailableTicket[]
}) {
  const [incidents, setIncidents] = useState<Incident[]>(initialIncidents)
  const [createOpen, setCreateOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')

  function handleUpdated(updated: Incident) {
    setIncidents(prev => prev.map(i => i.id === updated.id ? { ...i, ...updated } : i))
  }

  const filtered = statusFilter === 'all'
    ? incidents
    : incidents.filter(i => i.status === statusFilter)

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Incidentes</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Agrupe múltiplos tickets sob um incidente único quando vários clientes reportam o mesmo problema.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-1.5">
          <Plus className="h-4 w-4" />
          Criar Incidente
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Filtrar:</span>
        <div className="inline-flex rounded-md border border-border overflow-hidden">
          {['all', 'open', 'investigating', 'resolved', 'closed'].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-xs font-medium border-r last:border-r-0 border-border transition-colors ${
                statusFilter === s
                  ? 'bg-background text-foreground'
                  : 'bg-background text-foreground/60 hover:bg-muted/50'
              }`}
            >
              {s === 'all' ? 'Todos' : s === 'open' ? 'Aberto' : s === 'investigating' ? 'Investigando' : s === 'resolved' ? 'Resolvido' : 'Fechado'}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground/70">{filtered.length} incidente{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <AlertTriangle className="h-10 w-10 text-foreground mb-3" />
          <p className="text-muted-foreground font-medium">Nenhum incidente encontrado</p>
          <p className="text-sm text-muted-foreground/70 mt-1">
            Crie um incidente para agrupar tickets relacionados ao mesmo problema.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(incident => (
            <IncidentCard
              key={incident.id}
              incident={incident}
              availableTickets={availableTickets}
              onUpdated={handleUpdated}
            />
          ))}
        </div>
      )}

      {/* Create dialog */}
      <CreateIncidentDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={incident => setIncidents(prev => [incident, ...prev])}
      />
    </div>
  )
}
