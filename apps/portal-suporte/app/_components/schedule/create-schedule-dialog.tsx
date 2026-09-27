'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { schedulesApi } from '@/lib/api/schedules'

interface Agent {
  id: string
  full_name: string | null
  email: string
}

interface CreateScheduleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  agents: Agent[]
  existingSchedule?: any | null
  onSuccess: () => void
}

export function CreateScheduleDialog({
  open,
  onOpenChange,
  agents,
  existingSchedule,
  onSuccess,
}: CreateScheduleDialogProps) {
  const [weekStart, setWeekStart] = useState('')
  const [n1, setN1] = useState('none')
  const [n2, setN2] = useState('none')
  const [n3, setN3] = useState('none')
  const [backup, setBackup] = useState('none')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  const isEditing = !!existingSchedule

  // Populate form when editing
  useEffect(() => {
    if (existingSchedule) {
      const ws = existingSchedule.week_start
      setWeekStart(ws ? ws.split('T')[0] : '')
      setN1(existingSchedule.n1_assigned || 'none')
      setN2(existingSchedule.n2_assigned || 'none')
      setN3(existingSchedule.n3_assigned || 'none')
      setBackup(existingSchedule.backup_assigned || 'none')
      setNotes(existingSchedule.notes || '')
    } else {
      resetForm()
    }
  }, [existingSchedule, open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!weekStart) return
    setLoading(true)

    try {
      const startDate = new Date(weekStart)
      const endDate = new Date(startDate)
      endDate.setDate(endDate.getDate() + 6)

      const body = {
        week_start: weekStart,
        week_end: endDate.toISOString().split('T')[0],
        n1_assigned:     n1     !== 'none' ? n1     : null,
        n2_assigned:     n2     !== 'none' ? n2     : null,
        n3_assigned:     n3     !== 'none' ? n3     : null,
        backup_assigned: backup !== 'none' ? backup : null,
        notes: notes || null,
      }

      if (isEditing) {
        await schedulesApi.update(existingSchedule.id, body)
      } else {
        await schedulesApi.create(body)
      }

      toast({
        title: isEditing ? 'Escala atualizada' : 'Escala criada',
        description: isEditing ? 'A escala foi atualizada com sucesso' : 'A escala foi criada com sucesso',
      })

      onSuccess()
    } catch (error: any) {
      toast({
        title: isEditing ? 'Erro ao atualizar escala' : 'Erro ao criar escala',
        description: error?.message || 'Não foi possível salvar a escala',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  function resetForm() {
    setWeekStart('')
    setN1('none')
    setN2('none')
    setN3('none')
    setBackup('none')
    setNotes('')
  }

  const agentOptions = (
    <>
      <SelectItem value="none">— Não atribuído</SelectItem>
      {agents.map((a) => (
        <SelectItem key={a.id} value={a.id}>
          {a.full_name || a.email}
        </SelectItem>
      ))}
    </>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar Escala de Suporte' : 'Nova Escala de Suporte'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Semana — início (segunda-feira)</Label>
            <input
              type="date"
              value={weekStart}
              onChange={(e) => setWeekStart(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              required
              disabled={isEditing}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>N1 — Suporte</Label>
              <Select value={n1} onValueChange={setN1}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>{agentOptions}</SelectContent>
              </Select>
            </div>

            <div>
              <Label>N2 — Especialista</Label>
              <Select value={n2} onValueChange={setN2}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>{agentOptions}</SelectContent>
              </Select>
            </div>

            <div>
              <Label>N3 — Dev Suporte</Label>
              <Select value={n3} onValueChange={setN3}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>{agentOptions}</SelectContent>
              </Select>
            </div>

            <div>
              <Label>Backup</Label>
              <Select value={backup} onValueChange={setBackup}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>{agentOptions}</SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Observações</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Adicione observações sobre esta escala..."
              rows={3}
              className="mt-1"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Salvando...' : isEditing ? 'Salvar Alterações' : 'Criar Escala'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
