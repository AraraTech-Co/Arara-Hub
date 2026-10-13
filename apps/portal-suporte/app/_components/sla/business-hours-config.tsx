"use client"

// =============================================================================
// Horário de atendimento — um dado, dois consumidores.
//
// Esta tela sempre falou em nome do SLA ("quando os cronômetros contam"). Desde
// a entrega 2 do Fluxo v2 o MESMO horário governa o robô do WhatsApp: o nó
// Condição "está dentro do horário?" consulta exatamente isto. Por isso a tela
// deixou de editar uma faixa por dia e passou a editar o que o atendimento
// real tem — almoço, feriado e a janela de plantão.
//
// Até 13/10/2026 nada aqui salvava: o `PUT /settings/business-hours` exigia um
// `:id` que a rota não tem e respondia 400 "Missing id" sempre, e o GET
// devolvia `{data, count}` que o componente atribuía inteiro como se fosse a
// configuração. As duas pontas foram corrigidas junto com esta tela.
// =============================================================================

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { Clock, Save, Loader2, Plus, X, CalendarOff } from "lucide-react"
import { cn, formatDate } from "@/lib/utils"
import { araraApiFetch } from '@/lib/arara/arara-api-fetch'

const DAYS = [
  { value: 1, short: "Seg", long: "Segunda" },
  { value: 2, short: "Ter", long: "Terça" },
  { value: 3, short: "Qua", long: "Quarta" },
  { value: 4, short: "Qui", long: "Quinta" },
  { value: 5, short: "Sex", long: "Sexta" },
  { value: 6, short: "Sáb", long: "Sábado" },
  { value: 0, short: "Dom", long: "Domingo" },
]

const TIMEZONES = [
  "America/Sao_Paulo", "America/Manaus", "America/Belem", "America/Fortaleza",
  "America/Recife", "America/Noronha", "America/Bahia", "America/Campo_Grande",
  "America/Cuiaba", "America/Porto_Velho", "America/Boa_Vista", "America/Rio_Branco",
  "America/New_York", "America/Chicago", "America/Los_Angeles",
  "Europe/London", "Europe/Lisbon", "UTC",
]

/** Faixa como o servidor guarda: ["HH:MM", "HH:MM"]. */
type Faixa = [string, string]
type PorDia = Record<string, Faixa[]>

interface Horario {
  fuso: string
  atendimento: PorDia
  plantao: PorDia
  excecoes: PorDia
  updatedAt?: string | null
}

const VAZIO: Horario = {
  fuso: "America/Sao_Paulo",
  atendimento: { 1: [["09:00", "18:00"]], 2: [["09:00", "18:00"]], 3: [["09:00", "18:00"]], 4: [["09:00", "18:00"]], 5: [["09:00", "18:00"]] },
  plantao: {},
  excecoes: {},
}

/** Soma das faixas de um dia, em horas — serve de conferência visual. */
function horasDoDia(faixas: Faixa[]): number {
  return faixas.reduce((total, [ini, fim]) => {
    const [hi, mi] = ini.split(":").map(Number)
    const [hf, mf] = fim.split(":").map(Number)
    const minutos = hf * 60 + mf - (hi * 60 + mi)
    return total + (minutos > 0 ? minutos : 0)
  }, 0) / 60
}

function GradeDeFaixas({
  titulo, descricao, valor, onChange, disabled,
}: {
  titulo: string
  descricao: string
  valor: PorDia
  onChange: (v: PorDia) => void
  disabled?: boolean
}) {
  const mexer = (dia: number, faixas: Faixa[]) => {
    const copia = { ...valor }
    if (faixas.length) copia[String(dia)] = faixas
    else delete copia[String(dia)]
    onChange(copia)
  }

  return (
    <div className="space-y-2">
      <div>
        <Label>{titulo}</Label>
        <p className="text-[11px] text-muted-foreground">{descricao}</p>
      </div>
      <div className="space-y-1.5">
        {DAYS.map((d) => {
          const faixas = valor[String(d.value)] ?? []
          return (
            <div key={d.value} className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 px-2 py-1.5">
              <span className="w-10 shrink-0 text-sm font-medium" title={d.long}>{d.short}</span>
              {faixas.length === 0 && (
                <span className="text-xs italic text-muted-foreground">fechado</span>
              )}
              {faixas.map((f, i) => (
                <span key={i} className="flex items-center gap-1">
                  <Input
                    type="time"
                    aria-label={`${d.long}: início da faixa ${i + 1}`}
                    value={f[0]}
                    disabled={disabled}
                    onChange={(e) => {
                      const novas = faixas.map((x, j) => (j === i ? [e.target.value, x[1]] as Faixa : x))
                      mexer(d.value, novas)
                    }}
                    className="h-8 w-28"
                  />
                  <span className="text-xs text-muted-foreground">às</span>
                  <Input
                    type="time"
                    aria-label={`${d.long}: fim da faixa ${i + 1}`}
                    value={f[1]}
                    disabled={disabled}
                    onChange={(e) => {
                      const novas = faixas.map((x, j) => (j === i ? [x[0], e.target.value] as Faixa : x))
                      mexer(d.value, novas)
                    }}
                    className="h-8 w-28"
                  />
                  <button
                    type="button"
                    aria-label={`Remover a faixa ${i + 1} de ${d.long}`}
                    disabled={disabled}
                    onClick={() => mexer(d.value, faixas.filter((_, j) => j !== i))}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}
              <button
                type="button"
                disabled={disabled}
                onClick={() => mexer(d.value, [...faixas, faixas.length ? ["13:00", "18:00"] : ["09:00", "12:00"]] as Faixa[])}
                className="flex items-center gap-1 rounded px-1.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Plus className="h-3 w-3" /> faixa
              </button>
              {faixas.length > 0 && (
                <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
                  {horasDoDia(faixas).toFixed(1)}h
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function BusinessHoursConfig() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [h, setH] = useState<Horario>(VAZIO)
  const [novaData, setNovaData] = useState("")

  useEffect(() => {
    araraApiFetch("/api/settings/business-hours")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        // O servidor devolve UM objeto de configuração (antes era um envelope
        // `{data, count}` que caía aqui inteiro e nunca batia com nada).
        if (data && typeof data === "object" && data.atendimento) {
          setH({
            fuso: data.fuso ?? data.timezone ?? VAZIO.fuso,
            atendimento: data.atendimento ?? {},
            plantao: data.plantao ?? {},
            excecoes: data.excecoes ?? {},
            updatedAt: data.updatedAt ?? null,
          })
        }
      })
      .finally(() => setLoading(false))
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      const res = await araraApiFetch("/api/settings/business-hours", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fuso: h.fuso, atendimento: h.atendimento, plantao: h.plantao, excecoes: h.excecoes }),
      })
      const data = await res.json()
      if (!res.ok) {
        // As recusas do servidor dizem qual dia e qual faixa estão erradas —
        // vale mostrar o texto dele, não um "erro ao salvar" genérico.
        toast({ title: "Não salvou", description: data.error, variant: "destructive" })
      } else {
        setH((atual) => ({ ...atual, updatedAt: data.updatedAt }))
        toast({ title: "Salvo", description: "O SLA e o robô do WhatsApp já usam este horário." })
      }
    } catch {
      toast({ title: "Erro de rede", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const horasSemana = DAYS.reduce((t, d) => t + horasDoDia(h.atendimento[String(d.value)] ?? []), 0)
  const datasDeExcecao = Object.keys(h.excecoes).sort()

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
          <CardTitle>Horário de atendimento</CardTitle>
        </div>
        <CardDescription>
          Vale para dois lugares: os cronômetros de SLA (tickets com &ldquo;apenas horário
          comercial&rdquo;) e o robô do WhatsApp, no card <strong>Condição → está dentro do
          horário de atendimento?</strong>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-1.5">
          <Label htmlFor="tz">Fuso horário</Label>
          <select
            id="tz"
            value={h.fuso}
            onChange={(e) => setH((s) => ({ ...s, fuso: e.target.value }))}
            className="flex h-9 w-full max-w-xs rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
          </select>
        </div>

        <GradeDeFaixas
          titulo="Expediente"
          descricao={`Mais de uma faixa no mesmo dia cobre o almoço. Dia sem faixa é dia fechado. ${horasSemana.toFixed(1)}h por semana.`}
          valor={h.atendimento}
          onChange={(v) => setH((s) => ({ ...s, atendimento: v }))}
          disabled={saving}
        />

        <GradeDeFaixas
          titulo="Plantão"
          descricao="Fora do expediente, quem está de plantão pode ser avisado nesta janela. Fora dela, ninguém é acordado."
          valor={h.plantao}
          onChange={(v) => setH((s) => ({ ...s, plantao: v }))}
          disabled={saving}
        />

        <div className="space-y-2">
          <div>
            <Label>Exceções por data</Label>
            <p className="text-[11px] text-muted-foreground">
              Feriado e data especial. A exceção substitui o dia inteiro: sem faixa, fecha.
            </p>
          </div>
          {datasDeExcecao.length === 0 && (
            <p className="text-xs italic text-muted-foreground">Nenhuma exceção cadastrada.</p>
          )}
          {datasDeExcecao.map((data) => {
            const faixas = h.excecoes[data] ?? []
            return (
              <div key={data} className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 px-2 py-1.5">
                <CalendarOff className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="text-sm tabular-nums">{data}</span>
                <span className="text-xs italic text-muted-foreground">
                  {faixas.length ? faixas.map((f) => `${f[0]}–${f[1]}`).join(", ") : "fechado o dia inteiro"}
                </span>
                <div className="ml-auto flex items-center gap-1">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => setH((s) => ({
                      ...s,
                      excecoes: { ...s.excecoes, [data]: faixas.length ? [] : [["09:00", "13:00"]] as Faixa[] },
                    }))}
                    className="rounded px-1.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    {faixas.length ? "fechar o dia" : "abrir meio período"}
                  </button>
                  <button
                    type="button"
                    aria-label={`Remover a exceção de ${data}`}
                    disabled={saving}
                    onClick={() => setH((s) => {
                      const copia = { ...s.excecoes }
                      delete copia[data]
                      return { ...s, excecoes: copia }
                    })}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )
          })}
          <div className="flex items-center gap-2">
            <Input
              type="date"
              aria-label="Data da nova exceção"
              value={novaData}
              disabled={saving}
              onChange={(e) => setNovaData(e.target.value)}
              className="h-8 w-40"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving || !novaData || Boolean(h.excecoes[novaData])}
              onClick={() => {
                setH((s) => ({ ...s, excecoes: { ...s.excecoes, [novaData]: [] } }))
                setNovaData("")
              }}
              className="gap-1"
            >
              <Plus className="h-3.5 w-3.5" /> Adicionar exceção
            </Button>
          </div>
        </div>

        {h.updatedAt && (
          <p className="text-xs text-muted-foreground">
            Última atualização: {formatDate(h.updatedAt)}
          </p>
        )}

        <Button onClick={save} disabled={saving} className={cn("gap-2")}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar horário
        </Button>
      </CardContent>
    </Card>
  )
}
