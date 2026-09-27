'use client'

import { useState } from 'react'
import { CheckCircle2, XCircle, AlertTriangle, Info, ChevronDown, ChevronRight, Download } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ValidationResult, ValidationError } from '@/lib/sped/validator'

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_COLORS = {
  APROVADO: 'bg-sem-success text-sem-success-fg border-sem-success-bd',
  COM_AVISOS: 'bg-sem-warning text-sem-warning-fg border-sem-warning-bd',
  COM_ERROS: 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300 border-orange-200 dark:border-orange-700',
  REPROVADO: 'bg-sem-error text-sem-error-fg border-sem-error-bd',
}

const SEVERITY_ICON = {
  CRITICAL: <XCircle className="h-4 w-4 text-sem-error-fg flex-shrink-0" />,
  ERROR: <AlertTriangle className="h-4 w-4 text-orange-500 flex-shrink-0" />,
  WARNING: <AlertTriangle className="h-4 w-4 text-yellow-500 flex-shrink-0" />,
  INFO: <Info className="h-4 w-4 text-blue-400 flex-shrink-0" />,
}

const SEVERITY_ROW = {
  CRITICAL: 'border-l-2 border-sem-error-bd bg-sem-error',
  ERROR: 'border-l-2 border-orange-300 dark:border-orange-700 bg-orange-50/30 dark:bg-orange-900/20',
  WARNING: 'border-l-2 border-sem-warning-bd bg-sem-warning',
  INFO: 'border-l-2 border-sem-info-bd',
}

const BLOCO_STATUS_COLOR = {
  ok: 'bg-sem-success text-sem-success-fg border-sem-success-bd',
  error: 'bg-sem-error text-sem-error-fg border-sem-error-bd',
  warning: 'bg-sem-warning text-sem-warning-fg border-sem-warning-bd',
  na: 'bg-muted text-muted-foreground/70 border-border',
}

// ── Exportar CSV ──────────────────────────────────────────────────────────────

function exportCsvDetalhado(errors: ValidationError[], fileName: string) {
  const header = 'Severidade,Categoria,Bloco,Registro,Linha,Campo,Código,Mensagem,Sugestão,Técnico\n'
  const rows = errors.map(e => [
    e.severity, e.category, e.bloco, e.registro, e.linha,
    e.campo ?? '', e.code, `"${e.mensagem}"`, `"${e.sugestao}"`, `"${e.technical}"`,
  ].join(',')).join('\n')
  const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `sped-erros-${fileName.replace('.txt', '')}.csv`
  a.click()
}

function exportCsvResumo(result: ValidationResult) {
  const header = 'Bloco,Registros,Erros,Avisos,Status\n'
  const rows = Object.values(result.blocos).map(b =>
    `${b.bloco},${b.total_registros},${b.total_erros},${b.total_avisos},${b.status}`
  ).join('\n')
  const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `sped-resumo-${result.file_name.replace('.txt', '')}.csv`
  a.click()
}

// ── Componente principal ──────────────────────────────────────────────────────

interface Props {
  result: ValidationResult
}

export function ResultadoSuporteView({ result }: Props) {
  const [severityFilter, setSeverityFilter] = useState<string>('ALL')
  const [blocoFilter, setBlocoFilter] = useState<string>('ALL')
  const [expandedRecs, setExpandedRecs] = useState<Set<string>>(new Set())

  const toggleRec = (reg: string) => setExpandedRecs(prev => {
    const next = new Set(prev)
    next.has(reg) ? next.delete(reg) : next.add(reg)
    return next
  })

  const filteredErrors = result.errors.filter(e => {
    if (severityFilter !== 'ALL' && e.severity !== severityFilter) return false
    if (blocoFilter !== 'ALL' && e.bloco !== blocoFilter) return false
    return true
  })

  const uniqueBlocos = [...new Set(result.errors.map(e => e.bloco))].sort()

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start gap-4 p-5 bg-card rounded-xl shadow-[var(--shadow-media)]">
        <div className={cn('px-3 py-1 rounded-full text-sm font-bold border', STATUS_COLORS[result.summary.status])}>
          {result.summary.status}
        </div>
        <div className="space-y-0.5 text-sm">
          <p className="font-semibold text-foreground">{result.file_name}</p>
          <p className="text-muted-foreground">CNPJ: {result.cnpj} · Período: {result.periodo} · COD_VER: {result.cod_ver}</p>
          <p className="text-muted-foreground">{result.summary.total_linhas.toLocaleString('pt-BR')} linhas</p>
        </div>
        <div className="ml-auto flex gap-2">
          <button
            onClick={() => exportCsvDetalhado(result.errors, result.file_name)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-foreground/60 border border-border rounded-lg hover:bg-muted/50"
          >
            <Download className="h-3.5 w-3.5" /> CSV Detalhado
          </button>
          <button
            onClick={() => exportCsvResumo(result)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-foreground/60 border border-border rounded-lg hover:bg-muted/50"
          >
            <Download className="h-3.5 w-3.5" /> CSV Resumo
          </button>
        </div>
      </div>

      {/* ── Quick Checks ── */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Quick Checks</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {result.quick_checks.map(qc => (
            <div key={qc.label} className={cn(
              'flex items-start gap-2 p-3 rounded-lg border text-sm',
              qc.status === 'ok' ? 'bg-sem-success border-sem-success-bd' :
              qc.status === 'fail' ? 'bg-sem-error border-sem-error-bd' :
              'bg-muted/50 border-border',
            )}>
              {qc.status === 'ok' ? <CheckCircle2 className="h-4 w-4 text-sem-success-fg mt-0.5 flex-shrink-0" /> :
               qc.status === 'fail' ? <XCircle className="h-4 w-4 text-sem-error-fg mt-0.5 flex-shrink-0" /> :
               <Info className="h-4 w-4 text-muted-foreground/70 mt-0.5 flex-shrink-0" />}
              <div>
                <p className="font-medium text-foreground/80 leading-tight">{qc.label}</p>
                {qc.detail && <p className="text-xs text-muted-foreground mt-0.5">{qc.detail}</p>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Cards de blocos ── */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Blocos</h3>
        <div className="grid grid-cols-5 md:grid-cols-10 gap-2">
          {Object.values(result.blocos).map(b => (
            <div key={b.bloco} className={cn(
              'flex flex-col items-center p-2 rounded-lg border text-xs font-medium',
              BLOCO_STATUS_COLOR[b.status],
            )}>
              <span className="text-base font-bold">{b.bloco}</span>
              <span>{b.total_registros > 0 ? b.total_registros : '–'}</span>
              {b.total_erros > 0 && <span className="text-sem-error-fg">{b.total_erros}E</span>}
              {b.total_avisos > 0 && <span className="text-yellow-600">{b.total_avisos}A</span>}
            </div>
          ))}
        </div>
      </div>

      {/* ── Tabela de erros ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Erros ({filteredErrors.length.toLocaleString('pt-BR')}{filteredErrors.length !== result.errors.length ? ` de ${result.errors.length.toLocaleString('pt-BR')}` : ''})
          </h3>
          <div className="flex gap-2">
            <select
              value={severityFilter}
              onChange={e => setSeverityFilter(e.target.value)}
              className="text-xs border border-border rounded-md px-2 py-1 bg-background"
            >
              <option value="ALL">Todas severidades</option>
              <option value="CRITICAL">Crítico</option>
              <option value="ERROR">Erro</option>
              <option value="WARNING">Aviso</option>
            </select>
            <select
              value={blocoFilter}
              onChange={e => setBlocoFilter(e.target.value)}
              className="text-xs border border-border rounded-md px-2 py-1 bg-background"
            >
              <option value="ALL">Todos blocos</option>
              {uniqueBlocos.map(b => <option key={b} value={b}>Bloco {b}</option>)}
            </select>
          </div>
        </div>

        <div className="rounded-xl border border-border overflow-hidden">
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Sev.</th>
                  <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Registro</th>
                  <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Linha</th>
                  <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Campo</th>
                  <th className="px-3 py-2 text-left font-semibold text-muted-foreground min-w-48">Problema</th>
                  <th className="px-3 py-2 text-left font-semibold text-muted-foreground min-w-48">Correção</th>
                </tr>
              </thead>
              <tbody>
                {filteredErrors.slice(0, 500).map((e, i) => (
                  <tr key={i} className={cn('border-t border-border/50', SEVERITY_ROW[e.severity])}>
                    <td className="px-3 py-1.5">{SEVERITY_ICON[e.severity]}</td>
                    <td className="px-3 py-1.5 font-mono font-medium">{e.registro}</td>
                    <td className="px-3 py-1.5 font-mono text-muted-foreground">{e.linha}</td>
                    <td className="px-3 py-1.5 font-mono text-muted-foreground">{e.campo ?? '–'}</td>
                    <td className="px-3 py-1.5 text-foreground/80">{e.mensagem}</td>
                    <td className="px-3 py-1.5 text-foreground/60">{e.sugestao}</td>
                  </tr>
                ))}
                {filteredErrors.length > 500 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-3 text-center text-xs text-muted-foreground/70">
                      Exibindo 500 de {filteredErrors.length.toLocaleString('pt-BR')} erros. Use o CSV para ver todos.
                    </td>
                  </tr>
                )}
                {filteredErrors.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-sm text-muted-foreground/70">
                      Nenhum erro com os filtros selecionados
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Recomendações ── */}
      {result.recommendations.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Recomendações</h3>
          <div className="space-y-2">
            {result.recommendations.map(rec => (
              <div key={rec.registro} className="rounded-xl border border-border bg-background overflow-hidden">
                <button
                  onClick={() => toggleRec(rec.registro)}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-foreground/80 hover:bg-muted/50"
                >
                  <span>{rec.titulo}</span>
                  {expandedRecs.has(rec.registro)
                    ? <ChevronDown className="h-4 w-4 text-muted-foreground/70" />
                    : <ChevronRight className="h-4 w-4 text-muted-foreground/70" />}
                </button>
                {expandedRecs.has(rec.registro) && (
                  <div className="px-4 pb-4 space-y-2">
                    <ol className="list-decimal list-inside space-y-1.5">
                      {rec.passos.map((passo, i) => (
                        <li key={i} className="text-sm text-foreground/60">{passo}</li>
                      ))}
                    </ol>
                    <div className="flex flex-wrap gap-1 pt-1">
                      {rec.erros_relacionados.map(code => (
                        <span key={code} className="px-2 py-0.5 bg-muted text-muted-foreground text-xs font-mono rounded">
                          {code}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
