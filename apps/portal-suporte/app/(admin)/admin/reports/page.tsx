'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { PRIORITY_LABELS } from '@/lib/ticket-priority'
import {
  BarChart2, TrendingUp, CheckCircle2, AlertTriangle, Users,
  MessageSquare, Shield, Activity, Calendar, Download, RefreshCw,
  History, Tag, Database, BrainCircuit, Clock,
  Search, ChevronUp, ChevronDown, ChevronsUpDown,
  ExternalLink, X, Building2, RotateCcw, Timer,
} from 'lucide-react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import { useReport, useReportHistory } from '@/hooks/use-reports'
import type { ReportPeriod } from '@/lib/api/reports'
import { formatDate, formatDateShort } from '@/lib/utils'

// ─── Types ─────────────────────────────────────────────────────────────────
type Period = 'weekly' | 'monthly' | 'annual'

const periodLabel: Record<Period, string> = {
  weekly: 'Semanal', monthly: 'Mensal', annual: 'Anual',
}

const statusLabel: Record<string, string> = {
  novos_chamados: 'Novos', triagem: 'Triagem', em_atendimento: 'Em atendimento',
  em_teste: 'Em teste', aguardando_cliente: 'Ag. cliente',
  resolvido_com_manual: 'Resolvido c/ manual', resolvido_sem_manual: 'Resolvido s/ manual',
  post_mortem: 'Post-mortem',
}
const statusColor: Record<string, string> = {
  novos_chamados: 'bg-sem-info text-sem-info-fg',
  triagem: 'bg-sem-warning text-sem-warning-fg',
  em_atendimento: 'bg-status-waiting text-status-waiting-fg',
  em_teste: 'bg-status-testing text-status-testing-fg',
  aguardando_cliente: 'bg-muted text-foreground/80',
  resolvido_com_manual: 'bg-sem-success text-sem-success-fg',
  resolvido_sem_manual: 'bg-sem-success text-sem-success-fg',
  post_mortem: 'bg-sem-error text-sem-error-fg',
}
const priorityLabel: Record<string, string> = PRIORITY_LABELS
const priorityColor: Record<string, string> = {
  urgent: 'bg-sem-error text-sem-error-fg', high: 'bg-priority-high text-priority-high-fg',
  medium: 'bg-sem-info text-sem-info-fg', low: 'bg-muted text-foreground/60',
  very_low: 'border border-dashed border-border text-muted-foreground',
}
// P0-P3 = tickets atuais; N0-N3 = histórico importado do Trello (não muda)
const severityColor: Record<string, string> = {
  P0: 'bg-sem-error text-sem-error-fg', P1: 'bg-priority-high text-priority-high-fg',
  P2: 'bg-sem-info text-sem-info-fg', P3: 'bg-muted text-foreground/60',
  N0: 'bg-sem-error text-sem-error-fg', N1: 'bg-priority-high text-priority-high-fg',
  N2: 'bg-sem-info text-sem-info-fg', N3: 'bg-muted text-foreground/60',
}
const barColor: Record<string, string> = {
  P0: 'bg-sem-error-fg', P1: 'bg-priority-high-fg', P2: 'bg-sem-info-fg', P3: 'bg-muted-foreground',
  N0: 'bg-sem-error-fg', N1: 'bg-priority-high-fg', N2: 'bg-sem-info-fg', N3: 'bg-muted-foreground',
  urgent: 'bg-sem-error-fg', high: 'bg-priority-high-fg', medium: 'bg-sem-info-fg', low: 'bg-muted-foreground',
  very_low: 'bg-muted-foreground/40',
}

const actionLabel: Record<string, string> = {
  ticket_created: 'Tickets criados', ticket_updated: 'Tickets editados',
  status_changed: 'Mudanças de status', ticket_assigned: 'Atribuições',
  message_added: 'Mensagens enviadas', internal_note_added: 'Notas internas',
  whatsapp_sent: 'WhatsApp enviado', sla_breached: 'SLA violado',
}

// ─── DataTable component ────────────────────────────────────────────────────
type SortDir = 'asc' | 'desc' | null
function DataTable({ columns, rows, emptyText = 'Sem dados' }: {
  columns: { key: string; label: string; sortable?: boolean; render?: (v: any, row: any) => React.ReactNode }[]
  rows: any[]
  emptyText?: string
}) {
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>(null)
  const [page, setPage] = useState(1)
  const PER_PAGE = 15

  function toggleSort(key: string) {
    if (sortKey !== key) { setSortKey(key); setSortDir('asc') }
    else if (sortDir === 'asc') setSortDir('desc')
    else { setSortKey(null); setSortDir(null) }
    setPage(1)
  }

  const sorted = useMemo(() => {
    if (!sortKey || !sortDir) return rows
    return [...rows].sort((a, b) => {
      const av = a[sortKey] ?? '', bv = b[sortKey] ?? ''
      const cmp = String(av).localeCompare(String(bv), 'pt-BR', { numeric: true })
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [rows, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(sorted.length / PER_PAGE))
  const pageRows = sorted.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  function SortIcon({ col }: { col: string }) {
    if (sortKey !== col) return <ChevronsUpDown className="h-3 w-3 text-muted-foreground/50" />
    if (sortDir === 'asc') return <ChevronUp className="h-3 w-3 text-primary" />
    return <ChevronDown className="h-3 w-3 text-primary" />
  }

  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              {columns.map(col => (
                <th key={col.key}
                  className={`px-4 py-3 text-left text-xs font-semibold text-foreground/60 uppercase tracking-wide whitespace-nowrap ${col.sortable !== false ? 'cursor-pointer select-none hover:bg-muted' : ''}`}
                  onClick={() => col.sortable !== false && toggleSort(col.key)}
                >
                  <div className="flex items-center gap-1">
                    {col.label}
                    {col.sortable !== false && <SortIcon col={col.key} />}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {pageRows.length === 0 ? (
              <tr><td colSpan={columns.length} className="px-4 py-10 text-center text-muted-foreground/70">{emptyText}</td></tr>
            ) : (
              pageRows.map((row, i) => (
                <tr key={i} className="hover:bg-muted/50 transition-colors">
                  {columns.map(col => (
                    <td key={col.key} className="px-4 py-2.5 text-foreground/80 whitespace-nowrap max-w-xs truncate">
                      {col.render ? col.render(row[col.key], row) : (row[col.key] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {sorted.length > PER_PAGE && (
        <div className="flex items-center justify-between mt-3 text-sm text-muted-foreground">
          <span>{sorted.length} registros · página {page} de {totalPages}</span>
          <div className="flex gap-1">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="px-3 py-1 rounded border border-border disabled:opacity-40 hover:bg-muted/50">
              ← Ant
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const n = Math.max(1, Math.min(totalPages - 4, page - 2)) + i
              return (
                <button key={n} onClick={() => setPage(n)}
                  className={`px-3 py-1 rounded border ${page === n ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted/50'}`}>
                  {n}
                </button>
              )
            })}
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="px-3 py-1 rounded border border-border disabled:opacity-40 hover:bg-muted/50">
              Próx →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main page ──────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const [period, setPeriod]       = useState<Period>('monthly')
  const [activeTab, setActiveTab] = useState<'resumo' | 'tickets' | 'trello' | 'history'>('resumo')

  // Filters
  const [search, setSearch]             = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [filterSev, setFilterSev]       = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [companyFilter, setCompanyFilter]   = useState<string | undefined>(undefined)

  const { data, loading, error, reload } = useReport(period, undefined, companyFilter)
  const { snapshots, loading: histLoading, reload: loadHistory } = useReportHistory(period)

  useEffect(() => { if (activeTab === 'history') loadHistory() }, [activeTab, period])

  // Debounce da busca — evita re-filtrar (JSON.stringify de cada linha) a cada tecla.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250)
    return () => clearTimeout(t)
  }, [search])

  // ── Filtered rows for datatables ────────────────────────────────────────
  const filteredTickets = useMemo(() => {
    let rows: any[] = data?.tickets_list ?? []
    if (debouncedSearch) rows = rows.filter(r => JSON.stringify(r).toLowerCase().includes(debouncedSearch.toLowerCase()))
    if (filterSev)      rows = rows.filter(r => r.severity === filterSev)
    if (filterStatus)   rows = rows.filter(r => r.status === filterStatus)
    if (filterPriority) rows = rows.filter(r => r.priority === filterPriority)
    return rows
  }, [data, debouncedSearch, filterSev, filterStatus, filterPriority])

  const filteredTrello = useMemo(() => {
    let rows: any[] = data?.trello_cards_list ?? []
    if (debouncedSearch) rows = rows.filter(r => JSON.stringify(r).toLowerCase().includes(debouncedSearch.toLowerCase()))
    if (filterSev) rows = rows.filter(r => r.severity === filterSev)
    return rows
  }, [data, debouncedSearch, filterSev])

  // ── CSV Export ──────────────────────────────────────────────────────────
  function exportCSV() {
    if (!data) return
    const s = data.summary

    const ticketRows = (data.tickets_list ?? []).map((t: any) => [
      t.title, statusLabel[t.status] ?? t.status, priorityLabel[t.priority] ?? t.priority,
      t.severity ?? '—', t.company ?? '—', t.assignee, t.creator,
      formatDateShort(t.created_at),
    ])

    const trelloRows = (data.trello_cards_list ?? []).map((c: any) => [
      c.ticket_num ?? '—', c.client ?? '—', c.name, c.list,
      c.severity ?? '—', (c.labels ?? []).join('; '),
      formatDateShort(c.last_activity),
      c.resolved ? 'Sim' : 'Não',
    ])

    const rows = [
      [`Relatório de Suporte — ${periodLabel[period]}`],
      [`Período`, `${formatDateShort(data.from)} – ${formatDateShort(data.to)}`],
      [],
      [`── RESUMO ──`],
      [`Tickets criados`, s.tickets_created],
      [`  Portal`, s.portal_created],
      [`  Histórico`, s.hist_created],
      [`Tickets resolvidos`, s.tickets_resolved],
      [`Em aberto`, s.tickets_open],
      [`Mensagens`, s.messages_sent],
      [`SLA Compliance`, `${s.sla_compliance_pct}%`],
      [`SLA violados`, s.sla_breached],
      [],
      [`── TICKETS DO PORTAL ──`],
      [`Título`, `Status`, `Prioridade`, `Severidade`, `Empresa`, `Atribuído`, `Criado por`, `Data`],
      ...ticketRows,
      [],
      [`── HISTÓRICO TRELLO ──`],
      [`Nº Ticket`, `Cliente`, `Nome do Card`, `Lista`, `Severidade`, `Labels`, `Última atividade`, `Resolvido`],
      ...trelloRows,
    ]

    const csv = rows.map(r => r.map((v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `relatorio_${period}_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const s = data?.summary

  const tabs = [
    { key: 'resumo',  label: 'Resumo',          icon: BarChart2 },
    { key: 'tickets', label: `Tickets Portal${data ? ` (${(data.tickets_list ?? []).length})` : ''}`, icon: Database },
    { key: 'trello',  label: `Histórico Trello${data ? ` (${(data.trello_cards_list ?? []).length})` : ''}`, icon: History },
    { key: 'history', label: `Histórico Salvo${snapshots.length > 0 ? ` (${snapshots.length})` : ''}`, icon: Clock },
  ] as const

  return (
    <div className="pt-14 lg:pt-0">
      <div className="mx-auto max-w-screen-2xl px-6 py-8 space-y-5">

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Relatórios</h1>
            <p className="mt-1 text-muted-foreground">Portal de suporte + histórico do board Trello</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={() => reload()} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
            <Button onClick={exportCSV} disabled={!data || loading}>
              <Download className="mr-2 h-4 w-4" />
              Exportar CSV
            </Button>
          </div>
        </div>

        {/* ── Period selector ── */}
        <div className="flex gap-2 flex-wrap">
          {(['weekly', 'monthly', 'annual'] as Period[]).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-all ${
                period === p
                  ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                  : 'bg-background text-foreground/60 border-border hover:border-primary/50 hover:text-primary'
              }`}>
              <Calendar className="h-4 w-4" />
              {periodLabel[p]}
            </button>
          ))}
          {data && !loading && (
            <span className="ml-2 self-center text-sm text-muted-foreground/70">
              {formatDateShort(data.from, { day: '2-digit', month: 'short', year: 'numeric' })}
              {' – '}
              {formatDateShort(data.to, { day: '2-digit', month: 'short', year: 'numeric' })}
            </span>
          )}
        </div>

        {/* ── Filter bar ── */}
        <div className="flex gap-3 flex-wrap items-center rounded-xl border border-border bg-background px-4 py-3">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70" />
            <Input
              placeholder="Buscar em tickets e histórico..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X className="h-3.5 w-3.5 text-muted-foreground/70 hover:text-foreground/60" />
              </button>
            )}
          </div>

          {/* Company filter — populated from backend */}
          {(data?.available_companies ?? []).length > 0 && (
            <select value={companyFilter ?? ''} onChange={e => setCompanyFilter(e.target.value || undefined)}
              className="h-9 rounded-md border border-border px-3 text-sm text-foreground/80 bg-background focus:outline-none focus:ring-2 focus:ring-ring">
              <option value="">Empresa (todas)</option>
              {(data!.available_companies).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}

          <select value={filterSev} onChange={e => setFilterSev(e.target.value)}
            className="h-9 rounded-md border border-border px-3 text-sm text-foreground/80 bg-background focus:outline-none focus:ring-2 focus:ring-ring">
            <option value="">Severidade (todas)</option>
            {/* Atuais (P0-P3, alinhado com TicketSeverity enum) */}
            <option value="P0">P0 — Crítico</option>
            <option value="P1">P1 — Alto</option>
            <option value="P2">P2 — Médio</option>
            <option value="P3">P3 — Baixo</option>
            {/* Histórico do Trello — mantido pra filtrar imports antigos */}
            <option value="N0">N0 — Crítico (histórico)</option>
            <option value="N1">N1 — Alto (histórico)</option>
            <option value="N2">N2 — Médio (histórico)</option>
            <option value="N3">N3 — Baixo (histórico)</option>
          </select>

          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="h-9 rounded-md border border-border px-3 text-sm text-foreground/80 bg-background focus:outline-none focus:ring-2 focus:ring-ring">
            <option value="">Status (todos)</option>
            {Object.entries(statusLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>

          <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)}
            className="h-9 rounded-md border border-border px-3 text-sm text-foreground/80 bg-background focus:outline-none focus:ring-2 focus:ring-ring">
            <option value="">Prioridade (todas)</option>
            {Object.entries(priorityLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>

          {(search || filterSev || filterStatus || filterPriority || companyFilter) && (
            <button onClick={() => { setSearch(''); setFilterSev(''); setFilterStatus(''); setFilterPriority(''); setCompanyFilter(undefined) }}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-sem-error-fg transition-colors">
              <X className="h-3 w-3" /> Limpar filtros
            </button>
          )}
        </div>

        {/* ── Error ── */}
        {error && (
          <div className="rounded-lg border border-sem-error-bd bg-sem-error px-4 py-3 text-sm text-sem-error-fg flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {/* ── Loading skeleton ── */}
        {loading && (
          <div className="flex items-center justify-center py-24 text-muted-foreground/70 gap-3">
            <RefreshCw className="h-5 w-5 animate-spin" />
            Carregando relatório...
          </div>
        )}

        {!loading && data && (
          <>
            {/* ── KPI cards ── */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
              <Card>
                <CardContent className="pt-5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground font-medium">Tickets criados</span>
                    <BarChart2 className="h-4 w-4 text-primary" />
                  </div>
                  <p className="mt-2 text-3xl font-bold text-foreground">{s.tickets_created}</p>
                  <div className="mt-1 flex gap-3 text-xs text-muted-foreground/70">
                    <span className="flex items-center gap-0.5"><Database className="h-3 w-3" /> {s.portal_created} portal</span>
                    <span className="flex items-center gap-0.5"><History className="h-3 w-3" /> {s.hist_created} hist.</span>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground font-medium">Resolvidos</span>
                    <CheckCircle2 className="h-4 w-4 text-sem-success-fg" />
                  </div>
                  <p className="mt-2 text-3xl font-bold text-sem-success-fg">{s.tickets_resolved}</p>
                  <div className="mt-1 flex gap-3 text-xs text-muted-foreground/70">
                    <span><Database className="inline h-3 w-3 mr-0.5" />{s.portal_resolved} portal</span>
                    <span><History className="inline h-3 w-3 mr-0.5" />{s.hist_resolved} hist.</span>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground font-medium">Em aberto</span>
                    <Activity className="h-4 w-4 text-sem-warning-fg" />
                  </div>
                  <p className="mt-2 text-3xl font-bold text-sem-warning-fg">{s.tickets_open}</p>
                  <p className="mt-1 text-xs text-muted-foreground/70">apenas portal</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground font-medium">SLA Compliance</span>
                    <Shield className="h-4 w-4 text-primary" />
                  </div>
                  <p className={`mt-2 text-3xl font-bold ${s.sla_compliance_pct >= 95 ? 'text-sem-success-fg' : s.sla_compliance_pct >= 80 ? 'text-sem-warning-fg' : 'text-sem-error-fg'}`}>
                    {s.sla_compliance_pct}%
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground/70">{s.sla_breached} violados · meta 95%</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground font-medium">Mensagens</span>
                    <MessageSquare className="h-4 w-4 text-muted-foreground/70" />
                  </div>
                  <p className="mt-2 text-3xl font-bold text-foreground">{s.messages_sent}</p>
                  <p className="mt-1 text-xs text-muted-foreground/70">enviadas no período</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground font-medium">Tempo médio resposta</span>
                    <Timer className="h-4 w-4 text-sem-info-fg" />
                  </div>
                  <p className="mt-2 text-3xl font-bold text-sem-info-fg">
                    {s.avg_response_hours != null ? `${s.avg_response_hours}h` : '—'}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground/70">da abertura à 1ª resposta</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground font-medium">Taxa de reabertura</span>
                    <RotateCcw className="h-4 w-4 text-sem-error-fg" />
                  </div>
                  <p className={`mt-2 text-3xl font-bold ${(s.reopen_rate_pct ?? 0) > 10 ? 'text-sem-error-fg' : 'text-foreground'}`}>
                    {s.reopen_rate_pct ?? 0}%
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground/70">{s.reopened_count ?? 0} ticket{(s.reopened_count ?? 0) !== 1 ? 's' : ''} reaberto{(s.reopened_count ?? 0) !== 1 ? 's' : ''}</p>
                </CardContent>
              </Card>
            </div>

            {/* ── Tabs ── */}
            <div className="border-b border-border">
              <div className="flex gap-0 overflow-x-auto">
                {tabs.map(tab => (
                  <button key={tab.key} onClick={() => setActiveTab(tab.key as any)}
                    className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                      activeTab === tab.key
                        ? 'border-primary text-primary'
                        : 'border-transparent text-muted-foreground hover:text-foreground/80 hover:border-border'
                    }`}>
                    <tab.icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* ══════════════════════ TAB: RESUMO ══════════════════════ */}
            {activeTab === 'resumo' && (
              <div className="space-y-5">
                <div className="grid gap-5 md:grid-cols-3">
                  {/* SLA */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Shield className="h-4 w-4 text-primary" /> SLA Compliance
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="text-center">
                        <p className={`text-5xl font-bold ${s.sla_compliance_pct >= 95 ? 'text-sem-success-fg' : s.sla_compliance_pct >= 80 ? 'text-sem-warning-fg' : 'text-sem-error-fg'}`}>
                          {s.sla_compliance_pct}%
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">Meta: 95%</p>
                      </div>
                      <Progress value={s.sla_compliance_pct} className="h-3" />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{s.sla_total} com SLA</span>
                        <span className="text-sem-error-fg">{s.sla_breached} violados</span>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Por Prioridade */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center justify-between">
                        Por Prioridade
                        <span className="text-xs font-normal text-muted-foreground/70 flex items-center gap-1"><Database className="h-3 w-3" /> portal</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {Object.keys(data.by_priority ?? {}).length === 0
                        ? <p className="text-sm text-muted-foreground/70">Sem dados no período</p>
                        : Object.entries(data.by_priority).map(([k, v]: any) => {
                          const max = Math.max(...Object.values(data.by_priority).map(Number))
                          return (
                            <div key={k} className="space-y-1">
                              <div className="flex justify-between text-sm">
                                <span className="flex items-center gap-1.5">
                                  <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${priorityColor[k] ?? 'bg-muted text-foreground/60'}`}>
                                    {priorityLabel[k] ?? k}
                                  </span>
                                </span>
                                <span className="font-semibold">{v}</span>
                              </div>
                              <div className="h-2 w-full rounded-full bg-muted">
                                <div className={`h-2 rounded-full ${barColor[k] ?? 'bg-muted-foreground'}`} style={{ width: `${(v / max) * 100}%` }} />
                              </div>
                            </div>
                          )
                        })}
                    </CardContent>
                  </Card>

                  {/* Por Severidade */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center justify-between">
                        Por Severidade
                        <span className="text-xs font-normal text-primary flex items-center gap-1"><History className="h-3 w-3" /> combinado</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {Object.keys(data.by_severity ?? {}).length === 0
                        ? <p className="text-sm text-muted-foreground/70">Sem dados no período</p>
                        : Object.entries(data.by_severity).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]: any) => {
                          const max = Math.max(...Object.values(data.by_severity).map(Number))
                          const portal = data.by_severity_portal?.[k] ?? 0
                          const hist   = data.by_severity_hist?.[k] ?? 0
                          return (
                            <div key={k} className="space-y-1">
                              <div className="flex justify-between text-sm">
                                <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-mono font-bold ${severityColor[k] ?? 'bg-muted text-foreground/60'}`}>{k}</span>
                                <span className="font-semibold">{v}</span>
                              </div>
                              <div className="h-2 w-full rounded-full bg-muted">
                                <div className={`h-2 rounded-full ${barColor[k] ?? 'bg-muted-foreground'}`} style={{ width: `${(v / max) * 100}%` }} />
                              </div>
                              {(portal > 0 || hist > 0) && (
                                <div className="flex gap-3 text-xs text-muted-foreground/70">
                                  {portal > 0 && <span><Database className="inline h-3 w-3 mr-0.5" />{portal}</span>}
                                  {hist   > 0 && <span><History  className="inline h-3 w-3 mr-0.5" />{hist}</span>}
                                </div>
                              )}
                            </div>
                          )
                        })}
                    </CardContent>
                  </Card>
                </div>

                <div className="grid gap-5 lg:grid-cols-2">
                  {/* Agent performance */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Users className="h-4 w-4" /> Performance por Agente
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {(data.agent_performance ?? []).length === 0
                        ? <p className="text-sm text-muted-foreground/70">Nenhum dado de agente no período.</p>
                        : (data.agent_performance).map((a: any, i: number) => {
                          const max = data.agent_performance[0]?.tickets ?? 1
                          return (
                            <div key={i} className="space-y-1">
                              <div className="flex justify-between text-sm">
                                <span className="font-medium">{a.agent_name}</span>
                                <span className="text-muted-foreground">{a.tickets} ticket{a.tickets !== 1 ? 's' : ''}</span>
                              </div>
                              <div className="h-2 w-full rounded-full bg-muted">
                                <div className="h-2 rounded-full bg-primary" style={{ width: `${(a.tickets / max) * 100}%` }} />
                              </div>
                            </div>
                          )
                        })}
                    </CardContent>
                  </Card>

                  {/* Action breakdown */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Activity className="h-4 w-4" /> Ações da Equipe
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {Object.keys(data.action_summary ?? {}).length === 0
                          ? <p className="text-sm text-muted-foreground/70">Nenhuma ação registrada.</p>
                          : Object.entries(data.action_summary)
                            .sort((a: any, b: any) => b[1] - a[1])
                            .map(([action, count]: any) => (
                              <div key={action} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
                                <span className="text-foreground/60">{actionLabel[action] ?? action}</span>
                                <span className="font-semibold">{count}</span>
                              </div>
                            ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Agent Volume + Company Breakdown */}
                <div className="grid gap-5 lg:grid-cols-2">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Users className="h-4 w-4 text-primary" /> Volume por Agente
                        <span className="ml-auto text-xs font-normal text-muted-foreground/70">tickets resolvidos</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {(data.agent_volume ?? []).length === 0
                        ? <p className="text-sm text-muted-foreground/70">Nenhum dado no período.</p>
                        : (
                          <div className="space-y-2">
                            {data.agent_volume.map((a, i) => (
                              <div key={i} className="flex items-center gap-3 rounded-lg bg-muted/50 px-3 py-2.5">
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-foreground truncate">{a.agent_name}</p>
                                  <p className="text-xs text-muted-foreground/70">
                                    {a.tickets_resolved} resolvido{a.tickets_resolved !== 1 ? 's' : ''} · ~{a.avg_resolution_hours}h resolução
                                  </p>
                                </div>
                                <span className="text-lg font-bold text-primary">{a.tickets_resolved}</span>
                              </div>
                            ))}
                          </div>
                        )
                      }
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Building2 className="h-4 w-4 text-muted-foreground" /> Tickets por Empresa
                        <span className="ml-auto text-xs font-normal text-muted-foreground/70">top 15 no período</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {(data.company_breakdown ?? []).length === 0
                        ? <p className="text-sm text-muted-foreground/70">Nenhum dado no período.</p>
                        : (() => {
                          const max = data.company_breakdown[0]?.count ?? 1
                          return (
                            <div className="space-y-2">
                              {data.company_breakdown.map((c, i) => (
                                <div key={i} className="space-y-1">
                                  <div className="flex justify-between text-sm">
                                    <span className="font-medium text-foreground/80 truncate max-w-[180px]" title={c.company}>{c.company}</span>
                                    <span className="font-semibold ml-2 shrink-0">{c.count}</span>
                                  </div>
                                  <div className="h-1.5 w-full rounded-full bg-muted">
                                    <div className="h-1.5 rounded-full bg-primary/70" style={{ width: `${(c.count / max) * 100}%` }} />
                                  </div>
                                </div>
                              ))}
                            </div>
                          )
                        })()
                      }
                    </CardContent>
                  </Card>
                </div>

                {/* Activity timeline */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <TrendingUp className="h-4 w-4" /> Timeline de Atividade
                      <span className="ml-auto text-xs font-normal text-muted-foreground/70">últimas 50 ações</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="max-h-80 overflow-y-auto space-y-1">
                      {(data.timeline ?? []).length === 0
                        ? <p className="text-sm text-muted-foreground/70">Sem atividade registrada.</p>
                        : (data.timeline).map((t: any, i: number) => (
                          <div key={i} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-muted/50">
                            <div className="h-2 w-2 shrink-0 rounded-full bg-primary/70" />
                            <span className="flex-1 text-sm text-foreground/80">
                              <strong>{t.agent}</strong> — {actionLabel[t.action] ?? t.action}
                            </span>
                            <span className="text-xs text-muted-foreground/70 shrink-0">
                              {formatDate(t.created_at, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        ))}
                    </div>
                  </CardContent>
                </Card>

                {/* IA */}
                {data.ai && (
                  <Card className="border border-status-triage-bd bg-status-triage">
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <BrainCircuit className="h-4 w-4 text-status-triage-fg" />
                        Inteligência Artificial
                        <span className="ml-auto text-xs font-normal text-muted-foreground">no período</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        {[
                          { label: 'Triados pela IA', value: data.ai.triaged_count, color: 'text-status-triage-fg', border: 'border-status-triage-bd' },
                          { label: 'Prioridade ajustada', value: `${data.ai.priority_changed} (${data.ai.priority_change_pct}%)`, color: 'text-sem-warning-fg', border: 'border-sem-warning-bd' },
                          { label: 'Treinamentos', value: data.ai.total_learning_runs, color: 'text-sem-success-fg', border: 'border-sem-success-bd' },
                          { label: 'FAQs gerados', value: (data.ai.learning_runs ?? []).reduce((s: number, r: any) => s + (r.faq_created ?? 0), 0), color: 'text-sem-info-fg', border: 'border-sem-info-bd' },
                        ].map(kpi => (
                          <div key={kpi.label} className={`rounded-lg bg-background border ${kpi.border} p-3 text-center`}>
                            <p className="text-xs text-muted-foreground">{kpi.label}</p>
                            <p className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Trello historico totals */}
                {data.trello_historico && (
                  <Card className="border border-sem-info-bd bg-sem-info">
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <History className="h-4 w-4 text-primary" />
                        Histórico do Board Trello — Visão Geral
                        <Link href="/admin/historico-trello" className="ml-auto">
                          <button className="rounded px-2 py-0.5 text-xs bg-status-migration text-status-migration-fg hover:bg-status-migration/80 transition-colors flex items-center gap-1">
                            Ver board <ExternalLink className="h-3 w-3" />
                          </button>
                        </Link>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        {[
                          { label: 'Total de cards', value: data.trello_historico.total_cards, color: 'text-foreground' },
                          { label: 'Resolvidos', value: data.trello_historico.total_resolved, color: 'text-sem-success-fg' },
                          { label: 'No período', value: data.trello_historico.period_cards, color: 'text-primary' },
                          { label: 'N0 Críticos', value: data.trello_historico.by_severity?.['N0'] ?? 0, color: 'text-sem-warning-fg' },
                        ].map(kpi => (
                          <div key={kpi.label} className="rounded-lg bg-background border border-border p-3 text-center">
                            <p className="text-xs text-muted-foreground">{kpi.label}</p>
                            <p className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {/* ══════════════════════ TAB: TICKETS PORTAL ══════════════════════ */}
            {activeTab === 'tickets' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>{filteredTickets.length} ticket{filteredTickets.length !== 1 ? 's' : ''} encontrado{filteredTickets.length !== 1 ? 's' : ''}</span>
                </div>
                <DataTable
                  emptyText="Nenhum ticket encontrado para os filtros selecionados."
                  columns={[
                    { key: 'title', label: 'Título', render: (v, r) => (
                      <Link href={`/admin/tickets/view/?id=${encodeURIComponent(r.id)}`} className="font-medium text-primary hover:underline flex items-center gap-1 max-w-xs truncate">
                        {v} <ExternalLink className="h-3 w-3 shrink-0" />
                      </Link>
                    )},
                    { key: 'status', label: 'Status', render: (v) => (
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[v] ?? 'bg-muted text-foreground/60'}`}>
                        {statusLabel[v] ?? v}
                      </span>
                    )},
                    { key: 'priority', label: 'Prioridade', render: (v) => (
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${priorityColor[v] ?? 'bg-muted text-foreground/60'}`}>
                        {priorityLabel[v] ?? v}
                      </span>
                    )},
                    { key: 'severity', label: 'Severidade', render: (v) => v
                      ? <span className={`inline-flex px-2 py-0.5 rounded text-xs font-mono font-bold ${severityColor[v] ?? 'bg-muted text-foreground/60'}`}>{v}</span>
                      : <span className="text-muted-foreground/50">—</span>
                    },
                    { key: 'company', label: 'Empresa' },
                    { key: 'assignee', label: 'Atribuído' },
                    { key: 'creator', label: 'Criado por' },
                    { key: 'created_at', label: 'Data', render: (v) => formatDateShort(v) },
                  ]}
                  rows={filteredTickets}
                />
              </div>
            )}

            {/* ══════════════════════ TAB: HISTÓRICO TRELLO ══════════════════════ */}
            {activeTab === 'trello' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>{filteredTrello.length} card{filteredTrello.length !== 1 ? 's' : ''} encontrado{filteredTrello.length !== 1 ? 's' : ''}</span>
                  <span className="text-xs text-muted-foreground/70 flex items-center gap-1">
                    <History className="h-3 w-3" /> cards com atividade no período selecionado
                  </span>
                </div>
                <DataTable
                  emptyText="Nenhum card encontrado para os filtros selecionados."
                  columns={[
                    { key: 'ticket_num', label: 'Nº Ticket', render: (v) => v
                      ? <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{v}</span>
                      : <span className="text-muted-foreground/50">—</span>
                    },
                    { key: 'client', label: 'Cliente' },
                    { key: 'name', label: 'Descrição', render: (v) => (
                      <span className="max-w-xs truncate block text-foreground/80" title={v}>{v}</span>
                    )},
                    { key: 'severity', label: 'Severidade', render: (v) => v
                      ? <span className={`inline-flex px-2 py-0.5 rounded text-xs font-mono font-bold ${severityColor[v] ?? 'bg-muted text-foreground/60'}`}>{v}</span>
                      : <span className="text-muted-foreground/50">—</span>
                    },
                    { key: 'list', label: 'Lista/Status', render: (v) => (
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                        v?.startsWith('RESOLVIDO') || v === 'Resolvido' ? 'bg-sem-success text-sem-success-fg' :
                        v === 'Pendência' ? 'bg-sem-warning text-sem-warning-fg' :
                        'bg-muted text-foreground/60'
                      }`}>{v}</span>
                    )},
                    { key: 'labels', label: 'Labels', sortable: false, render: (v: string[]) => (
                      <div className="flex gap-1 flex-wrap">
                        {(v ?? []).slice(0, 3).map((l, i) => (
                          <span key={i} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-status-migration/10 text-status-migration-fg rounded text-xs">
                            <Tag className="h-2.5 w-2.5" />{l}
                          </span>
                        ))}
                        {(v ?? []).length > 3 && <span className="text-xs text-muted-foreground/70">+{v.length - 3}</span>}
                      </div>
                    )},
                    { key: 'resolved', label: 'Resolvido', render: (v) => v
                      ? <span className="text-sem-success-fg font-medium text-xs">✓ Sim</span>
                      : <span className="text-muted-foreground/70 text-xs">Não</span>
                    },
                    { key: 'last_activity', label: 'Última atividade', render: (v) => formatDateShort(v) },
                  ]}
                  rows={filteredTrello}
                />
              </div>
            )}
          </>
        )}

        {/* ══════════════════════ TAB: HISTÓRICO SALVO ══════════════════════ */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Snapshots salvos automaticamente a cada acesso ao relatório.</p>
              <Button variant="outline" size="sm" onClick={() => loadHistory()} disabled={histLoading}>
                <RefreshCw className={`mr-2 h-3 w-3 ${histLoading ? 'animate-spin' : ''}`} />
                Atualizar
              </Button>
            </div>
            {histLoading ? (
              <div className="flex items-center justify-center py-20 text-muted-foreground/70 gap-2">
                <RefreshCw className="h-4 w-4 animate-spin" /> Carregando histórico...
              </div>
            ) : snapshots.length === 0 ? (
              <div className="rounded-xl border-2 border-dashed border-border py-16 text-center text-muted-foreground/70">
                <Clock className="mx-auto mb-3 h-8 w-8 opacity-40" />
                <p className="font-medium">Nenhum snapshot salvo ainda</p>
                <p className="mt-1 text-sm">Acesse a aba "Resumo" para gerar o primeiro snapshot.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {snapshots.map((snap: any) => (
                  <Card key={snap.id} className="hover:shadow-sm transition-shadow">
                    <CardContent className="py-3 px-4">
                      <div className="flex items-center justify-between gap-4 flex-wrap">
                        <div className="flex items-center gap-3">
                          <span className="rounded-full bg-status-migration text-status-migration-fg px-2.5 py-0.5 text-xs font-semibold uppercase">
                            {periodLabel[snap.period as Period] ?? snap.period}
                          </span>
                          <div>
                            <p className="text-sm font-medium text-foreground">
                              {formatDateShort(snap.periodFrom, { day: '2-digit', month: 'short', year: 'numeric' })}
                              {' – '}
                              {formatDateShort(snap.periodTo, { day: '2-digit', month: 'short', year: 'numeric' })}
                            </p>
                            <p className="text-xs text-muted-foreground/70">
                              Salvo em {formatDate(snap.createdAt)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-6 flex-wrap">
                          {[
                            { label: 'Criados', value: snap.ticketsCreated, color: 'text-foreground' },
                            { label: 'Resolvidos', value: snap.ticketsResolved, color: 'text-sem-success-fg' },
                            { label: 'Em aberto', value: snap.ticketsOpen, color: 'text-sem-warning-fg' },
                            { label: 'SLA', value: `${snap.slaCompliancePct}%`, color: snap.slaCompliancePct >= 95 ? 'text-sem-success-fg' : snap.slaCompliancePct >= 80 ? 'text-sem-warning-fg' : 'text-sem-error-fg' },
                            { label: 'Msgs', value: snap.messagesSent, color: 'text-foreground/60' },
                          ].map(kpi => (
                            <div key={kpi.label} className="text-center">
                              <p className="text-xs text-muted-foreground/70">{kpi.label}</p>
                              <p className={`text-lg font-bold ${kpi.color}`}>{kpi.value}</p>
                            </div>
                          ))}
                          <a
                            href={`/api/reports/${snap.id}/pdf`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-2 flex items-center gap-1.5 rounded-md border border-sem-info-bd bg-sem-info px-3 py-1.5 text-xs font-medium text-sem-info-fg hover:bg-sem-info/80 transition-colors"
                            title="Baixar PDF Executivo"
                          >
                            <Download className="h-3.5 w-3.5" />
                            PDF
                          </a>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
