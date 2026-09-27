// =============================================================================
// Métricas de desempenho do WhatsApp, derivadas no cliente.
//
// Por que aqui e não na API: o controller `/whatsapp/analytics` da plataforma
// só calcula os totais e os motivos de encerramento — `series` e `agents` são
// `[]` fixos no código dele. A tela, herdada do portal antigo, esperava um
// pacote bem maior (funil, tempos, série diária, tabela por atendente) e
// quebrava em `data.times.firstResponseMedian` porque nada disso vinha.
//
// A lista de conversas (`GET /whatsapp`) carrega o suficiente para reconstruir
// quase tudo: data de criação, fase, responsável, encerramento e motivo. É o
// que este módulo faz. Quando o controller passar a calcular de verdade, esta
// derivação sai e a tela volta a só consumir a API.
//
// O que NÃO dá para derivar está documentado em cada função — preferimos "—"
// a um número inventado.
// =============================================================================

import type { WAConversation, WAGranularity, WASeriesMetric } from '@/lib/api/whatsapp'
import { WA_PHASES, type WAPhaseMeta } from '@/lib/wa-phase'

type Row = WAConversation & Record<string, unknown>

const DIA_MS = 24 * 60 * 60 * 1000

// ─── Utilitários ─────────────────────────────────────────────────────────────

function ms(v: unknown): number | null {
  if (!v) return null
  const t = new Date(String(v)).getTime()
  return Number.isNaN(t) ? null : t
}

function mediana(xs: number[]): number | null {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const meio = Math.floor(s.length / 2)
  return s.length % 2 ? s[meio] : (s[meio - 1] + s[meio]) / 2
}

function media(xs: number[]): number | null {
  if (!xs.length) return null
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

/** Início do balde (dia ou hora) em ISO — chave estável para agrupar. */
function balde(t: number, g: WAGranularity): string {
  const d = new Date(t)
  if (g === 'hour') d.setMinutes(0, 0, 0)
  else d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

// ─── Tipos de saída ──────────────────────────────────────────────────────────

export interface WAFaseFatia {
  fase: WAPhaseMeta
  n: number
}

export interface WAAgenteLinha {
  agentId: string | null
  agentName: string | null
  assigned: number
  closed: number
  resolutionMedian: number | null
  resolutionAvg: number | null
}

export interface WADerivado {
  /** Conversas criadas dentro do período. */
  totalNoPeriodo: number
  /** Distribuição por fase — substitui o funil de chatbot, que não é derivável. */
  fases: WAFaseFatia[]
  emAberto: number
  encerradas: number
  semResponsavel: number
  /** Segundos entre a criação e o encerramento. */
  resolucaoMediana: number | null
  resolucaoMedia: number | null
  agentes: WAAgenteLinha[]
  /** Uma barra por balde: quantas entraram e quantas foram encerradas. */
  diario: Array<{ bucket: string; entraram: number; encerradas: number }>
  serie: Array<{ bucket: string; value: number }>
}

// ─── Derivação ───────────────────────────────────────────────────────────────

/**
 * Monta as métricas do período a partir das conversas.
 *
 * O recorte usa `created_at` para tudo que é entrada e `resolved_at` para tudo
 * que é saída — uma conversa aberta antes do período mas encerrada dentro dele
 * conta como encerrada, e não como nova.
 */
export function derivarAnalytics(
  conversas: WAConversation[],
  opts: { from: Date; to: Date; granularity: WAGranularity; metric: WASeriesMetric },
): WADerivado {
  const de = opts.from.getTime()
  const ate = opts.to.getTime()
  const dentro = (t: number | null) => t != null && t >= de && t <= ate

  const rows = conversas as Row[]
  const novas = rows.filter((c) => dentro(ms(c.created_at)))
  const fechadas = rows.filter((c) => dentro(ms(c.resolved_at)))

  // ── Fases ──
  // Conta sobre as conversas novas do período: é a leitura que responde
  // "o que entrou e onde parou".
  const porFase = new Map<string, number>()
  for (const c of novas) {
    const k = String(c.phase || 'novo')
    porFase.set(k, (porFase.get(k) ?? 0) + 1)
  }
  const fases: WAFaseFatia[] = WA_PHASES.map((f) => ({ fase: f, n: porFase.get(f.key) ?? 0 }))

  // ── Tempos de resolução ──
  const duracoes: number[] = []
  for (const c of fechadas) {
    const ini = ms(c.created_at)
    const fim = ms(c.resolved_at)
    if (ini != null && fim != null && fim >= ini) duracoes.push((fim - ini) / 1000)
  }

  // ── Por atendente ──
  // O crédito segue o responsável ATUAL da conversa: o payload não guarda
  // histórico de atribuição, então uma conversa reatribuída conta para quem
  // está com ela agora. A tela diz isso ao usuário.
  const porAgente = new Map<string, WAAgenteLinha & { _dur: number[] }>()
  const chaveAgente = (c: Row) => String(c.assigned_to_id ?? c.assigned_to?.id ?? '')
  const nomeAgente = (c: Row) => c.assigned_to?.name ?? null

  for (const c of [...novas, ...fechadas]) {
    const id = chaveAgente(c)
    if (!id) continue
    if (!porAgente.has(id)) {
      porAgente.set(id, {
        agentId: id,
        agentName: nomeAgente(c),
        assigned: 0,
        closed: 0,
        resolutionMedian: null,
        resolutionAvg: null,
        _dur: [],
      })
    }
  }
  for (const c of novas) {
    const a = porAgente.get(chaveAgente(c))
    if (a) a.assigned += 1
  }
  for (const c of fechadas) {
    const a = porAgente.get(chaveAgente(c))
    if (!a) continue
    a.closed += 1
    const ini = ms(c.created_at)
    const fim = ms(c.resolved_at)
    if (ini != null && fim != null && fim >= ini) a._dur.push((fim - ini) / 1000)
  }
  const agentes: WAAgenteLinha[] = [...porAgente.values()]
    .map(({ _dur, ...a }) => ({
      ...a,
      resolutionMedian: mediana(_dur),
      resolutionAvg: media(_dur),
    }))
    .sort((x, y) => y.assigned - x.assigned || y.closed - x.closed)

  // ── Baldes ──
  // Baldes vazios entram com zero: sem isso o gráfico "pula" os dias sem
  // movimento e sugere uma continuidade que não existe.
  const passo = opts.granularity === 'hour' ? 60 * 60 * 1000 : DIA_MS
  const buckets: string[] = []
  for (let t = de; t <= ate; t += passo) buckets.push(balde(t, opts.granularity))
  const unicos = [...new Set(buckets)]

  const entraramPor = new Map<string, number>()
  const fechadasPor = new Map<string, number>()
  for (const c of novas) {
    const t = ms(c.created_at)
    if (t == null) continue
    const b = balde(t, opts.granularity)
    entraramPor.set(b, (entraramPor.get(b) ?? 0) + 1)
  }
  for (const c of fechadas) {
    const t = ms(c.resolved_at)
    if (t == null) continue
    const b = balde(t, opts.granularity)
    fechadasPor.set(b, (fechadasPor.get(b) ?? 0) + 1)
  }

  const diario = unicos.map((b) => ({
    bucket: b,
    entraram: entraramPor.get(b) ?? 0,
    encerradas: fechadasPor.get(b) ?? 0,
  }))

  const emAberto = rows.filter(
    (c) => String(c.status) !== 'closed' && String(c.phase) !== 'resolvido',
  ).length

  const serie = diario.map((d) => ({
    bucket: d.bucket,
    value:
      opts.metric === 'conversas_encerradas'
        ? d.encerradas
        : opts.metric === 'conversas_abertas'
          ? d.entraram - d.encerradas
          : d.entraram,
  }))

  return {
    totalNoPeriodo: novas.length,
    fases,
    emAberto,
    encerradas: fechadas.length,
    semResponsavel: novas.filter((c) => !chaveAgente(c)).length,
    resolucaoMediana: mediana(duracoes),
    resolucaoMedia: media(duracoes),
    agentes,
    diario,
    serie,
  }
}
