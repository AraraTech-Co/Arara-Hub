'use client'

import { useState, useEffect } from 'react'
import { Contact, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { EmptyState } from '@/components/ui/empty-state'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { companiesApi } from '@/lib/api/companies'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Unit {
  id: string
  name: string
}

interface ContactItem {
  id: string
  companyId: string
  unitId: string | null
  name: string
  roleTitle: string | null
  department: string | null
  email: string | null
  phone: string | null
  whatsapp: string | null
  contactType: string
  receivesNotifications: boolean
  receivesSlaAlerts: boolean
  onCall: boolean
  notes: string | null
  active: boolean
}

interface ContactsTabProps {
  companyId: string
  isAdmin: boolean
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CONTACT_TYPES = [
  { value: 'principal',  label: 'Principal',  color: 'bg-sem-info text-sem-info-fg' },
  { value: 'tecnico',    label: 'Técnico',    color: 'bg-status-triage text-status-triage-fg' },
  { value: 'financeiro', label: 'Financeiro', color: 'bg-sem-warning text-sem-warning-fg' },
  { value: 'fiscal',     label: 'Fiscal',     color: 'bg-status-waiting text-status-waiting-fg' },
  { value: 'comercial',  label: 'Comercial',  color: 'bg-sem-success text-sem-success-fg' },
  { value: 'emergencia', label: 'Emergência', color: 'bg-sem-error text-sem-error-fg' },
]

const EMPTY_FORM = {
  name: '', roleTitle: '', department: '', email: '', phone: '', whatsapp: '',
  contactType: 'principal', receivesNotifications: false, receivesSlaAlerts: false,
  onCall: false, notes: '', unitId: '',
}

const labelCls = 'text-xs font-medium text-foreground/60'
const inputCls = 'mt-1 text-sm'
const checkboxRow = 'flex items-center gap-2'

// ─── Component ────────────────────────────────────────────────────────────────

export function ContactsTab({ companyId, isAdmin }: ContactsTabProps) {
  const { toast } = useToast()

  const [contacts, setContacts]             = useState<ContactItem[]>([])
  const [contactsLoaded, setContactsLoaded] = useState(false)
  const [units, setUnits]                   = useState<Unit[]>([])
  const [form, setForm]                     = useState(EMPTY_FORM)
  const [editing, setEditing]               = useState<ContactItem | null>(null)
  const [showForm, setShowForm]             = useState(false)
  const [saving, setSaving]                 = useState(false)

  useEffect(() => {
    companiesApi.listContacts(companyId)
      .then(j => { if (j.success) { setContacts(j.data); setContactsLoaded(true) } })
      .catch(() => {})
    companiesApi.listUnits(companyId)
      .then(j => { if (j.success) setUnits(j.data) })
      .catch(() => {})
  }, [companyId])

  async function saveContact() {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const payload = { ...form, unitId: form.unitId || null }
      if (editing) {
        const json = await companiesApi.updateContact(companyId, editing.id, payload)
        if (!json.success) throw new Error('Erro ao salvar contato')
        setContacts(cs => cs.map(c => c.id === editing.id ? json.data : c))
      } else {
        const json = await companiesApi.createContact(companyId, payload as Parameters<typeof companiesApi.createContact>[1])
        if (!json.success) throw new Error('Erro ao criar contato')
        setContacts(cs => [...cs, json.data])
      }
      setEditing(null)
      setForm(EMPTY_FORM)
      setShowForm(false)
      toast({ title: 'Contato salvo' })
    } catch (err: unknown) {
      toast({ title: 'Erro', description: err instanceof Error ? err.message : 'Erro', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  async function deleteContact(id: string) {
    if (!confirm('Excluir este contato?')) return
    const json = await companiesApi.deleteContact(companyId, id)
    if (!json.success) { alert('Erro ao excluir contato'); return }
    setContacts(cs => cs.filter(c => c.id !== id))
    toast({ title: 'Contato excluído' })
  }

  return (
    <div className="rounded-xl bg-card p-6 space-y-4 shadow-[var(--shadow-media)]">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground/80">Contatos Operacionais</h2>
        {isAdmin && (
          <Button size="sm" variant="outline" className="gap-1.5"
            onClick={() => { setEditing(null); setForm(EMPTY_FORM); setShowForm(s => !s) }}>
            <Plus className="h-3.5 w-3.5" /> Adicionar Contato
          </Button>
        )}
      </div>

      {showForm && (
        <div className="rounded-lg border border-sem-info-bd bg-sem-info p-4 space-y-3">
          <p className="text-xs font-semibold text-foreground/60">
            {editing ? 'Editar contato' : 'Novo contato'}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className={labelCls}>Nome *</Label>
              <Input className={inputCls} placeholder="Nome completo"
                value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <Label className={labelCls}>Cargo / Função</Label>
              <Input className={inputCls} placeholder="Gerente TI, Financeiro..."
                value={form.roleTitle} onChange={e => setForm(f => ({ ...f, roleTitle: e.target.value }))} />
            </div>
            <div>
              <Label className={labelCls}>Tipo</Label>
              <select className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={form.contactType} onChange={e => setForm(f => ({ ...f, contactType: e.target.value }))}>
                {CONTACT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <Label className={labelCls}>Unidade</Label>
              <select className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={form.unitId} onChange={e => setForm(f => ({ ...f, unitId: e.target.value }))}>
                <option value="">— Matriz</option>
                {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div>
              <Label className={labelCls}>E-mail</Label>
              <Input className={inputCls} type="email" placeholder="contato@empresa.com"
                value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <Label className={labelCls}>Telefone / WhatsApp</Label>
              <Input className={inputCls} placeholder="(11) 99999-9999"
                value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
            <div className="col-span-2 flex flex-wrap gap-4">
              <div className={checkboxRow}>
                <Checkbox id="ct-notif" checked={form.receivesNotifications}
                  onCheckedChange={v => setForm(f => ({ ...f, receivesNotifications: !!v }))} />
                <label htmlFor="ct-notif" className="text-xs cursor-pointer">Recebe notificações</label>
              </div>
              <div className={checkboxRow}>
                <Checkbox id="ct-sla" checked={form.receivesSlaAlerts}
                  onCheckedChange={v => setForm(f => ({ ...f, receivesSlaAlerts: !!v }))} />
                <label htmlFor="ct-sla" className="text-xs cursor-pointer">Alertas SLA crítico</label>
              </div>
              <div className={checkboxRow}>
                <Checkbox id="ct-oncall" checked={form.onCall}
                  onCheckedChange={v => setForm(f => ({ ...f, onCall: !!v }))} />
                <label htmlFor="ct-oncall" className="text-xs cursor-pointer">On-call</label>
              </div>
            </div>
            <div className="col-span-2">
              <Label className={labelCls}>Notas</Label>
              <Textarea className="mt-1 text-sm" rows={2}
                value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm"
              onClick={() => { setShowForm(false); setEditing(null); setForm(EMPTY_FORM) }}>
              Cancelar
            </Button>
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={saveContact} disabled={saving}>
              {editing ? 'Atualizar' : 'Adicionar'}
            </Button>
          </div>
        </div>
      )}

      {!contactsLoaded ? (
        <p className="text-xs text-muted-foreground/70 py-4 text-center">Carregando contatos...</p>
      ) : contacts.length === 0 ? (
        <EmptyState icon={<Contact className="h-8 w-8 text-muted-foreground/70" />}
          title="Nenhum contato cadastrado"
          description="Adicione contatos operacionais para esta empresa."
          size="sm" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50">
                <th className="text-left text-xs font-medium text-muted-foreground pb-2 pr-4">Nome</th>
                <th className="text-left text-xs font-medium text-muted-foreground pb-2 pr-4">Tipo</th>
                <th className="text-left text-xs font-medium text-muted-foreground pb-2 pr-4">Cargo</th>
                <th className="text-left text-xs font-medium text-muted-foreground pb-2 pr-4">E-mail</th>
                <th className="text-left text-xs font-medium text-muted-foreground pb-2 pr-4">Telefone</th>
                {isAdmin && <th className="pb-2 w-16"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-muted/50">
              {contacts.map(ct => {
                const typeInfo = CONTACT_TYPES.find(t => t.value === ct.contactType)
                return (
                  <tr key={ct.id} className="hover:bg-muted/50">
                    <td className="py-2.5 pr-4 font-medium text-foreground">{ct.name}</td>
                    <td className="py-2.5 pr-4">
                      <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium', typeInfo?.color ?? 'bg-muted text-foreground/60')}>
                        {typeInfo?.label ?? ct.contactType}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-muted-foreground text-xs">{ct.roleTitle ?? '—'}</td>
                    <td className="py-2.5 pr-4 text-muted-foreground text-xs">{ct.email ?? '—'}</td>
                    <td className="py-2.5 pr-4 text-muted-foreground text-xs">{ct.phone ?? '—'}</td>
                    {isAdmin && (
                      <td className="py-2.5">
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground/70 hover:text-sem-info-fg"
                            onClick={() => {
                              setEditing(ct)
                              setForm({
                                name: ct.name, roleTitle: ct.roleTitle ?? '', department: ct.department ?? '',
                                email: ct.email ?? '', phone: ct.phone ?? '', whatsapp: ct.whatsapp ?? '',
                                contactType: ct.contactType, receivesNotifications: ct.receivesNotifications,
                                receivesSlaAlerts: ct.receivesSlaAlerts, onCall: ct.onCall,
                                notes: ct.notes ?? '', unitId: ct.unitId ?? '',
                              })
                              setShowForm(true)
                            }}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground/70 hover:text-sem-error-fg"
                            onClick={() => deleteContact(ct.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
