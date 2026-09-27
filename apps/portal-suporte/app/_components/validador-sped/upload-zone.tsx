'use client'

import { useCallback, useRef, useState, useTransition } from 'react'
import { Upload, FileText, Loader2, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { validateSpedBuffer, type ValidationResult } from '@/lib/sped/validator'
import { api } from '@/lib/api/client'

const ETAPAS = [
  { label: 'Parse', detail: 'Lendo arquivo e detectando encoding' },
  { label: 'Estrutura', detail: 'Verificando registros e sequência de blocos' },
  { label: 'Campos', detail: 'Validando contagem e tipos por registro' },
  { label: 'Referências', detail: 'Cruzando K200/H010 com 0200/0190' },
  { label: 'Fechamento', detail: 'Verificando QTD_LIN e totalizadores' },
]

interface Props {
  onResult: (result: ValidationResult) => void
}

export function UploadZone({ onResult }: Props) {
  const [isDragging, setIsDragging] = useState(false)
  const [etapa, setEtapa] = useState<number>(-1)
  const [error, setError] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()

  const handleFile = useCallback(
    (file: File) => {
      if (!file.name.endsWith('.txt')) {
        setError('Apenas arquivos .txt são aceitos')
        return
      }
      if (file.size > 50 * 1024 * 1024) {
        setError('Arquivo muito grande. Máximo: 50 MB')
        return
      }

      setError(null)
      setFileName(file.name)

      let step = 0
      setEtapa(0)
      const interval = setInterval(() => {
        step++
        if (step < ETAPAS.length) setEtapa(step)
        else clearInterval(interval)
      }, 400)

      startTransition(async () => {
        try {
          const content = await file.text()
          const result = validateSpedBuffer(content, file.name)
          try {
            await api.post('/api/sped-validations', {
              id: result.id,
              file_name: result.file_name,
              cnpj: result.cnpj,
              periodo: result.periodo,
              cod_ver: result.cod_ver,
              status: result.summary.status,
              error_count: result.summary.total_erros + result.summary.total_criticos,
              warn_count: result.summary.total_avisos,
              result,
            })
          } catch {
            // Persist is best-effort — still show validation
          }
          clearInterval(interval)
          setEtapa(-1)
          onResult(result)
        } catch (e) {
          clearInterval(interval)
          setEtapa(-1)
          setError(e instanceof Error ? e.message : 'Falha na validação')
        }
      })
    },
    [onResult],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) handleFile(file)
    },
    [handleFile],
  )

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) handleFile(file)
    },
    [handleFile],
  )

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'cursor-pointer rounded-xl border-2 border-dashed p-10 text-center transition-colors',
          isDragging ? 'border-indigo-500 bg-indigo-50/50' : 'border-border hover:border-indigo-300',
          isPending && 'pointer-events-none opacity-60',
        )}
      >
        <input ref={inputRef} type="file" accept=".txt" className="hidden" onChange={handleChange} />
        {isPending ? (
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-indigo-500" />
        ) : (
          <Upload className="mx-auto h-10 w-10 text-muted-foreground/60" />
        )}
        <p className="mt-3 text-sm font-medium">
          {fileName ? fileName : 'Arraste o arquivo SPED (.txt) ou clique para selecionar'}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">Máximo 50 MB · validação no browser</p>
      </div>

      {etapa >= 0 && (
        <ul className="space-y-1 text-sm">
          {ETAPAS.map((e, i) => (
            <li
              key={e.label}
              className={cn(
                'flex items-center gap-2',
                i < etapa && 'text-emerald-600',
                i === etapa && 'font-medium text-indigo-600',
                i > etapa && 'text-muted-foreground/50',
              )}
            >
              <FileText className="h-3.5 w-3.5" />
              {e.label}
              <span className="text-xs text-muted-foreground">{e.detail}</span>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}
    </div>
  )
}
