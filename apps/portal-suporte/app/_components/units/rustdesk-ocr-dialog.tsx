'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Loader2, ScanSearch, ImagePlus, CheckCircle2, AlertCircle, RotateCcw, Crop,
} from 'lucide-react'
import { LoadingBlock } from '@/components/ui/loading-block'

interface Props {
  open: boolean
  onClose: () => void
  onConfirm: (data: { numero: number; rustdeskId: string; rustdeskPassword: string | null; screenshot: string | null }) => Promise<void>
}

type Step = 'paste' | 'crop' | 'scanning' | 'confirm'

interface Rect { x: number; y: number; w: number; h: number }

// Extrai ID do RustDesk (9-10 dígitos) do texto OCR
function extractRustdeskId(text: string): string | null {
  const cleaned = text.replace(/[^\d\s]/g, ' ').replace(/\s+/g, ' ').trim()
  const groups = cleaned.match(/\d[\d ]*\d/g) ?? []
  for (const g of groups) {
    const digits = g.replace(/\s/g, '')
    if (digits.length >= 9 && digits.length <= 10) return g.trim()
  }
  const allDigits = cleaned.replace(/\s/g, '')
  const m = allDigits.match(/\d{9,10}/)
  return m ? m[0] : null
}

// Comprime uma imagem para JPEG (máx 800px de largura, 85% de qualidade)
function compressImage(dataUrl: string, maxWidth = 800, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width)
      const c = document.createElement('canvas')
      c.width  = Math.round(img.width  * scale)
      c.height = Math.round(img.height * scale)
      const ctx = c.getContext('2d')
      if (!ctx) { reject(new Error('canvas')); return }
      ctx.drawImage(img, 0, 0, c.width, c.height)
      resolve(c.toDataURL('image/jpeg', quality))
    }
    img.onerror = reject
    img.src = dataUrl
  })
}

// Recorta a área selecionada de uma imagem via Canvas
function cropImage(src: string, rect: Rect): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = rect.w
      c.height = rect.h
      const ctx = c.getContext('2d')
      if (!ctx) { reject(new Error('canvas')); return }
      ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h)
      resolve(c.toDataURL('image/png'))
    }
    img.onerror = reject
    img.src = src
  })
}

// ── Componente de recorte interativo ─────────────────────────────────────────

function CropSelector({
  imageUrl,
  onConfirm,
}: {
  imageUrl: string
  onConfirm: (cropped: string) => void
}) {
  const canvasRef   = useRef<HTMLCanvasElement>(null)
  const imgRef      = useRef<HTMLImageElement | null>(null)
  const dragging    = useRef(false)
  const startPos    = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const [sel, setSel] = useState<Rect | null>(null)
  const selRef      = useRef<Rect | null>(null)

  // Carrega imagem e dimensiona o canvas
  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      imgRef.current = img
      const canvas = canvasRef.current
      if (!canvas) return
      canvas.width  = img.width
      canvas.height = img.height
      redraw(null)
    }
    img.src = imageUrl
  }, [imageUrl]) // eslint-disable-line react-hooks/exhaustive-deps

  function redraw(rect: Rect | null) {
    const canvas = canvasRef.current
    const img    = imgRef.current
    if (!canvas || !img) return
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0)

    if (rect && rect.w > 4 && rect.h > 4) {
      // Escurece área fora da seleção
      ctx.fillStyle = 'rgba(0,0,0,0.45)'
      ctx.fillRect(0, 0, canvas.width, rect.y)
      ctx.fillRect(0, rect.y, rect.x, rect.h)
      ctx.fillRect(rect.x + rect.w, rect.y, canvas.width - rect.x - rect.w, rect.h)
      ctx.fillRect(0, rect.y + rect.h, canvas.width, canvas.height - rect.y - rect.h)

      // Borda da seleção
      ctx.strokeStyle = '#6366f1'
      ctx.lineWidth   = Math.max(2, canvas.width / 400)
      ctx.setLineDash([8, 4])
      ctx.strokeRect(rect.x, rect.y, rect.w, rect.h)

      // Handles nos cantos
      const hs = 8
      ctx.fillStyle = '#6366f1'
      ctx.setLineDash([])
      ;[[rect.x, rect.y], [rect.x + rect.w, rect.y],
        [rect.x, rect.y + rect.h], [rect.x + rect.w, rect.y + rect.h]].forEach(([cx, cy]) => {
        ctx.fillRect(cx - hs / 2, cy - hs / 2, hs, hs)
      })
    }
  }

  function getPos(e: React.MouseEvent<HTMLCanvasElement>): { x: number; y: number } {
    const canvas = canvasRef.current!
    const rect   = canvas.getBoundingClientRect()
    const scaleX = canvas.width  / rect.width
    const scaleY = canvas.height / rect.height
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top)  * scaleY,
    }
  }

  function onMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    dragging.current = true
    startPos.current = getPos(e)
    setSel(null)
    selRef.current = null
  }

  function onMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!dragging.current) return
    const cur = getPos(e)
    const r: Rect = {
      x: Math.min(startPos.current.x, cur.x),
      y: Math.min(startPos.current.y, cur.y),
      w: Math.abs(cur.x - startPos.current.x),
      h: Math.abs(cur.y - startPos.current.y),
    }
    selRef.current = r
    redraw(r)
  }

  function onMouseUp() {
    dragging.current = false
    if (selRef.current && selRef.current.w > 20 && selRef.current.h > 10) {
      setSel(selRef.current)
    }
  }

  async function handleConfirm() {
    if (!sel) return
    const cropped = await cropImage(imageUrl, sel)
    onConfirm(cropped)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-md bg-indigo-50 border border-indigo-200 px-3 py-2 text-xs text-indigo-700 dark:bg-indigo-950/20 dark:border-indigo-800 dark:text-indigo-300">
        <Crop className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <span>Clique e arraste para selecionar <strong>apenas o número</strong> do RustDesk</span>
      </div>

      <div className="relative rounded-lg border overflow-hidden bg-black">
        <canvas
          ref={canvasRef}
          className="w-full cursor-crosshair select-none"
          style={{ maxHeight: 320, display: 'block' }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onDragStart={e => e.preventDefault()}
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button
          size="sm"
          className="bg-indigo-600 hover:bg-indigo-700 gap-1.5"
          disabled={!sel}
          onClick={handleConfirm}
        >
          <ScanSearch className="h-3.5 w-3.5" />
          Reconhecer número
        </Button>
      </div>
    </div>
  )
}

// ── Dialog principal ──────────────────────────────────────────────────────────

const labelCls = 'text-xs font-medium text-foreground/60'

export function RustdeskOcrDialog({ open, onClose, onConfirm }: Props) {
  const [step, setStep]             = useState<Step>('paste')
  const [imageUrl, setImageUrl]     = useState<string | null>(null)
  const [croppedUrl, setCroppedUrl] = useState<string | null>(null)
  const [detectedId, setDetectedId] = useState('')
  const [numero, setNumero]         = useState('')
  const [senha, setSenha]           = useState('')
  const [saving, setSaving]         = useState(false)
  const [noMatch, setNoMatch]       = useState(false)
  const pasteZoneRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      setStep('paste'); setImageUrl(null); setCroppedUrl(null); setDetectedId('')
      setNumero(''); setSenha(''); setNoMatch(false); setSaving(false)
    }
  }, [open])

  useEffect(() => {
    if (open && step === 'paste') setTimeout(() => pasteZoneRef.current?.focus(), 50)
  }, [open, step])

  const handlePaste = useCallback((e: ClipboardEvent) => {
    if (step !== 'paste') return
    const imgItem = Array.from(e.clipboardData?.items ?? []).find(i => i.type.startsWith('image/'))
    if (!imgItem) return
    e.preventDefault()
    const file = imgItem.getAsFile()
    if (!file) return
    const reader = new FileReader()
    reader.onload = evt => {
      setImageUrl(evt.target?.result as string)
      setStep('crop')
    }
    reader.readAsDataURL(file)
  }, [step])

  useEffect(() => {
    if (!open || step !== 'paste') return
    window.addEventListener('paste', handlePaste as EventListener)
    return () => window.removeEventListener('paste', handlePaste as EventListener)
  }, [open, step, handlePaste])

  async function runOcr(croppedDataUrl: string) {
    setStep('scanning')
    setNoMatch(false)

    // Comprime e guarda o recorte para usar como screenshot do caixa
    const compressed = await compressImage(croppedDataUrl).catch(() => croppedDataUrl)
    setCroppedUrl(compressed)

    try {
      const { createWorker } = await import('tesseract.js')
      const worker = await createWorker('eng', 1, { logger: () => {} })
      await worker.setParameters({ tessedit_char_whitelist: '0123456789 ' })
      const { data: { text } } = await worker.recognize(croppedDataUrl)
      await worker.terminate()
      const found = extractRustdeskId(text)
      setDetectedId(found ?? '')
      if (!found) setNoMatch(true)
    } catch {
      setDetectedId(''); setNoMatch(true)
    } finally {
      setStep('confirm')
    }
  }

  function reset() {
    setStep('paste'); setImageUrl(null); setCroppedUrl(null); setDetectedId(''); setNoMatch(false)
    setTimeout(() => pasteZoneRef.current?.focus(), 50)
  }

  async function handleConfirm() {
    if (!numero || !detectedId.trim()) return
    setSaving(true)
    try {
      await onConfirm({
        numero: Number(numero),
        rustdeskId: detectedId.trim(),
        rustdeskPassword: senha.trim() || null,
        screenshot: croppedUrl,
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanSearch className="h-5 w-5 text-indigo-500" />
            Capturar RustDesk via Print
          </DialogTitle>
        </DialogHeader>

        {/* Passo 1: colar */}
        {step === 'paste' && (
          <div
            ref={pasteZoneRef}
            tabIndex={0}
            className="rounded-xl border-2 border-dashed border-border bg-muted/30 p-10 text-center space-y-3 focus:outline-none focus:border-indigo-400 focus:bg-indigo-50/30 transition-colors cursor-default"
          >
            <ImagePlus className="h-12 w-12 text-muted-foreground/30 mx-auto" />
            <div>
              <p className="text-sm font-medium text-foreground/70">Cole o print da tela do RustDesk</p>
              <p className="text-xs text-muted-foreground mt-1">
                Pressione{' '}
                <kbd className="px-1.5 py-0.5 rounded border bg-background text-xs font-mono">Ctrl+V</kbd>
                {' '}com o print na área de transferência
              </p>
            </div>
          </div>
        )}

        {/* Passo 2: recortar */}
        {step === 'crop' && imageUrl && (
          <CropSelector imageUrl={imageUrl} onConfirm={runOcr} />
        )}

        {/* Passo 3: processando */}
        {step === 'scanning' && (
          <LoadingBlock size="sm" label="Identificando número do RustDesk…" />
        )}

        {/* Passo 4: confirmar */}
        {step === 'confirm' && (
          <div className="space-y-4">
            {noMatch && !detectedId && (
              <div className="flex items-start gap-2 rounded-md bg-yellow-50 border border-yellow-200 p-3 text-sm text-yellow-800 dark:bg-yellow-950/20 dark:border-yellow-800 dark:text-yellow-400">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>Não foi possível detectar o número. Verifique o recorte ou digite manualmente.</span>
              </div>
            )}

            {detectedId && (
              <div className="flex items-center gap-2 rounded-md bg-green-50 border border-green-200 p-3 text-sm text-green-800 dark:bg-green-950/20 dark:border-green-800 dark:text-green-400">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>RustDesk ID detectado! Confirme ou corrija se necessário.</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className={labelCls}>Número do Caixa *</Label>
                <Input className="mt-1 text-sm" type="number" min="1" placeholder="1"
                  value={numero} onChange={e => setNumero(e.target.value)} autoFocus />
              </div>
              <div>
                <Label className={labelCls}>RustDesk ID *</Label>
                <Input className="mt-1 text-sm font-mono" placeholder="1 967 317 780"
                  value={detectedId} onChange={e => setDetectedId(e.target.value)} />
              </div>
            </div>

            <div>
              <Label className={labelCls}>Senha RustDesk (opcional)</Label>
              <Input className="mt-1 text-sm" placeholder="senha"
                value={senha} onChange={e => setSenha(e.target.value)} />
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              <Button variant="ghost" size="sm" className="gap-1.5" onClick={reset}>
                <RotateCcw className="h-3.5 w-3.5" /> Tentar novamente
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
                <Button
                  size="sm"
                  className="bg-indigo-600 hover:bg-indigo-700 gap-1.5"
                  onClick={handleConfirm}
                  disabled={saving || !numero || !detectedId.trim()}
                >
                  {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Cadastrar Caixa
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
