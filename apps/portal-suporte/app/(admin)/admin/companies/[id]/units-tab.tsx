'use client'

import { useState, useEffect } from 'react'
import { Check, Copy, Eye, EyeOff, MapPin, MessageCircle, Monitor, Pencil, Plus, ScanSearch, Trash2, Upload, X, ZoomIn } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState } from '@/components/ui/empty-state'
import { toWhatsappUrl, mascaraTelefone } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { companiesApi, UnitCaixa, UnitSolicitante } from '@/lib/api/companies'
import { RustdeskOcrDialog } from '@/components/units/rustdesk-ocr-dialog'
import { MultiPrintDialog } from '@/components/units/multi-print-dialog'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Unit {
  id: string
  companyId: string
  name: string
  city: string | null
  state: string | null
  active: boolean
  code?: string | null
  cnpj?: string | null
  address?: string | null
  phone?: string | null
  email?: string | null
  whatsapp?: string | null
  product?: string | null
  pdvCount?: number | null
  serverRef?: string | null
  notes?: string | null
}

interface UnitsTabProps {
  companyId: string
  isAdmin: boolean
}

// ─── Constants ────────────────────────────────────────────────────────────────

const EMPTY_UNIT_FORM = {
  name: '', city: '', state: '', code: '', cnpj: '', address: '',
  phone: '', email: '', whatsapp: '', product: '', pdvCount: '' as string | number,
  serverRef: '', notes: '',
}

const EMPTY_CAIXA_FORM = { numero: '', rustdeskId: '', rustdeskPassword: '' }

const labelCls = 'text-xs font-medium text-foreground/60'
const inputCls = 'mt-1 text-sm'

// ─── CaixaRow ─────────────────────────────────────────────────────────────────

function CaixaRow({
  caixa,
  isAdmin,
  companyId,
  unitId,
  onUpdated,
  onDeleted,
}: {
  caixa: UnitCaixa
  isAdmin: boolean
  companyId: string
  unitId: string
  onUpdated: (c: UnitCaixa) => void
  onDeleted: (id: string) => void
}) {
  const { toast } = useToast()
  const [editing, setEditing] = useState(false)
  const [showPass, setShowPass] = useState(false)
  const [saving, setSaving] = useState(false)
  const [lightbox, setLightbox] = useState(false)
  const [copiedField, setCopiedField] = useState<'rustdeskId' | 'senha' | null>(null)

  function copyToClipboard(value: string, field: 'rustdeskId' | 'senha') {
    navigator.clipboard.writeText(value)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 1500)
  }
  const [form, setForm] = useState({
    numero: String(caixa.numero),
    rustdeskId: caixa.rustdeskId ?? '',
    rustdeskPassword: caixa.rustdeskPassword ?? '',
  })

  async function save() {
    setSaving(true)
    try {
      const json = await companiesApi.updateCaixa(companyId, unitId, caixa.id, {
        numero: Number(form.numero),
        rustdeskId: form.rustdeskId || null,
        rustdeskPassword: form.rustdeskPassword || null,
      })
      if (!json.success) throw new Error('Erro ao salvar')
      onUpdated(json.data)
      setEditing(false)
      toast({ title: 'Caixa atualizado' })
    } catch {
      toast({ title: 'Erro', description: 'Não foi possível salvar o caixa', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!confirm(`Excluir Caixa ${caixa.numero}?`)) return
    const json = await companiesApi.deleteCaixa(companyId, unitId, caixa.id)
    if (!json.success) { toast({ title: 'Erro ao excluir', variant: 'destructive' }); return }
    onDeleted(caixa.id)
    toast({ title: `Caixa ${caixa.numero} excluído` })
  }

  if (editing) {
    return (
      <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label className={labelCls}>Número</Label>
            <Input className={inputCls} type="number" min="1" value={form.numero}
              onChange={e => setForm(f => ({ ...f, numero: e.target.value }))} />
          </div>
          <div>
            <Label className={labelCls}>RustDesk ID</Label>
            <Input className={inputCls} placeholder="123 456 789" value={form.rustdeskId}
              onChange={e => setForm(f => ({ ...f, rustdeskId: e.target.value }))} />
          </div>
          <div>
            <Label className={labelCls}>Senha RustDesk</Label>
            <Input className={inputCls} type="text" placeholder="••••••" value={form.rustdeskPassword}
              onChange={e => setForm(f => ({ ...f, rustdeskPassword: e.target.value }))} />
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>Cancelar</Button>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={save} disabled={saving}>Salvar</Button>
        </div>
      </div>
    )
  }

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
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-bold text-foreground/70">
              {caixa.numero}
            </div>
          )}

          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">Caixa {caixa.numero}</p>
            {caixa.rustdeskId && (
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <button
                  onClick={() => copyToClipboard(caixa.rustdeskId!, 'rustdeskId')}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground group"
                  title="Copiar RustDesk ID"
                >
                  <Monitor className="h-3 w-3" />
                  <span className="font-mono">{caixa.rustdeskId}</span>
                  {copiedField === 'rustdeskId'
                    ? <Check className="h-3 w-3 text-green-500" />
                    : <Copy className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                  }
                </button>
                <a
                  href={`rustdesk://${caixa.rustdeskId}`}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
                  title="Abrir no RustDesk (ID preenchido)"
                >
                  <Monitor className="h-3 w-3" /> Conectar
                </a>
                {caixa.rustdeskPassword && (
                  <span className="flex items-center gap-1">
                    <button
                      onClick={() => setShowPass(s => !s)}
                      className="text-muted-foreground/60 hover:text-foreground"
                      title={showPass ? 'Ocultar senha' : 'Mostrar senha'}
                    >
                      {showPass ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    </button>
                    <button
                      onClick={() => copyToClipboard(caixa.rustdeskPassword!, 'senha')}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground group"
                      title="Copiar senha"
                    >
                      <span className="font-mono">{showPass ? caixa.rustdeskPassword : '••••••'}</span>
                      {copiedField === 'senha'
                        ? <Check className="h-3 w-3 text-green-500" />
                        : <Copy className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                      }
                    </button>
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {isAdmin && (
          <div className="flex gap-1 shrink-0">
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground/70 hover:text-blue-500"
              onClick={() => setEditing(true)}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground/70 hover:text-red-500"
              onClick={remove}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
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

// ─── CaixasPanel ──────────────────────────────────────────────────────────────

function CaixasPanel({ companyId, unit, isAdmin }: { companyId: string; unit: Unit; isAdmin: boolean }) {
  const { toast } = useToast()
  const [caixas, setCaixas] = useState<UnitCaixa[]>([])
  const [loaded, setLoaded] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [showBulk, setShowBulk] = useState(false)
  const [showOcr, setShowOcr] = useState(false)
  const [showMultiPrint, setShowMultiPrint] = useState(false)
  const [form, setForm] = useState(EMPTY_CAIXA_FORM)
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
      const json = await companiesApi.createCaixa(companyId, unit.id, {
        numero: Number(form.numero),
        rustdeskId: form.rustdeskId || null,
        rustdeskPassword: form.rustdeskPassword || null,
      })
      if (!json.success) throw new Error('Erro ao criar')
      setCaixas(cs => [...cs, json.data].sort((a, b) => a.numero - b.numero))
      setForm(EMPTY_CAIXA_FORM)
      setShowAdd(false)
      toast({ title: `Caixa ${json.data.numero} adicionado` })
    } catch {
      toast({ title: 'Erro ao adicionar caixa', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
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
      if (isNaN(numero) || numero < 1) {
        toast({ title: 'Linha inválida', description: `"${line}" — o primeiro valor deve ser o número do caixa`, variant: 'destructive' })
        return
      }
      items.push({ numero, rustdeskId: parts[1] || null, rustdeskPassword: parts[2] || null })
    }

    if (items.length === 0) return
    setSaving(true)
    try {
      const json = await companiesApi.createCaixasBulk(companyId, unit.id, items)
      if (!json.success) throw new Error('Erro')
      const refreshed = await companiesApi.listCaixas(companyId, unit.id)
      if (refreshed.success) setCaixas(refreshed.data)
      setBulkText('')
      setShowBulk(false)
      toast({ title: `${items.length} caixa(s) adicionado(s)` })
    } catch {
      toast({ title: 'Erro ao importar caixas', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-foreground/50 uppercase tracking-wide">
          Caixas ({caixas.length})
        </p>
        {isAdmin && (
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" className="h-6 gap-1 text-xs px-2"
              onClick={() => { setShowBulk(s => !s); setShowAdd(false) }}>
              <Upload className="h-3 w-3" /> Em massa
            </Button>
            <Button variant="ghost" size="sm" className="h-6 gap-1 text-xs px-2"
              onClick={() => { setShowAdd(s => !s); setShowBulk(false) }}>
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

      {/* Formulário — adicionar unitário */}
      {showAdd && (
        <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className={labelCls}>Número *</Label>
              <Input className={inputCls} type="number" min="1" placeholder="1"
                value={form.numero} onChange={e => setForm(f => ({ ...f, numero: e.target.value }))} />
            </div>
            <div>
              <Label className={labelCls}>RustDesk ID</Label>
              <Input className={inputCls} placeholder="123 456 789"
                value={form.rustdeskId} onChange={e => setForm(f => ({ ...f, rustdeskId: e.target.value }))} />
            </div>
            <div>
              <Label className={labelCls}>Senha RustDesk</Label>
              <Input className={inputCls} placeholder="senha"
                value={form.rustdeskPassword} onChange={e => setForm(f => ({ ...f, rustdeskPassword: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => { setShowAdd(false); setForm(EMPTY_CAIXA_FORM) }}>
              Cancelar
            </Button>
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={addCaixa} disabled={saving || !form.numero}>
              Adicionar
            </Button>
          </div>
        </div>
      )}

      {/* Formulário — importação em massa */}
      {showBulk && (
        <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
          <p className="text-xs text-muted-foreground">
            Uma linha por caixa: <span className="font-mono">número, rustdesk_id, senha_rustdesk</span><br />
            Ex: <span className="font-mono">1, 123456789, minhasenha</span>
          </p>
          <Textarea
            className="text-sm font-mono"
            rows={5}
            placeholder={"1, 123456789, senha\n2, 987654321\n3"}
            value={bulkText}
            onChange={e => setBulkText(e.target.value)}
          />
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => { setShowBulk(false); setBulkText('') }}>
              Cancelar
            </Button>
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={addBulk} disabled={saving || !bulkText.trim()}>
              Importar
            </Button>
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
            <CaixaRow
              key={c.id}
              caixa={c}
              isAdmin={isAdmin}
              companyId={companyId}
              unitId={unit.id}
              onUpdated={updated => setCaixas(cs => cs.map(x => x.id === updated.id ? updated : x))}
              onDeleted={id => setCaixas(cs => cs.filter(x => x.id !== id))}
            />
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

// ─── WhatsappsPanel ───────────────────────────────────────────────────────────

const EMPTY_WA_FORM = { nome: '', cargo: '', whatsapp: '' }

function WhatsappsPanel({ companyId, unit, isAdmin }: { companyId: string; unit: Unit; isAdmin: boolean }) {
  const { toast } = useToast()
  const [items, setItems] = useState<UnitSolicitante[]>([])
  const [loaded, setLoaded] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_WA_FORM)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    companiesApi.listWhatsapps(companyId, unit.id)
      .then(j => { if (j.success) { setItems(j.data); setLoaded(true) } })
      .catch(() => setLoaded(true))
  }, [companyId, unit.id])

  function startEdit(item: UnitSolicitante) {
    setEditingId(item.id)
    setForm({ nome: item.nome, cargo: item.cargo ?? '', whatsapp: item.whatsapp })
    setShowAdd(false)
  }

  function cancelEdit() {
    setEditingId(null)
    setForm(EMPTY_WA_FORM)
  }

  async function save(id?: string) {
    if (!form.nome.trim() || !form.whatsapp.trim()) return
    setSaving(true)
    try {
      if (id) {
        const json = await companiesApi.updateWhatsapp(companyId, unit.id, id, {
          nome: form.nome, cargo: form.cargo || null, whatsapp: form.whatsapp,
        })
        if (!json.success) throw new Error()
        setItems(xs => xs.map(x => x.id === id ? json.data : x))
        setEditingId(null)
        toast({ title: 'Contato atualizado' })
      } else {
        const json = await companiesApi.createWhatsapp(companyId, unit.id, {
          nome: form.nome, cargo: form.cargo || null, whatsapp: form.whatsapp,
        })
        if (!json.success) throw new Error()
        setItems(xs => [...xs, json.data])
        setShowAdd(false)
        toast({ title: 'Contato adicionado' })
      }
      setForm(EMPTY_WA_FORM)
    } catch {
      toast({ title: 'Erro ao salvar contato', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  async function remove(item: UnitSolicitante) {
    if (!confirm(`Excluir ${item.nome}?`)) return
    const json = await companiesApi.deleteWhatsapp(companyId, unit.id, item.id)
    if (!json.success) { toast({ title: 'Erro ao excluir', variant: 'destructive' }); return }
    setItems(xs => xs.filter(x => x.id !== item.id))
    toast({ title: `${item.nome} removido` })
  }

  const waForm = (id?: string) => (
    <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
      <div className="grid grid-cols-3 gap-2">
        <div>
          <Label className={labelCls}>Nome *</Label>
          <Input className={inputCls} placeholder="João Silva"
            value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
        </div>
        <div>
          <Label className={labelCls}>Cargo</Label>
          <Input className={inputCls} placeholder="Gerente"
            value={form.cargo} onChange={e => setForm(f => ({ ...f, cargo: e.target.value }))} />
        </div>
        <div>
          <Label className={labelCls}>WhatsApp *</Label>
          <Input className={inputCls} placeholder="(11) 99999-9999"
            value={form.whatsapp} onChange={e => setForm(f => ({ ...f, whatsapp: e.target.value }))} />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="sm" onClick={() => id ? cancelEdit() : setShowAdd(false)}>Cancelar</Button>
        <Button size="sm" className="bg-green-600 hover:bg-green-700"
          onClick={() => save(id)} disabled={saving || !form.nome.trim() || !form.whatsapp.trim()}>
          {id ? 'Salvar' : 'Adicionar'}
        </Button>
      </div>
    </div>
  )

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-foreground/50 uppercase tracking-wide">
          WhatsApp ({items.length})
        </p>
        {isAdmin && (
          <Button variant="ghost" size="sm" className="h-6 gap-1 text-xs px-2"
            onClick={() => { setShowAdd(s => !s); cancelEdit() }}>
            <Plus className="h-3 w-3" /> Adicionar
          </Button>
        )}
      </div>

      {showAdd && waForm()}

      {!loaded ? (
        <p className="text-xs text-muted-foreground/60 py-2 text-center">Carregando...</p>
      ) : items.length === 0 && !showAdd ? (
        <p className="text-xs text-muted-foreground/50 py-2 text-center">Nenhum contato cadastrado</p>
      ) : (
        <div className="space-y-1.5">
          {items.map(item => editingId === item.id ? (
            <div key={item.id}>{waForm(item.id)}</div>
          ) : (
            <div key={item.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2 hover:bg-muted/30">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-green-500/10 text-green-600">
                  <MessageCircle className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{item.nome}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {item.cargo && <span className="mr-2">{item.cargo}</span>}
                    <a
                      href={toWhatsappUrl(item.whatsapp)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono hover:text-green-600 transition-colors"
                      onClick={e => e.stopPropagation()}
                    >
                      {item.whatsapp}
                    </a>
                  </p>
                </div>
              </div>
              {isAdmin && (
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground/70 hover:text-blue-500"
                    onClick={() => startEdit(item)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground/70 hover:text-red-500"
                    onClick={() => remove(item)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function UnitsTab({ companyId, isAdmin }: UnitsTabProps) {
  const { toast } = useToast()

  const [units, setUnits]             = useState<Unit[]>([])
  const [unitsLoaded, setUnitsLoaded] = useState(false)
  const [form, setForm]               = useState(EMPTY_UNIT_FORM)
  const [editing, setEditing]         = useState<Unit | null>(null)
  const [showForm, setShowForm]       = useState(false)
  const [saving, setSaving]           = useState(false)
  const [activePanel, setActivePanel] = useState<Record<string, 'caixas' | 'whatsapps' | null>>({})

  useEffect(() => {
    companiesApi.listUnits(companyId)
      .then(j => { if (j.success) { setUnits(j.data); setUnitsLoaded(true) } })
      .catch(() => {})
  }, [companyId])

  function togglePanel(unitId: string, panel: 'caixas' | 'whatsapps') {
    setActivePanel(prev => ({
      ...prev,
      [unitId]: prev[unitId] === panel ? null : panel,
    }))
  }

  async function saveUnit() {
    if (!form.name.trim()) return
    // Mesma regra do servidor, dita ANTES de enviar: recusar aqui evita a ida
    // e volta e diz onde está o problema.
    if (!form.whatsapp.trim()) {
      toast({ title: 'Erro', description: 'Informe o WhatsApp da unidade.', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const payload = { ...form, pdvCount: form.pdvCount !== '' ? Number(form.pdvCount) : null }
      if (editing) {
        const json = await companiesApi.updateUnit(companyId, editing.id, payload)
        if (!json.success) throw new Error('Erro ao salvar unidade')
        setUnits(us => us.map(u => u.id === editing.id ? json.data : u))
      } else {
        const json = await companiesApi.createUnit(companyId, payload as Parameters<typeof companiesApi.createUnit>[1])
        if (!json.success) throw new Error('Erro ao criar unidade')
        setUnits(us => [...us, json.data])
      }
      setEditing(null)
      setForm(EMPTY_UNIT_FORM)
      setShowForm(false)
      toast({ title: 'Unidade salva' })
    } catch (err: unknown) {
      toast({ title: 'Erro', description: err instanceof Error ? err.message : 'Erro', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  async function deleteUnit(id: string) {
    if (!confirm('Excluir esta unidade? A operação não pode ser desfeita.')) return
    const json = await companiesApi.deleteUnit(companyId, id)
    if (!json.success) { toast({ title: 'Erro', description: 'Erro ao excluir unidade', variant: 'destructive' }); return }
    setUnits(us => us.filter(u => u.id !== id))
    toast({ title: 'Unidade excluída' })
  }

  return (
    <div className="rounded-xl bg-card p-6 space-y-4 shadow-[var(--shadow-media)]">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground/80">Unidades / Filiais</h2>
        {isAdmin && (
          <Button size="sm" variant="outline" className="gap-1.5"
            onClick={() => { setEditing(null); setForm(EMPTY_UNIT_FORM); setShowForm(s => !s) }}>
            <Plus className="h-3.5 w-3.5" /> Adicionar Unidade
          </Button>
        )}
      </div>

      {showForm && (
        <div className="rounded-lg border border-sem-info-bd bg-sem-info p-4 space-y-3">
          <p className="text-xs font-semibold text-foreground/60">
            {editing ? 'Editar unidade' : 'Nova unidade'}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label className={labelCls}>Nome *</Label>
              <Input className={inputCls} placeholder="Filial Centro, Unidade Norte..."
                value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <Label className={labelCls}>Código interno</Label>
              <Input className={inputCls} placeholder="UN-001"
                value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} />
            </div>
            <div>
              <Label className={labelCls}>CNPJ</Label>
              <Input className={inputCls} placeholder="00.000.000/0001-00"
                value={form.cnpj} onChange={e => setForm(f => ({ ...f, cnpj: e.target.value }))} />
            </div>
            <div>
              <Label className={labelCls}>Cidade</Label>
              <Input className={inputCls}
                value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
            </div>
            <div>
              <Label className={labelCls}>Estado</Label>
              <Input className={inputCls} placeholder="SP"
                value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} />
            </div>
            <div>
              <Label className={labelCls}>Telefone</Label>
              <Input className={inputCls}
                value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
            <div>
              <Label className={labelCls}>E-mail</Label>
              <Input className={inputCls} type="email"
                value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            {/* O servidor EXIGE o WhatsApp da unidade — é por ele que a conversa
                é roteada para a filial certa. O campo existia no estado do
                formulário e era enviado vazio porque ninguém tinha colocado o
                input na tela: a pessoa preenchia tudo e levava "WhatsApp da
                unidade é obrigatório" sem ter onde informá-lo. */}
            <div>
              <Label className={labelCls}>
                WhatsApp da unidade <span aria-hidden className="text-sem-error-fg">*</span>
              </Label>
              <Input className={inputCls} type="tel" required
                placeholder="(00) 00000-0000" maxLength={15}
                value={form.whatsapp}
                onChange={e => setForm(f => ({ ...f, whatsapp: mascaraTelefone(e.target.value) }))} />
            </div>
            <div>
              <Label className={labelCls}>Produto</Label>
              <select className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={form.product} onChange={e => setForm(f => ({ ...f, product: e.target.value }))}>
                <option value="">— Herda da empresa</option>
                <option value="SGI">SGI</option>
                <option value="SGC">SGC</option>
                <option value="BOTH">SGI + SGC</option>
                <option value="OTHER">Outro</option>
              </select>
            </div>
            <div>
              <Label className={labelCls}>Qtd. PDVs</Label>
              <Input className={inputCls} type="number" min="0" placeholder="0"
                value={form.pdvCount} onChange={e => setForm(f => ({ ...f, pdvCount: e.target.value }))} />
            </div>
            <div>
              <Label className={labelCls}>Servidor / Ref.</Label>
              <Input className={inputCls} placeholder="FILIAL-SRV01"
                value={form.serverRef} onChange={e => setForm(f => ({ ...f, serverRef: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <Label className={labelCls}>Endereço</Label>
              <Input className={inputCls} placeholder="Rua, número..."
                value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <Label className={labelCls}>Notas</Label>
              <Textarea className="mt-1 text-sm" rows={2}
                value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm"
              onClick={() => { setShowForm(false); setEditing(null); setForm(EMPTY_UNIT_FORM) }}>
              Cancelar
            </Button>
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={saveUnit} disabled={saving}>
              {editing ? 'Atualizar' : 'Adicionar'}
            </Button>
          </div>
        </div>
      )}

      {!unitsLoaded ? (
        <p className="text-xs text-muted-foreground/70 py-4 text-center">Carregando unidades...</p>
      ) : units.length === 0 ? (
        <EmptyState icon={<MapPin className="h-8 w-8 text-muted-foreground/50" />}
          title="Nenhuma unidade cadastrada"
          description="Adicione filiais e unidades desta empresa."
          size="sm" />
      ) : (
        <div className="space-y-2">
          {units.map(u => {
            const panel = activePanel[u.id] ?? null
            return (
              <div key={u.id} className="rounded-lg border border-border bg-background overflow-hidden">
                {/* Cabeçalho da unidade */}
                <div className="flex items-start justify-between gap-3 p-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground mt-0.5">
                      <MapPin className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{u.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {[u.city, u.state].filter(Boolean).join(', ')}{u.code && ` • ${u.code}`}
                      </p>
                      <div className="mt-0.5 flex flex-wrap gap-2 text-xs text-muted-foreground/60">
                        {u.product && <span>{u.product}</span>}
                        {u.pdvCount != null && <span>{u.pdvCount} PDVs</span>}
                        {(u.phone || u.email) && <span>{[u.phone, u.email].filter(Boolean).join(' | ')}</span>}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {/* Botões de gerenciamento */}
                    <Button
                      variant={panel === 'caixas' ? 'secondary' : 'outline'}
                      size="sm"
                      className="h-7 gap-1.5 text-xs px-2.5"
                      onClick={() => togglePanel(u.id, 'caixas')}
                    >
                      <Monitor className="h-3 w-3" />
                      Caixas
                    </Button>
                    <Button
                      variant={panel === 'whatsapps' ? 'secondary' : 'outline'}
                      size="sm"
                      className="h-7 gap-1.5 text-xs px-2.5"
                      onClick={() => togglePanel(u.id, 'whatsapps')}
                    >
                      <MessageCircle className="h-3 w-3" />
                      Usuários
                    </Button>

                    {/* Editar / Excluir unidade */}
                    {isAdmin && (
                      <>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground/70 hover:text-blue-500"
                          onClick={() => {
                            setEditing(u)
                            setForm({
                              name: u.name, city: u.city ?? '', state: u.state ?? '',
                              code: u.code ?? '', cnpj: u.cnpj ?? '', address: u.address ?? '',
                              phone: u.phone ?? '', email: u.email ?? '', whatsapp: u.whatsapp ?? '',
                              product: u.product ?? '', pdvCount: u.pdvCount ?? '',
                              serverRef: u.serverRef ?? '', notes: u.notes ?? '',
                            })
                            setShowForm(true)
                          }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground/70 hover:text-red-500"
                          onClick={() => deleteUnit(u.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {/* Painel ativo */}
                {panel === 'caixas' && (
                  <div className="border-t border-border/40 px-4 py-3 bg-muted/20">
                    <CaixasPanel companyId={companyId} unit={u} isAdmin={isAdmin} />
                  </div>
                )}
                {panel === 'whatsapps' && (
                  <div className="border-t border-border/40 px-4 py-3 bg-muted/20">
                    <WhatsappsPanel companyId={companyId} unit={u} isAdmin={isAdmin} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
