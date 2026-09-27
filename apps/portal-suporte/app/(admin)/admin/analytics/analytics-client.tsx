'use client'

import { useState, useEffect, useCallback } from 'react'
import { cn, formatDate, formatDateShort } from '@/lib/utils'
import { RefreshCw, BarChart2, Clock, Tag, Activity, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CategoryWeekRow {
  category: string
  week: string
  count: number
}

interface TypeRow {
  type: string
  count: number
  pct: number
}

interface StatusRow {
  status: string
  count: number
}

interface ResolutionRow {
  category: string
  avg_hours: number
  ticket_count: number
}

interface HeatmapData {
  byCategory: CategoryWeekRow[]
  byType: TypeRow[]
  byStatus: StatusRow[]
  resolutionByCategory: ResolutionRow[]
  period_days: number
  generated_at: string
}

interface RootCauseRow {
  category: string
  label: string
  count: number
  pct: number
}

interface DrillTicket {
  id: string
  ticketNumber: string | null
  title: string
  companyName: string | null
  resolvedAt: string | null
}

interface RootCauseData {
  top10: RootCauseRow[]
  total: number
  period_days: number
  drill: DrillTicket[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function heatColor(count: number): string {
  if (count === 0) return 'bg-muted'
  if (count <= 2) return 'bg-indigo-900/60'
  if (count <= 5) return 'bg-indigo-700/70'
  if (count <= 10) return 'bg-indigo-500/80'
  return 'bg-indigo-400'
}

function heatTextColor(count: number): string {
  if (count === 0) return 'text-transparent'
  if (count <= 2) return 'text-indigo-300'
  if (count <= 5) return 'text-indigo-200'
  return 'text-foreground'
}

function formatWeek(dateStr: string): string {
  return formatDateShort(dateStr + 'T12:00:00Z', { month: 'short', day: 'numeric' })
}

function typeLabel(type: string): string {
  const map: Record<string, string> = {
    bug: 'Bug',
    feature: 'Feature',
    support: 'Suporte',
    outros: 'Outros',
  }
  return map[type] ?? type
}

function typeColor(type: string): string {
  const map: Record<string, string> = {
    bug: 'bg-red-500',
    feature: 'bg-purple-500',
    support: 'bg-blue-500',
    outros: 'bg-muted-foreground/60',
  }
  return map[type] ?? 'bg-indigo-500'
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    novos_chamados: 'Novos',
    triagem: 'Triagem',
    em_atendimento: 'Em atendimento',
    em_teste: 'Em teste',
    aguardando_cliente: 'Ag. cliente',
    resolvido_com_manual: 'Resolvido c/ manual',
    resolvido_sem_manual: 'Resolvido s/ manual',
    post_mortem: 'Post-mortem',
  }
  return map[status] ?? status
}

function statusColor(status: string): string {
  const map: Record<string, string> = {
    novos_chamados: 'bg-blue-500',
    triagem: 'bg-yellow-500',
    em_atendimento: 'bg-orange-500',
    em_teste: 'bg-purple-500',
    aguardando_cliente: 'bg-muted-foreground/60',
    resolvido_com_manual: 'bg-green-500',
    resolvido_sem_manual: 'bg-emerald-500',
    post_mortem: 'bg-red-500',
  }
  return map[status] ?? 'bg-indigo-500'
}

const PERIOD_OPTIONS = [
  { label: '30d', value: 30 },
  { label: '90d', value: 90 },
  { label: '180d', value: 180 },
  { label: '365d', value: 365 },
]

// ─── Heatmap ──────────────────────────────────────────────────────────────────

interface HeatmapProps {
  rows: CategoryWeekRow[]
}

function CategoryHeatmap({ rows }: HeatmapProps) {
  // Build unique sorted weeks and categories
  const weeksSet = new Set<string>()
  const categoriesSet = new Set<string>()
  for (const r of rows) {
    weeksSet.add(r.week)
    categoriesSet.add(r.category)
  }
  const weeks = Array.from(weeksSet).sort()
  const categories = Array.from(categoriesSet)

  // Build lookup: category+week → count
  const lookup: Record<string, number> = {}
  for (const r of rows) {
    lookup[`${r.category}::${r.week}`] = r.count
  }

  // Row totals for sorting
  const rowTotals: Record<string, number> = {}
  for (const cat of categories) {
    rowTotals[cat] = weeks.reduce((sum, w) => sum + (lookup[`${cat}::${w}`] ?? 0), 0)
  }
  const sortedCategories = [...categories].sort((a, b) => rowTotals[b] - rowTotals[a])

  if (weeks.length === 0 || categories.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        Nenhum dado disponível para o período selecionado.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse min-w-max">
        <thead>
          <tr>
            <th className="text-left text-xs text-muted-foreground/70 font-medium pb-2 pr-4 w-40 sticky left-0 bg-card z-10">
              Categoria
            </th>
            {weeks.map((w) => (
              <th key={w} className="text-center text-[10px] text-muted-foreground font-normal pb-2 px-0.5 min-w-[36px]">
                <span className="writing-mode-vertical">{formatWeek(w)}</span>
              </th>
            ))}
            <th className="text-center text-xs text-muted-foreground/70 font-medium pb-2 pl-2 sticky right-0 bg-card z-10">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedCategories.map((cat) => (
            <tr key={cat} className="group">
              <td className="py-0.5 pr-4 sticky left-0 bg-card z-10 group-hover:bg-muted">
                <span
                  className="text-xs text-muted-foreground/50 truncate block max-w-[150px]"
                  title={cat}
                >
                  {cat}
                </span>
              </td>
              {weeks.map((w) => {
                const count = lookup[`${cat}::${w}`] ?? 0
                return (
                  <td key={w} className="py-0.5 px-0.5">
                    <div
                      className={cn(
                        'w-8 h-6 rounded flex items-center justify-center text-[10px] font-semibold transition-colors cursor-default',
                        heatColor(count),
                        heatTextColor(count)
                      )}
                      title={`${cat} — semana ${formatWeek(w)}: ${count} ticket(s)`}
                    >
                      {count > 0 ? count : ''}
                    </div>
                  </td>
                )
              })}
              <td className="py-0.5 pl-2 sticky right-0 bg-card z-10 group-hover:bg-muted">
                <span className="text-xs font-semibold text-indigo-300">{rowTotals[cat]}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Horizontal Bar Chart ──────────────────────────────────────────────────────

interface HBarProps {
  label: string
  value: number
  pct?: number
  maxValue: number
  color: string
  suffix?: string
}

function HBar({ label, value, pct, maxValue, color, suffix = '' }: HBarProps) {
  const barPct = maxValue > 0 ? (value / maxValue) * 100 : 0
  return (
    <div className="flex items-center gap-3 group">
      <div className="w-36 shrink-0 text-right">
        <span className="text-xs text-muted-foreground/50 truncate block" title={label}>
          {label}
        </span>
      </div>
      <div className="flex-1 h-5 bg-muted/40 rounded overflow-hidden">
        <div
          className={cn('h-full rounded transition-all duration-500', color)}
          style={{ width: `${barPct}%` }}
        />
      </div>
      <div className="w-20 shrink-0 text-left">
        <span className="text-xs text-muted-foreground/70">
          {value}{suffix}
          {pct !== undefined && (
            <span className="text-muted-foreground ml-1">({pct}%)</span>
          )}
        </span>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function AnalyticsClient() {
  const [days, setDays] = useState(90)
  const [data, setData] = useState<HeatmapData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [rcData, setRcData] = useState<RootCauseData | null>(null)
  const [rcLoading, setRcLoading] = useState(true)
  const [rcDrill, setRcDrill] = useState<string | null>(null)
  const [rcDrillOpen, setRcDrillOpen] = useState(false)

  const fetchData = useCallback(async (d: number) => {
    setLoading(true)
    setError(null)
    try {
      const { api } = await import('@/lib/api/client')
      const json = await api.get<{ data: HeatmapData }>(`/api/admin/analytics/heatmap?days=${d}`)
      setData(json.data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchRootCause = useCallback(async (d: number, category?: string) => {
    setRcLoading(true)
    try {
      const { api } = await import('@/lib/api/client')
      const url = `/api/admin/root-cause?days=${d}${category ? `&category=${encodeURIComponent(category)}` : ''}`
      const json = await api.get<{ data: RootCauseData }>(url)
      setRcData(json.data)
    } finally {
      setRcLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData(days)
    fetchRootCause(days)
  }, [days, fetchData, fetchRootCause])

  const handleRcDrill = (category: string) => {
    if (rcDrill === category && rcDrillOpen) {
      setRcDrillOpen(false)
      setRcDrill(null)
    } else {
      setRcDrill(category)
      setRcDrillOpen(true)
      fetchRootCause(days, category)
    }
  }

  const maxTypeCount = data ? Math.max(...data.byType.map((r) => r.count), 1) : 1
  const maxStatusCount = data ? Math.max(...data.byStatus.map((r) => r.count), 1) : 1
  const maxResolutionHours = data ? Math.max(...data.resolutionByCategory.map((r) => r.avg_hours), 1) : 1

  return (
    <div className="pt-14 lg:pt-0">
      <div className="px-6 pt-6 pb-2">
        <h1 className="text-2xl font-bold text-foreground">Analytics — Heatmap de Módulos</h1>
        <p className="text-sm text-muted-foreground/70 mt-1">Distribuição de tickets por categoria, tipo e tempo de resolução</p>
      </div>

      <div className="container mx-auto p-6 space-y-8">
        {/* Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 bg-muted/40 rounded-lg p-1">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setDays(opt.value)}
                className={cn(
                  'px-4 py-1.5 rounded-md text-sm font-medium transition-colors',
                  days === opt.value
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-muted-foreground/70 hover:text-foreground hover:bg-muted'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            {data && (
              <span className="text-xs text-muted-foreground">
                Atualizado {formatDate(data.generated_at, { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchData(days)}
              disabled={loading}
              className="border-border bg-background hover:bg-muted text-muted-foreground/50"
            >
              <RefreshCw className={cn('w-3.5 h-3.5 mr-1.5', loading && 'animate-spin')} />
              Atualizar
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-700/50 bg-red-900/20 p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        {loading && !data && (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 rounded-lg bg-muted/40 animate-pulse" />
            ))}
          </div>
        )}

        {data && (
          <>
            {/* ── Category Heatmap ── */}
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <BarChart2 className="w-5 h-5 text-indigo-400" />
                <h2 className="text-lg font-semibold text-foreground">Heatmap por Categoria × Semana</h2>
                <span className="text-xs text-muted-foreground ml-2">últimos {days} dias</span>
              </div>

              {/* Legend */}
              <div className="flex items-center gap-3 text-xs text-muted-foreground/70">
                <span>Intensidade:</span>
                {[
                  { label: '0', color: 'bg-muted' },
                  { label: '1–2', color: 'bg-indigo-900/60' },
                  { label: '3–5', color: 'bg-indigo-700/70' },
                  { label: '6–10', color: 'bg-indigo-500/80' },
                  { label: '11+', color: 'bg-indigo-400' },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-1">
                    <div className={cn('w-4 h-4 rounded', item.color)} />
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-border bg-card p-4">
                <CategoryHeatmap rows={data.byCategory} />
              </div>
            </section>

            {/* ── Type Distribution + Status ── */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {/* Type distribution */}
              <section className="space-y-4">
                <div className="flex items-center gap-2">
                  <Tag className="w-5 h-5 text-purple-400" />
                  <h2 className="text-lg font-semibold text-foreground">Distribuição por Tipo</h2>
                </div>
                <div className="rounded-xl border border-border bg-card p-4 space-y-2.5">
                  {data.byType.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">Sem dados</p>
                  ) : (
                    data.byType.map((row) => (
                      <HBar
                        key={row.type}
                        label={typeLabel(row.type)}
                        value={row.count}
                        pct={row.pct}
                        maxValue={maxTypeCount}
                        color={typeColor(row.type)}
                      />
                    ))
                  )}
                </div>
              </section>

              {/* Status distribution */}
              <section className="space-y-4">
                <div className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-blue-400" />
                  <h2 className="text-lg font-semibold text-foreground">Distribuição por Status</h2>
                </div>
                <div className="rounded-xl border border-border bg-card p-4 space-y-2.5">
                  {data.byStatus.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">Sem dados</p>
                  ) : (
                    data.byStatus.map((row) => (
                      <HBar
                        key={row.status}
                        label={statusLabel(row.status)}
                        value={row.count}
                        maxValue={maxStatusCount}
                        color={statusColor(row.status)}
                      />
                    ))
                  )}
                </div>
              </section>
            </div>

            {/* ── Resolution Time by Category ── */}
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-green-400" />
                <h2 className="text-lg font-semibold text-foreground">Tempo Médio de Resolução por Categoria</h2>
                <span className="text-xs text-muted-foreground ml-2">(mín. 2 tickets resolvidos)</span>
              </div>
              <div className="rounded-xl border border-border bg-card p-4 space-y-2.5">
                {data.resolutionByCategory.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    Nenhuma categoria com tickets resolvidos suficientes no período.
                  </p>
                ) : (
                  data.resolutionByCategory.map((row) => (
                    <HBar
                      key={row.category}
                      label={`${row.category} (${row.ticket_count})`}
                      value={row.avg_hours}
                      maxValue={maxResolutionHours}
                      color="bg-green-600"
                      suffix="h"
                    />
                  ))
                )}
              </div>
            </section>

            {/* ── Root Cause Analytics ── */}
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                <h2 className="text-lg font-semibold text-foreground">Top Causas-Raiz</h2>
                <span className="text-xs text-muted-foreground ml-2">tickets fechados · clique para ver detalhes</span>
              </div>
              <div className="rounded-xl border border-border bg-card p-4 space-y-2">
                {rcLoading ? (
                  <p className="text-sm text-muted-foreground text-center py-6">Carregando...</p>
                ) : !rcData || rcData.top10.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    Nenhum ticket fechado com causa-raiz no período.
                  </p>
                ) : (
                  <>
                    {rcData.top10.map(row => {
                      const isOpen = rcDrill === row.category && rcDrillOpen
                      const barPct = rcData.total > 0 ? (row.count / rcData.top10[0].count) * 100 : 0
                      return (
                        <div key={row.category}>
                          <button
                            className="w-full flex items-center gap-3 group text-left hover:bg-muted rounded px-1 py-0.5"
                            onClick={() => handleRcDrill(row.category)}
                          >
                            <div className="w-44 shrink-0 text-right">
                              <span className="text-xs text-muted-foreground/50 truncate block">{row.label}</span>
                            </div>
                            <div className="flex-1 h-5 bg-muted/40 rounded overflow-hidden">
                              <div className="h-full rounded transition-all duration-500 bg-amber-600/80" style={{ width: `${barPct}%` }} />
                            </div>
                            <div className="w-16 shrink-0 text-left flex items-center gap-1">
                              <span className="text-xs text-muted-foreground/70">{row.count} <span className="text-foreground/60">({row.pct}%)</span></span>
                              {isOpen ? <ChevronUp className="w-3 h-3 text-muted-foreground" /> : <ChevronDown className="w-3 h-3 text-muted-foreground" />}
                            </div>
                          </button>

                          {/* Drill-down tickets */}
                          {isOpen && rcData.drill && rcData.drill.length > 0 && (
                            <div className="mt-1 mb-2 ml-48 rounded border border-border bg-background divide-y divide-border text-xs max-h-48 overflow-y-auto">
                              {rcData.drill.map(t => (
                                <div key={t.id} className="flex items-center gap-2 px-3 py-1.5">
                                  <span className="text-muted-foreground shrink-0">#{t.ticketNumber}</span>
                                  <span className="text-muted-foreground/50 truncate flex-1">{t.title}</span>
                                  {t.companyName && <span className="text-muted-foreground shrink-0">{t.companyName}</span>}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                    <p className="text-xs text-foreground/60 pt-1">Total: {rcData.total} tickets com causa-raiz registrada</p>
                  </>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  )
}
