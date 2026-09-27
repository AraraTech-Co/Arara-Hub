'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Loader2, ScanSearch, ImagePlus, CheckCircle2, AlertCircle,
  Crop, ChevronRight, ChevronLeft, X, Layers,
} from 'lucide-react'
import { LoadingBlock } from '@/components/ui/loading-block'

interface Props {
  open: boolean
  onClose: () => void
  onSave: (items: Array<{ numero: number; rustdeskId: string; rustdeskPassword: string | null; screenshot: string | null }>) => Promise<void>
}

interface Rect { x: number; y: number; w: number; h: number }

type StepId = 'images' | 'crop' | 'register'

interface ImageItem {
  id: string
  original: string
  croppedUrl: string | null
  rustdeskId: string
  ocrStatus: 'pending' | 'running' | 'done' | 'error'
  noMatch: boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function compressImage(dataUrl: string, maxWidth = 800, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width)
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * scale)
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

async function runOcr(croppedDataUrl: string): Promise<string> {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('eng', 1, { logger: () => {} })
  await worker.setParameters({ tessedit_char_whitelist: '0123456789 ' })
  const { data: { text } } = await worker.recognize(croppedDataUrl)
  await worker.terminate()
  return text
}

// ── CropSelector ──────────────────────────────────────────────────────────────

function CropSelector({ imageUrl, onConfirm }: { imageUrl: string; onConfirm: (cropped: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const dragging = useRef(false)
  const startPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const selRef = useRef<Rect | null>(null)
  const [sel, setSel] = useState<Rect | null>(null)

  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      imgRef.current = img
      const canvas = canvasRef.current
      if (!canvas) return
      canvas.width = img.width
      canvas.height = img.height
      redraw(null)
    }
    img.src = imageUrl
    setSel(null)
    selRef.current = null
  }, [imageUrl]) // eslint-disable-line react-hooks/exhaustive-deps

  function redraw(rect: Rect | null) {
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img) return
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0)
    if (rect && rect.w > 4 && rect.h > 4) {
      ctx.fillStyle = 'rgba(0,0,0,0.45)'
      ctx.fillRect(0, 0, canvas.width, rect.y)
      ctx.fillRect(0, rect.y, rect.x, rect.h)
      ctx.fillRect(rect.x + rect.w, rect.y, canvas.width - rect.x - rect.w, rect.h)
      ctx.fillRect(0, rect.y + rect.h, canvas.width, canvas.height - rect.y - rect.h)
      ctx.strokeStyle = '#6366f1'
      ctx.lineWidth = Math.max(2, canvas.width / 400)
      ctx.setLineDash([8, 4])
      ctx.strokeRect(rect.x, rect.y, rect.w, rect.h)
      const hs = 8
      ctx.fillStyle = '#6366f1'
      ctx.setLineDash([])
      ;[[rect.x, rect.y], [rect.x + rect.w, rect.y],
        [rect.x, rect.y + rect.h], [rect.x + rect.w, rect.y + rect.h]].forEach(([cx, cy]) => {
        ctx.fillRect(cx - hs / 2, cy - hs / 2, hs, hs)
      })
    }
  }

  function getPos(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!
    const r = canvas.getBoundingClientRect()
    return {
      x: (e.clientX - r.left) * (canvas.width / r.width),
      y: (e.clientY - r.top) * (canvas.height / r.height),
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
          style={{ maxHeight: 280, display: 'block' }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onDragStart={e => e.preventDefault()}
        />
      </div>
      <div className="flex justify-end">
        <Button
          size="sm"
          className="bg-indigo-600 hover:bg-indigo-700 gap-1.5"
          disabled={!sel}
          onClick={handleConfirm}
        >
          <ScanSearch className="h-3.5 w-3.5" />
          Reconhecer e avançar
        </Button>
      </div>
    </div>
  )
}

// ── Step indicator ────────────────────────────────────────────────────────────

function Steps({ current }: { current: StepId }) {
  const steps: { id: StepId; label: string }[] = [
    { id: 'images', label: 'Imagens' },
    { id: 'crop', label: 'Recorte' },
    { id: 'register', label: 'Cadastro' },
  ]
  const idx = steps.findIndex(s => s.id === current)
  return (
    <div className="flex items-center gap-1 mb-4">
      {steps.map((s, i) => (
        <div key={s.id} className="flex items-center gap-1">
          <div className={`flex items-center justify-center h-5 w-5 rounded-full text-[10px] font-bold ${i <= idx ? 'bg-indigo-600 text-white' : 'bg-muted text-muted-foreground'}`}>{i + 1}</div>
          <span className={`text-xs ${i === idx ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>{s.label}</span>
          {i < steps.length - 1 && <div className={`h-px w-6 ${i < idx ? 'bg-indigo-600' : 'bg-border'}`} />}
        </div>
      ))}
    </div>
  )
}

// ── Main dialog ───────────────────────────────────────────────────────────────

export function MultiPrintDialog({ open, onClose, onSave }: Props) {
  const [step, setStep] = useState<StepId>('images')
  const [items, setItems] = useState<ImageItem[]>([])
  const [cropIndex, setCropIndex] = useState(0)
  const [numbers, setNumbers] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const pasteZoneRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      setStep('images')
      setItems([])
      setCropIndex(0)
      setNumbers({})
      setSaving(false)
    }
  }, [open])

  useEffect(() => {
    if (open && step === 'images') {
      setTimeout(() => pasteZoneRef.current?.focus(), 50)
    }
  }, [open, step])

  const handlePaste = useCallback((e: ClipboardEvent) => {
    if (step !== 'images') return
    if (items.length >= 20) return
    const imgItem = Array.from(e.clipboardData?.items ?? []).find(i => i.type.startsWith('image/'))
    if (!imgItem) return
    e.preventDefault()
    const file = imgItem.getAsFile()
    if (!file) return
    const reader = new FileReader()
    reader.onload = async evt => {
      const dataUrl = evt.target?.result as string
      const compressed = await compressImage(dataUrl, 1200, 0.9).catch(() => dataUrl)
      const id = crypto.randomUUID()
      setItems(prev => [...prev, {
        id, original: compressed, croppedUrl: null,
        rustdeskId: '', ocrStatus: 'pending', noMatch: false,
      }])
    }
    reader.readAsDataURL(file)
  }, [step, items.length])

  useEffect(() => {
    if (!open || step !== 'images') return
    window.addEventListener('paste', handlePaste as EventListener)
    return () => window.removeEventListener('paste', handlePaste as EventListener)
  }, [open, step, handlePaste])

  function removeItem(id: string) {
    setItems(prev => prev.filter(i => i.id !== id))
  }

  function goToCrop() {
    setCropIndex(0)
    setStep('crop')
  }

  async function handleCrop(croppedDataUrl: string) {
    const item = items[cropIndex]
    if (!item) return

    setItems(prev => prev.map((it, idx) =>
      idx === cropIndex ? { ...it, ocrStatus: 'running' } : it
    ))

    try {
      const compressed = await compressImage(croppedDataUrl).catch(() => croppedDataUrl)
      const text = await runOcr(croppedDataUrl)
      const found = extractRustdeskId(text)
      setItems(prev => prev.map((it, idx) =>
        idx === cropIndex ? {
          ...it,
          croppedUrl: compressed,
          rustdeskId: found ?? '',
          ocrStatus: 'done',
          noMatch: !found,
        } : it
      ))
    } catch {
      setItems(prev => prev.map((it, idx) =>
        idx === cropIndex ? { ...it, ocrStatus: 'error', noMatch: true } : it
      ))
    }

    if (cropIndex + 1 < items.length) {
      setCropIndex(i => i + 1)
    } else {
      setStep('register')
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      const payload = items.map(it => ({
        numero: Number(numbers[it.id] ?? 0),
        rustdeskId: it.rustdeskId.trim(),
        rustdeskPassword: null as string | null,
        screenshot: it.croppedUrl,
      }))
      await onSave(payload)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const allNumbersFilled = items.every(it => {
    const n = Number(numbers[it.id] ?? '')
    return Number.isInteger(n) && n >= 1
  })
  const allRustdeskFilled = items.every(it => it.rustdeskId.trim().length > 0)
  const canSave = allNumbersFilled && allRustdeskFilled && items.length > 0

  const currentItem = items[cropIndex]

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-indigo-500" />
            Multi Print — Cadastro em Lote
          </DialogTitle>
        </DialogHeader>

        <Steps current={step} />

        {/* ── Passo 1: Imagens ── */}
        {step === 'images' && (
          <div className="flex flex-col gap-3 overflow-hidden flex-1">
            <div
              ref={pasteZoneRef}
              tabIndex={0}
              className="rounded-xl border-2 border-dashed border-border bg-muted/30 p-6 text-center space-y-2 focus:outline-none focus:border-indigo-400 focus:bg-indigo-50/30 transition-colors cursor-default shrink-0"
            >
              <ImagePlus className="h-10 w-10 text-muted-foreground/30 mx-auto" />
              <div>
                <p className="text-sm font-medium text-foreground/70">Cole prints do RustDesk aqui</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Pressione{' '}
                  <kbd className="px-1.5 py-0.5 rounded border bg-background text-xs font-mono">Ctrl+V</kbd>
                  {' '}para adicionar cada imagem · Máximo de 20
                </p>
              </div>
              {items.length > 0 && (
                <p className="text-xs font-semibold text-indigo-600">{items.length} imagem(ns) adicionada(s)</p>
              )}
            </div>

            {items.length > 0 && (
              <div className="overflow-y-auto flex-1 space-y-1.5">
                {items.map((item, idx) => (
                  <div key={item.id} className="flex items-center gap-2 rounded-lg border border-border bg-background px-2 py-1.5">
                    <span className="text-xs font-bold text-muted-foreground w-5 text-center shrink-0">{idx + 1}</span>
                    <img src={item.original} alt="" className="h-10 w-16 object-cover rounded border border-border shrink-0" />
                    <span className="text-xs text-muted-foreground flex-1 truncate">Imagem {idx + 1}</span>
                    <button
                      onClick={() => removeItem(item.id)}
                      className="text-muted-foreground/50 hover:text-red-500 transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end pt-1 shrink-0">
              <Button
                className="bg-indigo-600 hover:bg-indigo-700 gap-1.5"
                disabled={items.length === 0}
                onClick={goToCrop}
              >
                Avançar
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Passo 2: Recorte ── */}
        {step === 'crop' && currentItem && (
          <div className="flex flex-col gap-3 overflow-hidden flex-1">
            <div className="flex items-center justify-between shrink-0">
              <p className="text-xs text-muted-foreground">
                Imagem <span className="font-semibold text-foreground">{cropIndex + 1}</span> de{' '}
                <span className="font-semibold text-foreground">{items.length}</span>
              </p>
              {currentItem.ocrStatus === 'running' && (
                <span className="flex items-center gap-1.5 text-xs text-indigo-600">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reconhecendo…
                </span>
              )}
            </div>

            <div className="overflow-y-auto flex-1">
              {currentItem.ocrStatus === 'running' ? (
                <LoadingBlock size="lg" />
              ) : (
                <CropSelector
                  key={currentItem.id}
                  imageUrl={currentItem.original}
                  onConfirm={handleCrop}
                />
              )}
            </div>

            <div className="flex items-center justify-between shrink-0 pt-1">
              <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setStep('images')}>
                <ChevronLeft className="h-4 w-4" /> Voltar
              </Button>
              <div className="flex gap-1">
                {items.map((_, i) => (
                  <div
                    key={i}
                    className={`h-1.5 w-1.5 rounded-full transition-colors ${i === cropIndex ? 'bg-indigo-600' : i < cropIndex ? 'bg-indigo-300' : 'bg-border'}`}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Passo 3: Cadastro ── */}
        {step === 'register' && (
          <div className="flex flex-col gap-3 overflow-hidden flex-1">
            <p className="text-xs text-muted-foreground shrink-0">
              Preencha o número de cada caixa. Corrija o RustDesk ID se necessário.
            </p>

            <div className="overflow-y-auto flex-1 space-y-2">
              {items.map((item, idx) => (
                <div key={item.id} className="rounded-lg border border-border bg-background p-3 space-y-2">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-muted-foreground w-4 shrink-0">{idx + 1}</span>
                    {item.croppedUrl ? (
                      <img src={item.croppedUrl} alt="" className="h-9 w-24 object-cover rounded border border-border shrink-0" />
                    ) : (
                      <div className="h-9 w-24 rounded border border-border bg-muted shrink-0 flex items-center justify-center">
                        {item.noMatch ? (
                          <AlertCircle className="h-4 w-4 text-yellow-500" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        )}
                      </div>
                    )}
                    {item.noMatch && (
                      <span className="text-xs text-yellow-600 dark:text-yellow-400">
                        OCR não detectou — verifique o ID
                      </span>
                    )}
                    {!item.noMatch && item.rustdeskId && (
                      <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> ID detectado
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs font-medium text-foreground/60">Número do Caixa *</Label>
                      <Input
                        className="mt-1 text-sm"
                        type="number"
                        min="1"
                        placeholder={String(idx + 1)}
                        value={numbers[item.id] ?? ''}
                        onChange={e => setNumbers(prev => ({ ...prev, [item.id]: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-foreground/60">RustDesk ID *</Label>
                      <Input
                        className="mt-1 text-sm font-mono"
                        placeholder="123 456 789"
                        value={item.rustdeskId}
                        onChange={e => setItems(prev => prev.map(it => it.id === item.id ? { ...it, rustdeskId: e.target.value } : it))}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between shrink-0 pt-1">
              <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => { setCropIndex(0); setStep('crop') }}>
                <ChevronLeft className="h-4 w-4" /> Refazer recortes
              </Button>
              <Button
                className="bg-indigo-600 hover:bg-indigo-700 gap-1.5"
                disabled={!canSave || saving}
                onClick={handleSave}
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Cadastrar {items.length} caixa(s)
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
