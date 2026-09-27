'use client'

"use client"

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useRotaDinamica } from '@/hooks/use-rota-dinamica'
import Link from 'next/link'
import {
  ArrowLeft, Server, Container, FolderOpen, Terminal,
  ExternalLink, RefreshCw, WifiOff, Activity,
  CheckCircle2, Globe, User, Hash, Route, Cpu, HardDrive,
  Network, MemoryStick, ShieldAlert, ShieldCheck,
  Download, AlertCircle, PowerOff,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { araraApiFetch } from '@/lib/arara/arara-api-fetch'
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis,
  Tooltip, CartesianGrid, LineChart, Line,
} from 'recharts'

// ─── types ────────────────────────────────────────────────────────────────────

type SshServer = {
  id: string; nome: string; host: string; port?: number
  dns?: string | null; usuario: string; active: boolean
}
type PingPoint   = { time: string; latency: number | null }
type MetricsData = {
  cpu: number
  memory: { total: number; used: number; free: number }
  disk:   { total: string; used: string; avail: string; pct: string }
  load:   string
  net:    { rx: number; tx: number }
}
type Process = { name: string; memPct: number; rss: number }
type CronJob = { schedule: string; time: string; cmd: string; full: string }
type LogEntry = { count: number; message: string }
type LogSource = { source: string; errors: LogEntry[] }
type SslResult = { domain: string; valid?: boolean; daysLeft?: number; expiry?: string; issuer?: string; error?: string }

const PING_INTERVAL    = 5000
const METRICS_INTERVAL = 15000
const HISTORY_MAX      = 40

// ─── page ─────────────────────────────────────────────────────────────────────

export default function ServerDetailPage() {
  const router   = useRouter()
  const serverId = useRotaDinamica('serverId', 'devops')

  const [server,    setServer]    = useState<SshServer | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [pingHist,  setPingHist]  = useState<PingPoint[]>([])
  const [pingNow,   setPingNow]   = useState<{ online: boolean; latency: number | null } | null>(null)
  const [pinging,   setPinging]   = useState(false)
  const [metrics,   setMetrics]   = useState<MetricsData | null>(null)
  const [metricsHist, setMetricsHist] = useState<{ time: string; cpu: number; mem: number }[]>([])
  const [processes, setProcesses] = useState<Process[]>([])
  const [crons,     setCrons]     = useState<CronJob[]>([])
  const [logs,      setLogs]      = useState<LogSource[]>([])
  const [ssl,       setSsl]       = useState<SslResult[]>([])
  const [rebooting, setRebooting] = useState(false)

  const pingRef    = useRef<ReturnType<typeof setInterval> | null>(null)
  const metricsRef = useRef<ReturnType<typeof setInterval> | null>(null)

  async function handleReboot() {
    if (!confirm(`Reiniciar o servidor "${server?.nome}"? O servidor ficará offline por alguns minutos.`)) return
    setRebooting(true)
    try {
      await araraApiFetch(`/api/devops/${serverId}/reboot`, { method: 'POST' })
    } finally {
      setRebooting(false)
    }
  }

  // ── load server ─────────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        const res  = await araraApiFetch('/api/admin/ssh-servers')
        const json = await res.json()
        const list: SshServer[] = Array.isArray(json) ? json : (json.data || [])
        setServer(list.find(s => s.id === serverId) ?? null)
      } catch { setServer(null) }
      finally  { setLoading(false) }
    }
    load()
  }, [serverId])

  // ── ping loop ────────────────────────────────────────────────────────────────
  const doPing = useCallback(async (host: string) => {
    setPinging(true)
    try {
      const res  = await araraApiFetch(`/api/devops/ping?host=${encodeURIComponent(host)}`)
      const json = await res.json()
      const point: PingPoint = {
        time:    new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        latency: json.online ? json.latency : null,
      }
      setPingNow({ online: json.online, latency: json.latency ?? null })
      setPingHist(h => [...h, point].slice(-HISTORY_MAX))
    } catch {
      setPingNow({ online: false, latency: null })
    } finally {
      setPinging(false)
    }
  }, [])

  useEffect(() => {
    if (!server?.host) return
    doPing(server.host)
    pingRef.current = setInterval(() => doPing(server.host), PING_INTERVAL)
    return () => { if (pingRef.current) clearInterval(pingRef.current) }
  }, [server, doPing])

  // ── metrics loop ─────────────────────────────────────────────────────────────
  const fetchMetrics = useCallback(async () => {
    try {
      const res  = await araraApiFetch(`/api/devops/${serverId}/metrics`)
      const json = await res.json()
      if (json.success) {
        setMetrics(json.data)
        setMetricsHist(h => [...h, {
          time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          cpu:  json.data.cpu,
          mem:  json.data.memory.total > 0 ? Math.round(json.data.memory.used / json.data.memory.total * 100) : 0,
        }].slice(-HISTORY_MAX))
      }
    } catch {}
  }, [serverId])

  useEffect(() => {
    fetchMetrics()
    metricsRef.current = setInterval(fetchMetrics, METRICS_INTERVAL)
    return () => { if (metricsRef.current) clearInterval(metricsRef.current) }
  }, [fetchMetrics])

  // ── one-shot sections ────────────────────────────────────────────────────────
  useEffect(() => {
    async function fetchAll() {
      const [procRes, cronRes, logRes, sslRes] = await Promise.allSettled([
        araraApiFetch(`/api/devops/${serverId}/processes`).then(r => r.json()),
        araraApiFetch(`/api/devops/${serverId}/crontab`).then(r => r.json()),
        araraApiFetch(`/api/devops/${serverId}/logs-analysis`).then(r => r.json()),
        araraApiFetch(`/api/devops/${serverId}/ssl`).then(r => r.json()),
      ])
      if (procRes.status === 'fulfilled' && procRes.value.success) setProcesses(procRes.value.data ?? [])
      if (cronRes.status === 'fulfilled' && cronRes.value.success) setCrons(cronRes.value.data ?? [])
      if (logRes.status  === 'fulfilled' && logRes.value.success)  setLogs(logRes.value.data  ?? [])
      if (sslRes.status  === 'fulfilled' && sslRes.value.success)  setSsl(sslRes.value.data   ?? [])
    }
    if (serverId) fetchAll()
  }, [serverId])

  // ── health score (heuristic) ─────────────────────────────────────────────────
  const healthScore = (() => {
    let score = 100
    if (pingNow && !pingNow.online)                                  score -= 40
    if (pingNow?.latency && pingNow.latency > 200)                   score -= 10
    if (metrics && metrics.cpu > 90)                                 score -= 15
    if (metrics && metrics.memory.total > 0 &&
        metrics.memory.used / metrics.memory.total > 0.9)            score -= 15
    const diskPct = parseInt(metrics?.disk.pct ?? '0')
    if (diskPct > 90)                                                score -= 15
    const totalErrors = logs.reduce((a, s) => a + s.errors.reduce((b, e) => b + e.count, 0), 0)
    if (totalErrors > 100)                                           score -= 5
    const sslExpiringSoon = ssl.some(s => s.daysLeft !== undefined && s.daysLeft < 30)
    if (sslExpiringSoon)                                             score -= 5
    return Math.max(0, score)
  })()

  const healthColor = healthScore >= 80 ? 'text-devops-success' : healthScore >= 60 ? 'text-devops-warning' : 'text-devops-error'

  // ── status ───────────────────────────────────────────────────────────────────
  const statusColor = pingNow === null ? 'text-muted-foreground'
    : pingNow.online ? (pingNow.latency && pingNow.latency > 200 ? 'text-devops-warning' : 'text-devops-success')
    : 'text-devops-error'
  const statusLabel = pingNow === null ? 'Verificando…'
    : pingNow.online ? (pingNow.latency && pingNow.latency > 200 ? 'Instável' : 'Online')
    : 'Offline'

  if (loading) return (
    <div className="devops-theme min-h-screen bg-devops-surface flex items-center justify-center text-muted-foreground">
      <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Carregando…
    </div>
  )

  if (!server) return (
    <div className="devops-theme min-h-screen bg-devops-surface flex flex-col items-center justify-center text-muted-foreground gap-4">
      <Server className="w-10 h-10 text-foreground/80" />
      <p>Servidor não encontrado.</p>
      <Link href="/admin/devops">
        <Button variant="outline" size="sm" className="border-devops-border text-muted-foreground/50">
          <ArrowLeft className="w-4 h-4 mr-2" /> Voltar
        </Button>
      </Link>
    </div>
  )

  const memPct  = metrics && metrics.memory.total > 0
    ? Math.round(metrics.memory.used / metrics.memory.total * 100) : 0
  const diskPct = parseInt(metrics?.disk.pct ?? '0')

  return (
    <div className="devops-theme min-h-screen bg-devops-surface text-white">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="border-b border-devops-border px-6 py-4 flex items-center gap-3">
        <Link href="/admin/devops">
          <Button size="icon" variant="ghost" className="text-muted-foreground/70 hover:text-white h-8 w-8">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <Server className="w-5 h-5 text-devops-accent" />
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">DevOps</span>
          <span className="text-foreground/60">/</span>
          <span className="text-white font-semibold">{server.nome}</span>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className={`flex items-center gap-1.5 text-sm font-medium ${statusColor}`}>
            {pingNow?.online ? <CheckCircle2 className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
            {pinging ? 'Verificando…' : statusLabel}
            {pingNow?.online && pingNow.latency && (
              <span className="text-xs font-mono text-muted-foreground/70">{pingNow.latency}ms</span>
            )}
          </span>
          <span className={`text-sm font-bold ${healthColor}`}>{healthScore}/100</span>
          <Button
            size="sm"
            variant="outline"
            disabled={rebooting}
            onClick={handleReboot}
            className="border-red-900 text-red-400 hover:bg-red-500/10 hover:text-red-300 gap-1.5 h-8"
          >
            <PowerOff className={`w-3.5 h-3.5 ${rebooting ? 'animate-pulse' : ''}`} />
            {rebooting ? 'Reiniciando…' : 'Reiniciar Servidor'}
          </Button>
        </div>
      </div>

      <div className="px-6 py-6 space-y-6 max-w-7xl mx-auto">

        {/* ── Row 1: info + shortcuts ──────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4">
          {/* Info */}
          <div className="bg-devops-panel border border-devops-border rounded-xl p-5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-4">Servidor</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <InfoItem icon={<Route    className="w-3.5 h-3.5 text-muted-foreground/70" />} label="Host / IP" value={server.host}             mono />
              <InfoItem icon={<Hash     className="w-3.5 h-3.5 text-muted-foreground/70" />} label="Porta"     value={String(server.port ?? 22)} mono />
              <InfoItem icon={<User     className="w-3.5 h-3.5 text-muted-foreground/70" />} label="Usuário"   value={server.usuario}           mono />
              <InfoItem icon={<Activity className="w-3.5 h-3.5 text-muted-foreground/70" />} label="Load"      value={metrics?.load ?? '—'}      mono />
              {server.dns && (
                <div className="col-span-2 sm:col-span-4">
                  <InfoItem
                    icon={<Globe className="w-3.5 h-3.5 text-emerald-400" />}
                    label="DNS"
                    value={server.dns}
                    mono
                    link={server.dns.startsWith('http') ? server.dns : `https://${server.dns}`}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Shortcuts */}
          <div className="flex flex-col gap-2 min-w-[160px]">
            <ShortcutBtn icon={<Container  className="w-4 h-4" />} label="Docker"    color="blue"    onClick={() => router.push(`/admin/devops/_/docker/?serverId=${encodeURIComponent(serverId)}`)}   />
            <ShortcutBtn icon={<FolderOpen className="w-4 h-4" />} label="Explorador" color="amber"  onClick={() => router.push(`/admin/devops/_/explorer/?serverId=${encodeURIComponent(serverId)}`)} />
            <ShortcutBtn icon={<Terminal   className="w-4 h-4" />} label="Terminal"  color="emerald" onClick={() => router.push(`/admin/devops/_/terminal/?serverId=${encodeURIComponent(serverId)}`)} />
          </div>
        </div>

        {/* ── Row 2: metric cards ──────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetricCard icon={<Cpu         className="w-5 h-5 text-blue-400"   />} label="CPU"       value={`${metrics?.cpu.toFixed(1) ?? '—'}%`}    pct={metrics?.cpu ?? 0}    color="blue"    />
          <MetricCard icon={<MemoryStick className="w-5 h-5 text-purple-400" />} label="Memória"   value={`${memPct}%`}                             pct={memPct}               color="purple"  sub={metrics ? `${metrics.memory.used} / ${metrics.memory.total} MB` : undefined} />
          <MetricCard icon={<HardDrive   className="w-5 h-5 text-amber-400"  />} label="Disco"     value={metrics?.disk.pct ?? '—'}                 pct={diskPct}              color="amber"   sub={metrics ? `${metrics.disk.used} / ${metrics.disk.total}` : undefined} />
          <MetricCard icon={<Network     className="w-5 h-5 text-emerald-400"/>} label="Rede"      value={pingNow?.online ? 'Online' : 'Offline'}   pct={pingNow?.online ? 100 : 0} color="emerald" sub={pingNow?.latency ? `${pingNow.latency}ms latência` : undefined} />
        </div>

        {/* ── Row 3: charts ────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Ping chart */}
          <div className="bg-devops-panel border border-devops-border rounded-xl p-5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">
              Estabilidade de Conexão (ms)
            </p>
            {pingHist.length < 2 ? (
              <div className="h-32 flex items-center justify-center text-xs text-foreground/60">
                <Activity className="w-4 h-4 mr-2 animate-pulse" /> Coletando dados…
              </div>
            ) : (
              <div className="h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={pingHist.map(p => ({ ...p, latency: p.latency ?? 0 }))} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                    <defs>
                      <linearGradient id="pingGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}   />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e2535" vertical={false} />
                    <XAxis dataKey="time" tick={{ fill: '#475569', fontSize: 9 }} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: '#475569', fontSize: 9 }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ backgroundColor: '#1e2535', border: '1px solid #334155', borderRadius: 8, fontSize: 11 }} labelStyle={{ color: '#94a3b8' }} formatter={(v: number) => [v > 0 ? `${v}ms` : 'Offline', 'Latência']} />
                    <Area type="monotone" dataKey="latency" stroke="#3b82f6" strokeWidth={2} fill="url(#pingGrad)" dot={false} connectNulls={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* CPU + RAM chart */}
          <div className="bg-devops-panel border border-devops-border rounded-xl p-5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">
              CPU & Memória (%)
            </p>
            {metricsHist.length < 2 ? (
              <div className="h-32 flex items-center justify-center text-xs text-foreground/60">
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Coletando dados…
              </div>
            ) : (
              <div className="h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={metricsHist} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e2535" vertical={false} />
                    <XAxis dataKey="time" tick={{ fill: '#475569', fontSize: 9 }} tickLine={false} interval="preserveStartEnd" />
                    <YAxis domain={[0, 100]} tick={{ fill: '#475569', fontSize: 9 }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ backgroundColor: '#1e2535', border: '1px solid #334155', borderRadius: 8, fontSize: 11 }} labelStyle={{ color: '#94a3b8' }} formatter={(v: number, n: string) => [`${v.toFixed(1)}%`, n === 'cpu' ? 'CPU' : 'RAM']} />
                    <Line type="monotone" dataKey="cpu" stroke="#3b82f6" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="mem" stroke="#a855f7" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>

        {/* ── Row 4: health + processes + snapshot ─────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Saúde */}
          <div className="bg-devops-panel border border-devops-border rounded-xl p-5 flex flex-col gap-3">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Saúde do Servidor</p>
            <div className="flex items-end gap-2">
              <span className={`text-5xl font-bold tabular-nums ${healthColor}`}>{healthScore}</span>
              <span className="text-muted-foreground text-lg pb-1">/100</span>
            </div>
            <div className="w-full h-2 bg-devops-panel rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${healthScore >= 80 ? 'bg-emerald-500' : healthScore >= 60 ? 'bg-amber-500' : 'bg-red-500'}`}
                style={{ width: `${healthScore}%` }}
              />
            </div>
            <div className="space-y-1.5 text-xs text-muted-foreground/70 mt-1">
              <HealthItem ok={pingNow?.online ?? false}                    label="Conectividade"       />
              <HealthItem ok={(metrics?.cpu ?? 0) < 80}                   label="CPU estável (<80%)"  />
              <HealthItem ok={memPct < 85}                                label="RAM disponível"      />
              <HealthItem ok={diskPct < 85}                               label="Disco disponível"    />
              <HealthItem ok={!ssl.some(s => (s.daysLeft ?? 99) < 30)}   label="SSL válido (>30 dias)"/>
            </div>
          </div>

          {/* Processos htop-style */}
          <div className="bg-devops-panel border border-devops-border rounded-xl p-5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">
              📈 Processos Consumindo Recursos
            </p>
            {processes.length === 0 ? (
              <div className="text-xs text-foreground/60 text-center py-6">Coletando…</div>
            ) : (
              <div className="space-y-2">
                {processes.slice(0, 8).map((p, i) => {
                  const mb  = Math.round(p.rss / 1024)
                  const bar = Math.min(100, p.memPct * 5)
                  return (
                    <div key={i} className="flex items-center gap-2 text-xs font-mono">
                      <span className="w-24 truncate text-muted-foreground/50">{p.name}</span>
                      <div className="flex-1 h-1.5 bg-devops-panel rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${p.memPct > 20 ? 'bg-red-500' : p.memPct > 10 ? 'bg-amber-500' : 'bg-blue-500'}`}
                          style={{ width: `${bar}%` }}
                        />
                      </div>
                      <span className="w-14 text-right text-muted-foreground/70">
                        {mb > 1024 ? `${(mb/1024).toFixed(1)} GB` : `${mb} MB`}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Snapshot */}
          <div className="bg-devops-panel border border-devops-border rounded-xl p-5 flex flex-col gap-3">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">🗄 Snapshot Completo</p>
            <p className="text-xs text-muted-foreground/70">Salva estado atual do servidor:</p>
            <div className="space-y-1.5 text-xs text-muted-foreground">
              {['Arquivos do sistema', 'Banco de dados', 'Containers Docker', 'Volumes'].map(item => (
                <div key={item} className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-devops-muted" />
                  {item}
                </div>
              ))}
            </div>
            <Button
              className="mt-auto bg-blue-600 hover:bg-blue-700 gap-2 text-sm"
              onClick={() => alert('Em desenvolvimento')}
            >
              <Download className="w-4 h-4" />
              Criar Snapshot
            </Button>
          </div>
        </div>

        {/* ── Row 5: logs + crontab + SSL ──────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Log analysis */}
          <div className="bg-devops-panel border border-devops-border rounded-xl p-5 lg:col-span-1">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">
              📊 Análise de Logs
            </p>
            {logs.length === 0 ? (
              <div className="text-xs text-foreground/60 text-center py-6">Coletando…</div>
            ) : (
              <div className="space-y-4">
                {logs.map(src => (
                  <div key={src.source}>
                    <p className="text-[10px] font-semibold text-devops-accent uppercase mb-1.5">{src.source}</p>
                    {src.errors.length === 0 ? (
                      <p className="text-xs text-devops-success flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Sem erros recentes
                      </p>
                    ) : (
                      <div className="space-y-1">
                        {src.errors.slice(0, 3).map((e, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs">
                            <span className="text-devops-error font-mono font-bold flex-shrink-0">{e.count}×</span>
                            <span className="text-muted-foreground/70 truncate">{e.message}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Crontab */}
          <div className="bg-devops-panel border border-devops-border rounded-xl p-5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">
              ⏰ Tarefas Agendadas
            </p>
            {crons.length === 0 ? (
              <div className="text-xs text-foreground/60 text-center py-6">Nenhuma tarefa encontrada</div>
            ) : (
              <div className="space-y-2">
                {crons.slice(0, 10).map((c, i) => (
                  <div key={i} className="flex items-start gap-3 text-xs">
                    <span className="font-mono text-devops-warning flex-shrink-0 w-12">{c.time}</span>
                    <span className="text-muted-foreground/50 truncate">{c.cmd}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* SSL */}
          <div className="bg-devops-panel border border-devops-border rounded-xl p-5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">
              🌐 Certificados SSL
            </p>
            {ssl.length === 0 ? (
              <div className="text-xs text-foreground/60 text-center py-6">
                {server.dns ? 'Verificando…' : 'Sem domínio configurado'}
              </div>
            ) : (
              <div className="space-y-3">
                {ssl.map((s, i) => (
                  <div key={i} className="bg-devops-surface/60 rounded-lg p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono text-muted-foreground/50 truncate">{s.domain}</span>
                      {s.error ? (
                        <ShieldAlert className="w-4 h-4 text-devops-error flex-shrink-0" />
                      ) : s.daysLeft !== undefined && s.daysLeft < 30 ? (
                        <ShieldAlert className="w-4 h-4 text-devops-warning flex-shrink-0" />
                      ) : (
                        <ShieldCheck className="w-4 h-4 text-devops-success flex-shrink-0" />
                      )}
                    </div>
                    {s.error ? (
                      <p className="text-xs text-devops-error">{s.error}</p>
                    ) : (
                      <>
                        <p className={`text-xs font-semibold ${s.daysLeft !== undefined && s.daysLeft < 30 ? 'text-devops-warning' : 'text-devops-success'}`}>
                          {s.daysLeft !== undefined && s.daysLeft < 0
                            ? 'Expirado!'
                            : `Expira em ${s.daysLeft} dias`}
                        </p>
                        <p className="text-[10px] text-muted-foreground">{s.expiry} · {s.issuer}</p>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}

// ─── sub-components ───────────────────────────────────────────────────────────

function InfoItem({ icon, label, value, mono, link }: {
  icon: React.ReactNode; label: string; value: string; mono?: boolean; link?: string
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-muted-foreground flex items-center gap-1">{icon} {label}</span>
      {link ? (
        <a href={link} target="_blank" rel="noopener noreferrer"
          className={`text-sm text-devops-success hover:underline flex items-center gap-1 ${mono ? 'font-mono' : ''}`}>
          {value} <ExternalLink className="w-3 h-3" />
        </a>
      ) : (
        <span className={`text-sm text-devops-foreground ${mono ? 'font-mono' : ''}`}>{value}</span>
      )}
    </div>
  )
}

function MetricCard({ icon, label, value, pct, color, sub }: {
  icon: React.ReactNode; label: string; value: string; pct: number; color: string; sub?: string
}) {
  const barColor = {
    blue:   'bg-blue-500',    purple: 'bg-purple-500',
    amber:  'bg-amber-500',   emerald: 'bg-emerald-500',
  }[color] ?? 'bg-devops-muted'
  const alertBar = pct > 85 ? 'bg-red-500' : pct > 70 ? 'bg-amber-500' : barColor

  return (
    <div className="bg-devops-panel border border-devops-border rounded-xl p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon} {label}</div>
        <span className="text-sm font-bold text-white">{value}</span>
      </div>
      <div className="w-full h-1.5 bg-devops-panel rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${alertBar}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  )
}

function ShortcutBtn({ icon, label, color, onClick }: {
  icon: React.ReactNode; label: string; color: string; onClick: () => void
}) {
  const cls = {
    blue:   'border-blue-800/40 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400',
    amber:  'border-amber-800/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400',
    emerald:'border-emerald-800/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400',
  }[color] ?? ''
  return (
    <button onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors w-full ${cls}`}>
      {icon} {label}
    </button>
  )
}

function HealthItem({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      {ok
        ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
        : <AlertCircle  className="w-3.5 h-3.5 text-red-500    flex-shrink-0" />}
      <span className={ok ? 'text-muted-foreground/70' : 'text-red-400'}>{label}</span>
    </div>
  )
}
