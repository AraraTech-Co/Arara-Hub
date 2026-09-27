'use client'

// =============================================================================
// Desempenho do atendimento (WhatsApp).
//
// A tela quebrava: ela foi escrita para o portal antigo, que devolvia funil de
// chatbot, tempos, série diária e tabela por atendente prontos. O controller da
// plataforma calcula só os totais e os motivos de encerramento — `series` e
// `agents` são `[]` fixos lá dentro. Sem `data.times` nem `data.daily`, o
// primeiro acesso era um TypeError e a página ficava em branco.
//
// Agora a tela carrega as conversas e deriva as métricas aqui (lib/wa-analytics),
// usando `/analytics` só para os motivos de encerramento, que são a única parte
// que a API realmente calcula.
//
// Duas métricas do desenho original SAÍRAM, por honestidade:
//  • Funil de chatbot — depende de saber se o bot atuou, e não há nem essa
//    marcação no payload nem bot conectado. No lugar entra a distribuição por
//    fase, que responde a mesma pergunta com dado real.
//  • Tempo até a primeira resposta — `first_response_at` existe no banco mas
//    não é serializado na listagem. Volta quando a API expuser o campo.
// =============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Area,
  AreaChart,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { EmptyState } from '@/components/ui/empty-state'
import { cn, formatDateShort } from '@/lib/utils'
import {
  whatsappApi,
  type WAConversation,
  type WAGranularity,
  type WASeriesMetric,
} from '@/lib/api/whatsapp'
import { derivarAnalytics, type WADerivado, type WAAgenteLinha } from '@/lib/wa-analytics'
import { WACloseReasonsCard } from './wa-close-reasons-card'
import { WAConnectionCard } from './wa-connection-card'
import { WAIaCard } from './wa-ia-card'

// ─── Formatação ───────────────────────────────────────────────────────────────

/** Duração legível a partir de segundos ("13m 13s", "17h 40m"). */
function formatDuration(seconds: number | null): string {
  if (seconds == null) return '—'
  const s = Math.max(0, Math.round(seconds))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ${m % 60}m`
  return `${Math.floor(h / 24)}d ${h % 24}h`
}

function bucketLabel(iso: string, granularity: WAGranularity): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  if (granularity === 'hour') {
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  }
  return formatDateShort(d, { day: '2-digit', month: 'short' })
}

const PERIODS = [
  { key: '7', label: 'Últimos 7 dias' },
  { key: '30', label: 'Últimos 30 dias' },
  { key: '90', label: 'Últimos 90 dias' },
] as const

const SERIES_LABELS: Record<WASeriesMetric, string> = {
  novos_contatos: 'Novos contatos',
  conversas_unicas: 'Conversas únicas',
  conversas_abertas: 'Conversas abertas',
  conversas_encerradas: 'Conversas encerradas',
}

// Cores dos gráficos vindas dos tokens semânticos — funcionam nos dois temas.
const CHART = {
  entraram: 'var(--color-sem-info-fg)',
  encerradas: 'var(--color-sem-success-fg)',
}

/** Motivos de encerramento como a tela consome. */
type MotivoLinha = { reasonId: string | null; reasonName: string; closed: number }

/** A API devolve `{id,name,count}`; a tela fala `{reasonId,reasonName,closed}`. */
function normalizarMotivos(raw: unknown): MotivoLinha[] {
  if (!Array.isArray(raw)) return []
  return raw.map((r) => {
    const o = (r ?? {}) as Record<string, unknown>
    const id = o.reasonId ?? o.id
    return {
      reasonId: id == null || id === '_none' ? null : String(id),
      reasonName: String(o.reasonName ?? o.name ?? 'Sem motivo informado'),
      closed: Number(o.closed ?? o.count ?? 0),
    }
  })
}

export function WhatsAppAnalyticsClient({
  canEditReasons = false,
  canManageToken = false,
}: {
  canEditReasons?: boolean
  canManageToken?: boolean
}) {
  const [conversas, setConversas] = useState<WAConversation[] | null>(null)
  const [motivos, setMotivos] = useState<MotivoLinha[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [days, setDays] = useState<string>('30')
  const [metric, setMetric] = useState<WASeriesMetric>('novos_contatos')

  const { from, to } = useMemo(() => {
    const ate = new Date()
    return { from: new Date(ate.getTime() - Number(days) * 24 * 60 * 60 * 1000), to: ate }
  }, [days])

  const carregar = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // As conversas são obrigatórias; os motivos são complemento e não podem
      // derrubar a tela se a rota falhar.
      const [convs, analytics] = await Promise.all([
        whatsappApi.listConversations(),
        whatsappApi
          .getAnalytics({ from: from.toISOString(), to: to.toISOString() })
          .catch(() => null),
      ])
      setConversas(Array.isArray(convs?.data) ? convs.data : [])
      setMotivos(
        normalizarMotivos((analytics?.data as { closeReasons?: unknown } | undefined)?.closeReasons),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar as métricas.')
    } finally {
      setLoading(false)
    }
  }, [from, to])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const g: WAGranularity = 'day'

  const d: WADerivado | null = useMemo(() => {
    if (!conversas) return null
    return derivarAnalytics(conversas, { from, to, granularity: g, metric })
  }, [conversas, from, to, metric])

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Desempenho do atendimento</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Métricas do WhatsApp a partir das conversas do portal.
          </p>
        </div>
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            {PERIODS.map((p) => (
              <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && (
        <Card>
          <CardContent className="py-6">
            <p className="text-sm text-sem-error-fg">{error}</p>
          </CardContent>
        </Card>
      )}

      <WAConnectionCard canManageToken={canManageToken} />

      {/* Configuração da IA: mesma tela da conexão e dos interruptores, que é
          onde quem opera o WhatsApp já vai. Só admin — é cliente real do outro
          lado. Ver docs/plans/plano-painel-ia-humanizada-whatsapp.md. */}
      {canManageToken && <WAIaCard />}

      {loading && !d ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Carregando métricas…</p>
      ) : d ? (
        <>
          <FasesCard d={d} />

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Atividade no período</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-3 gap-3">
                <Stat label="Conversas novas" value={d.totalNoPeriodo} />
                <Stat label="Encerradas" value={d.encerradas} />
                <Stat label="Sem responsável" value={d.semResponsavel} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Tempo até o encerramento</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3">
                <Stat label="Mediana" value={formatDuration(d.resolucaoMediana)} />
                <Stat label="Média" value={formatDuration(d.resolucaoMedia)} />
                <p className="col-span-2 text-xs text-muted-foreground">
                  Da abertura da conversa até o encerramento. O tempo até a primeira resposta
                  ainda não é exposto pela API.
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Entrada e saída por dia</CardTitle>
            </CardHeader>
            <CardContent>
              {d.diario.length === 0 ? (
                <EmptyState icon="📊" title="Sem movimento no período" size="sm" />
              ) : (
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={d.diario.map((x) => ({ ...x, label: bucketLabel(x.bucket, g) }))}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                      <Tooltip
                        contentStyle={{
                          background: 'var(--color-card)',
                          border: '1px solid var(--color-border)',
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="entraram" name="Entraram" fill={CHART.entraram} radius={[3, 3, 0, 0]} />
                      <Bar dataKey="encerradas" name="Encerradas" fill={CHART.encerradas} radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-base">Estatísticas por período</CardTitle>
              <Select value={metric} onValueChange={(v) => setMetric(v as WASeriesMetric)}>
                <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(SERIES_LABELS) as WASeriesMetric[]).map((m) => (
                    <SelectItem key={m} value={m}>{SERIES_LABELS[m]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent>
              {d.serie.length === 0 ? (
                <EmptyState icon="📈" title="Sem dados no período" size="sm" />
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={d.serie.map((p) => ({ ...p, label: bucketLabel(p.bucket, g) }))}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                      <Tooltip
                        contentStyle={{
                          background: 'var(--color-card)',
                          border: '1px solid var(--color-border)',
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="value"
                        name={SERIES_LABELS[metric]}
                        stroke={CHART.entraram}
                        fill={CHART.entraram}
                        fillOpacity={0.15}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          <WACloseReasonsCard closeReasons={motivos} canEdit={canEditReasons} />

          <AgentsTable agents={d.agentes} />
        </>
      ) : null}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <p className="text-2xl font-bold text-foreground">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  )
}

/**
 * Onde as conversas do período pararam.
 *
 * Ocupa o lugar do funil de chatbot do portal antigo: aquele separava
 * "resolvido pelo bot" de "bot e depois equipe", e nada no payload diz se o bot
 * atuou — seria número inventado.
 */
function FasesCard({ d }: { d: WADerivado }) {
  const total = d.totalNoPeriodo
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          Onde estão as conversas
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {total} conversa{total === 1 ? '' : 's'} no período
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {total === 0 ? (
          <EmptyState icon="💬" title="Sem conversas no período" size="sm" />
        ) : (
          d.fases.map((f) => (
            <div key={f.fase.key} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-foreground/70">{f.fase.label}</span>
                <span className="font-medium text-foreground">
                  {f.n} <span className="text-muted-foreground">({pct(f.n)}%)</span>
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn('h-full rounded-full', f.fase.accent.split(' ')[0])}
                  style={{ width: `${pct(f.n)}%` }}
                />
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}

function AgentsTable({ agents }: { agents: WAAgenteLinha[] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Estatísticas por atendente</CardTitle>
      </CardHeader>
      <CardContent>
        {agents.length === 0 ? (
          <EmptyState icon="👥" title="Nenhuma conversa atribuída no período" size="sm" />
        ) : (
          <>
            {/* Tabela larga: rola sozinha em vez de empurrar a página. */}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="pb-2 pr-3 font-medium">Atendente</th>
                    <th className="pb-2 px-3 font-medium">Atribuídas</th>
                    <th className="pb-2 px-3 font-medium">Encerradas</th>
                    <th className="pb-2 px-3 font-medium">Encerramento (mediana)</th>
                    <th className="pb-2 pl-3 font-medium">Encerramento (média)</th>
                  </tr>
                </thead>
                <tbody>
                  {agents.map((a) => (
                    <tr key={a.agentId ?? a.agentName} className="border-b border-border/50">
                      <td className="py-2 pr-3 font-medium text-foreground">
                        {a.agentName ?? 'Sem nome'}
                      </td>
                      <td className="py-2 px-3 text-foreground/80">{a.assigned}</td>
                      <td className="py-2 px-3 text-foreground/80">{a.closed}</td>
                      <td className="py-2 px-3 text-foreground/80">
                        {formatDuration(a.resolutionMedian)}
                      </td>
                      <td className="py-2 pl-3 text-foreground/80">
                        {formatDuration(a.resolutionAvg)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              O crédito segue o responsável atual da conversa: o histórico de atribuição não é
              exposto pela API, então uma conversa reatribuída conta para quem está com ela agora.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}
