'use client'

import { useState } from 'react'
import Link from 'next/link'
import { formatDate } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  FileText, ChevronDown, ChevronUp, ExternalLink,
  Clock, User, AlertTriangle, CheckCircle, Shield,
  List, TrendingUp,
} from 'lucide-react'

// ─── types ───────────────────────────────────────────────────────────────────

interface TimelineEntry {
  time: string
  event: string
}

interface Responsible {
  names: string[]
}

interface PostMortem {
  id: string
  ticketId: string
  createdBy: string
  whatHappened: string
  timeline: TimelineEntry[]
  impact: string
  rootCause: string
  correctiveActions: string
  preventiveActions: string
  responsible: Responsible | null
  createdAt: string
  updatedAt: string
  ticket: {
    id: string
    title: string
    ticketNumber: string
    status: string
  }
  creator: {
    fullName: string | null
    email: string
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function truncate(text: string, max = 120) {
  return text.length <= max ? text : text.slice(0, max).trimEnd() + '…'
}


function statusColor(status: string) {
  const map: Record<string, string> = {
    novos_chamados:           'bg-muted text-foreground/80',
    triagem:                  'bg-sem-warning text-sem-warning-fg',
    em_atendimento:           'bg-sem-info text-sem-info-fg',
    em_teste:                 'bg-status-testing text-status-testing-fg',
    aguardando_cliente:       'bg-status-waiting text-status-waiting-fg',
    resolvido_com_manual:     'bg-sem-success text-sem-success-fg',
    resolvido_sem_manual:     'bg-status-resolved text-status-resolved-fg',
    post_mortem:              'bg-sem-error text-sem-error-fg',
  }
  return map[status] ?? 'bg-muted text-foreground/60'
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    novos_chamados:           'Novo',
    triagem:                  'Triagem',
    em_atendimento:           'Em Atendimento',
    em_teste:                 'Em Teste',
    aguardando_cliente:       'Aguard. Cliente',
    resolvido_com_manual:     'Resolvido c/ Manual',
    resolvido_sem_manual:     'Resolvido s/ Manual',
    post_mortem:              'Post-Mortem',
  }
  return map[status] ?? status
}

// ─── Section component ────────────────────────────────────────────────────────

function Section({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        {icon}
        {label}
      </div>
      <div className="text-sm text-foreground/80 leading-relaxed">{children}</div>
    </div>
  )
}

// ─── PostMortemCard ───────────────────────────────────────────────────────────

function PostMortemCard({ pm }: { pm: PostMortem }) {
  const [expanded, setExpanded] = useState(false)

  const timeline: TimelineEntry[] = Array.isArray(pm.timeline) ? pm.timeline : []
  const responsible: Responsible | null =
    pm.responsible && typeof pm.responsible === 'object' && 'names' in pm.responsible
      ? pm.responsible as Responsible
      : null

  return (
    <Card className="bg-background border border-border shadow-sm overflow-hidden">
      {/* Card header */}
      <div className="p-5">
        <div className="flex items-start gap-4">
          {/* Icon */}
          <div className="flex-shrink-0 mt-0.5 p-2 bg-sem-error rounded-lg">
            <FileText className="w-5 h-5 text-sem-error-fg" />
          </div>

          {/* Main info */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="text-xs font-mono font-semibold text-muted-foreground/70">
                #{pm.ticket.ticketNumber}
              </span>
              <Badge
                variant="outline"
                className={`text-xs px-2 py-0 h-5 ${statusColor(pm.ticket.status)}`}
              >
                {statusLabel(pm.ticket.status)}
              </Badge>
            </div>

            <h3 className="text-base font-semibold text-foreground leading-snug mb-1.5">
              {pm.ticket.title}
            </h3>

            <p className="text-sm text-foreground/60 mb-3 leading-relaxed">
              {truncate(pm.whatHappened)}
            </p>

            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <User className="w-3.5 h-3.5" />
                {pm.creator.fullName || pm.creator.email}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {formatDate(pm.createdAt, { day: '2-digit', month: 'short', year: 'numeric' })}
              </span>
              {timeline.length > 0 && (
                <span className="flex items-center gap-1">
                  <List className="w-3.5 h-3.5" />
                  {timeline.length} eventos na timeline
                </span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex-shrink-0 flex items-center gap-2">
            <Link href={`/admin/kanban?ticket=${pm.ticket.id}`}>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8">
                <ExternalLink className="w-3.5 h-3.5" />
                Ver Ticket
              </Button>
            </Link>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-xs h-8"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? (
                <>
                  <ChevronUp className="w-3.5 h-3.5" />
                  Recolher
                </>
              ) : (
                <>
                  <ChevronDown className="w-3.5 h-3.5" />
                  Expandir
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-border/50 bg-muted/50 px-5 py-5 space-y-5">
          {/* Full what happened */}
          <Section icon={<AlertTriangle className="w-3.5 h-3.5" />} label="O que aconteceu">
            <p className="whitespace-pre-wrap">{pm.whatHappened}</p>
          </Section>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Impact */}
            <Section icon={<TrendingUp className="w-3.5 h-3.5" />} label="Impacto">
              <p className="whitespace-pre-wrap">{pm.impact}</p>
            </Section>

            {/* Root cause */}
            <Section icon={<Shield className="w-3.5 h-3.5" />} label="Causa Raiz">
              <p className="whitespace-pre-wrap">{pm.rootCause}</p>
            </Section>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Corrective actions */}
            <Section icon={<CheckCircle className="w-3.5 h-3.5" />} label="Ações Corretivas">
              <p className="whitespace-pre-wrap">{pm.correctiveActions}</p>
            </Section>

            {/* Preventive actions */}
            <Section icon={<CheckCircle className="w-3.5 h-3.5" />} label="Ações Preventivas">
              <p className="whitespace-pre-wrap">{pm.preventiveActions}</p>
            </Section>
          </div>

          {/* Responsible */}
          {responsible && responsible.names && responsible.names.length > 0 && (
            <Section icon={<User className="w-3.5 h-3.5" />} label="Responsáveis">
              <div className="flex flex-wrap gap-1.5 mt-1">
                {responsible.names.map((name, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">
                    {name}
                  </Badge>
                ))}
              </div>
            </Section>
          )}

          {/* Timeline */}
          {timeline.length > 0 && (
            <Section icon={<Clock className="w-3.5 h-3.5" />} label="Timeline do Incidente">
              <ol className="mt-2 space-y-2 border-l-2 border-border pl-4">
                {timeline.map((entry, i) => (
                  <li key={i} className="relative">
                    <div className="absolute -left-[1.35rem] mt-1 w-2.5 h-2.5 rounded-full bg-blue-500 border-2 border-white" />
                    <span className="inline-block text-xs font-mono font-semibold text-sem-info-fg bg-sem-info px-1.5 py-0.5 rounded mr-2">
                      {entry.time}
                    </span>
                    <span className="text-sm text-foreground/80">{entry.event}</span>
                  </li>
                ))}
              </ol>
            </Section>
          )}
        </div>
      )}
    </Card>
  )
}

// ─── Main client component ────────────────────────────────────────────────────

export function PostMortemsClient({ postMortems }: { postMortems: PostMortem[] }) {
  return (
    <div className="pt-14 lg:pt-0">
      <div className="mx-auto max-w-5xl px-4 pt-6 pb-8 lg:py-8 sm:px-6 lg:px-8 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold text-foreground">Post-Mortems</h1>
              {postMortems.length > 0 && (
                <Badge className="bg-sem-error text-sem-error-fg border-sem-error-bd px-2.5 py-0.5 text-sm font-semibold">
                  {postMortems.length}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Registro de incidentes críticos com análise de causa raiz e plano de ação.
              Post-mortems são criados quando um ticket entra no status{' '}
              <span className="font-medium text-foreground/80">Post-Mortem</span>.
            </p>
          </div>
        </div>

        {/* List */}
        {postMortems.length === 0 ? (
          <Card className="p-12 text-center border-dashed border-2 border-border">
            <FileText className="w-12 h-12 text-muted-foreground/70 mx-auto mb-3" />
            <h3 className="font-semibold text-foreground/80 mb-1">
              Nenhum post-mortem registrado ainda.
            </h3>
            <p className="text-sm text-muted-foreground/70 max-w-sm mx-auto">
              Post-mortems são criados quando um ticket entra no status Post-Mortem.
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {postMortems.map((pm) => (
              <PostMortemCard key={pm.id} pm={pm} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
