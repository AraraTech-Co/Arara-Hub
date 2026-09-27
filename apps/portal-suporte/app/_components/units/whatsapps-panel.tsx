'use client'

import { useState, useEffect } from 'react'
import { MessageCircle, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { companiesApi, UnitSolicitante } from '@/lib/api/companies'
import { toWhatsappUrl } from '@/lib/utils'

const labelCls = 'text-xs font-medium text-foreground/60'
const inputCls = 'mt-1 text-sm'
const EMPTY_FORM = { nome: '', cargo: '', whatsapp: '' }

interface UnitMin { id: string }

export function WhatsappsPanel({ companyId, unit, isAdmin }: { companyId: string; unit: UnitMin; isAdmin: boolean }) {
  const { toast } = useToast()
  const [items, setItems] = useState<UnitSolicitante[]>([])
  const [loaded, setLoaded] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
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

  function cancelEdit() { setEditingId(null); setForm(EMPTY_FORM) }

  async function save(id?: string) {
    if (!form.nome.trim() || !form.whatsapp.trim()) return
    setSaving(true)
    try {
      if (id) {
        const json = await companiesApi.updateWhatsapp(companyId, unit.id, id, { nome: form.nome, cargo: form.cargo || null, whatsapp: form.whatsapp })
        if (!json.success) throw new Error()
        setItems(xs => xs.map(x => x.id === id ? json.data : x))
        setEditingId(null)
        toast({ title: 'Contato atualizado' })
      } else {
        const json = await companiesApi.createWhatsapp(companyId, unit.id, { nome: form.nome, cargo: form.cargo || null, whatsapp: form.whatsapp })
        if (!json.success) throw new Error()
        setItems(xs => [...xs, json.data])
        setShowAdd(false)
        toast({ title: 'Contato adicionado' })
      }
      setForm(EMPTY_FORM)
    } catch { toast({ title: 'Erro ao salvar contato', variant: 'destructive' }) }
    finally { setSaving(false) }
  }

  async function remove(item: UnitSolicitante) {
    if (!confirm(`Excluir ${item.nome}?`)) return
    const json = await companiesApi.deleteWhatsapp(companyId, unit.id, item.id)
    if (!json.success) { toast({ title: 'Erro ao excluir', variant: 'destructive' }); return }
    setItems(xs => xs.filter(x => x.id !== item.id))
    toast({ title: `${item.nome} removido` })
  }

  const renderForm = (id?: string) => (
    <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
      <div className="grid grid-cols-3 gap-2">
        <div><Label className={labelCls}>Nome *</Label><Input className={inputCls} placeholder="João Silva" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} /></div>
        <div><Label className={labelCls}>Cargo</Label><Input className={inputCls} placeholder="Gerente" value={form.cargo} onChange={e => setForm(f => ({ ...f, cargo: e.target.value }))} /></div>
        <div><Label className={labelCls}>WhatsApp *</Label><Input className={inputCls} placeholder="(11) 99999-9999" value={form.whatsapp} onChange={e => setForm(f => ({ ...f, whatsapp: e.target.value }))} /></div>
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="sm" onClick={() => id ? cancelEdit() : setShowAdd(false)}>Cancelar</Button>
        <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => save(id)} disabled={saving || !form.nome.trim() || !form.whatsapp.trim()}>
          {id ? 'Salvar' : 'Adicionar'}
        </Button>
      </div>
    </div>
  )

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-foreground/50 uppercase tracking-wide">Solicitantes ({items.length})</p>
        {isAdmin && (
          <Button variant="ghost" size="sm" className="h-6 gap-1 text-xs px-2" onClick={() => { setShowAdd(s => !s); cancelEdit() }}>
            <Plus className="h-3 w-3" /> Adicionar
          </Button>
        )}
      </div>

      {showAdd && renderForm()}

      {!loaded ? (
        <p className="text-xs text-muted-foreground/60 py-2 text-center">Carregando...</p>
      ) : items.length === 0 && !showAdd ? (
        <p className="text-xs text-muted-foreground/50 py-2 text-center">Nenhum solicitante cadastrado</p>
      ) : (
        <div className="space-y-1.5">
          {items.map(item => editingId === item.id ? (
            <div key={item.id}>{renderForm(item.id)}</div>
          ) : (
            <div key={item.id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2 hover:bg-muted/30">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-green-500/10 text-green-600">
                  <MessageCircle className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{item.nome}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {item.cargo && <span className="mr-2">{item.cargo}</span>}
                    <a href={toWhatsappUrl(item.whatsapp)} target="_blank" rel="noopener noreferrer"
                      className="font-mono hover:text-green-600 transition-colors" onClick={e => e.stopPropagation()}>
                      {item.whatsapp}
                    </a>
                  </p>
                </div>
              </div>
              {isAdmin && (
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground/70 hover:text-blue-500" onClick={() => startEdit(item)}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground/70 hover:text-red-500" onClick={() => remove(item)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
