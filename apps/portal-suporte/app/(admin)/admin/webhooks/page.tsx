'use client'

import { useState, useEffect, useCallback } from 'react'
import { formatDate } from '@/lib/utils'
import { LoadingBlock } from '@/components/ui/loading-block'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Webhook, Plus, Trash2, Pencil, Loader2,
  CheckCircle2, XCircle, ChevronDown, ChevronUp,
  RefreshCw, Clock, Activity, AlertCircle,
} from 'lucide-react'
import { araraApiFetch } from '@/lib/arara/arara-api-fetch'

// ─── constants ────────────────────────────────────────────────────────────────

const AVAILABLE_EVENTS = [
  'ticket.created',
  'ticket.updated',
  'ticket.assigned',
  'ticket.resolved',
  'message.added',
  'status.changed',
] as const

type EventName = typeof AVAILABLE_EVENTS[number]

// ─── types ────────────────────────────────────────────────────────────────────

interface WebhookItem {
  id: string
  name: string
  url: string
  events: string[]
  secret: string
  active: boolean
  lastTriggeredAt: string | null
  successCount: number
  failureCount: number
  createdBy: string
  createdAt: string
  updatedAt: string
}

interface Delivery {
  id: string
  webhookId: string
  event: string
  payload: unknown
  statusCode: number | null
  response: string | null
  success: boolean
  createdAt: string
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function generateSecret(length = 32) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

function truncateUrl(url: string, max = 55) {
  return url.length > max ? url.slice(0, max) + '…' : url
}


function statusCodeColor(code: number | null) {
  if (code === null) return 'text-muted-foreground bg-muted'
  if (code >= 200 && code < 300) return 'text-sem-success-fg bg-sem-success'
  return 'text-sem-error-fg bg-sem-error'
}

function eventLabel(event: string) {
  const map: Record<string, string> = {
    'ticket.created':  'Ticket Criado',
    'ticket.updated':  'Ticket Atualizado',
    'ticket.assigned': 'Ticket Atribuído',
    'ticket.resolved': 'Ticket Resolvido',
    'message.added':   'Mensagem Adicionada',
    'status.changed':  'Status Alterado',
  }
  return map[event] ?? event
}

// ─── DeliveriesDialog ─────────────────────────────────────────────────────────

function DeliveriesDialog({
  webhook,
  open,
  onClose,
}: {
  webhook: WebhookItem | null
  open: boolean
  onClose: () => void
}) {
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [loading, setLoading] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!webhook) return
    setLoading(true)
    try {
      const res = await araraApiFetch(`/api/webhooks/${webhook.id}/deliveries`)
      if (res.ok) {
        const data = await res.json()
        setDeliveries(Array.isArray(data) ? data : data.data ?? [])
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [webhook])

  useEffect(() => {
    if (open && webhook) load()
    else setDeliveries([])
  }, [open, webhook, load])

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-600" />
            Entregas — {webhook?.name}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-2 pr-1 py-2">
          {loading ? (
            <LoadingBlock size="sm" label="Carregando entregas…" />
          ) : deliveries.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground/70">
              <Activity className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Nenhuma entrega registrada para este webhook.</p>
            </div>
          ) : (
            deliveries.map((d) => {
              const isExpanded = expandedId === d.id
              return (
                <div
                  key={d.id}
                  className="border border-border rounded-lg overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : d.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-background hover:bg-muted/50 transition-colors text-left"
                  >
                    {d.success ? (
                      <CheckCircle2 className="w-4 h-4 text-sem-success-fg flex-shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-sem-error-fg flex-shrink-0" />
                    )}
                    <span className="flex-1 text-sm font-medium text-foreground">
                      {eventLabel(d.event)}
                    </span>
                    {d.statusCode !== null && (
                      <span
                        className={`text-xs font-mono font-semibold px-1.5 py-0.5 rounded ${statusCodeColor(d.statusCode)}`}
                      >
                        {d.statusCode}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground/70 ml-auto">
                      {d.createdAt ? formatDate(d.createdAt) : 'Nunca'}
                    </span>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-muted-foreground/70 ml-2" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-muted-foreground/70 ml-2" />
                    )}
                  </button>
                  {isExpanded && (
                    <div className="border-t border-border/50 bg-muted/50 px-4 py-3 space-y-3">
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">
                          Payload enviado
                        </p>
                        <pre className="text-xs bg-card text-green-400 rounded-md p-3 overflow-x-auto max-h-40">
                          {JSON.stringify(d.payload, null, 2)}
                        </pre>
                      </div>
                      {d.response && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">
                            Resposta recebida
                          </p>
                          <pre className="text-xs bg-background border border-border rounded-md p-3 overflow-x-auto max-h-32 text-foreground/80">
                            {d.response}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>

        <div className="pt-2 border-t border-border/50 flex justify-between items-center">
          <Button variant="ghost" size="sm" onClick={load} className="gap-1.5 text-xs">
            <RefreshCw className="w-3.5 h-3.5" />
            Atualizar
          </Button>
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── WebhookFormDialog ────────────────────────────────────────────────────────

interface WebhookForm {
  name: string
  url: string
  events: string[]
  secret: string
}

const EMPTY_FORM: WebhookForm = {
  name: '',
  url: '',
  events: [],
  secret: '',
}

function WebhookFormDialog({
  open,
  editing,
  onClose,
  onSaved,
}: {
  open: boolean
  editing: WebhookItem | null
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<WebhookForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      if (editing) {
        setForm({
          name: editing.name,
          url: editing.url,
          events: editing.events,
          secret: editing.secret,
        })
      } else {
        setForm({ ...EMPTY_FORM, secret: generateSecret() })
      }
      setError('')
    }
  }, [open, editing])

  const toggleEvent = (event: EventName) => {
    setForm((prev) => ({
      ...prev,
      events: prev.events.includes(event)
        ? prev.events.filter((e) => e !== event)
        : [...prev.events, event],
    }))
  }

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Nome é obrigatório.'); return }
    if (!form.url.trim())  { setError('URL é obrigatória.'); return }
    if (form.events.length === 0) { setError('Selecione ao menos um evento.'); return }
    if (!form.secret.trim()) { setError('Secret é obrigatório.'); return }

    try {
      new URL(form.url)
    } catch {
      setError('URL inválida. Inclua o protocolo (https://).')
      return
    }

    setSaving(true)
    setError('')
    try {
      const url    = editing ? `/api/webhooks/${editing.id}` : '/api/webhooks'
      const method = editing ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'Erro ao salvar webhook.')
      }
      onSaved()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Webhook className="w-5 h-5 text-blue-600" />
            {editing ? 'Editar Webhook' : 'Novo Webhook'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="wh-name">Nome</Label>
            <Input
              id="wh-name"
              placeholder="Ex: Notificação Slack"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              disabled={saving}
            />
          </div>

          {/* URL */}
          <div className="space-y-1.5">
            <Label htmlFor="wh-url">URL de destino</Label>
            <Input
              id="wh-url"
              placeholder="https://hooks.slack.com/services/..."
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              disabled={saving}
            />
          </div>

          {/* Events */}
          <div className="space-y-2">
            <Label>Eventos</Label>
            <div className="grid grid-cols-2 gap-2">
              {AVAILABLE_EVENTS.map((event) => (
                <label
                  key={event}
                  className="flex items-center gap-2 p-2 rounded-md border border-border hover:bg-muted/50 cursor-pointer transition-colors"
                >
                  <Checkbox
                    checked={form.events.includes(event)}
                    onCheckedChange={() => toggleEvent(event)}
                    disabled={saving}
                  />
                  <span className="text-sm text-foreground/80">{eventLabel(event)}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Secret */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="wh-secret">Secret (HMAC)</Label>
              <button
                type="button"
                onClick={() => setForm({ ...form, secret: generateSecret() })}
                className="text-xs text-blue-600 hover:underline"
                disabled={saving}
              >
                Gerar automaticamente
              </button>
            </div>
            <Input
              id="wh-secret"
              value={form.secret}
              onChange={(e) => setForm({ ...form, secret: e.target.value })}
              disabled={saving}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground/70">
              Usado para assinar o payload. Mantenha em segredo.
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-sem-error-fg bg-sem-error border border-sem-error-bd rounded-md px-3 py-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {editing ? 'Salvar alterações' : 'Criar webhook'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── WebhookCard ──────────────────────────────────────────────────────────────

function WebhookCard({
  webhook,
  onEdit,
  onDelete,
  onToggle,
  onViewDeliveries,
}: {
  webhook: WebhookItem
  onEdit: () => void
  onDelete: () => void
  onToggle: () => void
  onViewDeliveries: () => void
}) {
  const [toggling, setToggling] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleToggle = async () => {
    setToggling(true)
    await onToggle()
    setToggling(false)
  }

  const handleDelete = async () => {
    if (!confirm(`Excluir o webhook "${webhook.name}"? Esta ação não pode ser desfeita.`)) return
    setDeleting(true)
    await onDelete()
    setDeleting(false)
  }

  const total = webhook.successCount + webhook.failureCount
  const successRate = total > 0 ? Math.round((webhook.successCount / total) * 100) : null

  return (
    <Card className="bg-card p-5 shadow-[var(--shadow-media)]">
      <div className="flex items-start gap-4">
        {/* Status indicator */}
        <div className={`mt-0.5 flex-shrink-0 p-2 rounded-lg ${webhook.active ? 'bg-sem-success' : 'bg-muted'}`}>
          <Webhook className={`w-5 h-5 ${webhook.active ? 'text-sem-success-fg' : 'text-muted-foreground/70'}`} />
        </div>

        {/* Main info */}
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-foreground">{webhook.name}</h3>
            {webhook.active ? (
              <Badge className="bg-sem-success text-sem-success-fg border-sem-success-bd text-xs h-5">
                Ativo
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground text-xs h-5">
                Inativo
              </Badge>
            )}
          </div>

          <p className="text-sm text-muted-foreground font-mono break-all">
            {truncateUrl(webhook.url)}
          </p>

          {/* Events */}
          <div className="flex flex-wrap gap-1.5">
            {webhook.events.map((ev) => (
              <Badge
                key={ev}
                variant="outline"
                className="text-xs px-2 py-0 h-5 bg-sem-info text-sem-info-fg border-sem-info-bd"
              >
                {ev}
              </Badge>
            ))}
          </div>

          {/* Stats */}
          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
              {webhook.successCount} sucesso{webhook.successCount !== 1 ? 's' : ''}
            </span>
            <span className="flex items-center gap-1">
              <XCircle className="w-3.5 h-3.5 text-red-400" />
              {webhook.failureCount} falha{webhook.failureCount !== 1 ? 's' : ''}
            </span>
            {successRate !== null && (
              <span className={`font-medium ${successRate >= 90 ? 'text-sem-success-fg' : successRate >= 70 ? 'text-yellow-600' : 'text-sem-error-fg'}`}>
                {successRate}% taxa de sucesso
              </span>
            )}
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              Último disparo: {webhook.lastTriggeredAt ? formatDate(webhook.lastTriggeredAt) : 'Nunca'}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex-shrink-0 flex flex-col items-end gap-3">
          {/* Active toggle */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{webhook.active ? 'Ativo' : 'Inativo'}</span>
            <Switch
              checked={webhook.active}
              onCheckedChange={handleToggle}
              disabled={toggling}
            />
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs h-8"
              onClick={onViewDeliveries}
            >
              <Activity className="w-3.5 h-3.5" />
              Entregas
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs h-8"
              onClick={onEdit}
            >
              <Pencil className="w-3.5 h-3.5" />
              Editar
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs h-8 text-sem-error-fg hover:text-sem-error-fg hover:bg-sem-error border-sem-error-bd"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Trash2 className="w-3.5 h-3.5" />
              )}
              Excluir
            </Button>
          </div>
        </div>
      </div>
    </Card>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function WebhooksPage() {
  const [webhooks, setWebhooks] = useState<WebhookItem[]>([])
  const [loading, setLoading] = useState(true)

  // Form dialog
  const [formOpen, setFormOpen] = useState(false)
  const [editingWebhook, setEditingWebhook] = useState<WebhookItem | null>(null)

  // Deliveries dialog
  const [deliveriesOpen, setDeliveriesOpen] = useState(false)
  const [deliveriesWebhook, setDeliveriesWebhook] = useState<WebhookItem | null>(null)

  const loadWebhooks = useCallback(async () => {
    try {
      const res = await araraApiFetch('/api/webhooks')
      if (res.ok) {
        const data = await res.json()
        setWebhooks(Array.isArray(data) ? data : data.data ?? [])
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadWebhooks() }, [loadWebhooks])

  const handleDelete = async (id: string) => {
    try {
      await araraApiFetch(`/api/webhooks/${id}`, { method: 'DELETE' })
      setWebhooks((prev) => prev.filter((w) => w.id !== id))
    } catch {
      // silent
    }
  }

  const handleToggle = async (webhook: WebhookItem) => {
    try {
      const res = await araraApiFetch(`/api/webhooks/${webhook.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !webhook.active }),
      })
      if (res.ok) {
        setWebhooks((prev) =>
          prev.map((w) => (w.id === webhook.id ? { ...w, active: !w.active } : w))
        )
      }
    } catch {
      // silent
    }
  }

  const openCreate = () => {
    setEditingWebhook(null)
    setFormOpen(true)
  }

  const openEdit = (webhook: WebhookItem) => {
    setEditingWebhook(webhook)
    setFormOpen(true)
  }

  const openDeliveries = (webhook: WebhookItem) => {
    setDeliveriesWebhook(webhook)
    setDeliveriesOpen(true)
  }

  const handleSaved = () => {
    setFormOpen(false)
    setEditingWebhook(null)
    loadWebhooks()
  }

  const activeCount   = webhooks.filter((w) => w.active).length
  const inactiveCount = webhooks.filter((w) => !w.active).length

  return (
    <div className="pt-14 lg:pt-0">
      <div className="mx-auto max-w-5xl px-4 pt-6 pb-8 lg:py-8 sm:px-6 lg:px-8 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold text-foreground">Webhooks</h1>
              {webhooks.length > 0 && (
                <Badge className="bg-sem-info text-sem-info-fg border-sem-info-bd px-2.5 py-0.5 text-sm font-semibold">
                  {webhooks.length}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground max-w-xl">
              Configure endpoints externos para receber notificações em tempo real quando eventos
              acontecerem no portal. Webhooks enviam requisições HTTP POST com payload JSON assinado.
            </p>
          </div>
          <Button onClick={openCreate} className="gap-2 flex-shrink-0">
            <Plus className="w-4 h-4" />
            Novo Webhook
          </Button>
        </div>

        {/* Stats bar */}
        {webhooks.length > 0 && (
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
              {activeCount} ativo{activeCount !== 1 ? 's' : ''}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-muted inline-block" />
              {inactiveCount} inativo{inactiveCount !== 1 ? 's' : ''}
            </span>
          </div>
        )}

        {/* Content */}
        {loading ? (
          <LoadingBlock size="lg" label="Carregando webhooks…" />
        ) : webhooks.length === 0 ? (
          <Card className="p-12 text-center border-dashed border-2 border-border">
            <Webhook className="w-12 h-12 text-muted mx-auto mb-3" />
            <h3 className="font-semibold text-foreground/80 mb-1">Nenhum webhook configurado</h3>
            <p className="text-sm text-muted-foreground/70 max-w-sm mx-auto mb-5">
              Webhooks permitem que sistemas externos recebam notificações automáticas sobre
              eventos do portal, como novos tickets ou mudanças de status.
            </p>
            <Button onClick={openCreate} className="gap-2">
              <Plus className="w-4 h-4" />
              Configurar primeiro webhook
            </Button>
          </Card>
        ) : (
          <div className="space-y-3">
            {webhooks.map((webhook) => (
              <WebhookCard
                key={webhook.id}
                webhook={webhook}
                onEdit={() => openEdit(webhook)}
                onDelete={() => handleDelete(webhook.id)}
                onToggle={() => handleToggle(webhook)}
                onViewDeliveries={() => openDeliveries(webhook)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Form dialog */}
      <WebhookFormDialog
        open={formOpen}
        editing={editingWebhook}
        onClose={() => { setFormOpen(false); setEditingWebhook(null) }}
        onSaved={handleSaved}
      />

      {/* Deliveries dialog */}
      <DeliveriesDialog
        webhook={deliveriesWebhook}
        open={deliveriesOpen}
        onClose={() => { setDeliveriesOpen(false); setDeliveriesWebhook(null) }}
      />
    </div>
  )
}
