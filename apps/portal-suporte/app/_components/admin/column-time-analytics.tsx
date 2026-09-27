'use client'

import { useEffect, useState } from 'react'
import { STATUS_LABELS } from '@/lib/ticket-status'
import { adminAnalyticsApi } from '@/lib/api/admin'

interface ColumnStat {
  status: string
  avg_duration_hours: number
  p50_hours: number
  p90_hours: number
  count: number
}

function DurationBar({ hours, maxHours }: { hours: number; maxHours: number }) {
  const pct = maxHours > 0 ? Math.min(100, (hours / maxHours) * 100) : 0
  const color = hours > 48 ? 'bg-red-500' : hours > 24 ? 'bg-amber-500' : hours > 8 ? 'bg-yellow-400' : 'bg-emerald-500'
  return (
    <div className="h-2 w-full rounded-full bg-muted">
      <div className={`h-2 rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
    </div>
  )
}

function fmt(h: number) {
  if (h < 1) return `${Math.round(h * 60)}m`
  if (h < 24) return `${h.toFixed(1)}h`
  return `${(h / 24).toFixed(1)}d`
}

export function ColumnTimeAnalytics() {
  const [stats, setStats] = useState<ColumnStat[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    adminAnalyticsApi.columnTimes()
      .then(d => { setStats((d.data as unknown as ColumnStat[]) ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return <div className="py-6 text-center text-sm text-muted-foreground">Carregando métricas de tempo por coluna…</div>
  if (!stats.length) return <div className="py-6 text-center text-sm text-muted-foreground">Sem dados de histórico de colunas ainda.</div>

  const maxAvg = Math.max(...stats.map(s => s.avg_duration_hours), 1)

  return (
    <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-media)]">
      <h3 className="mb-3 text-sm font-semibold text-foreground/80">⏱ Tempo Médio por Coluna <span className="text-xs font-normal text-muted-foreground">(últimos 30 dias)</span></h3>
      <div className="space-y-3">
        {stats.map(s => (
          <div key={s.status} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-foreground/80">
                {(STATUS_LABELS as Record<string, string>)[s.status] ?? s.status}
              </span>
              <span className="text-muted-foreground">
                avg <span className="font-semibold text-foreground/80">{fmt(s.avg_duration_hours)}</span>
                {' · '}p90 {fmt(s.p90_hours)}
                {' · '}{s.count} tickets
              </span>
            </div>
            <DurationBar hours={s.avg_duration_hours} maxHours={maxAvg} />
          </div>
        ))}
      </div>
      <p className="mt-3 text-[10px] text-muted-foreground">
        🔴 &gt;48h (crítico) · 🟠 24–48h (atenção) · 🟡 8–24h (normal) · 🟢 &lt;8h (rápido)
      </p>
    </div>
  )
}
