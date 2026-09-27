'use client'

"use client"

import { useEffect, useState } from 'react'
import { useRotaDinamica } from '@/hooks/use-rota-dinamica'
import {
  RefreshCw,
  Play,
  Square,
  RotateCcw,
  Trash2,
  FileText,
  BarChart3,
  ChevronDown,
  ChevronRight,
  Search,
  Download,
  X,
  Cpu,
  MemoryStick,
  Clock,
  Network,
  Hash,
  ArrowLeft,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import Link from 'next/link'
import { araraApiFetch } from '@/lib/arara/arara-api-fetch'

type ContainerState = 'running' | 'stopped' | 'restarting' | 'paused' | 'dead'

type DockerContainer = {
  id: string
  shortId: string
  ref: string
  name: string
  image: string
  state: ContainerState
  status: string
  ports: string
  cpu: string
  ram: string
  ramUsage: number
  uptime: string
  created: string
  network: string
  command: string
}

type LogModal = { open: boolean; name: string; logs: string; loading?: boolean }
type StatsModal = { open: boolean; name: string; cpu: string; ram: string; net: string; disk: string }

const STATUS_CONFIG: Record<ContainerState, { dot: string; label: string; bg: string; text: string }> = {
  running:    { dot: 'bg-emerald-500', label: 'Running',    bg: 'bg-emerald-500/10', text: 'text-emerald-400' },
  stopped:    { dot: 'bg-red-500',     label: 'Stopped',    bg: 'bg-red-500/10',     text: 'text-red-400'     },
  restarting: { dot: 'bg-amber-400',   label: 'Restarting', bg: 'bg-amber-400/10',   text: 'text-amber-400'   },
  paused:     { dot: 'bg-blue-400',    label: 'Paused',     bg: 'bg-blue-400/10',    text: 'text-blue-400'    },
  dead:       { dot: 'bg-devops-muted',   label: 'Dead',       bg: 'bg-devops-panel/30',   text: 'text-muted-foreground'   },
}

function containerRefPath(c: DockerContainer) {
  return encodeURIComponent(c.ref || c.name)
}

export default function DockerPage() {
  const serverId = useRotaDinamica('serverId', 'devops')

  const [containers, setContainers] = useState<DockerContainer[]>([])
  const [filtered, setFiltered] = useState<DockerContainer[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [logModal, setLogModal] = useState<LogModal>({ open: false, name: '', logs: '' })
  const [statsModal, setStatsModal] = useState<StatsModal>({ open: false, name: '', cpu: '', ram: '', net: '', disk: '' })
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [restartingDocker, setRestartingDocker] = useState(false)

  async function handleRestartDocker() {
    if (!confirm('Reiniciar o serviço Docker? Todos os containers serão interrompidos brevemente.')) return
    setRestartingDocker(true)
    try {
      await araraApiFetch(`/api/devops/${serverId}/docker-restart`, { method: 'POST' })
      setTimeout(() => loadContainers(), 5000)
    } finally {
      setRestartingDocker(false)
    }
  }

  async function loadContainers() {
    setLoading(true)
    try {
      const res = await araraApiFetch(`/api/devops/${serverId}/containers`)
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Falha ao carregar containers')
      }
      setContainers(json.data ?? [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao carregar containers')
      setContainers([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadContainers() }, [serverId])

  useEffect(() => {
    const q = search.toLowerCase()
    setFiltered(
      q ? containers.filter(c => c.name.toLowerCase().includes(q) || c.image.toLowerCase().includes(q)) : containers
    )
  }, [search, containers])

  async function handleAction(container: DockerContainer, action: 'start' | 'stop' | 'restart' | 'remove') {
    setActionLoading(container.id + action)
    const ref = containerRefPath(container)
    try {
      if (action === 'remove') {
        const res = await araraApiFetch(`/api/devops/${serverId}/containers/${ref}`, { method: 'DELETE' })
        const json = await res.json()
        if (!res.ok || !json.success) throw new Error(json.error || 'Falha ao remover container')
      } else {
        const res = await araraApiFetch(`/api/devops/${serverId}/containers/${ref}/${action}`, { method: 'POST' })
        const json = await res.json()
        if (!res.ok || !json.success) throw new Error(json.error || `Falha ao executar ${action}`)
      }
      toast.success(`${action} executado com sucesso`)
      if (action === 'remove') setExpanded(null)
      await loadContainers()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `Erro ao executar ${action}`)
    } finally {
      setActionLoading(null)
    }
  }

  async function handleLogs(container: DockerContainer) {
    setLogModal({ open: true, name: container.name, logs: '', loading: true })
    try {
      const ref = containerRefPath(container)
      const res = await araraApiFetch(`/api/devops/${serverId}/containers/${ref}/logs?tail=200`)
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Falha ao carregar logs')
      setLogModal({ open: true, name: container.name, logs: json.data?.logs ?? '(sem logs)', loading: false })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao carregar logs')
      setLogModal(p => ({ ...p, loading: false, logs: '(erro ao carregar logs)' }))
    }
  }

  async function handleStats(container: DockerContainer) {
    setStatsModal({ open: true, name: container.name, cpu: '…', ram: '…', net: '…', disk: '…' })
    try {
      const ref = containerRefPath(container)
      const res = await araraApiFetch(`/api/devops/${serverId}/containers/${ref}/stats`)
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Falha ao carregar stats')
      const d = json.data
      setStatsModal({
        open: true,
        name: container.name,
        cpu: d?.cpu ?? '--',
        ram: d?.ram ?? '--',
        net: d?.netIo ?? '—',
        disk: d?.blockIo ?? '—',
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao carregar stats')
      setStatsModal(p => ({ ...p, cpu: '--', ram: '--', net: '—', disk: '—' }))
    }
  }

  const running    = containers.filter(c => c.state === 'running').length
  const stopped    = containers.filter(c => c.state === 'stopped' || c.state === 'dead').length
  const restarting = containers.filter(c => c.state === 'restarting').length

  return (
    <div className="devops-theme min-h-screen bg-devops-panel text-white">
      {/* Top bar */}
      <div className="border-b border-devops-border px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/admin/devops">
              <Button size="icon" variant="ghost" className="text-muted-foreground/70 hover:text-white h-8 w-8">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <span>DevOps</span>
              <span>/</span>
              <span className="text-white font-semibold">Docker — Containers</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar container ou imagem…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 h-8 w-64 bg-devops-surface border-devops-border text-sm text-white placeholder:text-muted-foreground"
              />
            </div>
            <Button size="sm" variant="outline" className="border-devops-border text-muted-foreground/50 hover:bg-devops-surface h-8"
              onClick={loadContainers}>
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              Atualizar
            </Button>
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700 h-8">
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Pull Image
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={restartingDocker}
              onClick={handleRestartDocker}
              className="border-red-900 text-red-400 hover:bg-red-500/10 hover:text-red-300 h-8 gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${restartingDocker ? 'animate-spin' : ''}`} />
              {restartingDocker ? 'Reiniciando…' : 'Reiniciar Docker'}
            </Button>
          </div>
        </div>

        {/* Summary */}
        <div className="flex items-center gap-5 mt-3">
          <span className="text-xs text-muted-foreground">{containers.length} containers</span>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
            <span className="text-xs text-muted-foreground/50">{running} running</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
            <span className="text-xs text-muted-foreground/50">{stopped} stopped</span>
          </div>
          {restarting > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400 inline-block animate-pulse" />
              <span className="text-xs text-muted-foreground/50">{restarting} restarting</span>
            </div>
          )}
        </div>
      </div>

      {/* Table header */}
      <div className="px-6 py-2 grid grid-cols-[2fr_2fr_1fr_1fr_1fr_1fr_auto] gap-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-devops-border/60">
        <span>Name</span>
        <span>Image</span>
        <span>Status</span>
        <span>CPU</span>
        <span>Memory</span>
        <span>Uptime</span>
        <span className="w-48 text-right">Actions</span>
      </div>

      {/* Container rows */}
      <div>
        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
            Carregando containers…
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">Nenhum container encontrado</div>
        ) : (
          filtered.map(c => {
            const cfg = STATUS_CONFIG[c.state]
            const isExpanded = expanded === c.id
            const busy = (suffix: string) => actionLoading === c.id + suffix

            return (
              <div key={c.id} className="border-b border-devops-border/60 last:border-b-0">
                {/* Row */}
                <div
                  className={`px-6 py-3 grid grid-cols-[2fr_2fr_1fr_1fr_1fr_1fr_auto] gap-4 items-center hover:bg-devops-overlay/30 cursor-pointer transition-colors ${isExpanded ? 'bg-devops-overlay/20' : ''}`}
                  onClick={() => setExpanded(isExpanded ? null : c.id)}
                >
                  {/* Name */}
                  <div className="flex items-center gap-2 min-w-0">
                    {isExpanded
                      ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                      : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                    }
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot} ${c.state === 'restarting' ? 'animate-pulse' : ''}`} />
                    <span className="font-medium text-sm truncate">{c.name}</span>
                  </div>

                  {/* Image */}
                  <span className="text-sm text-muted-foreground/70 font-mono truncate">{c.image}</span>

                  {/* Status badge */}
                  <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full w-fit ${cfg.bg} ${cfg.text}`}>
                    {cfg.label}
                  </span>

                  {/* CPU */}
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm text-white">{c.cpu}</span>
                    {c.cpu !== '--' && (
                      <div className="w-full bg-devops-panel rounded-full h-1">
                        <div
                          className="h-1 rounded-full bg-blue-500"
                          style={{ width: c.cpu }}
                        />
                      </div>
                    )}
                  </div>

                  {/* RAM */}
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm text-white">{c.ram.split(' / ')[0]}</span>
                    {c.ramUsage > 0 && (
                      <div className="w-full bg-devops-panel rounded-full h-1">
                        <div
                          className={`h-1 rounded-full ${c.ramUsage > 70 ? 'bg-red-500' : c.ramUsage > 40 ? 'bg-amber-400' : 'bg-emerald-500'}`}
                          style={{ width: `${c.ramUsage}%` }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Uptime */}
                  <span className="text-sm text-muted-foreground/70">{c.uptime}</span>

                  {/* Actions */}
                  <div className="flex items-center gap-1 w-48 justify-end" onClick={e => e.stopPropagation()}>
                    {c.state !== 'running' && (
                      <ActionBtn
                        icon={<Play className="w-3.5 h-3.5" />}
                        label="Start"
                        cls="text-emerald-400 hover:bg-emerald-500/10 border-emerald-800"
                        loading={busy('start')}
                        onClick={() => handleAction(c, 'start')}
                      />
                    )}
                    {c.state === 'running' && (
                      <ActionBtn
                        icon={<Square className="w-3.5 h-3.5" />}
                        label="Stop"
                        cls="text-amber-400 hover:bg-amber-500/10 border-amber-800"
                        loading={busy('stop')}
                        onClick={() => handleAction(c, 'stop')}
                      />
                    )}
                    <ActionBtn
                      icon={<RotateCcw className="w-3.5 h-3.5" />}
                      label="Restart"
                      cls="text-blue-400 hover:bg-blue-500/10 border-blue-900"
                      loading={busy('restart')}
                      onClick={() => handleAction(c, 'restart')}
                    />
                    <ActionBtn
                      icon={<FileText className="w-3.5 h-3.5" />}
                      label="Logs"
                      cls="text-muted-foreground/50 hover:bg-devops-overlay border-devops-border"
                      loading={false}
                      onClick={() => handleLogs(c)}
                    />
                    <ActionBtn
                      icon={<BarChart3 className="w-3.5 h-3.5" />}
                      label="Stats"
                      cls="text-muted-foreground/50 hover:bg-devops-overlay border-devops-border"
                      loading={false}
                      onClick={() => handleStats(c)}
                    />
                    <ActionBtn
                      icon={<Trash2 className="w-3.5 h-3.5" />}
                      label="Delete"
                      cls="text-red-500 hover:bg-red-500/10 border-red-900"
                      loading={busy('remove')}
                      onClick={() => {
                        if (confirm(`Remover container "${c.name}"?`)) handleAction(c, 'remove')
                      }}
                    />
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="px-6 pb-4 pt-2 bg-devops-surface/40 border-t border-devops-border/40">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                      <DetailCard icon={<Hash className="w-4 h-4" />} label="Container ID" value={c.shortId} mono />
                      <DetailCard icon={<Network className="w-4 h-4" />} label="Ports" value={c.ports || '—'} mono />
                      <DetailCard icon={<Clock className="w-4 h-4" />} label="Criado em" value={c.created} />
                      <DetailCard icon={<Network className="w-4 h-4" />} label="Network" value={c.network} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-devops-panel/60 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <Cpu className="w-4 h-4 text-muted-foreground/70" />
                          <span className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">CPU & Memória</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <Metric label="CPU" value={c.cpu} pct={parseInt(c.cpu) || 0} color="bg-blue-500" />
                          <Metric label="Memória" value={c.ram} pct={c.ramUsage} color={c.ramUsage > 70 ? 'bg-red-500' : 'bg-emerald-500'} />
                        </div>
                      </div>
                      <div className="bg-devops-panel/60 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <FileText className="w-4 h-4 text-muted-foreground/70" />
                          <span className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">Comando</span>
                        </div>
                        <code className="text-xs text-muted-foreground/50 font-mono bg-devops-surface/50 px-2 py-1.5 rounded block break-all">
                          {c.command}
                        </code>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Logs Modal */}
      {logModal.open && (
        <Modal title={`Logs — ${logModal.name}`} onClose={() => setLogModal(p => ({ ...p, open: false }))}>
          <pre className="bg-black rounded-lg p-4 text-xs text-emerald-400 font-mono overflow-auto max-h-[60vh] whitespace-pre-wrap">
            {logModal.loading ? 'Carregando logs…' : logModal.logs}
          </pre>
          <div className="flex justify-end mt-3">
            <Button size="sm" variant="outline" className="border-devops-border text-muted-foreground/50 hover:bg-devops-surface"
              onClick={() => setLogModal(p => ({ ...p, open: false }))}>
              Fechar
            </Button>
          </div>
        </Modal>
      )}

      {/* Stats Modal */}
      {statsModal.open && (
        <Modal title={`Stats — ${statsModal.name}`} onClose={() => setStatsModal(p => ({ ...p, open: false }))}>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <StatBlock icon={<Cpu className="w-5 h-5 text-blue-400" />} label="CPU" value={statsModal.cpu} />
            <StatBlock icon={<MemoryStick className="w-5 h-5 text-emerald-400" />} label="Memória" value={statsModal.ram} />
            <StatBlock icon={<Network className="w-5 h-5 text-purple-400" />} label="Network" value={statsModal.net} />
            <StatBlock icon={<BarChart3 className="w-5 h-5 text-amber-400" />} label="Disk I/O" value={statsModal.disk} />
          </div>
          <div className="flex justify-end">
            <Button size="sm" variant="outline" className="border-devops-border text-muted-foreground/50 hover:bg-devops-surface"
              onClick={() => setStatsModal(p => ({ ...p, open: false }))}>
              Fechar
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function ActionBtn({
  icon, label, cls, loading, onClick,
}: {
  icon: React.ReactNode
  label: string
  cls: string
  loading: boolean
  onClick: () => void
}) {
  return (
    <button
      title={label}
      disabled={loading}
      onClick={onClick}
      className={`flex items-center justify-center w-7 h-7 rounded border text-xs transition-colors disabled:opacity-40 ${cls}`}
    >
      {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : icon}
    </button>
  )
}

function DetailCard({
  icon, label, value, mono = false,
}: {
  icon: React.ReactNode
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="bg-devops-panel/50 rounded-lg px-3 py-2">
      <div className="flex items-center gap-1.5 mb-1 text-muted-foreground">
        {icon}
        <span className="text-xs uppercase tracking-wide">{label}</span>
      </div>
      <span className={`text-sm text-devops-foreground break-all ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  )
}

function Metric({ label, value, pct, color }: { label: string; value: string; pct: number; color: string }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xs text-white font-medium">{value}</span>
      </div>
      <div className="w-full bg-devops-panel rounded-full h-1.5">
        <div className={`h-1.5 rounded-full transition-all ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
    </div>
  )
}

function StatBlock({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-devops-panel/60 rounded-lg p-4 flex items-center gap-3">
      {icon}
      <div>
        <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
        <div className="text-sm font-semibold text-white mt-0.5">{value}</div>
      </div>
    </div>
  )
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div
        className="bg-devops-overlay border border-devops-border rounded-xl shadow-2xl w-full max-w-2xl mx-4 p-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-white">{title}</h2>
          <button onClick={onClose} className="text-muted-foreground/70 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
