'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { X } from 'lucide-react'
import { schedulesApi } from '@/lib/api/schedules'

interface Agent {
  id: string
  full_name: string | null
  email: string
  role: string
}

interface DailyShiftDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  agents: Agent[]
  type: 'morning' | 'night' | 'warroom'
  existingShift?: any
  onSuccess: () => void
}

const TYPE_LABELS = {
  morning: 'Escala Diária',
  night:   'Escala Noturna',
  warroom: 'Escala Warroom',
}

export function DailyShiftDialog({
  open, onOpenChange, agents, type, existingShift, onSuccess,
}: DailyShiftDialogProps) {
  const [date,       setDate]       = useState('')
  const [notes,      setNotes]      = useState('')
  const [agentIds,   setAgentIds]   = useState<string[]>([])
  const [search,     setSearch]     = useState('')
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    if (existingShift) {
      setDate(existingShift.date?.split('T')[0] ?? '')
      setNotes(existingShift.notes ?? '')
      setAgentIds(existingShift.agent_ids ?? [])
    } else {
      setDate('')
      setNotes('')
      setAgentIds([])
    }
    setSearch('')
    setError(null)
  }, [open, existingShift])

  const filtered = agents.filter(a => {
    if (agentIds.includes(a.id)) return false
    const q = search.toLowerCase()
    return !q || (a.full_name?.toLowerCase().includes(q) || a.email.toLowerCase().includes(q))
  })

  function addAgent(id: string) {
    setAgentIds(prev => prev.includes(id) ? prev : [...prev, id])
    setSearch('')
  }

  function removeAgent(id: string) {
    setAgentIds(prev => prev.filter(x => x !== id))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!date) { setError('Selecione uma data'); return }

    setLoading(true)
    try {
      await schedulesApi.upsertDaily({ date, type, agent_ids: agentIds, notes: notes || null })
      onSuccess()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally {
      setLoading(false)
    }
  }

  const selectedAgents = agents.filter(a => agentIds.includes(a.id))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{TYPE_LABELS[type]}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {/* Date */}
          <div className="space-y-1.5">
            <Label>Data</Label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} required />
          </div>

          {/* Agents */}
          <div className="space-y-1.5">
            <Label>Agentes</Label>
            {selectedAgents.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {selectedAgents.map(a => (
                  <Badge key={a.id} variant="secondary" className="gap-1 pr-1">
                    {a.full_name || a.email}
                    <button
                      type="button"
                      onClick={() => removeAgent(a.id)}
                      className="ml-0.5 hover:text-red-600 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            <Input
              placeholder="Buscar agente..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && filtered.length > 0 && (
              <div className="border rounded-md divide-y max-h-40 overflow-y-auto shadow-sm">
                {filtered.map(a => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => addAgent(a.id)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
                  >
                    <span className="font-medium">{a.full_name || '—'}</span>
                    <span className="text-muted-foreground/70 ml-2 text-xs">{a.email}</span>
                  </button>
                ))}
              </div>
            )}
            {search && filtered.length === 0 && (
              <p className="text-xs text-muted-foreground/70 px-1">Nenhum agente encontrado</p>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label>Observações <span className="text-muted-foreground/70">(opcional)</span></Label>
            <Textarea
              placeholder="Anotações ou instruções para o plantão..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          {error && <p className="text-sm text-sem-error-fg">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Salvando...' : existingShift?.id ? 'Atualizar' : 'Criar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
