'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Server,
  ChevronRight,
  ChevronDown,
  Container,
  FolderOpen,
  Terminal,
  Pencil,
  Trash2,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Wifi,
  WifiOff,
  Activity,
  Plus,
  Search,
  ArrowRight,
  Route,
  ExternalLink,
  Bell,
  BellOff,
} from 'lucide-react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from 'recharts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { araraApiFetch } from '@/lib/arara/arara-api-fetch'
import ServerForm from './ServerForm'
import ServerDownAlert, { type ServerAlert } from './ServerDownAlert'
import { devopsApi } from '@/lib/api/devops'

// ─── alert sound ──────────────────────────────────────────────────────────────

function playServerDownSound() {
  try {
    const ctx = new AudioContext()
    const now = ctx.currentTime
    ;[880, 660, 440].forEach((freq, i) => {
      const osc  = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.value = freq
      const t = now + i * 0.18
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(0.25, t + 0.04)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18)
      osc.start(t)
      osc.stop(t + 0.22)
    })
  } catch {}
}

// ─── types ────────────────────────────────────────────────────────────────────

type SshServer = {
  id: string
  nome: string
  host: string
  port?: number
  dns?: string | null
  usuario: string
  active: boolean
}

type PingPoint = {
  time: string
  latency: number | null
}

type ServerStatus = {
  online: boolean
  latency: number | null
  failures: number
  history: PingPoint[]
  lastCheck: Date | null
}

const HISTORY_MAX = 40
const PING_INTERVAL = 5000

// ─── component ────────────────────────────────────────────────────────────────

export default function ServerList() {
  const router = useRouter()
  const [servers, setServers]     = useState<SshServer[]>([])
  const [q, setQ]                 = useState('')
  const [loading, setLoading]     = useState(true)
  const [expanded, setExpanded]   = useState<string | null>(null)
  const [status, setStatus]       = useState<Record<string, ServerStatus>>({})
  const [showForm, setShowForm]   = useState(false)
  const [editServer, setEditServer] = useState<SshServer | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [alerts, setAlerts]         = useState<ServerAlert[]>([])
  const [muted, setMuted]           = useState(false)

  const intervalRef   = useRef<ReturnType<typeof setInterval> | null>(null)
  const prevOnlineRef  = useRef<Record<string, boolean>>({})
  const lastSavedRef   = useRef<Record<string, number>>({})

  // filtered é valor computado — sem estado separado para evitar flash de "vazio"
  const filtered = q.trim()
    ? servers.filter(s =>
        s.nome.toLowerCase().includes(q.toLowerCase()) ||
        s.host.toLowerCase().includes(q.toLowerCase())
      )
    : servers

  // ── load servers ────────────────────────────────────────────────────────────
  const loadServers = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    try {
      const res  = await araraApiFetch('/api/admin/ssh-servers')
      const json = await res.json()
      if (!res.ok) {
        setFetchError(`Erro ${res.status}: ${json.error ?? 'Falha ao carregar servidores'}`)
        return
      }
      const data: SshServer[] = Array.isArray(json) ? json : (json.data || [])
      setServers(data)
    } catch (e: any) {
      setFetchError(e?.message ?? 'Erro de rede')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadServers() }, [loadServers])

  // ── ping loop ───────────────────────────────────────────────────────────────
  const pingAll = useCallback(async () => {
    if (servers.length === 0) return
    await Promise.allSettled(
      servers.map(async (s) => {
        try {
          const json = await devopsApi.ping(s.host)
          const point: PingPoint = {
            time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            latency: json.online ? json.latency : null,
          }
          setStatus(prev => {
            const cur = prev[s.id] ?? { online: false, latency: null, failures: 0, history: [], lastCheck: null }
            const failed = !json.online
            return {
              ...prev,
              [s.id]: {
                online:    json.online,
                latency:   json.latency ?? null,
                failures:  failed ? cur.failures + 1 : 0,
                history:   [...cur.history, point].slice(-HISTORY_MAX),
                lastCheck: new Date(),
              },
            }
          })
          const nowTs = Date.now()
          if (nowTs - (lastSavedRef.current[s.id] ?? 0) >= 60_000) {
            lastSavedRef.current[s.id] = nowTs
            araraApiFetch('/api/devops/ping-log', {
              method:  'POST',
              headers: { 'Content-Type': 'application/json' },
              body:    JSON.stringify({ serverId: s.id, online: json.online, latencyMs: json.online ? (json.latency ?? null) : null }),
            }).catch(() => {})
          }
        } catch {
          setStatus(prev => {
            const cur = prev[s.id] ?? { online: false, latency: null, failures: 0, history: [], lastCheck: null }
            const point: PingPoint = {
              time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
              latency: null,
            }
            return {
              ...prev,
              [s.id]: { ...cur, online: false, failures: cur.failures + 1, history: [...cur.history, point].slice(-HISTORY_MAX), lastCheck: new Date() },
            }
          })
          const nowTs = Date.now()
          if (nowTs - (lastSavedRef.current[s.id] ?? 0) >= 60_000) {
            lastSavedRef.current[s.id] = nowTs
            araraApiFetch('/api/devops/ping-log', {
              method:  'POST',
              headers: { 'Content-Type': 'application/json' },
              body:    JSON.stringify({ serverId: s.id, online: false, latencyMs: null }),
            }).catch(() => {})
          }
        }
      })
    )
  }, [servers])

  useEffect(() => {
    pingAll()
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = setInterval(pingAll, PING_INTERVAL)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [pingAll])

  // ── offline detection ────────────────────────────────────────────────────────
  useEffect(() => {
    servers.forEach(s => {
      const st       = status[s.id]
      const isOnline = st?.lastCheck ? st.online : null
      const wasOnline = prevOnlineRef.current[s.id]

      if (wasOnline !== false && isOnline === false) {
        const alert: ServerAlert = {
          id:         `${s.id}-${Date.now()}`,
          nome:       s.nome,
          host:       s.host,
          detectedAt: new Date(),
        }
        setAlerts(prev => [...prev, alert])
        if (!muted) playServerDownSound()
      }

      if (isOnline !== null) prevOnlineRef.current[s.id] = isOnline
    })
  }, [status, servers, muted])

  const dismissAlert = useCallback((id: string) => {
    setAlerts(prev => prev.filter(a => a.id !== id))
  }, [])

  // ── actions ─────────────────────────────────────────────────────────────────
  async function removeServer(id: string) {
    if (!confirm('Excluir servidor?')) return
    await araraApiFetch(`/api/admin/ssh-servers?id=${id}`, { method: 'DELETE' })
    loadServers()
  }

  function navigate(serverId: string, path: string) {
    router.push(path ? `/admin/devops/_/?serverId=${encodeURIComponent(serverId)}/${path}` : `/admin/devops/_/?serverId=${encodeURIComponent(serverId)}`)
  }

  // ── render ──────────────────────────────────────────────────────────────────
  return (
    <div className="devops-theme min-h-screen bg-devops-surface text-white">
      {/* Header */}
      <div className="border-b border-devops-border px-6 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Server className="w-5 h-5 text-devops-accent" />
          <span className="font-semibold text-base">Servidores SSH</span>
          <span className="text-xs text-muted-foreground bg-devops-panel px-2 py-0.5 rounded-full">
            {servers.filter(s => status[s.id]?.online).length}/{servers.length} online
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar servidor ou IP…"
              value={q}
              onChange={e => setQ(e.target.value)}
              className="pl-8 h-8 w-56 bg-devops-panel border-devops-border text-sm placeholder:text-muted-foreground"
            />
          </div>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700 h-8 gap-1.5"
            onClick={loadServers}>
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
          <button
            title={muted ? 'Alertas sonoros desativados' : 'Alertas sonoros ativos'}
            onClick={() => setMuted(m => !m)}
            className={`w-8 h-8 flex items-center justify-center rounded border transition-colors ${
              muted
                ? 'border-devops-border text-foreground/60 hover:text-muted-foreground/70'
                : 'border-devops-border text-muted-foreground/70 hover:text-white hover:bg-devops-panel'
            }`}
          >
            {muted ? <BellOff className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
          </button>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700 h-8 gap-1.5"
            onClick={() => { setEditServer(null); setShowForm(true) }}>
            <Plus className="w-3.5 h-3.5" />
            Adicionar
          </Button>
        </div>
      </div>

      {/* Table header */}
      <div className="px-6 py-2 grid grid-cols-[auto_2fr_1fr_1fr_1fr_auto] gap-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-devops-border/60">
        <span className="w-3" />
        <span>Nome</span>
        <span>IP / Host</span>
        <span>Status</span>
        <span>Latência</span>
        <span className="w-32 text-right">Ações</span>
      </div>

      {/* Rows */}
      <div>
        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            Carregando servidores…
          </div>
        ) : fetchError ? (
          <div className="text-center py-20">
            <XCircle className="w-8 h-8 text-red-500 mx-auto mb-3" />
            <p className="text-devops-error text-sm font-medium">{fetchError}</p>
            <button onClick={loadServers} className="mt-3 text-xs text-muted-foreground hover:text-white underline">Tentar novamente</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            {q ? 'Nenhum servidor encontrado.' : 'Nenhum servidor cadastrado.'}
          </div>
        ) : (
          filtered.map(s => {
            const st       = status[s.id]
            const isOpen   = expanded === s.id
            const failures = st?.failures ?? 0

            return (
              <div key={s.id} className="border-b border-devops-border/50 last:border-b-0">
                {/* Compact row */}
                <div
                  className={`px-6 py-3 grid grid-cols-[auto_2fr_1fr_1fr_1fr_auto] gap-4 items-center cursor-pointer hover:bg-devops-panel/30 transition-colors ${isOpen ? 'bg-devops-panel/20' : ''}`}
                  onClick={() => setExpanded(isOpen ? null : s.id)}
                >
                  {/* Status dot */}
                  <StatusDot st={st} />

                  {/* Name + failures badge */}
                  <div className="flex items-center gap-2 min-w-0">
                    {isOpen
                      ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                      : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                    }
                    <span className="font-medium text-sm truncate">{s.nome}</span>
                    {failures >= 3 && (
                      <span className="text-[10px] font-bold bg-red-600 text-white px-1.5 py-0.5 rounded flex-shrink-0">
                        {failures} FALHAS
                      </span>
                    )}
                  </div>

                  {/* IP */}
                  <span className="text-sm text-muted-foreground/70 font-mono truncate">{s.host}</span>

                  {/* Status text */}
                  <StatusLabel st={st} />

                  {/* Latency */}
                  <LatencyBadge st={st} />

                  {/* Row actions */}
                  <div className="flex items-center gap-1 w-32 justify-end" onClick={e => e.stopPropagation()}>
                    <button
                      title="Editar"
                      onClick={() => { setEditServer(s); setShowForm(true) }}
                      className="w-7 h-7 flex items-center justify-center rounded border border-devops-border text-muted-foreground/70 hover:text-white hover:bg-devops-panel transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      title="Excluir"
                      onClick={() => removeServer(s.id)}
                      className="w-7 h-7 flex items-center justify-center rounded border border-devops-border text-muted-foreground hover:text-devops-error hover:border-red-900 hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Expanded panel */}
                {isOpen && (
                  <ExpandedPanel
                    server={s}
                    st={st}
                    onNavigate={(path) => navigate(s.id, path)}
                  />
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Server form modal */}
      {showForm && (
        <ServerForm
          server={editServer}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); loadServers() }}
        />
      )}

      {/* Offline alerts */}
      <ServerDownAlert alerts={alerts} onDismiss={dismissAlert} />
    </div>
  )
}

// ─── expanded panel ───────────────────────────────────────────────────────────

function ExpandedPanel({
  server,
  st,
  onNavigate,
}: {
  server: SshServer
  st: ServerStatus | undefined
  onNavigate: (path: string) => void
}) {
  const history  = st?.history ?? []
  const failures = st?.failures ?? 0

  const chartData = history.map(p => ({
    time:    p.time,
    latency: p.latency ?? 0,
    online:  p.latency !== null,
  }))

  const timeline = history.slice(-30)

  return (
    <div className="px-6 pb-5 pt-3 bg-devops-surface border-t border-devops-border/40 grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-5">
      {/* Left — charts */}
      <div className="space-y-4">
        {/* Latency chart */}
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">
            Histórico de Performance (ms)
          </p>
          {history.length < 2 ? (
            <div className="h-28 flex items-center justify-center text-xs text-foreground/60">
              Coletando dados…
            </div>
          ) : (
            <div className="h-28">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                  <defs>
                    <linearGradient id={`grad-${server.id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}   />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e2535" vertical={false} />
                  <XAxis dataKey="time" tick={{ fill: '#475569', fontSize: 9 }} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fill: '#475569', fontSize: 9 }} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1e2535', border: '1px solid #334155', borderRadius: 8, fontSize: 11 }}
                    labelStyle={{ color: '#94a3b8' }}
                    formatter={(v: number) => [v > 0 ? `${v}ms` : 'Offline', 'Latência']}
                  />
                  <ReferenceLine y={200} stroke="#f59e0b" strokeDasharray="4 2" strokeOpacity={0.5} label={{ value: '200ms', fill: '#f59e0b', fontSize: 9 }} />
                  <Area
                    type="monotone"
                    dataKey="latency"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    fill={`url(#grad-${server.id})`}
                    dot={false}
                    connectNulls={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Timeline */}
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">
            Status Recente: Timeline
          </p>
          <div className="flex gap-0.5 flex-wrap">
            {timeline.length === 0
              ? Array.from({ length: 20 }).map((_, i) => (
                  <span key={i} className="w-4 h-4 rounded-sm bg-devops-panel" />
                ))
              : timeline.map((p, i) => (
                  <span
                    key={i}
                    title={`${p.time} — ${p.latency !== null ? `${p.latency}ms` : 'Offline'}`}
                    className={`w-4 h-4 rounded-sm ${
                      p.latency === null
                        ? 'bg-red-600'
                        : p.latency > 200
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                    }`}
                  />
                ))
            }
          </div>
          <div className="flex items-center gap-4 mt-2">
            <LegendDot color="bg-emerald-500" label="Estável" />
            <LegendDot color="bg-amber-500"  label="Lento (>200ms)" />
            <LegendDot color="bg-red-600"    label="Offline" />
          </div>
        </div>
      </div>

      {/* Right — info + shortcuts */}
      <div className="space-y-3">
        {/* Info card */}
        <div className="bg-devops-panel/50 rounded-lg p-3 space-y-2">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
            Informações Adicionais
          </p>

          {failures > 0 ? (
            <div className="flex items-center justify-between bg-devops-surface/60 rounded px-3 py-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground/50">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                Instabilidade
              </div>
              <span className="text-sm font-bold text-devops-error">{failures} registros</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-devops-surface/60 rounded px-3 py-2 text-sm text-devops-success">
              <CheckCircle2 className="w-4 h-4" />
              Sem falhas registradas
            </div>
          )}

          <div className="flex items-center justify-between bg-devops-surface/60 rounded px-3 py-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground/50">
              <Route className="w-4 h-4 text-muted-foreground/70" />
              Rastreio de Rota
            </div>
            <button className="text-[11px] font-semibold bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded transition-colors">
              TRACERT
            </button>
          </div>

          <button
            onClick={() => onNavigate('')}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded px-3 py-2 text-sm font-semibold transition-colors"
          >
            ACESSAR SERVIDOR
            <ArrowRight className="w-4 h-4" />
          </button>

          {server.dns && (
            <a
              href={server.dns.startsWith('http') ? server.dns : `https://${server.dns}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2 bg-devops-panel hover:bg-devops-overlay text-devops-foreground rounded px-3 py-2 text-sm font-semibold transition-colors"
            >
              <ExternalLink className="w-4 h-4 text-muted-foreground/70" />
              ACESSAR DNS
            </a>
          )}
        </div>

        {/* Shortcut buttons */}
        <div className="bg-devops-panel/50 rounded-lg p-3">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">
            Acessos Rápidos
          </p>
          <div className="grid grid-cols-3 gap-2">
            <ShortcutBtn
              icon={<Container className="w-5 h-5" />}
              label="Docker"
              color="bg-blue-500/20 text-devops-accent hover:bg-blue-500/30 border-blue-800"
              onClick={() => onNavigate('docker')}
            />
            <ShortcutBtn
              icon={<FolderOpen className="w-5 h-5" />}
              label="Explorer"
              color="bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 border-amber-800"
              onClick={() => onNavigate('explorer')}
            />
            <ShortcutBtn
              icon={<Terminal className="w-5 h-5" />}
              label="Terminal"
              color="bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border-emerald-800"
              onClick={() => onNavigate('terminal')}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── small helpers ────────────────────────────────────────────────────────────

function StatusDot({ st }: { st: ServerStatus | undefined }) {
  if (!st?.lastCheck) return <span className="w-2.5 h-2.5 rounded-full bg-devops-muted flex-shrink-0" />
  if (st.online) return <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 flex-shrink-0 shadow-[0_0_6px_#10b981]" />
  return <span className="w-2.5 h-2.5 rounded-full bg-red-500 flex-shrink-0 animate-pulse" />
}

function StatusLabel({ st }: { st: ServerStatus | undefined }) {
  if (!st?.lastCheck) return <span className="text-xs text-muted-foreground flex items-center gap-1"><Activity className="w-3.5 h-3.5" />Verificando…</span>
  if (st.online) {
    if (st.latency && st.latency > 200)
      return <span className="text-xs text-devops-warning flex items-center gap-1"><Wifi className="w-3.5 h-3.5" />Instável</span>
    return <span className="text-xs text-devops-success flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" />Estável</span>
  }
  return <span className="text-xs text-devops-error flex items-center gap-1"><WifiOff className="w-3.5 h-3.5" />Timeout</span>
}

function LatencyBadge({ st }: { st: ServerStatus | undefined }) {
  if (!st?.lastCheck || !st.online) {
    return <span className="text-sm text-foreground/60">—</span>
  }
  const ms = st.latency ?? 0
  const cls = ms > 200 ? 'text-devops-error' : ms > 100 ? 'text-devops-warning' : 'text-devops-warning'
  return <span className={`text-sm font-semibold ${cls}`}>{ms}ms</span>
}

function ShortcutBtn({
  icon, label, color, onClick,
}: {
  icon: React.ReactNode
  label: string
  color: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-lg border text-xs font-medium transition-colors ${color}`}
    >
      {icon}
      {label}
    </button>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`w-2.5 h-2.5 rounded-sm ${color}`} />
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </div>
  )
}
