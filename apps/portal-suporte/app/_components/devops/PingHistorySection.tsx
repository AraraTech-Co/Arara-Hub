'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'
import { Activity, AlertTriangle, Server, TrendingDown } from 'lucide-react'
import { araraApiFetch } from '@/lib/arara/arara-api-fetch'

// ─── types ────────────────────────────────────────────────────────────────────

type Severity = 'critico' | 'alto' | 'moderado' | 'saudavel'

type ServerStat = {
  id:           string
  nome:         string
  host:         string
  avgLatency:   number | null
  offlineCount: number
  totalCount:   number
  uptime:       number
  severity:     Severity
}

type HistoryData = {
  servers: ServerStat[]
  summary: {
    totalServers: number
    avgUptime:    number
    criticalCount: number
    totalQuedas:  number
  }
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function latencyColor(ms: number): string {
  if (ms > 200) return '#ef4444'
  if (ms > 100) return '#f59e0b'
  return '#3b82f6'
}

function severityColor(s: Severity): string {
  if (s === 'critico')  return '#ef4444'
  if (s === 'alto')     return '#f59e0b'
  if (s === 'moderado') return '#3b82f6'
  return '#10b981'
}

function severityLabel(s: Severity): string {
  if (s === 'critico')  return 'Crítico'
  if (s === 'alto')     return 'Alto'
  if (s === 'moderado') return 'Moderado'
  return 'Saudável'
}

// ─── custom tooltip ───────────────────────────────────────────────────────────

function BarTooltip({ active, payload }: { active?: boolean; payload?: { payload: ServerStat }[] }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-devops-surface border border-devops-border rounded-lg px-3 py-2.5 text-xs shadow-xl">
      <p className="font-semibold text-devops-foreground mb-1.5">{d.nome}</p>
      <p className="text-muted-foreground/70">
        Latência média: <span className="font-bold text-white">{d.avgLatency}ms</span>
      </p>
    </div>
  )
}

// ─── skeleton ─────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={`bg-devops-panel/60 animate-pulse rounded ${className}`} />
}

// ─── component ────────────────────────────────────────────────────────────────

export default function PingHistorySection() {
  const [data,    setData]    = useState<HistoryData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchHistory = useCallback(async () => {
    try {
      const res  = await araraApiFetch('/api/devops/ping-log?period=24h')
      const json = await res.json()
      if (res.ok && json.success) setData(json.data)
    } catch {}
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    fetchHistory()
    const id = setInterval(fetchHistory, 60_000)
    return () => clearInterval(id)
  }, [fetchHistory])

  // ── derived ─────────────────────────────────────────────────────────────────

  // A resposta pode não trazer `servers` (formatos diferem entre o portal
  // antigo e a plataforma); sem esta guarda a tela quebra inteira.
  const servers = Array.isArray(data?.servers) ? data.servers : []
  const hasData = servers.some(s => s.totalCount > 0)

  const top10Latency = data
    ? [...servers]
      .filter(s => s.avgLatency !== null && s.totalCount > 0)
      .sort((a, b) => (b.avgLatency ?? 0) - (a.avgLatency ?? 0))
      .slice(0, 10)
    : []

  const top10Quedas = data
    ? [...servers]
      .filter(s => s.totalCount > 0)
      .sort((a, b) => b.offlineCount - a.offlineCount)
      .slice(0, 10)
    : []

  const maxQuedas = top10Quedas[0]?.offlineCount ?? 1

  const summary = data?.summary ?? {
    totalServers:  0,
    avgUptime:     100,
    criticalCount: 0,
    totalQuedas:   0,
  }

  return (
    <div className="devops-theme border-b border-devops-border bg-devops-surface px-6 py-5 space-y-4">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
            <Activity className="w-4 h-4 text-devops-accent" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white tracking-tight">Monitoramento de Performance</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {loading
                ? 'Carregando...'
                : hasData
                  ? `${summary.totalServers} servidores monitorados · últimas 24h · salvo a cada minuto`
                  : 'Aguardando primeiros registros...'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-3 py-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] font-medium text-emerald-400">Ao vivo</span>
        </div>
      </div>

      {/* ── KPI Cards ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {([
          {
            icon:   Server,
            label:  'Total Servidores',
            value:  loading ? '—' : summary.totalServers,
            sub:    loading ? '' : `${summary.totalServers - summary.criticalCount} saudáveis`,
            color:  'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20',
          },
          {
            icon:   Activity,
            label:  'Uptime Médio',
            value:  loading ? '—' : `${summary.avgUptime}%`,
            sub:    'média da frota',
            color:  'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20',
          },
          {
            icon:   AlertTriangle,
            label:  'Estado Crítico',
            value:  loading ? '—' : summary.criticalCount,
            sub:    'servidores',
            color:  'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20',
          },
          {
            icon:   TrendingDown,
            label:  'Total de Quedas',
            value:  loading ? '—' : summary.totalQuedas.toLocaleString('pt-BR'),
            sub:    'últimas 24h',
            color:  'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20',
          },
        ] as const).map(k => (
          <div key={k.label} className={`${k.bg} border ${k.border} rounded-xl p-3.5 flex items-center gap-3`}>
            <div className={`w-9 h-9 rounded-lg ${k.bg} border ${k.border} flex items-center justify-center shrink-0`}>
              <k.icon className={`w-4 h-4 ${k.color}`} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground truncate">{k.label}</p>
              <p className={`text-xl font-bold ${k.color} leading-none mt-0.5`}>{k.value}</p>
              <p className="text-[10px] text-foreground/60 mt-0.5">{k.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Top 10 Latência + Análise de Falhas ────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">

        {/* Top 10 latência — BarChart horizontal */}
        <div className="bg-devops-panel border border-devops-border/80 rounded-xl p-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-widest">
                Top 10 — Maior Latência Média
              </p>
              <p className="text-[10px] text-foreground/60 mt-0.5">
                {loading
                  ? 'Carregando dados...'
                  : hasData
                    ? `Exibindo ${top10Latency.length} de ${summary.totalServers} servidores`
                    : 'Nenhum dado ainda — monitoramento iniciado'}
              </p>
            </div>
            <div className="flex items-center gap-3 text-[9px] text-foreground/60">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm bg-red-500 inline-block" />&gt;200ms
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm bg-amber-400 inline-block" />100–200ms
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm bg-blue-500 inline-block" />&lt;100ms
              </span>
            </div>
          </div>
          <div className="h-52">
            {loading ? (
              <div className="h-full flex flex-col justify-between py-1">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="w-24 h-3" />
                    <Skeleton className="h-3" style={{ width: `${60 - i * 8}%` }} />
                  </div>
                ))}
              </div>
            ) : top10Latency.length === 0 ? (
              <div className="h-full flex items-center justify-center">
                <p className="text-[11px] text-foreground/60">
                  Aguardando dados de latência...
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={top10Latency}
                  margin={{ top: 0, right: 40, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#161b2e" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fill: '#334155', fontSize: 9 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={v => `${v}ms`}
                  />
                  <YAxis
                    type="category"
                    dataKey="nome"
                    tick={{ fill: '#94a3b8', fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    width={120}
                  />
                  <Tooltip content={<BarTooltip />} cursor={{ fill: '#ffffff06' }} />
                  <Bar dataKey="avgLatency" radius={[0, 4, 4, 0]} maxBarSize={13}>
                    {top10Latency.map((entry, i) => (
                      <Cell key={i} fill={latencyColor(entry.avgLatency!)} fillOpacity={0.85} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Análise de Falhas */}
        <div className="bg-devops-panel border border-devops-border/80 rounded-xl p-4 flex flex-col">
          <div className="mb-3">
            <p className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-widest">
              Análise de Falhas
            </p>
            <p className="text-[10px] text-foreground/60 mt-0.5">
              Top 10 com mais quedas
            </p>
          </div>

          <div className="space-y-3.5 flex-1 overflow-y-auto max-h-52 scrollbar-dark">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Skeleton className="w-32 h-3" />
                    <Skeleton className="w-14 h-4 rounded-full" />
                  </div>
                  <Skeleton className="h-[5px] w-full" />
                </div>
              ))
            ) : top10Quedas.length === 0 ? (
              <div className="flex-1 flex items-center justify-center h-32">
                <p className="text-[11px] text-foreground/60 text-center">
                  Nenhuma queda registrada ainda
                </p>
              </div>
            ) : (
              top10Quedas.map((r, idx) => (
                <div key={r.id}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-[10px] font-bold text-foreground/60 shrink-0">#{idx + 1}</span>
                      <span className="text-[11px] font-medium text-devops-foreground truncate">{r.nome}</span>
                    </div>
                    <span
                      className="text-[9px] font-semibold px-1.5 py-0.5 rounded border shrink-0 ml-2"
                      style={{
                        color:           severityColor(r.severity),
                        backgroundColor: `${severityColor(r.severity)}15`,
                        borderColor:     `${severityColor(r.severity)}30`,
                      }}
                    >
                      {severityLabel(r.severity)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-[5px] bg-devops-panel rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width:      `${(r.offlineCount / maxQuedas) * 100}%`,
                          background: `linear-gradient(90deg, ${severityColor(r.severity)}80, ${severityColor(r.severity)})`,
                        }}
                      />
                    </div>
                    <span
                      className="text-[10px] font-bold w-[60px] text-right shrink-0"
                      style={{ color: severityColor(r.severity) }}
                    >
                      {r.offlineCount} quedas
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-3 pt-3 border-t border-devops-border/60 flex items-center gap-3 flex-wrap">
            {(['critico', 'alto', 'moderado', 'saudavel'] as Severity[]).map(s => (
              <span key={s} className="flex items-center gap-1.5 text-[9px] text-foreground/60">
                <span className="w-2 h-2 rounded-sm inline-block" style={{ backgroundColor: severityColor(s) }} />
                {severityLabel(s)}
              </span>
            ))}
          </div>
        </div>
      </div>

    </div>
  )
}
