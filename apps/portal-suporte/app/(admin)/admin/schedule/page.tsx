'use client'

// =============================================================================
// Plantão — uma tela só.
//
// Antes eram cinco abas (Semanal, Diária, Mensal, Warroom, Noturna) sobre um
// único model sem schema, gravando dois esquemas diferentes. "Colocar o Fulano
// de plantão esta noite" custava 4 cliques e uma digitação, e as abas Diária,
// Mensal, Warroom e Noturna mostravam "Sem escala" MESMO COM DADOS GRAVADOS,
// porque a listagem mandava start/end como filtro de coluna (corrigido no
// backend, entrega 3a).
//
// Decisões do Leonardo (09/10/2026) que desenham esta tela:
//  - uma escala só: o Plantão, por data, com ordem de chamada;
//  - N1/N2/N3 é severidade do CHAMADO e saiu da escala;
//  - war room é estado de incidente, não turno, e saiu também;
//  - janela fixa seg–sex 18–22 e sáb–dom 8–22, configurada junto com o horário
//    de atendimento (entrega 2). Fora dela ninguém é acordado.
// =============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { AlertCircle, ChevronLeft, ChevronRight, Clock, Phone, PhoneOff, Plus } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { schedulesApi, type PlantaoDia, type QuemAvisarAgora } from '@/lib/api/schedules'
import { araraApiFetch } from '@/lib/arara/arara-api-fetch'
import { cn } from '@/lib/utils'
import { DiaDoPlantaoDialog, type AgenteEscolhivel } from '@/components/schedule/dia-do-plantao-dialog'

const DIAS_CURTOS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

/** AAAA-MM-DD no fuso local — `toISOString()` daria o dia errado à noite. */
function isoLocal(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

/** Segunda da semana que contém `d`. */
function segundaDa(d: Date): Date {
  const base = new Date(d)
  base.setHours(12, 0, 0, 0)
  base.setDate(base.getDate() - ((base.getDay() + 6) % 7))
  return base
}

function diasDaSemana(segunda: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(segunda)
    d.setDate(segunda.getDate() + i)
    return d
  })
}

export default function PlantaoPage() {
  const { toast } = useToast()
  const [segunda, setSegunda] = useState(() => segundaDa(new Date()))
  const [dias, setDias] = useState<PlantaoDia[]>([])
  const [agora, setAgora] = useState<QuemAvisarAgora | null>(null)
  const [equipe, setEquipe] = useState<AgenteEscolhivel[]>([])
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [editando, setEditando] = useState<string | null>(null)

  const semana = useMemo(() => diasDaSemana(segunda), [segunda])
  const de = isoLocal(semana[0])
  const ate = isoLocal(semana[6])
  const hoje = isoLocal(new Date())

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const [lista, oncall, agentesRes] = await Promise.all([
        schedulesApi.listar(de, ate),
        schedulesApi.quemAvisarAgora(),
        araraApiFetch('/api/profiles/agents'),
      ])
      setDias(lista.data ?? [])
      setAgora(oncall.data ?? null)
      const brutos = agentesRes instanceof Response && agentesRes.ok
        ? ((await agentesRes.json())?.data ?? [])
        : []
      setEquipe(
        (brutos as Record<string, unknown>[]).map((a) => ({
          id: String(a.id),
          nome: (a.full_name as string) ?? (a.name as string) ?? null,
          email: (a.email as string) ?? null,
          // A lista de agentes não diz se tem telefone; o plantão do dia diz.
          // Aqui começa otimista e é corrigido pelo que o servidor devolve.
          telefone_ok: Boolean(a.phone),
        })),
      )
    } catch {
      toast({ title: 'Não foi possível carregar o plantão', variant: 'destructive' })
    } finally {
      setCarregando(false)
    }
  }, [de, ate, toast])

  useEffect(() => { void carregar() }, [carregar])

  const porData = useMemo(() => {
    const m = new Map<string, PlantaoDia>()
    for (const d of dias) m.set(d.date, d)
    return m
  }, [dias])

  // O telefone conferido pelo servidor é a verdade: a lista de agentes pode
  // não trazer o campo.
  const equipeComTelefone = useMemo(() => {
    const conhecido = new Map<string, boolean>()
    for (const d of dias) for (const a of d.agentes) conhecido.set(a.id, a.telefone_ok)
    return equipe.map((a) => ({ ...a, telefone_ok: conhecido.get(a.id) ?? a.telefone_ok }))
  }, [equipe, dias])

  async function salvarDia(data: string, ids: string[]) {
    setSalvando(true)
    try {
      await schedulesApi.salvarDia(data, ids)
      setEditando(null)
      await carregar()
      toast({ title: 'Plantão salvo', description: `${data}: ${ids.length} pessoa(s) na ordem de chamada.` })
    } catch (err) {
      // A recusa do servidor diz o que está errado (pessoa repetida, agente
      // que não existe) — vale mostrar o texto dele.
      toast({
        title: 'Não salvou',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      })
    } finally {
      setSalvando(false)
    }
  }

  async function limparDia(data: string) {
    setSalvando(true)
    try {
      await schedulesApi.limparDia(data)
      setEditando(null)
      await carregar()
      toast({ title: 'Plantão removido', description: `${data} ficou sem plantão.` })
    } catch (err) {
      toast({
        title: 'Não removeu',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="pt-14 lg:pt-0">
      <div className="mx-auto max-w-7xl space-y-6 px-4 pb-8 pt-6 sm:px-6 lg:px-8 lg:py-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Plantão</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Quem é avisado quando um cliente escreve fora do horário de atendimento. A ordem dentro
            do dia é a ordem de chamada.
          </p>
        </div>

        {/* Estado de agora: é a função quemAvisar(agora) mostrada na tela. */}
        <Card className="p-4">
          {carregando && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {!carregando && agora && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <Clock className="h-4 w-4 shrink-0 text-blue-600" />
              <span className="text-sm font-medium">
                {agora.agora.em_plantao
                  ? `Em plantão agora${agora.agora.faixa ? ` (${agora.agora.faixa[0]}–${agora.agora.faixa[1]})` : ''}`
                  : 'Fora da janela de plantão'}
              </span>
              {agora.avisar.length > 0 && (
                <span className="flex flex-wrap items-center gap-1.5 text-sm">
                  {agora.avisar.map((a, i) => (
                    <span key={a.id} className="flex items-center gap-1">
                      <span className="text-xs tabular-nums text-muted-foreground">{i + 1}.</span>
                      {a.nome ?? a.id}
                      <Phone className="h-3 w-3 text-emerald-600" aria-label="telefone cadastrado" />
                    </span>
                  ))}
                </span>
              )}
              {/* O motivo só acrescenta quando diz algo que o rótulo ao lado
                  ainda não disse. Fora da janela, os dois diziam a mesma frase:
                  "Fora da janela de plantão — ninguém: fora da janela de
                  plantão". Dentro da janela sem ninguém, o motivo é a
                  informação que importa (sem plantão no dia, ou os escalados
                  sem telefone). */}
              {agora.avisar.length === 0 && agora.motivo && agora.agora.em_plantao && (
                <span className="text-sm text-muted-foreground">— ninguém: {agora.motivo}</span>
              )}
              {agora.avisar.length === 0 && !agora.agora.em_plantao && (
                <span className="text-sm text-muted-foreground">— ninguém é avisado agora</span>
              )}
              {agora.sem_telefone.length > 0 && (
                <span className="flex items-center gap-1.5 rounded-md bg-sem-warning px-2 py-1 text-xs text-sem-warning-fg">
                  <AlertCircle className="h-3.5 w-3.5" />
                  Escalado sem telefone, não recebe aviso:{' '}
                  {agora.sem_telefone.map((a) => a.nome ?? a.id).join(', ')}
                </span>
              )}
              <span className="ml-auto text-xs text-muted-foreground">
                {agora.agora.data} · {agora.agora.fuso}
              </span>
            </div>
          )}
        </Card>

        {/* A semana: uma célula por dia. "Fulano esta noite" = 2 ações. */}
        <div className="flex items-center gap-2">
          <Button
            type="button" variant="outline" size="sm" aria-label="Semana anterior"
            onClick={() => setSegunda((s) => { const d = new Date(s); d.setDate(s.getDate() - 7); return d })}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium tabular-nums">{de} a {ate}</span>
          <Button
            type="button" variant="outline" size="sm" aria-label="Próxima semana"
            onClick={() => setSegunda((s) => { const d = new Date(s); d.setDate(s.getDate() + 7); return d })}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          {de > hoje || ate < hoje ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setSegunda(segundaDa(new Date()))}>
              Voltar para esta semana
            </Button>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {semana.map((d, i) => {
            const data = isoLocal(d)
            const dia = porData.get(data)
            const ehHoje = data === hoje
            return (
              <button
                key={data}
                type="button"
                onClick={() => setEditando(data)}
                className={cn(
                  'flex min-h-[7rem] flex-col gap-1.5 rounded-xl border p-3 text-left transition-colors hover:bg-muted/40',
                  ehHoje ? 'border-blue-600 ring-1 ring-blue-600/20' : 'border-border',
                )}
              >
                <span className="flex items-baseline gap-1.5">
                  <span className="text-sm font-semibold">{DIAS_CURTOS[i]}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {data.slice(8, 10)}/{data.slice(5, 7)}
                  </span>
                  {ehHoje && <span className="text-[11px] font-medium text-blue-600">hoje</span>}
                </span>
                {!dia || dia.agentes.length === 0 ? (
                  <span className="flex items-center gap-1 text-xs italic text-muted-foreground">
                    <Plus className="h-3 w-3" /> sem plantão
                  </span>
                ) : (
                  <span className="space-y-0.5">
                    {dia.agentes.map((a, j) => (
                      <span key={a.id} className="flex items-center gap-1 text-sm">
                        <span className="text-[11px] tabular-nums text-muted-foreground">{j + 1}.</span>
                        <span className="truncate">{a.nome ?? a.id}</span>
                        {a.telefone_ok
                          ? <Phone className="h-3 w-3 shrink-0 text-emerald-600" aria-label="telefone cadastrado" />
                          : <PhoneOff className="h-3 w-3 shrink-0 text-amber-600" aria-label="sem telefone — não recebe aviso" />}
                      </span>
                    ))}
                  </span>
                )}
                {dia && dia.origem !== 'plantao' && (
                  <span className="mt-auto text-[11px] italic text-muted-foreground">
                    {dia.origem === 'semanal' ? 'da escala semanal antiga' : 'do plantão diário antigo'}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <p className="text-xs text-muted-foreground">
          A janela de plantão (seg–sex 18–22, sáb–dom 8–22) é configurada junto com o horário de
          atendimento, em SLA → Horário de atendimento. Fora dela, ninguém é avisado: a conversa
          entra na fila e o plantonista é chamado quando o turno dele começa.
        </p>
      </div>

      {editando && (
        <DiaDoPlantaoDialog
          data={editando}
          escolhidos={porData.get(editando)?.agent_ids ?? []}
          agentes={equipeComTelefone}
          salvando={salvando}
          onFechar={() => setEditando(null)}
          onSalvar={(ids) => void salvarDia(editando, ids)}
          onLimpar={() => void limparDia(editando)}
        />
      )}
    </div>
  )
}
