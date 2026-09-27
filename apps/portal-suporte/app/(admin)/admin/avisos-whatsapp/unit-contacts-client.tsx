'use client'

import { useState, useEffect, useMemo } from 'react'
import { Building2, MapPin, MessageCircle, Pencil, Plus, Search, Send, Trash2, Users, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { useToast } from '@/hooks/use-toast'
import { companiesApi } from '@/lib/api/companies'
import { toWhatsappUrl } from '@/lib/utils'

interface Company { id: string; name: string }
interface Unit { id: string; name: string; city: string | null; state: string | null; company: Company }
interface Contact {
  id: string
  unitId: string
  nome: string
  cargo: string | null
  whatsapp: string
  unit: Unit
}

const labelCls = 'text-xs font-medium text-foreground/60'
const inputCls = 'mt-1 text-sm'
const EMPTY_FORM = { nome: '', cargo: '', whatsapp: '' }

export function UnitContactsClient({ isAdmin }: { isAdmin: boolean }) {
  const { toast } = useToast()
  const [contacts, setContacts]   = useState<Contact[]>([])
  const [loaded, setLoaded]       = useState(false)
  const [search, setSearch]       = useState('')
  const [filterCompanyId, setFilterCompanyId] = useState('')
  const [filterUnitId, setFilterUnitId]       = useState('')
  const [companies, setCompanies] = useState<Company[]>([])
  const [units, setUnits]         = useState<Unit[]>([])

  // Seleção
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Formulário
  const [showForm, setShowForm]     = useState(false)
  const [editingId, setEditingId]   = useState<string | null>(null)
  const [form, setForm]             = useState(EMPTY_FORM)
  const [formUnitId, setFormUnitId] = useState('')
  const [formUnits, setFormUnits]   = useState<Unit[]>([])
  const [formCompanyId, setFormCompanyId] = useState('')
  const [formCompanies, setFormCompanies] = useState<Company[]>([])
  const [saving, setSaving]         = useState(false)

  // Enviar mensagem (única ou em lote)
  const [msgTargets, setMsgTargets] = useState<Contact[]>([])
  const [msgText, setMsgText]       = useState('')

  function openMsgSingle(c: Contact) { setMsgTargets([c]); setMsgText('') }
  function openMsgBulk() {
    const targets = filtered.filter(c => selectedIds.has(c.id))
    setMsgTargets(targets); setMsgText('')
  }
  function closeMsg() { setMsgTargets([]); setMsgText('') }

  function sendMsg() {
    if (!msgText.trim() || msgTargets.length === 0) return
    msgTargets.forEach(c => {
      const url = toWhatsappUrl(c.whatsapp, msgText.trim())
      window.open(url, '_blank')
    })
    closeMsg()
  }

  // Carregar contatos
  useEffect(() => {
    import('@/lib/api/client')
      .then(({ api }) => api.get<{ success?: boolean; data?: Contact[] }>('/api/admin/unit-contacts'))
      .then((j) => {
        const rows = j.data || []
        setContacts(rows)
        const cMap = new Map<string, Company>()
        const uMap = new Map<string, Unit>()
        rows.forEach((c) => {
          if (c.unit?.company) cMap.set(c.unit.company.id, c.unit.company)
          if (c.unit) uMap.set(c.unit.id, c.unit)
        })
        setCompanies(Array.from(cMap.values()).sort((a, b) => a.name.localeCompare(b.name)))
        setUnits(Array.from(uMap.values()))
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [])

  useEffect(() => {
    companiesApi.list({ limit: 200 })
      .then(j => setFormCompanies(j.data ?? []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!formCompanyId) { setFormUnits([]); setFormUnitId(''); return }
    companiesApi.listUnits(formCompanyId)
      .then(j => setFormUnits(j.data ?? []))
      .catch(() => {})
  }, [formCompanyId])

  const filteredUnits = useMemo(() =>
    units.filter(u => !filterCompanyId || u.company.id === filterCompanyId),
    [units, filterCompanyId]
  )

  const filtered = useMemo(() => {
    return contacts.filter(c => {
      if (filterCompanyId && c.unit.company.id !== filterCompanyId) return false
      if (filterUnitId && c.unitId !== filterUnitId) return false
      if (search) {
        const q = search.toLowerCase()
        if (
          !c.nome.toLowerCase().includes(q) &&
          !(c.cargo ?? '').toLowerCase().includes(q) &&
          !c.whatsapp.includes(q) &&
          !c.unit.name.toLowerCase().includes(q) &&
          !c.unit.company.name.toLowerCase().includes(q)
        ) return false
      }
      return true
    })
  }, [contacts, filterCompanyId, filterUnitId, search])

  // Seleção
  const allVisibleSelected = filtered.length > 0 && filtered.every(c => selectedIds.has(c.id))
  const someSelected = filtered.some(c => selectedIds.has(c.id))
  const selectedCount = filtered.filter(c => selectedIds.has(c.id)).size ?? [...selectedIds].filter(id => filtered.some(c => c.id === id)).length

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (allVisibleSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev)
        filtered.forEach(c => next.delete(c.id))
        return next
      })
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev)
        filtered.forEach(c => next.add(c.id))
        return next
      })
    }
  }

  function clearSelection() { setSelectedIds(new Set()) }

  const numSelected = [...selectedIds].filter(id => filtered.some(c => c.id === id)).length

  // Formulário
  function openCreate() {
    setEditingId(null); setForm(EMPTY_FORM); setFormCompanyId(''); setFormUnitId(''); setShowForm(true)
  }

  function openEdit(c: Contact) {
    setEditingId(c.id)
    setForm({ nome: c.nome, cargo: c.cargo ?? '', whatsapp: c.whatsapp })
    setFormUnitId(c.unitId)
    setFormCompanyId(c.unit.company.id)
    companiesApi.listUnits(c.unit.company.id).then(j => setFormUnits(j.data ?? [])).catch(() => {})
    setShowForm(true)
  }

  function cancelForm() {
    setShowForm(false); setEditingId(null); setForm(EMPTY_FORM); setFormUnitId(''); setFormCompanyId('')
  }

  async function save() {
    if (!form.nome.trim() || !form.whatsapp.trim() || !formUnitId) return
    setSaving(true)
    try {
      if (editingId) {
        const json = await companiesApi.updateWhatsapp(formCompanyId, formUnitId, editingId, {
          nome: form.nome, cargo: form.cargo || null, whatsapp: form.whatsapp,
        })
        if (!json.success) throw new Error()
        setContacts(cs => cs.map(c => c.id === editingId ? { ...c, ...json.data } : c))
        toast({ title: 'Contato atualizado' })
      } else {
        const json = await companiesApi.createWhatsapp(formCompanyId, formUnitId, {
          nome: form.nome, cargo: form.cargo || null, whatsapp: form.whatsapp,
        })
        if (!json.success) throw new Error()
        const unit = formUnits.find(u => u.id === formUnitId)
        const company = formCompanies.find(c => c.id === formCompanyId)
        if (unit && company) {
          const newContact: Contact = { ...json.data, unit: { ...unit, company } }
          setContacts(cs => [...cs, newContact])
          if (!companies.find(c => c.id === company.id)) setCompanies(prev => [...prev, company].sort((a, b) => a.name.localeCompare(b.name)))
          if (!units.find(u => u.id === unit.id)) setUnits(prev => [...prev, unit as Unit])
        }
        toast({ title: 'Contato adicionado' })
      }
      cancelForm()
    } catch {
      toast({ title: 'Erro ao salvar', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  async function remove(c: Contact) {
    if (!confirm(`Excluir ${c.nome}?`)) return
    const json = await companiesApi.deleteWhatsapp(c.unit.company.id, c.unitId, c.id)
    if (!json.success) { toast({ title: 'Erro ao excluir', variant: 'destructive' }); return }
    setContacts(cs => cs.filter(x => x.id !== c.id))
    setSelectedIds(prev => { const next = new Set(prev); next.delete(c.id); return next })
    toast({ title: `${c.nome} removido` })
  }

  return (
    <div className="pt-14 lg:pt-0">
      <div className="mx-auto max-w-7xl px-4 pt-6 pb-8 lg:py-8 sm:px-6 lg:px-8 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Avisos Whatsapp</h1>
            <p className="mt-1 text-sm text-muted-foreground">Enviar avisos em massa via whatsapp</p>
          </div>
          {isAdmin && (
            <Button className="gap-2 shrink-0" onClick={openCreate}>
              <Plus className="h-4 w-4" /> Novo Usuário
            </Button>
          )}
        </div>


        {/* Formulário */}
        {showForm && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">{editingId ? 'Editar contato' : 'Novo contato'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className={labelCls}>Empresa *</Label>
                  <select className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    value={formCompanyId}
                    onChange={e => { setFormCompanyId(e.target.value); setFormUnitId('') }}>
                    <option value="">Selecionar empresa...</option>
                    {formCompanies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <Label className={labelCls}>Unidade *</Label>
                  <select className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    value={formUnitId} onChange={e => setFormUnitId(e.target.value)} disabled={!formCompanyId}>
                    <option value="">Selecionar unidade...</option>
                    {formUnits.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
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
                <div className="col-span-2">
                  <Label className={labelCls}>WhatsApp *</Label>
                  <Input className={inputCls} placeholder="(11) 99999-9999"
                    value={form.whatsapp} onChange={e => setForm(f => ({ ...f, whatsapp: e.target.value }))} />
                </div>
              </div>
              <div className="flex gap-2 justify-end pt-1">
                <Button variant="ghost" size="sm" onClick={cancelForm}>Cancelar</Button>
                <Button size="sm" onClick={save}
                  disabled={saving || !form.nome.trim() || !form.whatsapp.trim() || !formUnitId}>
                  {saving ? 'Salvando...' : editingId ? 'Salvar' : 'Adicionar'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Lista */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center gap-3">
              <CardTitle className="mr-auto">Usuários Cadastrados</CardTitle>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
                <Input className="pl-8 h-8 text-sm w-52" placeholder="Buscar por nome ou email..."
                  value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <select className="h-8 rounded-md border border-border bg-background px-2 text-sm"
                value={filterCompanyId}
                onChange={e => { setFilterCompanyId(e.target.value); setFilterUnitId('') }}>
                <option value="">Todas as empresas</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {filterCompanyId && (
                <select className="h-8 rounded-md border border-border bg-background px-2 text-sm"
                  value={filterUnitId} onChange={e => setFilterUnitId(e.target.value)}>
                  <option value="">Todas as unidades</option>
                  {filteredUnits.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              )}
              {(filterCompanyId || filterUnitId || search) && (
                <Button variant="ghost" size="sm" className="h-8 text-xs px-2"
                  onClick={() => { setFilterCompanyId(''); setFilterUnitId(''); setSearch('') }}>
                  Limpar
                </Button>
              )}
            </div>

            {/* Barra de seleção */}
            {numSelected > 0 && (
              <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 px-3 py-2">
                <span className="text-sm font-medium text-green-800 dark:text-green-300">
                  {numSelected} contato{numSelected !== 1 ? 's' : ''} selecionado{numSelected !== 1 ? 's' : ''}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    className="h-7 gap-1.5 text-xs bg-green-600 hover:bg-green-700 text-white"
                    onClick={openMsgBulk}
                  >
                    <Send className="h-3 w-3" />
                    Enviar mensagem
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-green-700 hover:text-green-900"
                    onClick={clearSelection}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </CardHeader>

          <CardContent>
            {!loaded ? (
              <div className="space-y-2 py-2">
                {[1, 2, 3].map(i => <div key={i} className="h-12 rounded-lg bg-muted/40 animate-pulse" />)}
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={<Users className="h-8 w-8 text-muted-foreground/50" />}
                title="Nenhum usuário encontrado"
                description={search || filterCompanyId ? 'Tente ajustar os filtros.' : 'Adicione usuários para conceder acesso ao sistema.'}
                size="sm"
              />
            ) : (
              <div className="space-y-1.5">
                {/* Cabeçalho seleção */}
                <div className="flex items-center gap-3 px-4 py-1.5">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-border accent-green-600 cursor-pointer"
                    checked={allVisibleSelected}
                    ref={el => { if (el) el.indeterminate = someSelected && !allVisibleSelected }}
                    onChange={toggleSelectAll}
                  />
                  <span className="text-xs text-muted-foreground/60">
                    {allVisibleSelected ? 'Desmarcar todos' : 'Selecionar todos'}
                  </span>
                </div>

                {filtered.map(c => {
                  const isSelected = selectedIds.has(c.id)
                  return (
                    <div key={c.id}
                      className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-2.5 transition-colors cursor-pointer
                        ${isSelected
                          ? 'border-green-300 bg-green-50/60 dark:border-green-800 dark:bg-green-950/20'
                          : 'border-border bg-background hover:bg-muted/30'
                        }`}
                      onClick={() => toggleSelect(c.id)}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <input
                          type="checkbox"
                          className="h-4 w-4 shrink-0 rounded border-border accent-green-600 cursor-pointer"
                          checked={isSelected}
                          onChange={() => toggleSelect(c.id)}
                          onClick={e => e.stopPropagation()}
                        />
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-500/10 text-green-600">
                          <MessageCircle className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium text-foreground">{c.nome}</p>
                            {c.cargo && (
                              <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                                {c.cargo}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <a href={toWhatsappUrl(c.whatsapp)}
                              target="_blank" rel="noopener noreferrer"
                              className="text-xs font-mono text-muted-foreground hover:text-green-600 transition-colors"
                              onClick={e => e.stopPropagation()}>
                              {c.whatsapp}
                            </a>
                            <span className="text-xs text-muted-foreground/50">•</span>
                            <span className="text-xs text-muted-foreground/70">{c.unit.company.name}</span>
                            <span className="text-xs text-muted-foreground/50">›</span>
                            <span className="text-xs text-muted-foreground/70">{c.unit.name}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground/70 hover:text-green-600"
                          title="Enviar mensagem" onClick={() => openMsgSingle(c)}>
                          <Send className="h-3.5 w-3.5" />
                        </Button>
                        {isAdmin && (
                          <>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground/70 hover:text-blue-500"
                              onClick={() => openEdit(c)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground/70 hover:text-red-500"
                              onClick={() => remove(c)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dialog enviar mensagem */}
      <Dialog open={msgTargets.length > 0} onOpenChange={open => { if (!open) closeMsg() }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-green-600" />
              Enviar mensagem
            </DialogTitle>
            <DialogDescription>
              {msgTargets.length === 1
                ? <>Para <strong>{msgTargets[0].nome}</strong> — {msgTargets[0].whatsapp}</>
                : <><strong>{msgTargets.length} contatos</strong> selecionados</>
              }
            </DialogDescription>
          </DialogHeader>

          <div className="py-2">
            <Textarea
              placeholder="Digite a mensagem..."
              rows={5}
              value={msgText}
              onChange={e => setMsgText(e.target.value)}
              className="resize-none"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeMsg}>Cancelar</Button>
            <Button
              className="gap-2 bg-green-600 hover:bg-green-700 text-white"
              onClick={sendMsg}
              disabled={!msgText.trim()}
            >
              <Send className="h-4 w-4" />
              {msgTargets.length === 1 ? 'Enviar pelo WhatsApp' : `Enviar para ${msgTargets.length} contatos`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
