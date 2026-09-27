"use client"

import type React from "react"

import { Card } from "@/components/ui/card"
import { formatDate } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { FileEdit, Plus } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useState, useEffect } from "react"
import { useToast } from "@/hooks/use-toast"
import { araraApiFetch } from '@/lib/arara/arara-api-fetch'

export function ChangeManagement() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [changes, setChanges] = useState<any[]>([])
  const { toast } = useToast()

  const loadChanges = async () => {
    const res = await araraApiFetch("/api/change-requests")
    const data = await res.json()
    if (data.success && data.data) setChanges(data.data)
  }

  useEffect(() => {
    loadChanges()
  }, [])

  const statusColors: Record<string, string> = {
    draft: "secondary",
    pending_approval: "default",
    approved: "default",
    scheduled: "default",
    in_progress: "default",
    completed: "default",
    cancelled: "secondary",
    failed: "destructive",
  }

  const impactColors: Record<string, string> = {
    low: "text-green-600",
    medium: "text-yellow-600",
    high: "text-orange-600",
    critical: "text-red-600",
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)

    const formData = new FormData(e.currentTarget)

    try {
      const res = await araraApiFetch('/api/change-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          change_number: `CHG-${Date.now().toString().slice(-6)}`,
          type: formData.get('type'),
          title: formData.get('title'),
          description: formData.get('description'),
          impact_level: formData.get('impact_level'),
          scheduled_start: formData.get('scheduled_start'),
          status: 'draft',
        }),
      })

      if (!res.ok) throw new Error(await res.text())

      toast({
        title: "Mudança criada!",
        description: "A mudança foi registrada com sucesso.",
      })
      setOpen(false)
      loadChanges()
    } catch (error) {
      console.error('Error creating change:', error)
      toast({
        title: "Erro",
        description: "Não foi possível criar a mudança. Tente novamente.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card className="border p-6 bg-linear-to-br from-orange-500/10 to-red-500/10 border-orange-500/20">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold mb-2">Gestão de Mudanças (ITIL)</h3>
            <p className="text-sm text-muted-foreground">
              Change Management: Mudanças padrão, normais e emergenciais com processo de aprovação
            </p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Nova Mudança
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Criar Nova Mudança (ITIL)</DialogTitle>
                <DialogDescription>
                  Registre uma mudança padrão, normal ou emergencial seguindo o processo ITIL
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="type">Tipo de Mudança *</Label>
                    <Select name="type" required>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="standard">Padrão</SelectItem>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="emergency">Emergencial</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="impact_level">Nível de Impacto *</Label>
                    <Select name="impact_level" required>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o impacto" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Baixo</SelectItem>
                        <SelectItem value="medium">Médio</SelectItem>
                        <SelectItem value="high">Alto</SelectItem>
                        <SelectItem value="critical">Crítico</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="title">Título da Mudança *</Label>
                  <Input id="title" name="title" placeholder="Ex: Atualização do sistema de tickets" required />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Descrição *</Label>
                  <Textarea
                    id="description"
                    name="description"
                    placeholder="Descreva a mudança, motivo, riscos e plano de rollback..."
                    rows={5}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="scheduled_start">Data/Hora Agendada *</Label>
                  <Input id="scheduled_start" name="scheduled_start" type="datetime-local" required />
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={loading}>
                    {loading ? "Criando..." : "Criar Mudança"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </Card>

      {changes.length === 0 ? (
        <Card className="p-8 text-center">
          <FileEdit className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">Nenhuma mudança registrada</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {changes.map((change) => (
            <Card key={change.id} className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline">{change.change_number}</Badge>
                    <Badge variant={statusColors[change.status as keyof typeof statusColors]}>{change.status}</Badge>
                    <Badge variant="outline" className="capitalize">
                      {change.type}
                    </Badge>
                  </div>
                  <h3 className="font-semibold mb-1">{change.title}</h3>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className={impactColors[change.impact_level]}>Impacto: {change.impact_level}</span>
                    <span>Agendado: {change.scheduled_start ? formatDate(change.scheduled_start) : "—"}</span>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
