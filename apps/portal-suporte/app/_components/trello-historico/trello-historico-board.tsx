'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Archive, BarChart2, Search, X, ChevronRight,
  RefreshCw, Tag, AlertTriangle, CheckCircle2,
  Clock, Filter, History, Upload, CheckCircle, XCircle,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { TrelloHistoricoColumn } from './trello-historico-column'
import { TrelloHistoricoCardModal } from './trello-historico-card-modal'
import { araraApiFetch } from '@/lib/arara/arara-api-fetch'

// ─── Cores das labels ─────────────────────────────────────────────────────────
const LABEL_COLORS: Record<string, string> = {
  'Resolvido':          'bg-sem-success text-sem-success-fg border-sem-success-bd',
  'Aguardando Cliente': 'bg-sem-warning text-sem-warning-fg border-sem-warning-bd',
  'Com Pendência':      'bg-orange-100 text-orange-700 border-orange-200',
  'Bug':                'bg-sem-error text-sem-error-fg border-sem-error-bd',
  'Dúvida':             'bg-purple-100 text-purple-700 border-purple-200',
  'Melhoria':           'bg-sem-info text-sem-info-fg border-sem-info-bd',
  'Instalação PDV':     'bg-sky-100 text-sky-700 border-sky-200',
}

// Cores de severidade
const SEVERITY_COLORS: Record<string, string> = {
  N0: 'bg-red-600 text-white',
  N1: 'bg-orange-500 text-white',
  N2: 'bg-blue-500 text-white',
  N3: 'bg-muted-foreground/60 text-background',
}

// Ícones por lista
const LIST_ICONS: Record<string, string> = {
  'Novos Chamados':                   '📥',
  'Triagem':                          '🔎',
  'Em Atendimento':                   '🛠️',
  'Em teste / Validação':             '🧪',
  'Aguardando Cliente':               '⏳',
  'Pendência':                        '🔴',
  'Resolvido':                        '✅',
  'RESOLVIDO C/ MANUAL DE RESOLUÇÃO': '📖',
  'RESOLVIDO SEM MANUAL DE RESOLUÇÃO':'✔️',
  'POST-MORTEM (N0)':                 '💀',
  'ESCALA DE SUPORTE':                '📅',
  'Migração SAT|NFC-e':              '🔄',
  'Migração Concluída SAT|NFC-e':    '🏁',
}

export type TrelloCard = {
  id: string
  trelloId: string
  name: string
  labels: string[]
  ticketNumber: string | null
  clientName: string | null
  severity: string | null
  dueDate: string | null
  dueComplete: boolean
  dateLastActivity: string | null
  closed: boolean
  shortLink: string | null
  description: string | null
}

export type TrelloList = {
  id: string
  trelloId: string
  name: string
  closed: boolean
  position: number
  cardCount: number
}

export type BoardData = {
  lists: TrelloList[]
  stats: {
    totalCards: number
    byLabel: Record<string, number>
    bySeverity: Record<string, number>
    resolvedCount: number
  }
  recentCards: TrelloCard[]
}

type ImportState =
  | { status: 'idle' }
  | { status: 'uploading' }
  | { status: 'success'; imported: number; skipped: number; lists: number }
  | { status: 'error'; message: string }

export function TrelloHistoricoBoard() {
  const [board, setBoard]           = useState<BoardData | null>(null)
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [filterSeverity, setFilterSeverity] = useState('all')
  const [filterLabel, setFilterLabel]       = useState('all')
  const [selectedCard, setSelectedCard]     = useState<TrelloCard | null>(null)
  const [showClosed, setShowClosed]         = useState(false)
  const [importState, setImportState]       = useState<ImportState>({ status: 'idle' })
  const fileInputRef                        = useRef<HTMLInputElement>(null)

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    // Reset input so the same file can be re-selected
    e.target.value = ''

    setImportState({ status: 'uploading' })
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await araraApiFetch('/api/admin/import-trello-historico', {
        method: 'POST',
        body: form,
      })
      const json = await res.json()
      if (!res.ok) {
        setImportState({ status: 'error', message: json.error ?? 'Erro desconhecido' })
        return
      }
      setImportState({
        status: 'success',
        imported: json.imported,
        skipped: json.skipped,
        lists: json.lists,
      })
      // Recarrega o board automaticamente após importar
      await load()
    } catch {
      setImportState({ status: 'error', message: 'Falha na conexão. Tente novamente.' })
    }
  }

  const load = useCallback(async () => {
    setLoading(true)
    const res = await araraApiFetch('/api/admin/trello-historico')
    if (res.ok) {
      const data = await res.json()
      setBoard(data)
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const visibleLists = board?.lists.filter(l =>
    showClosed ? true : !l.closed
  ) ?? []

  const s = board?.stats

  return (
    <div className="mx-auto max-w-full px-4 py-6 space-y-5">
      {/* ─── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100">
            <History className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Histórico — Gestão de Suporte</h1>
            <p className="text-sm text-muted-foreground">
              Board Trello importado · dados históricos da equipe · somente leitura
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Input de arquivo oculto */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleImportFile}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setImportState({ status: 'idle' }); fileInputRef.current?.click() }}
            disabled={importState.status === 'uploading'}
            className="gap-1.5 border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 hover:border-indigo-300"
          >
            {importState.status === 'uploading' ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {importState.status === 'uploading' ? 'Importando...' : 'Importar JSON Trello'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowClosed(!showClosed)}>
            <Archive className="mr-1.5 h-4 w-4" />
            {showClosed ? 'Ocultar listas fechadas' : 'Ver listas fechadas'}
          </Button>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* ─── Import result banner ────────────────────────────────────────────── */}
      {importState.status === 'success' && (
        <div className="flex items-center justify-between rounded-lg border border-sem-success-bd bg-sem-success px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-sem-success-fg">
            <CheckCircle className="h-4 w-4 shrink-0 text-sem-success-fg" />
            <span>
              Importação concluída — <strong>{importState.lists}</strong> listas,{' '}
              <strong>{importState.imported}</strong> cards importados
              {importState.skipped > 0 && `, ${importState.skipped} com erro`}.
            </span>
          </div>
          <button onClick={() => setImportState({ status: 'idle' })} className="text-emerald-500 hover:text-sem-success-fg ml-4">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {importState.status === 'error' && (
        <div className="flex items-center justify-between rounded-lg border border-sem-error-bd bg-sem-error px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-sem-error-fg">
            <XCircle className="h-4 w-4 shrink-0 text-sem-error-fg" />
            <span>{importState.message}</span>
          </div>
          <button onClick={() => setImportState({ status: 'idle' })} className="text-red-500 hover:text-sem-error-fg ml-4">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ─── Stats ──────────────────────────────────────────────────────────── */}
      {s && (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <StatCard icon={<BarChart2 className="h-4 w-4 text-indigo-500" />}
            label="Total de cards" value={s.totalCards} />
          <StatCard icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />}
            label="Resolvidos" value={s.resolvedCount}
            sub={`${Math.round((s.resolvedCount / s.totalCards) * 100)}% do total`} />
          <StatCard icon={<Tag className="h-4 w-4 text-orange-500" />}
            label="Bugs registrados" value={s.byLabel['Bug'] ?? 0} />
          <StatCard icon={<AlertTriangle className="h-4 w-4 text-red-500" />}
            label="N0 críticos" value={s.bySeverity['N0'] ?? 0} />
        </div>
      )}

      {/* ─── Filtros ────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70" />
          <Input placeholder="Buscar card..." className="pl-9"
            value={search} onChange={e => setSearch(e.target.value)} />
          {search && (
            <button onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/70 hover:text-foreground/60">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <Select value={filterSeverity} onValueChange={setFilterSeverity}>
          <SelectTrigger className="w-36">
            <Filter className="mr-1.5 h-3.5 w-3.5" />
            <SelectValue placeholder="Severidade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="N0">N0 — Crítico</SelectItem>
            <SelectItem value="N1">N1 — Alto</SelectItem>
            <SelectItem value="N2">N2 — Médio</SelectItem>
            <SelectItem value="N3">N3 — Baixo</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterLabel} onValueChange={setFilterLabel}>
          <SelectTrigger className="w-44">
            <Tag className="mr-1.5 h-3.5 w-3.5" />
            <SelectValue placeholder="Label" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {Object.keys(LABEL_COLORS).map(l => (
              <SelectItem key={l} value={l}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {(filterSeverity !== 'all' || filterLabel !== 'all' || search) && (
          <Button variant="ghost" size="sm" onClick={() => {
            setSearch(''); setFilterSeverity('all'); setFilterLabel('all')
          }}>
            <X className="mr-1 h-3.5 w-3.5" /> Limpar filtros
          </Button>
        )}
      </div>

      {/* ─── Board Kanban ────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-32 text-muted-foreground/70">
          <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
          Carregando histórico...
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-6">
          {visibleLists.map(list => (
            <TrelloHistoricoColumn
              key={list.trelloId}
              list={list}
              icon={LIST_ICONS[list.name] ?? '📋'}
              labelColors={LABEL_COLORS}
              severityColors={SEVERITY_COLORS}
              search={search}
              filterSeverity={filterSeverity === 'all' ? '' : filterSeverity}
              filterLabel={filterLabel === 'all' ? '' : filterLabel}
              onCardClick={setSelectedCard}
            />
          ))}
          {visibleLists.length === 0 && (
            <div className="flex-1 text-center py-20 text-muted-foreground/70">
              Nenhuma lista encontrada.
            </div>
          )}
        </div>
      )}

      {/* ─── Modal de card ──────────────────────────────────────────────────── */}
      {selectedCard && (
        <TrelloHistoricoCardModal
          card={selectedCard}
          labelColors={LABEL_COLORS}
          severityColors={SEVERITY_COLORS}
          onClose={() => setSelectedCard(null)}
        />
      )}
    </div>
  )
}

function StatCard({ icon, label, value, sub }: {
  icon: React.ReactNode; label: string; value: number; sub?: string
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-1 space-y-0">
        <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold text-foreground">{value.toLocaleString('pt-BR')}</p>
        {sub && <p className="text-xs text-muted-foreground/70 mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  )
}
