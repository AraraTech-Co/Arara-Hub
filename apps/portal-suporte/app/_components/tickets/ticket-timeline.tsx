'use client'

// =============================================================================
// TicketTimeline — Linha do tempo de eventos de um ticket com lazy loading
// ActivityLog paginado (3 por vez). OwnerHistory carregado uma vez e re-merged.
// =============================================================================

import { useEffect, useState, useCallback, useRef } from 'react'
import { Clock, Loader2, History } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { araraApiFetch } from '@/lib/arara/arara-api-fetch'

const BATCH = 3

interface TimelineEvent {
  id:         string
  action:     string
  label:      string
  icon:       string
  details:    unknown
  actor:      { id: string; name: string | null; avatar_url: string | null } | null
  created_at: string
  _kind?:     'activity' | 'handoff'
}

interface OwnerHistoryEntry {
  id:         string
  changed_at: string
  reason:     string | null
  from_user:  { id: string; name: string; email: string } | null
  to_user:    { id: string; name: string; email: string } | null
  changed_by: { id: string; name: string; email: string } | null
}

interface TicketTimelineProps {
  ticketId: string
}

function ownerHistoryToEvent(h: OwnerHistoryEntry): TimelineEvent {
  const fromName = h.from_user?.name ?? 'Ninguém'
  const toName   = h.to_user?.name   ?? 'Ninguém'
  return {
    id:         `oh-${h.id}`,
    action:     'owner_changed',
    label:      `Responsável alterado: ${fromName} → ${toName}`,
    icon:       '🔄',
    details:    h.reason ? { reason: h.reason } : null,
    actor:      h.changed_by
      ? { id: h.changed_by.id, name: h.changed_by.name, avatar_url: null }
      : null,
    created_at: h.changed_at,
    _kind:      'handoff',
  }
}

function mergeDesc(list: TimelineEvent[]): TimelineEvent[] {
  return [...new Map(list.map(e => [e.id, e])).values()]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
}

export function TicketTimeline({ ticketId }: TicketTimelineProps) {
  const ownerEventsRef              = useRef<TimelineEvent[]>([])
  const [events, setEvents]         = useState<TimelineEvent[]>([])
  const [total, setTotal]           = useState(0)
  const [activityLoaded, setActivityLoaded] = useState(0)
  const [loading, setLoading]       = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)

  const load = useCallback(async () => {
    try {
      const [evtRes, ownerRes] = await Promise.all([
        araraApiFetch(`/api/tickets/${ticketId}/events?limit=${BATCH}&skip=0`),
        araraApiFetch(`/api/tickets/${ticketId}/owner-history`),
      ])
      const [evtJson, ownerJson] = await Promise.all([evtRes.json(), ownerRes.json()])

      ownerEventsRef.current = ownerJson.success
        ? (ownerJson.data as OwnerHistoryEntry[]).map(ownerHistoryToEvent)
        : []

      // BaseController.success() wraps as { success, data: { data, total, hasMore } }
      const payload = evtJson.success ? evtJson.data : { data: [], total: 0 }
      const activityEvents: TimelineEvent[] = payload.data ?? []
      setTotal(payload.total ?? 0)
      setActivityLoaded(activityEvents.length)
      setEvents(mergeDesc([...activityEvents, ...ownerEventsRef.current]))
    } finally {
      setLoading(false)
    }
  }, [ticketId])

  useEffect(() => { load() }, [load])

  const loadMore = async () => {
    setLoadingMore(true)
    try {
      const res  = await araraApiFetch(`/api/tickets/${ticketId}/events?limit=${BATCH}&skip=${activityLoaded}`)
      const json = await res.json()
      const newEvents: TimelineEvent[] = json.success ? (json.data?.data ?? []) : []
      if (newEvents.length > 0) {
        setActivityLoaded(prev => prev + newEvents.length)
        setEvents(prev => mergeDesc([...prev, ...newEvents]))
      }
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <div className="rounded-xl bg-card p-5 shadow-[var(--shadow-media)]">
      <div className="flex items-center gap-2 mb-4">
        <History className="h-4 w-4 text-sem-warning-fg" />
        <h2 className="text-sm font-semibold text-foreground/80 uppercase tracking-wide">
          Histórico de Alterações
        </h2>
        {total > 0 && (
          <span className="ml-auto text-xs text-muted-foreground/70">{total} eventos</span>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(n => (
            <div key={n} className="flex gap-3">
              <div className="h-7 w-7 rounded-full bg-muted animate-pulse shrink-0" />
              <div className="flex-1 space-y-1.5 pt-1">
                <div className="h-3 w-32 bg-muted rounded animate-pulse" />
                <div className="h-2.5 w-20 bg-muted rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      ) : events.length === 0 ? (
        <p className="text-sm text-muted-foreground/70 italic text-center py-4">
          Nenhum evento registrado.
        </p>
      ) : (
    <ol className="relative space-y-0">
      {events.map((evt, idx) => {
        const isLast    = idx === events.length - 1 && activityLoaded >= total
        const detail    = buildDetailText(evt)
        const isHandoff = evt._kind === 'handoff'

        return (
          <li key={evt.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm shadow-xs ${
                isHandoff
                  ? 'bg-status-migration border border-status-migration-bd'
                  : 'bg-background border border-border'
              }`}>
                {evt.icon}
              </div>
              {!isLast && <div className="w-px flex-1 bg-muted my-1" />}
            </div>

            <div className={`pb-4 flex-1 min-w-0 ${isHandoff ? 'rounded-md bg-status-migration/50 px-2 py-1 -ml-1 mb-1' : ''}`}>
              <p className={`text-[13px] font-medium leading-tight ${isHandoff ? 'text-status-migration-fg' : 'text-foreground/80'}`}>
                {evt.label}
              </p>
              {detail && (
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{detail}</p>
              )}
              <div className="flex items-center gap-2 mt-1">
                {evt.actor?.name && (
                  <span className="text-[11px] text-muted-foreground/70 font-medium">
                    {evt.actor.name}
                  </span>
                )}
                <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground/50">
                  <Clock className="h-2.5 w-2.5" />
                  {formatDate(evt.created_at)}
                </span>
              </div>
            </div>
          </li>
        )
      })}

      {activityLoaded < total && (
        <li className="flex justify-center pt-1 pb-2">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground/80 disabled:opacity-50 transition-colors"
          >
            {loadingMore ? (
              <><Loader2 className="h-3 w-3 animate-spin" /> Carregando...</>
            ) : (
              <>Ver mais <span className="text-muted-foreground/70">({activityLoaded} de {total})</span></>
            )}
          </button>
        </li>
      )}
    </ol>
      )}
    </div>
  )
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function buildDetailText(evt: TimelineEvent): string | null {
  const d = evt.details as Record<string, unknown> | null
  if (!d) return null

  if (evt.action === 'status_changed') {
    const from = d.from as string | undefined
    const to   = d.to   as string | undefined
    if (from && to) return `${normalizeStatus(from)} → ${normalizeStatus(to)}`
  }

  if (evt.action === 'ticket_assigned' && d.assigned_to) {
    return `Atribuído a: ${d.assigned_to}`
  }

  // Desfecho do aviso por WhatsApp. O servidor grava isto justamente para a
  // falha não ficar invisível — mas até aqui a tela não sabia lê-lo, e o
  // registro existia sem ninguém conseguir ver. Agora diz onde parou.
  if (evt.action === 'acompanhamento_aviso') {
    const dz = (d.desfecho ?? {}) as Record<string, unknown>
    const destino = typeof d.destino === 'string' ? ` · ${d.destino}` : ''
    const etapa = String(dz.etapa ?? '')
    if (etapa === 'sem_numero') return `Não enviado: chamado sem número de WhatsApp${destino}`
    if (etapa === 'sem_token')  return 'Não enviado: whatsapp_token não configurado no cofre do app'
    if (etapa === 'falhou')     return `Falhou: ${String(dz.erro ?? 'erro desconhecido')}${destino}`
    if (etapa === 'enviado') {
      const st = dz.status == null ? '?' : String(dz.status)
      // O provedor responder 200 NÃO é prova de entrega — já nos custou
      // semanas de diagnóstico. Por isso "aceito", e não "entregue".
      return `Aceito pelo provedor (HTTP ${st})${destino}`
    }
    return `Sem desfecho registrado${destino}`
  }

  if (typeof d.message === 'string') return d.message
  if (typeof d.reason  === 'string') return d.reason
  if (typeof d.title   === 'string') return d.title

  return null
}

function normalizeStatus(s: string): string {
  return s.replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}
