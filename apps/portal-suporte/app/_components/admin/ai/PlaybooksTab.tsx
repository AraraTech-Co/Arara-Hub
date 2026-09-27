'use client'

import { useState } from 'react'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import useSWR, { mutate } from 'swr'
import { araraApiFetch } from '@/lib/arara/arara-api-fetch'

interface PlaybookForm {
  name: string; category: string; objective: string; opening_message: string
  required_questions: string[]; required_fields: string[]; escalation_rules: string; resolution_pattern: string; active: boolean
}
const empty: PlaybookForm = { name: '', category: '', objective: '', opening_message: '', required_questions: [], required_fields: [], escalation_rules: '{}', resolution_pattern: '', active: true }

const fetcher = (url: string) => fetch(url).then(r => r.json())

export function PlaybooksTab() {
  const { toast } = useToast()
  const { data: playbooks = [], isLoading } = useSWR<any[]>('/api/admin/ai/playbooks', fetcher)
  const [open, setOpen]     = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm]     = useState<PlaybookForm>(empty)
  const [qInput, setQInput] = useState('')
  const [fInput, setFInput] = useState('')
  const [saving, setSaving] = useState(false)

  const openCreate = () => { setEditId(null); setForm(empty); setQInput(''); setFInput(''); setOpen(true) }
  const openEdit   = (p: any) => {
    setEditId(p.id)
    setForm({ name: p.name, category: p.category || '', objective: p.objective || '', opening_message: p.openingMessage || '', required_questions: p.requiredQuestions ?? [], required_fields: p.requiredFields ?? [], escalation_rules: JSON.stringify(p.escalationRules || {}, null, 2), resolution_pattern: p.resolutionPattern || '', active: p.active })
    setQInput(''); setFInput(''); setOpen(true)
  }

  const addQ = () => { if (qInput.trim()) { setForm(f => ({ ...f, required_questions: [...f.required_questions, qInput.trim()] })); setQInput('') } }
  const addF = () => { if (fInput.trim()) { setForm(f => ({ ...f, required_fields: [...f.required_fields, fInput.trim()] })); setFInput('') } }

  async function save() {
    setSaving(true)
    const url = editId ? `/api/admin/ai/playbooks/${editId}` : '/api/admin/ai/playbooks'
    const res = await fetch(url, { method: editId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    setSaving(false)
    if (!res.ok) { toast({ title: 'Erro', description: (await res.json()).error, variant: 'destructive' }); return }
    mutate('/api/admin/ai/playbooks'); setOpen(false); toast({ title: editId ? 'Playbook atualizado' : 'Playbook criado' })
  }

  async function remove(id: string) {
    await araraApiFetch(`/api/admin/ai/playbooks/${id}`, { method: 'DELETE' })
    mutate('/api/admin/ai/playbooks'); toast({ title: 'Playbook removido' })
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Playbooks</CardTitle>
        <Button onClick={openCreate} size="sm"><Plus className="h-4 w-4 mr-1" /> Novo Playbook</Button>
      </CardHeader>
      <CardContent>
        {isLoading ? <p className="text-sm text-muted-foreground">Carregando...</p> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead><TableHead>Categoria</TableHead>
                <TableHead>Ativo</TableHead><TableHead className="w-20">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {playbooks.map((p: any) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>{p.category ? <Badge variant="secondary">{p.category}</Badge> : '—'}</TableCell>
                  <TableCell><Badge variant={p.active ? 'default' : 'outline'}>{p.active ? 'sim' : 'não'}</Badge></TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => remove(p.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {playbooks.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Nenhum playbook cadastrado.</TableCell></TableRow>}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editId ? 'Editar Playbook' : 'Novo Playbook'}</DialogTitle></DialogHeader>
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Nome</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Categoria</Label><Input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="ex: chamado, conhecimento, teste" /></div>
            </div>
            <div className="space-y-2"><Label>Objetivo</Label><Textarea rows={2} value={form.objective} onChange={e => setForm(f => ({ ...f, objective: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Mensagem de abertura</Label><Textarea rows={2} value={form.opening_message} onChange={e => setForm(f => ({ ...f, opening_message: e.target.value }))} /></div>

            <div className="space-y-2">
              <Label>Perguntas obrigatórias</Label>
              <div className="flex gap-2">
                <Input value={qInput} onChange={e => setQInput(e.target.value)} placeholder="Adicionar pergunta..." onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addQ())} />
                <Button type="button" variant="outline" onClick={addQ}>+</Button>
              </div>
              <div className="flex flex-col gap-1">
                {form.required_questions.map((q, i) => (
                  <div key={i} className="flex items-center justify-between bg-muted px-3 py-1.5 rounded text-sm">
                    <span>{i + 1}. {q}</span>
                    <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setForm(f => ({ ...f, required_questions: f.required_questions.filter((_, idx) => idx !== i) }))}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Campos obrigatórios</Label>
              <div className="flex gap-2">
                <Input value={fInput} onChange={e => setFInput(e.target.value)} placeholder="Ex: ambiente, impacto..." onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addF())} />
                <Button type="button" variant="outline" onClick={addF}>+</Button>
              </div>
              <div className="flex flex-wrap gap-1">
                {form.required_fields.map((f, i) => (
                  <Badge key={i} variant="secondary" className="cursor-pointer" onClick={() => setForm(fm => ({ ...fm, required_fields: fm.required_fields.filter((_, idx) => idx !== i) }))}>{f} ×</Badge>
                ))}
              </div>
            </div>

            <div className="space-y-2"><Label>Regras de escalada (JSON)</Label><Textarea rows={3} className="font-mono text-xs" value={form.escalation_rules} onChange={e => setForm(f => ({ ...f, escalation_rules: e.target.value }))} /></div>
            <div className="flex items-center gap-3">
              <Switch checked={form.active} onCheckedChange={v => setForm(f => ({ ...f, active: v }))} />
              <Label>Ativo</Label>
            </div>
            <Button onClick={save} disabled={!form.name || saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
