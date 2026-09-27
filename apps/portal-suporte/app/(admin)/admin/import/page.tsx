'use client'

// =============================================================================
// Página de importação de cards do Trello → Kanban
// Acessível apenas para role admin (bloqueada via middleware para agents)
// =============================================================================

import { useState, useRef, useCallback } from 'react'
import { AdminHeader } from '@/components/admin/admin-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import {
  Upload, FileJson, CheckCircle2, AlertCircle, RefreshCw,
  SkipForward, Trash2, Info,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { araraApiFetch } from '@/lib/arara/arara-api-fetch'

// ─── tipos ────────────────────────────────────────────────────────────────────

interface ImportSummary {
  total:    number
  inserted: number
  skipped:  number
  errors:   number
}

interface ErrorDetail {
  card:   string
  reason: string
}

// ─── componente ──────────────────────────────────────────────────────────────

export default function ImportTrelloPage() {
  const [jsonText,   setJsonText]   = useState('')
  const [fileName,   setFileName]   = useState<string | null>(null)
  const [loading,    setLoading]    = useState(false)
  const [summary,    setSummary]    = useState<ImportSummary | null>(null)
  const [errorDetails, setErrorDetails] = useState<ErrorDetail[]>([])
  const [globalError, setGlobalError]   = useState<string | null>(null)
  const [dragOver,   setDragOver]   = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // ── carregar arquivo ────────────────────────────────────────────────────────
  const loadFile = useCallback((file: File) => {
    if (!file.name.endsWith('.json')) {
      setGlobalError('Selecione um arquivo .json exportado do Trello.')
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => {
      setJsonText(e.target?.result as string)
      setFileName(file.name)
      setSummary(null)
      setGlobalError(null)
    }
    reader.readAsText(file)
  }, [])

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) loadFile(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) loadFile(file)
  }

  function handleClear() {
    setJsonText('')
    setFileName(null)
    setSummary(null)
    setGlobalError(null)
    setErrorDetails([])
    if (fileRef.current) fileRef.current.value = ''
  }

  // ── importar ────────────────────────────────────────────────────────────────
  async function handleImport() {
    if (!jsonText.trim()) {
      setGlobalError('Cole ou selecione o JSON do Trello antes de importar.')
      return
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(jsonText)
    } catch {
      setGlobalError('JSON inválido. Verifique se o arquivo foi exportado corretamente do Trello.')
      return
    }

    setLoading(true)
    setGlobalError(null)
    setSummary(null)
    setErrorDetails([])

    try {
      const res = await araraApiFetch('/api/admin/import-trello', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(parsed),
      })
      const data = await res.json()

      if (!res.ok) {
        setGlobalError(data.error ?? 'Erro ao importar.')
        return
      }

      setSummary(data.summary)
      if (data.errorDetails?.length) setErrorDetails(data.errorDetails)
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'Erro de rede ao tentar importar. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  const hasJson = jsonText.trim().length > 0

  return (
    <div className="pt-14 lg:pt-0">
      <AdminHeader
        title="Importar do Trello"
        description="Importe cards do board Trello para o kanban do portal"
      />

      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">

        {/* ── Info banner ─────────────────────────────────────────────────── */}
        <Alert className="border-sem-info-bd bg-sem-info">
          <Info className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-sem-info-fg text-sm">
            <strong>Janela padrão:</strong> 18/02/2026 – 18/05/2026.
            Apenas cards <strong>abertos</strong> dentro dessa janela são importados.
            Cards duplicados (mesmo número de ticket) são ignorados automaticamente.
          </AlertDescription>
        </Alert>

        {/* ── Upload area ─────────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileJson className="w-4 h-4 text-blue-600" />
              Arquivo JSON do Trello
            </CardTitle>
            <CardDescription>
              Arraste o arquivo, clique para selecionar ou cole o conteúdo JSON abaixo
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              className={cn(
                'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors',
                dragOver
                  ? 'border-blue-500 bg-sem-info'
                  : 'border-border hover:border-blue-400 hover:bg-muted/50',
              )}
            >
              <Upload className="w-8 h-8 text-muted-foreground/70 mx-auto mb-2" />
              {fileName ? (
                <p className="text-sm font-medium text-sem-info-fg">{fileName}</p>
              ) : (
                <>
                  <p className="text-sm font-medium text-foreground/60">Clique ou arraste o arquivo .json</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">Exportado via Trello → Compartilhar → Exportar JSON</p>
                </>
              )}
              <input
                ref={fileRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            {/* Textarea para colar JSON */}
            <div className="relative">
              <textarea
                className="w-full h-36 text-xs font-mono border border-border rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 bg-muted/50 text-foreground/80 placeholder:text-muted-foreground/70"
                placeholder='Ou cole aqui o conteúdo JSON do Trello... {"cards":[...],"lists":[...]}'
                value={jsonText}
                onChange={e => { setJsonText(e.target.value); setFileName(null) }}
              />
              {hasJson && (
                <button
                  onClick={handleClear}
                  className="absolute top-2 right-2 text-muted-foreground/70 hover:text-red-500 transition-colors"
                  title="Limpar"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Erro global */}
            {globalError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{globalError}</AlertDescription>
              </Alert>
            )}

            {/* Botão importar */}
            <Button
              onClick={handleImport}
              disabled={loading || !hasJson}
              className="w-full"
              size="lg"
            >
              {loading
                ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Importando...</>
                : <><Upload className="w-4 h-4 mr-2" />Importar para o Kanban</>
              }
            </Button>
          </CardContent>
        </Card>

        {/* ── Resultado ───────────────────────────────────────────────────── */}
        {summary && (
          <Card className={cn(
            'border-2',
            summary.errors > 0
              ? 'border-sem-warning-bd bg-sem-warning'
              : 'border-sem-success-bd bg-sem-success',
          )}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-sem-success-fg" />
                Importação concluída
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Stats grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <StatBadge
                  label="Processados"
                  value={summary.total}
                  color="text-foreground/80 bg-muted"
                />
                <StatBadge
                  label="Inseridos"
                  value={summary.inserted}
                  color="text-sem-success-fg bg-sem-success"
                />
                <StatBadge
                  label="Ignorados"
                  value={summary.skipped}
                  color="text-sem-warning-fg bg-sem-warning"
                  icon={<SkipForward className="w-3.5 h-3.5" />}
                />
                <StatBadge
                  label="Erros"
                  value={summary.errors}
                  color={summary.errors > 0 ? 'text-sem-error-fg bg-sem-error' : 'text-muted-foreground/70 bg-muted'}
                  icon={summary.errors > 0 ? <AlertCircle className="w-3.5 h-3.5" /> : undefined}
                />
              </div>

              {summary.inserted > 0 && (
                <p className="text-sm text-sem-success-fg mb-2">
                  ✅ {summary.inserted} ticket{summary.inserted !== 1 ? 's' : ''} adicionado{summary.inserted !== 1 ? 's' : ''} ao kanban com checklist N0-1 criado automaticamente.
                </p>
              )}

              {summary.skipped > 0 && (
                <p className="text-xs text-sem-warning-fg">
                  ⚠️ {summary.skipped} card{summary.skipped !== 1 ? 's' : ''} ignorado{summary.skipped !== 1 ? 's' : ''} (duplicados, fora da janela ou card máscara).
                </p>
              )}

              {/* Detalhes dos erros */}
              {errorDetails.length > 0 && (
                <details className="mt-3">
                  <summary className="text-xs font-medium text-sem-error-fg cursor-pointer hover:underline">
                    Ver detalhes dos {errorDetails.length} erro{errorDetails.length !== 1 ? 's' : ''}
                  </summary>
                  <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                    {errorDetails.map((e, i) => (
                      <div key={i} className="text-xs bg-background rounded p-2 border border-sem-error-bd">
                        <span className="font-medium text-sem-error-fg block truncate">{e.card}</span>
                        <span className="text-sem-error-fg">{e.reason}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}

              {summary.inserted > 0 && (
                <div className="mt-4 pt-3 border-t border-sem-success-bd">
                  <a
                    href="/admin/kanban"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-sem-success-fg hover:text-sem-success-fg underline-offset-2 hover:underline"
                  >
                    Ver no Kanban →
                  </a>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

// ─── helper ──────────────────────────────────────────────────────────────────

function StatBadge({
  label, value, color, icon,
}: {
  label: string
  value: number
  color: string
  icon?: React.ReactNode
}) {
  return (
    <div className={cn('rounded-lg p-3 flex flex-col items-center gap-1', color)}>
      <div className="flex items-center gap-1">
        {icon}
        <span className="text-2xl font-bold">{value}</span>
      </div>
      <span className="text-xs font-medium">{label}</span>
    </div>
  )
}
