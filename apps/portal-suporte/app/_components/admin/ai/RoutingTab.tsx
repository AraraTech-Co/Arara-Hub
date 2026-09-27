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
import { Switch } from '@/components/ui/switch'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import useSWR, { mutate } from 'swr'
import { araraApiFetch } from '@/lib/arara/arara-api-fetch'

const TRIGGER_TYPES = ['keyword', 'intent', 'context', 'fallback']

interface RuleForm {
  name: string; description: string; trigger_type: string; condition_expression: string
  target_agent_id: string; fallback_action: string; priority: number; active: boolean
}
const empty: RuleForm = { name: '', description: '', trigger_type: 'intent', condition_expression: '', target_agent_id: '', fallback_action: '', priority: 0, active: true }

const fetcher = (url: string) => fetch(url).then(r => r.json())

export function RoutingTab() {
  const { toast } = useToast()
  const { data: agents = [] }  = useSWR<any[]>('/api/admin/ai/agents', fetcher)
  const { data: rules  = [], isLoading } = useSWR<any[]>('/api/admin/ai/routing-rules', fetcher)
  const [open, setOpen]     = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm]     = useState<RuleForm>(empty)
  const [saving, setSaving] = useState(false)

  const openCreate = () => { setEditId(null); setForm(empty); setOpen(true) }
  const openEdit   = (r: any) => {
    setEditId(r.id)
    setForm({ name: r.name, description: r.description || '', trigger_type: r.triggerType, condition_expression: r.conditionExpression || '', target_agent_id: r.targetAgentId, fallback_action: r.fallbackAction || '', priority: r.priority, active: r.active })
    setOpen(true)
  }

  async function save() {
    setSaving(true)
    const url = editId ? `/api/admin/ai/routing-rules/${editId}` : '/api/admin/ai/routing-rules'
    const res = await fetch(url, { method: editId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    setSaving(false)
    if (!res.ok) { toast({ title: 'Erro', description: (await res.json()).error, variant: 'destructive' }); return }
    mutate('/api/admin/ai/routing-rules'); setOpen(false); toast({ title: editId ? 'Regra atualizada' : 'Regra criada' })
  }

  async function remove(id: string) {
    await araraApiFetch(`/api/admin/ai/routing-rules/${id}`, { method: 'DELETE' })
    mutate('/api/admin/ai/routing-rules'); toast({ title: 'Regra removida' })
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Regras de Roteamento</CardTitle>
        <Button onClick={openCreate} size="sm"><Plus className="h-4 w-4 mr-1" /> Nova Regra</Button>
      </CardHeader>
      <CardContent>
        {isLoading ? <p className="text-sm text-muted-foreground">Carregando...</p> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead><TableHead>Trigger</TableHead>
                <TableHead>Agente Alvo</TableHead><TableHead>Prioridade</TableHead>
                <TableHead>Ativo</TableHead><TableHead className="w-20">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell><Badge variant="outline">{r.triggerType}</Badge></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.targetAgent?.name || r.targetAgentId}</TableCell>
                  <TableCell>{r.priority}</TableCell>
                  <TableCell><Badge variant={r.active ? 'default' : 'outline'}>{r.active ? 'sim' : 'não'}</Badge></TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => remove(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {rules.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Nenhuma regra cadastrada.</TableCell></TableRow>}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editId ? 'Editar Regra' : 'Nova Regra'}</DialogTitle></DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-2"><Label>Nome</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Descrição</Label><Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo de trigger</Label>
                <Select value={form.trigger_type} onValueChange={v => setForm(f => ({ ...f, trigger_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TRIGGER_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Prioridade</Label><Input type="number" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: Number(e.target.value) }))} /></div>
            </div>
            <div className="space-y-2">
              <Label>Expressão de condição</Label>
              <Textarea rows={2} className="font-mono text-xs" value={form.condition_expression} onChange={e => setForm(f => ({ ...f, condition_expression: e.target.value }))} placeholder="intent IN ('abrir_chamado','problema')" />
            </div>
            <div className="space-y-2">
              <Label>Agente alvo</Label>
              <Select value={form.target_agent_id} onValueChange={v => setForm(f => ({ ...f, target_agent_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecionar agente..." /></SelectTrigger>
                <SelectContent>{agents.map((a: any) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Ação de fallback</Label><Input value={form.fallback_action} onChange={e => setForm(f => ({ ...f, fallback_action: e.target.value }))} placeholder="Ex: escalar para humano" /></div>
            <div className="flex items-center gap-3">
              <Switch checked={form.active} onCheckedChange={v => setForm(f => ({ ...f, active: v }))} />
              <Label>Ativo</Label>
            </div>
            <Button onClick={save} disabled={!form.name || !form.target_agent_id || saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
