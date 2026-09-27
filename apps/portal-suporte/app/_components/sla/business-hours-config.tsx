"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { Clock, Save, Loader2 } from "lucide-react"
import { cn, formatDate } from "@/lib/utils"
import { araraApiFetch } from '@/lib/arara/arara-api-fetch'

const DAYS = [
  { value: 0, short: "Dom", long: "Domingo" },
  { value: 1, short: "Seg", long: "Segunda" },
  { value: 2, short: "Ter", long: "Terça" },
  { value: 3, short: "Qua", long: "Quarta" },
  { value: 4, short: "Qui", long: "Quinta" },
  { value: 5, short: "Sex", long: "Sexta" },
  { value: 6, short: "Sáb", long: "Sábado" },
]

const TIMEZONES = [
  "America/Sao_Paulo",
  "America/Manaus",
  "America/Belem",
  "America/Fortaleza",
  "America/Recife",
  "America/Noronha",
  "America/Bahia",
  "America/Campo_Grande",
  "America/Cuiaba",
  "America/Porto_Velho",
  "America/Boa_Vista",
  "America/Rio_Branco",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Lisbon",
  "UTC",
]

interface Settings {
  id?: string
  timezone: string
  startHour: number
  endHour: number
  workDays: number[]
  updatedAt?: string
}

export function BusinessHoursConfig() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState<Settings>({
    timezone: "America/Sao_Paulo",
    startHour: 8,
    endHour: 18,
    workDays: [1, 2, 3, 4, 5],
  })

  useEffect(() => {
    araraApiFetch("/api/settings/business-hours")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) setSettings(data)
      })
      .finally(() => setLoading(false))
  }, [])

  const toggleDay = (day: number) => {
    setSettings(prev => ({
      ...prev,
      workDays: prev.workDays.includes(day)
        ? prev.workDays.filter(d => d !== day)
        : [...prev.workDays, day].sort((a, b) => a - b),
    }))
  }

  const save = async () => {
    setSaving(true)
    try {
      const res = await araraApiFetch("/api/settings/business-hours", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      })
      const data = await res.json()
      if (!res.ok) {
        toast({ title: "Erro", description: data.error, variant: "destructive" })
      } else {
        setSettings(data)
        toast({ title: "Salvo!", description: "Configurações de horário comercial atualizadas." })
      }
    } catch {
      toast({ title: "Erro de rede", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  // Preview: how many business hours/day
  const dailyHours = settings.endHour - settings.startHour
  const weeklyHours = dailyHours * settings.workDays.length

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-8 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando configurações…
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-blue-600" />
          <CardTitle>Horário Comercial</CardTitle>
        </div>
        <CardDescription>
          Define quando os cronômetros de SLA contam. Tickets com
          &ldquo;Apenas horário comercial&rdquo; ativado só consomem SLA neste intervalo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">

        {/* Timezone */}
        <div className="space-y-1.5">
          <Label htmlFor="tz">Fuso horário</Label>
          <select
            id="tz"
            value={settings.timezone}
            onChange={e => setSettings(s => ({ ...s, timezone: e.target.value }))}
            className="flex h-9 w-full max-w-xs rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {TIMEZONES.map(tz => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
          </select>
        </div>

        {/* Hours */}
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="start">Início do expediente</Label>
            <div className="flex items-center gap-1">
              <Input
                id="start"
                type="number"
                min={0}
                max={23}
                value={settings.startHour}
                onChange={e => setSettings(s => ({ ...s, startHour: Number(e.target.value) }))}
                className="w-20"
              />
              <span className="text-sm text-muted-foreground">h</span>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="end">Fim do expediente</Label>
            <div className="flex items-center gap-1">
              <Input
                id="end"
                type="number"
                min={1}
                max={24}
                value={settings.endHour}
                onChange={e => setSettings(s => ({ ...s, endHour: Number(e.target.value) }))}
                className="w-20"
              />
              <span className="text-sm text-muted-foreground">h</span>
            </div>
          </div>
          <p className="mb-2 text-sm text-muted-foreground">
            {dailyHours}h/dia · {weeklyHours}h/semana
          </p>
        </div>

        {/* Work days */}
        <div className="space-y-2">
          <Label>Dias úteis</Label>
          <div className="flex gap-1.5 flex-wrap">
            {DAYS.map(d => (
              <button
                key={d.value}
                type="button"
                title={d.long}
                onClick={() => toggleDay(d.value)}
                className={cn(
                  "h-9 w-12 rounded-md border text-sm font-medium transition-colors",
                  settings.workDays.includes(d.value)
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "border-border bg-background text-foreground/60 hover:bg-muted/50"
                )}
              >
                {d.short}
              </button>
            ))}
          </div>
        </div>

        {/* Last updated */}
        {settings.updatedAt && (
          <p className="text-xs text-muted-foreground">
            Última atualização: {formatDate(settings.updatedAt)}
          </p>
        )}

        <Button onClick={save} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar configurações
        </Button>
      </CardContent>
    </Card>
  )
}
