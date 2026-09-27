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

const SKILL_TYPES = ['classify', 'respond', 'collect', 'guide', 'custom']

interface SkillForm {
  name: string; description: string; type: string; input_schema: string; output_schema: string
  condition_expression: string; priority: number; active: boolean; agent_id: string
}
const empty: SkillForm = { name: '', description: '', type: 'respond', input_schema: '{}', output_schema: '{}', condition_expression: '', priority: 0, active: true, agent_id: '' }

const fetcher = (url: string) => fetch(url).then(r => r.json())

export function SkillsTab() {
  const { toast } = useToast()
  const { data: agents = [] } = useSWR<any[]>('/api/admin/ai/agents', fetcher)
  const { data: skills = [], isLoading } = useSWR<any[]>('/api/admin/ai/skills', fetcher)
  const [open, setOpen]           = useState(false)
  const [editId, setEditId]       = useState<string | null>(null)
  const [form, setForm]           = useState<SkillForm>(empty)
  const [filterAgent, setFilterAgent] = useState('all')
  const [saving, setSaving]       = useState(false)

  const filtered = filterAgent === 'all' ? skills : skills.filter((s: any) => s.agentId === filterAgent)

  const openCreate = () => { setEditId(null); setForm(empty); setOpen(true) }
  const openEdit   = (s: any) => {
    setEditId(s.id)
    setForm({ name: s.name, description: s.description || '', type: s.type, input_schema: JSON.stringify(s.inputSchema || {}, null, 2), output_schema: JSON.stringify(s.outputSchema || {}, null, 2), condition_expression: s.conditionExpression || '', priority: s.priority, active: s.active, agent_id: s.agentId })
    setOpen(true)
  }

  async function save() {
    setSaving(true)
    const url    = editId ? `/api/admin/ai/skills/${editId}` : '/api/admin/ai/skills'
    const method = editId ? 'PUT' : 'POST'
    const res    = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    setSaving(false)
    if (!res.ok) { const e = await res.json(); toast({ title: 'Erro', description: e.error, variant: 'destructive' }); return }
    mutate('/api/admin/ai/skills'); setOpen(false); toast({ title: editId ? 'Skill atualizada' : 'Skill criada' })
  }

  async function remove(id: string) {
    await araraApiFetch(`/api/admin/ai/skills/${id}`, { method: 'DELETE' })
    mutate('/api/admin/ai/skills'); toast({ title: 'Skill removida' })
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Skills por Agente</CardTitle>
        <div className="flex gap-2">
          <Select value={filterAgent} onValueChange={setFilterAgent}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Filtrar agente" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os agentes</SelectItem>
              {agents.map((a: any) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={openCreate} size="sm"><Plus className="h-4 w-4 mr-1" /> Nova Skill</Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? <p className="text-sm text-muted-foreground">Carregando...</p> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead><TableHead>Agente</TableHead>
                <TableHead>Tipo</TableHead><TableHead>Prioridade</TableHead>
                <TableHead>Ativo</TableHead><TableHead className="w-20">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((s: any) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{s.agent?.name}</TableCell>
                  <TableCell><Badge variant="secondary">{s.type}</Badge></TableCell>
                  <TableCell>{s.priority}</TableCell>
                  <TableCell><Badge variant={s.active ? 'default' : 'outline'}>{s.active ? 'sim' : 'não'}</Badge></TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(s)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => remove(s.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Nenhuma skill cadastrada.</TableCell></TableRow>}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editId ? 'Editar Skill' : 'Nova Skill'}</DialogTitle></DialogHeader>
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Nome</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
              <div className="space-y-2">
                <Label>Agente</Label>
                <Select value={form.agent_id} onValueChange={v => setForm(f => ({ ...f, agent_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent>{agents.map((a: any) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2"><Label>Descrição</Label><Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{SKILL_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Prioridade</Label><Input type="number" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: Number(e.target.value) }))} /></div>
            </div>
            <div className="space-y-2"><Label>Input Schema (JSON)</Label><Textarea rows={3} className="font-mono text-xs" value={form.input_schema} onChange={e => setForm(f => ({ ...f, input_schema: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Output Schema (JSON)</Label><Textarea rows={3} className="font-mono text-xs" value={form.output_schema} onChange={e => setForm(f => ({ ...f, output_schema: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Condição de ativação</Label><Input value={form.condition_expression} onChange={e => setForm(f => ({ ...f, condition_expression: e.target.value }))} placeholder="Ex: intent IN ('abrir_chamado')" /></div>
            <div className="flex items-center gap-3">
              <Switch checked={form.active} onCheckedChange={v => setForm(f => ({ ...f, active: v }))} />
              <Label>Ativo</Label>
            </div>
            <Button onClick={save} disabled={!form.name || !form.agent_id || saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
