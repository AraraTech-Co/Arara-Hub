'use client'

import { useState } from 'react'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import useSWR, { mutate } from 'swr'
import { araraApiFetch } from '@/lib/arara/arara-api-fetch'

const AGENT_TYPES    = ['orchestrator', 'knowledge', 'ticket', 'test', 'project', 'custom']
const AGENT_STATUSES = ['active', 'inactive', 'draft']

interface AgentForm {
  name: string; type: string; objective: string; system_prompt: string
  rules: string[]; status: string; priority: number; fallback_agent_id: string | null
}
const empty: AgentForm = { name: '', type: 'knowledge', objective: '', system_prompt: '', rules: [], status: 'active', priority: 0, fallback_agent_id: null }

const fetcher = (url: string) => fetch(url).then(r => r.json())

export function AgentsTab() {
  const { toast } = useToast()
  const { data: agents = [], isLoading } = useSWR<any[]>('/api/admin/ai/agents', fetcher)
  const [open, setOpen]         = useState(false)
  const [editId, setEditId]     = useState<string | null>(null)
  const [form, setForm]         = useState<AgentForm>(empty)
  const [ruleInput, setRuleInput] = useState('')
  const [saving, setSaving]     = useState(false)

  const openCreate = () => { setEditId(null); setForm(empty); setRuleInput(''); setOpen(true) }
  const openEdit   = (a: any) => {
    setEditId(a.id)
    setForm({ name: a.name, type: a.type, objective: a.objective || '', system_prompt: a.systemPrompt, rules: a.rules ?? [], status: a.status, priority: a.priority, fallback_agent_id: a.fallbackAgentId })
    setRuleInput(''); setOpen(true)
  }

  const addRule    = () => { if (ruleInput.trim()) { setForm(f => ({ ...f, rules: [...f.rules, ruleInput.trim()] })); setRuleInput('') } }
  const removeRule = (i: number) => setForm(f => ({ ...f, rules: f.rules.filter((_, idx) => idx !== i) }))

  async function save() {
    setSaving(true)
    const payload = { ...form }
    const url    = editId ? `/api/admin/ai/agents/${editId}` : '/api/admin/ai/agents'
    const method = editId ? 'PUT' : 'POST'
    const res    = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    setSaving(false)
    if (!res.ok) { toast({ title: 'Erro', description: (await res.json()).error, variant: 'destructive' }); return }
    mutate('/api/admin/ai/agents')
    setOpen(false)
    toast({ title: editId ? 'Agente atualizado' : 'Agente criado' })
  }

  async function remove(id: string) {
    await araraApiFetch(`/api/admin/ai/agents/${id}`, { method: 'DELETE' })
    mutate('/api/admin/ai/agents')
    toast({ title: 'Agente removido' })
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Agentes de IA</CardTitle>
        <Button onClick={openCreate} size="sm"><Plus className="h-4 w-4 mr-1" /> Novo Agente</Button>
      </CardHeader>
      <CardContent>
        {isLoading ? <p className="text-muted-foreground text-sm">Carregando...</p> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead><TableHead>Tipo</TableHead>
                <TableHead>Status</TableHead><TableHead>Prioridade</TableHead>
                <TableHead className="w-24">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agents.map((a: any) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.name}</TableCell>
                  <TableCell><Badge variant="secondary">{a.type}</Badge></TableCell>
                  <TableCell>
                    <Badge variant={a.status === 'active' ? 'default' : 'outline'}>{a.status}</Badge>
                  </TableCell>
                  <TableCell>{a.priority}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(a)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => remove(a.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {agents.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Nenhum agente cadastrado.</TableCell></TableRow>}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editId ? 'Editar Agente' : 'Novo Agente'}</DialogTitle></DialogHeader>
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Nome</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{AGENT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2"><Label>Objetivo</Label><Textarea rows={2} value={form.objective} onChange={e => setForm(f => ({ ...f, objective: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Prompt do Sistema</Label><Textarea rows={8} className="font-mono text-xs" value={form.system_prompt} onChange={e => setForm(f => ({ ...f, system_prompt: e.target.value }))} /></div>
            <div className="space-y-2">
              <Label>Regras de Comportamento</Label>
              <div className="flex gap-2">
                <Input value={ruleInput} onChange={e => setRuleInput(e.target.value)} placeholder="Adicionar regra..." onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addRule())} />
                <Button type="button" variant="outline" onClick={addRule}>+</Button>
              </div>
              <div className="flex flex-wrap gap-1 mt-1">
                {form.rules.map((r, i) => (
                  <Badge key={i} variant="secondary" className="cursor-pointer" onClick={() => removeRule(i)}>{r} ×</Badge>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{AGENT_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Prioridade</Label><Input type="number" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: Number(e.target.value) }))} /></div>
              <div className="space-y-2">
                <Label>Fallback Agent</Label>
                <Select value={form.fallback_agent_id || 'none'} onValueChange={v => setForm(f => ({ ...f, fallback_agent_id: v === 'none' ? null : v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {agents.filter((a: any) => a.id !== editId).map((a: any) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button onClick={save} disabled={!form.name || !form.system_prompt || saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
