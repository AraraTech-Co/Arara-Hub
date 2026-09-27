'use client'

import { useState, useEffect } from 'react'
import { Check, Copy, Eye, EyeOff, Monitor, Pencil, Plus, ScanSearch, Trash2, Upload, X, ZoomIn } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { companiesApi, UnitCaixa } from '@/lib/api/companies'
import { RustdeskOcrDialog } from './rustdesk-ocr-dialog'
import { MultiPrintDialog } from './multi-print-dialog'

const labelCls = 'text-xs font-medium text-foreground/60'
const inputCls = 'mt-1 text-sm'
const EMPTY_FORM = { numero: '', rustdeskId: '', rustdeskPassword: '' }

interface UnitMin { id: string }

function CaixaRow({
  caixa, isAdmin, companyId, unitId, onUpdated, onDeleted,
}: {
  caixa: UnitCaixa; isAdmin: boolean; companyId: string; unitId: string
  onUpdated: (c: UnitCaixa) => void; onDeleted: (id: string) => void
}) {
  const { toast } = useToast()
  const [editing, setEditing] = useState(false)
  const [showPass, setShowPass] = useState(false)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState<'rustdeskId' | 'senha' | null>(null)
  const [lightbox, setLightbox] = useState(false)
  const [form, setForm] = useState({ numero: String(caixa.numero), rustdeskId: caixa.rustdeskId ?? '', rustdeskPassword: caixa.rustdeskPassword ?? '' })

  function copy(value: string, field: 'rustdeskId' | 'senha') {
    navigator.clipboard.writeText(value)
    setCopied(field)
    setTimeout(() => setCopied(null), 1500)
  }

  async function save() {
    setSaving(true)
    try {
      const json = await companiesApi.updateCaixa(companyId, unitId, caixa.id, {
        numero: Number(form.numero), rustdeskId: form.rustdeskId || null, rustdeskPassword: form.rustdeskPassword || null,
      })
      if (!json.success) throw new Error()
      onUpdated(json.data); setEditing(false)
      toast({ title: 'Caixa atualizado' })
    } catch {
      toast({ title: 'Erro ao salvar', variant: 'destructive' })
    } finally { setSaving(false) }
  }

  async function remove() {
    if (!confirm(`Excluir Caixa ${caixa.numero}?`)) return
    const json = await companiesApi.deleteCaixa(companyId, unitId, caixa.id)
    if (!json.success) { toast({ title: 'Erro ao excluir', variant: 'destructive' }); return }
    onDeleted(caixa.id)
    toast({ title: `Caixa ${caixa.numero} excluído` })
  }

  if (editing) return (
    <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
      <div className="grid grid-cols-3 gap-2">
        <div><Label className={labelCls}>Número</Label>
          <Input className={inputCls} type="number" min="1" value={form.numero} onChange={e => setForm(f => ({ ...f, numero: e.target.value }))} /></div>
        <div><Label className={labelCls}>RustDesk ID</Label>
          <Input className={inputCls} placeholder="123 456 789" value={form.rustdeskId} onChange={e => setForm(f => ({ ...f, rustdeskId: e.target.value }))} /></div>
        <div><Label className={labelCls}>Senha RustDesk</Label>
          <Input className={inputCls} type="text" value={form.rustdeskPassword} onChange={e => setForm(f => ({ ...f, rustdeskPassword: e.target.value }))} /></div>
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>Cancelar</Button>
        <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={save} disabled={saving}>Salvar</Button>
      </div>
    </div>
  )

  return (
    <>
      <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2 hover:bg-muted/30">
        <div className="flex items-center gap-3 min-w-0">
          {/* Thumbnail ou número */}
          {caixa.screenshot ? (
            <button
              onClick={() => setLightbox(true)}
              className="group relative h-9 w-14 shrink-0 overflow-hidden rounded border border-border hover:border-indigo-400 transition-colors"
              title="Ver imagem ampliada"
            >
              <img src={caixa.screenshot} alt={`RustDesk Caixa ${caixa.numero}`} className="h-full w-full object-cover" />
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                <ZoomIn className="h-3.5 w-3.5 text-white" />
              </div>
            </button>
          ) : (
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-bold text-foreground/70">{caixa.numero}</div>
          )}

          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">Caixa {caixa.numero}</p>
            {caixa.rustdeskId && (
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <button onClick={() => copy(caixa.rustdeskId!, 'rustdeskId')} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground group" title="Copiar RustDesk ID">
                  <Monitor className="h-3 w-3" />
                  <span className="font-mono">{caixa.rustdeskId}</span>
                  {copied === 'rustdeskId' ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />}
                </button>
                <a
                  href={`rustdesk://${(caixa.rustdeskId ?? '').replace(/\s/g, '')}`}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
                  title="Abrir no RustDesk (ID preenchido)"
                >
                  <Monitor className="h-3 w-3" /> Conectar
                </a>
                {caixa.rustdeskPassword && (
                  <span className="flex items-center gap-1">
                    <button onClick={() => setShowPass(s => !s)} className="text-muted-foreground/60 hover:text-foreground">
                      {showPass ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    </button>
                    <button onClick={() => copy(caixa.rustdeskPassword!, 'senha')} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground group">
                      <span className="font-mono">{showPass ? caixa.rustdeskPassword : '••••••'}</span>
                      {copied === 'senha' ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />}
                    </button>
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {isAdmin && (
          <div className="flex gap-1 shrink-0">
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground/70 hover:text-blue-500" onClick={() => setEditing(true)}><Pencil className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground/70 hover:text-red-500" onClick={remove}><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && caixa.screenshot && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightbox(false)}
        >
          <div className="relative max-w-3xl w-full" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setLightbox(false)}
              className="absolute -top-9 right-0 text-white/70 hover:text-white flex items-center gap-1.5 text-sm"
            >
              <X className="h-4 w-4" /> Fechar
            </button>
            <img
              src={caixa.screenshot}
              alt={`RustDesk Caixa ${caixa.numero}`}
              className="w-full rounded-lg shadow-2xl"
            />
            <p className="text-center text-white/60 text-xs mt-2">
              Caixa {caixa.numero} — RustDesk {caixa.rustdeskId ?? ''}
            </p>
          </div>
        </div>
      )}
    </>
  )
}

export function CaixasPanel({ companyId, unit, isAdmin }: { companyId: string; unit: UnitMin; isAdmin: boolean }) {
  const { toast } = useToast()
  const [caixas, setCaixas] = useState<UnitCaixa[]>([])
  const [loaded, setLoaded] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [showBulk, setShowBulk] = useState(false)
  const [showOcr, setShowOcr] = useState(false)
  const [showMultiPrint, setShowMultiPrint] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [bulkText, setBulkText] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    companiesApi.listCaixas(companyId, unit.id)
      .then(j => { if (j.success) { setCaixas(j.data); setLoaded(true) } })
      .catch(() => setLoaded(true))
  }, [companyId, unit.id])

  async function addCaixa() {
    if (!form.numero) return
    setSaving(true)
    try {
      const json = await companiesApi.createCaixa(companyId, unit.id, { numero: Number(form.numero), rustdeskId: form.rustdeskId || null, rustdeskPassword: form.rustdeskPassword || null })
      if (!json.success) throw new Error()
      setCaixas(cs => [...cs, json.data].sort((a, b) => a.numero - b.numero))
      setForm(EMPTY_FORM); setShowAdd(false)
      toast({ title: `Caixa ${json.data.numero} adicionado` })
    } catch { toast({ title: 'Erro ao adicionar caixa', variant: 'destructive' }) }
    finally { setSaving(false) }
  }

  async function addViaMultiPrint(items: Array<{ numero: number; rustdeskId: string; rustdeskPassword: string | null; screenshot: string | null }>) {
    for (const data of items) {
      await companiesApi.createCaixa(companyId, unit.id, {
        numero: data.numero,
        rustdeskId: data.rustdeskId || null,
        rustdeskPassword: data.rustdeskPassword,
        screenshot: data.screenshot,
      })
    }
    const r = await companiesApi.listCaixas(companyId, unit.id)
    if (r.success) setCaixas(r.data)
    toast({ title: `${items.length} caixa(s) cadastrado(s) via Multi Print` })
  }

  async function addViaOcr(data: { numero: number; rustdeskId: string; rustdeskPassword: string | null; screenshot: string | null }) {
    const json = await companiesApi.createCaixa(companyId, unit.id, {
      numero: data.numero,
      rustdeskId: data.rustdeskId,
      rustdeskPassword: data.rustdeskPassword,
      screenshot: data.screenshot,
    })
    if (!json.success) throw new Error('Erro ao cadastrar caixa')
    setCaixas(cs => [...cs, json.data].sort((a, b) => a.numero - b.numero))
    toast({ title: `Caixa ${json.data.numero} cadastrado via OCR` })
  }

  async function addBulk() {
    const lines = bulkText.split('\n').map(l => l.trim()).filter(Boolean)
    const items: Array<{ numero: number; rustdeskId?: string | null; rustdeskPassword?: string | null }> = []
    for (const line of lines) {
      const parts = line.split(/[,;\t]+/).map(p => p.trim())
      const numero = parseInt(parts[0], 10)
      if (isNaN(numero) || numero < 1) { toast({ title: 'Linha inválida', description: `"${line}"`, variant: 'destructive' }); return }
      items.push({ numero, rustdeskId: parts[1] || null, rustdeskPassword: parts[2] || null })
    }
    if (!items.length) return
    setSaving(true)
    try {
      await companiesApi.createCaixasBulk(companyId, unit.id, items)
      const r = await companiesApi.listCaixas(companyId, unit.id)
      if (r.success) setCaixas(r.data)
      setBulkText(''); setShowBulk(false)
      toast({ title: `${items.length} caixa(s) adicionado(s)` })
    } catch { toast({ title: 'Erro ao importar', variant: 'destructive' }) }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-foreground/50 uppercase tracking-wide">Caixas ({caixas.length})</p>
        {isAdmin && (
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" className="h-6 gap-1 text-xs px-2" onClick={() => { setShowBulk(s => !s); setShowAdd(false) }}>
              <Upload className="h-3 w-3" /> Em massa
            </Button>
            <Button variant="ghost" size="sm" className="h-6 gap-1 text-xs px-2" onClick={() => { setShowAdd(s => !s); setShowBulk(false) }}>
              <Plus className="h-3 w-3" /> Adicionar
            </Button>
            <Button variant="ghost" size="sm" className="h-6 gap-1 text-xs px-2 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
              onClick={() => setShowOcr(true)}>
              <ScanSearch className="h-3 w-3" /> Via Print
            </Button>
            <Button variant="ghost" size="sm" className="h-6 gap-1 text-xs px-2 text-violet-600 hover:text-violet-700 hover:bg-violet-50"
              onClick={() => setShowMultiPrint(true)}>
              <ScanSearch className="h-3 w-3" /> Multi Print
            </Button>
          </div>
        )}
      </div>

      {showAdd && (
        <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <div><Label className={labelCls}>Número *</Label><Input className={inputCls} type="number" min="1" placeholder="1" value={form.numero} onChange={e => setForm(f => ({ ...f, numero: e.target.value }))} /></div>
            <div><Label className={labelCls}>RustDesk ID</Label><Input className={inputCls} placeholder="123 456 789" value={form.rustdeskId} onChange={e => setForm(f => ({ ...f, rustdeskId: e.target.value }))} /></div>
            <div><Label className={labelCls}>Senha RustDesk</Label><Input className={inputCls} placeholder="senha" value={form.rustdeskPassword} onChange={e => setForm(f => ({ ...f, rustdeskPassword: e.target.value }))} /></div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => { setShowAdd(false); setForm(EMPTY_FORM) }}>Cancelar</Button>
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={addCaixa} disabled={saving || !form.numero}>Adicionar</Button>
          </div>
        </div>
      )}

      {showBulk && (
        <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
          <p className="text-xs text-muted-foreground">Uma linha por caixa: <span className="font-mono">número, rustdesk_id, senha</span></p>
          <Textarea className="text-sm font-mono" rows={4} placeholder={"1, 123456789, senha\n2, 987654321\n3"} value={bulkText} onChange={e => setBulkText(e.target.value)} />
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => { setShowBulk(false); setBulkText('') }}>Cancelar</Button>
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={addBulk} disabled={saving || !bulkText.trim()}>Importar</Button>
          </div>
        </div>
      )}

      {!loaded ? (
        <p className="text-xs text-muted-foreground/60 py-2 text-center">Carregando...</p>
      ) : caixas.length === 0 ? (
        <p className="text-xs text-muted-foreground/50 py-2 text-center">Nenhum caixa cadastrado</p>
      ) : (
        <div className="space-y-1.5">
          {caixas.map(c => (
            <CaixaRow key={c.id} caixa={c} isAdmin={isAdmin} companyId={companyId} unitId={unit.id}
              onUpdated={u => setCaixas(cs => cs.map(x => x.id === u.id ? u : x))}
              onDeleted={id => setCaixas(cs => cs.filter(x => x.id !== id))} />
          ))}
        </div>
      )}

      <RustdeskOcrDialog
        open={showOcr}
        onClose={() => setShowOcr(false)}
        onConfirm={addViaOcr}
      />

      <MultiPrintDialog
        open={showMultiPrint}
        onClose={() => setShowMultiPrint(false)}
        onSave={addViaMultiPrint}
      />
    </div>
  )
}
