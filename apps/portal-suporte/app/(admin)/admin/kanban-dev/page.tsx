'use client'

// =============================================================================
// Kanban Dev — o quadro da equipe de Desenvolvimento.
//
// Deliberadamente NÃO reusa kanban-board.tsx: aquele arquivo tem 1000+ linhas
// de preocupações só do Suporte (SLA, bulk, presets, agrupamento) e a diretriz
// do projeto é não engordar os gigantes. Este quadro tem regras próprias
// (máquina de estados com validações por etapa) e vive em um arquivo enxuto.
//
// Quem manda é o servidor (POST /dev/tickets/:id/mover): a tela oferece os
// botões possíveis e pede os campos exigidos, mas um 400 de lá é exibido como
// veio — a mensagem já diz exatamente o que falta.
// =============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useCompanies } from '@/hooks/use-companies'
import { ANEXO_ACCEPT, ANEXO_MAX_MB, anexarAoChamado, motivoRecusaAnexo } from '@/lib/anexos'
import { TicketAttachments, type AttachmentItem } from '@/components/tickets/ticket-attachments'
import { TicketInternalComments, type InternalComment } from '@/components/tickets/ticket-internal-comments'
import { PRIORITY_OPTIONS, getPriorityBorder, getPriorityLabel } from '@/lib/ticket-priority'
import { prazoDoCard, SITUACAO_PRAZO_LABEL } from '@/lib/dev-prazo'
import {
  ESFORCO_OPCOES, esforcoValido, labelEsforco, previsaoDeEsforco,
  type EsforcoEntrega,
} from '@/lib/dev-esforco'
import { aplicarFiltros, contarAtivos, FILTROS_VAZIOS, filtrosDaUrl, filtrosNaUrl, type FiltrosDev } from '@/lib/dev-filtros'
import { DevFilterBar } from '@/components/kanban-dev/dev-filter-bar'
import { DevSortBar } from '@/components/kanban-dev/dev-sort-bar'
import { moverNaOrdem, ordenacaoDaUrl, ordenacaoNaUrl, ordenarCards, opcaoDe, ORDENACAO_PADRAO, type OrdenacaoDev } from '@/lib/dev-ordenacao'
import {
  DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable,
  useSensor, useSensors, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { useAuth } from '@/lib/arara/AuthProvider'
import { hasMinLevel } from '@/lib/auth/access-control'
import { useMeuAcesso } from '@/hooks/use-meu-acesso'
import { hasMinRole } from '@/lib/arara/auth-storage'
import {
  DEV_COLUNAS, DEV_EXIGE, DEV_LABELS, DEV_MARCADOR, DEV_TRANSICOES,
  numeroDev, type DevStatus,
} from '@/lib/kanban-dev'
import {
  ehServidorHml, labelServidorHml, SERVIDORES_HML, travaHml,
} from '@/lib/servidores-hml'
import { ServidoresHmlPanel } from '@/components/kanban-dev/servidores-hml-panel'
import { araraFetchIndicadores, carregarDescricaoCompleta, carregarOrigem, kanbanDevApi, type OrigemPacote, type Versao, type Reprovacao } from '@/lib/api/kanban-dev'
import { arara, araraFetch } from '@/lib/arara/client'
import { Lock, LockOpen } from 'lucide-react'

const FLUXO_TRAVADO_KEY = 'kanban-dev-fluxo-travado'

type Card = {
  id: string
  ticket_number?: string | null
  title?: string | null
  status: DevStatus
  priority?: string | null
  category?: string | null
  /** Todos os tipos do card; `category` é o principal. */
  categorias?: string[] | null
  company_name?: string | null
  origem_ticket_id?: string | null
  migrado?: boolean
  version?: string | null
  /** Slug do servidor HML (SGC standalone) enquanto em teste. */
  environment?: string | null
  previsao_entrega?: string | null
  esforco_entrega?: EsforcoEntrega | string | null
  /** Ordem manual da coluna (POST /tickets/reorder). */
  position?: number | null
  assignee?: { id: string; full_name?: string | null } | null
  created_at?: string
  description?: string | null
  pull_request_url?: string | null
  declaracoes?: { etapa: string; texto: string; autor?: string | null; em?: string }[]
  reprovacoes?: (Reprovacao & { autor?: string | null; em?: string })[]
  origem_numero?: string | null
  /** Chamado de origem, resolvido pelo servidor na leitura (onda 5). */
  origem?: {
    id: string
    ticket_number?: string | null
    status?: string | null
    source?: string | null
    sla?: { breached?: boolean; minutes_remaining?: number | null } | null
  } | null
}

/** Tipos do card: a lista nova, caindo para `category` nos cards antigos. */
function tiposDoCard(card: Card): string[] {
  if (card.categorias?.length) return card.categorias
  return card.category ? [card.category] : []
}

export default function KanbanDevPage() {
  const { user } = useAuth()
  const [cards, setCards] = useState<Card[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [verDescartados, setVerDescartados] = useState(false)
  // Indicadores do §23 — derivados do ActivityLog no servidor (GET
  // /dev/indicadores). O "desde" é deliberado: o histórico começa na virada,
  // e número sem essa nota parece medir o que nunca foi medido.
  const [indicadores, setIndicadores] = useState<{
    desde: string
    retrabalho_voltas: number
    origem: { de_chamado: number; internas: number }
    tempo_por_etapa: Record<string, { media_horas: number; amostras: number }>
  } | null>(null)
  const [movendo, setMovendo] = useState<{ card: Card; para: DevStatus } | null>(null)
  const [detalhe, setDetalhe] = useState<Card | null>(null)
  // Equipe elegível a responsável de desenvolvimento: developer+.
  const [devs, setDevs] = useState<{ id: string; nome: string }[]>([])
  // Quem pode ser RESPONSÁVEL no filtro: suporte para cima. `devs` continua
  // developer+ porque é a lista de quem pode assumir o desenvolvimento.
  const [pessoas, setPessoas] = useState<{ id: string; nome: string }[]>([])
  const [criando, setCriando] = useState(false)
  const [arrastando, setArrastando] = useState<Card | null>(null)
  const [avisoDrag, setAvisoDrag] = useState('')
  // 6px de tolerância: sem isso todo clique nos botões do card vira arrasto.
  const sensores = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  // A régua de quem MOVE — espelho da regra do servidor, só para desabilitar botão.
  const podeMover = hasMinRole(user?.roles?.[0], 'developer')

  // Admin+ vê o cadeado: padrão LIGADO (fluxo coluna a coluna). Descadear
  // libera saltos no quadro — o servidor também aceita salto de admin.
  const { nivel } = useMeuAcesso()
  const souAdmin = hasMinLevel(nivel ?? 'user', 'admin')
  const [fluxoTravado, setFluxoTravado] = useState(true)
  useEffect(() => {
    if (typeof window === 'undefined' || !souAdmin) return
    const v = sessionStorage.getItem(FLUXO_TRAVADO_KEY)
    if (v === '0') setFluxoTravado(false)
    if (v === '1') setFluxoTravado(true)
  }, [souAdmin])
  const alternarCadeado = () => {
    setFluxoTravado((atual) => {
      const prox = !atual
      if (typeof window !== 'undefined') sessionStorage.setItem(FLUXO_TRAVADO_KEY, prox ? '1' : '0')
      return prox
    })
  }
  const fluxoLivre = souAdmin && !fluxoTravado

  const carregar = useCallback(() => {
    kanbanDevApi.listar()
      .then((r) => {
        const lista = ((r.tickets || []) as unknown as Card[]).map((c) =>
          // Coluna Em Revisão removida: cards legados aparecem em Dev Finalizado
          // até a primeira movimentação (shim no servidor) ou a migração.
          (c.status as string) === 'em_revisao'
            ? { ...c, status: 'desenvolvimento_finalizado' as DevStatus }
            : c,
        )
        setCards(lista)
      })
      .catch((e) => setErro(e.message))
      .finally(() => setCarregando(false))
  }, [])
  useEffect(() => { carregar() }, [carregar])
  useEffect(() => {
    araraFetchIndicadores().then(setIndicadores).catch(() => {})
    arara.profiles()
      .then((p) => {
        setPessoas(
          ((p.data || []) as Record<string, unknown>[])
            .filter((pr) => hasMinRole(pr.role, 'support'))
            .map((pr) => ({ id: String(pr.id), nome: String(pr.full_name || pr.fullName || pr.name || pr.email || 'Sem nome') }))
            .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
        )
        return p
      })
      .then((p) => setDevs(
        ((p.data || []) as Record<string, unknown>[])
          .filter((pr) => hasMinRole(pr.role, 'developer'))
          .map((pr) => ({
            id: String(pr.id),
            nome: String(pr.full_name || pr.fullName || pr.name || pr.email || 'Dev'),
          })),
      ))
      .catch(() => {})
  }, [user?.id])

  // ── Filtros (pedido de 11/09/2026) ────────────────────────────────────────
  // Filtram os CARDS, não as colunas: o quadro continua inteiro e as contagens
  // do cabeçalho de cada coluna passam a refletir o recorte — é o que diz se o
  // filtro pegou alguma coisa.
  // Combináveis e guardados na URL (onda 6, item 2.4): recarregar ou mandar o
  // link mantém o recorte. Lido do endereço uma vez, na montagem — ler durante
  // a renderização quebraria o export estático.
  const [filtros, setFiltrosEstado] = useState<FiltrosDev>(FILTROS_VAZIOS)
  useEffect(() => {
    if (typeof window !== 'undefined') setFiltrosEstado(filtrosDaUrl(window.location.search))
  }, [])
  const setFiltros = useCallback((f: FiltrosDev) => {
    setFiltrosEstado(f)
    if (typeof window !== 'undefined') {
      const url = window.location.pathname + filtrosNaUrl(window.location.search, f) + window.location.hash
      window.history.replaceState(window.history.state, '', url)
    }
  }, [])

  const visiveis = useMemo(() => aplicarFiltros(cards, filtros), [cards, filtros])
  const filtrando = contarAtivos(filtros) > 0

  // ── Ordenação (onda 7, item 2.5) ──────────────────────────────────────────
  // Vale DENTRO de cada coluna e vive na URL como os filtros. "Manual" é a
  // ordem que a equipe montou arrastando (`position`); o resto é lente.
  const [ordenacao, setOrdenacaoEstado] = useState<OrdenacaoDev>(ORDENACAO_PADRAO)
  useEffect(() => {
    if (typeof window !== 'undefined') setOrdenacaoEstado(ordenacaoDaUrl(window.location.search))
  }, [])
  const setOrdenacao = useCallback((o: OrdenacaoDev) => {
    setOrdenacaoEstado(o)
    if (typeof window !== 'undefined') {
      const url = window.location.pathname + ordenacaoNaUrl(window.location.search, o) + window.location.hash
      window.history.replaceState(window.history.state, '', url)
    }
  }, [])
  // Time do responsável: o card não tem time; é o da pessoa (TeamMember).
  const [timePorPessoa, setTimePorPessoa] = useState<Map<string, string>>(new Map())
  const [temTimes, setTemTimes] = useState(false)
  useEffect(() => {
    kanbanDevApi.membrosDosTimes()
      .then((r) => {
        setTimePorPessoa(new Map((r.data || []).map((m) => [m.profile_id, m.team_name])))
        setTemTimes((r.times || 0) > 0)
      })
      .catch(() => {})
  }, [])
  const ctxOrdenacao = useMemo(() => ({ timePorPessoa }), [timePorPessoa])
  const manual = ordenacao.por === 'manual'

  const empresasDosCards = useMemo(
    () => Array.from(new Set(cards.map((c) => String(c.company_name || '').trim()).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [cards],
  )
  // Responsável que aparece em card mas não está na lista de pessoas (saiu da
  // equipe, papel mudou) continua filtrável.
  const pessoasFiltro = useMemo(() => {
    const vistos = new Map(pessoas.map((p) => [p.id, p]))
    for (const c of cards) {
      const a = c.assignee
      if (a?.id && !vistos.has(a.id)) vistos.set(a.id, { id: a.id, nome: String(a.full_name || 'Sem nome') })
    }
    return Array.from(vistos.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }, [pessoas, cards])

  const descartados = useMemo(() => cards.filter((c) => c.status === 'descartado'), [cards])

  // ── Drag-and-drop ──
  // Soltar numa coluna NÃO move na hora: abre o MESMO diálogo dos botões, que
  // pede o que a etapa exige — a máquina de estados do servidor continua sendo
  // a única verdade. O alvo é o primeiro status da coluna alcançável a partir
  // do status atual; se nenhum for, mostramos aonde o card PODE ir.
  const aoComecarArrasto = useCallback((e: DragStartEvent) => {
    setAvisoDrag('')
    setArrastando(cards.find((c) => c.id === String(e.active.id)) || null)
  }, [cards])

  const aoSoltar = useCallback((e: DragEndEvent) => {
    // Sempre pelo id do evento — `arrastando` em state pode estar stale se o
    // drop vier antes do re-render do dragStart (ASAP ia parar no card anterior).
    setArrastando(null)
    const card = cards.find((c) => c.id === String(e.active.id)) || null
    if (!card || !e.over) return
    const overId = String(e.over.id)
    // Soltou sobre OUTRO CARD: da mesma coluna é reordenação manual; de outra
    // coluna vale como soltar na coluna dele.
    let col = DEV_COLUNAS.find((c) => c.id === overId)
    if (!col && overId.startsWith('card:')) {
      const alvo = cards.find((c) => c.id === overId.slice(5))
      if (!alvo || alvo.id === card.id) return
      const colAlvo = DEV_COLUNAS.find((c) => c.statuses.includes(alvo.status))
      if (colAlvo && colAlvo.statuses.includes(card.status)) {
        if (!manual) {
          setAvisoDrag(`Ordenado por ${opcaoDe(ordenacao.por).label.toLowerCase()} — volte para "Manual" para reordenar arrastando.`)
          return
        }
        // Sequência inteira da coluna (sem filtro) na ordem manual atual; o
        // arrastado toma o lugar do alvo e as posições são regravadas 0..n.
        const daColuna = ordenarCards(cards.filter((c) => colAlvo.statuses.includes(c.status)), ORDENACAO_PADRAO)
        const nova = moverNaOrdem(daColuna.map((c) => c.id), card.id, alvo.id)
        const posicao = new Map(nova.map((id, i) => [id, i]))
        setCards((prev) => prev.map((c) => (posicao.has(c.id) ? { ...c, position: posicao.get(c.id)! } : c)))
        kanbanDevApi.reordenar(nova).catch((err) => {
          setAvisoDrag(`Não foi possível gravar a nova ordem: ${err instanceof Error ? err.message : String(err)}`)
          carregar()
        })
        return
      }
      col = colAlvo
    }
    if (!col || col.statuses.includes(card.status)) return
    const possiveis = DEV_TRANSICOES[card.status] || []
    // Com o cadeado aberto (só admin), a coluna alvo é a primeira status dela.
    const alvo = fluxoLivre
      ? col.statuses[0]
      : col.statuses.find((st) => possiveis.includes(st))
    if (!alvo) {
      setAvisoDrag(
        possiveis.length
          ? `${numeroDev(card.ticket_number)} não vai para ${col.titulo} daqui — pode ir para: ${possiveis.map((p) => DEV_LABELS[p]).join(', ')}.`
          : `${numeroDev(card.ticket_number)} está numa etapa final e não se move.`,
      )
      return
    }
    setMovendo({ card, para: alvo })
  }, [fluxoLivre, cards, manual, ordenacao.por, carregar])

  if (carregando) return <div className="p-6 text-sm text-muted-foreground">Carregando Kanban Dev…</div>
  if (erro) return <div className="m-6 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm">{erro}</div>

  return (
    <div className="flex flex-col overflow-hidden pt-14 lg:pt-0" style={{ height: '100dvh' }}>
      <main className="flex flex-1 min-h-0 flex-col overflow-hidden px-4">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 py-5">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Kanban Dev</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {cards.length - descartados.length} demandas · {descartados.length} descartadas
              {indicadores && (
                <>
                  {' '}· {indicadores.origem.internas} internas
                  {indicadores.retrabalho_voltas > 0 && <> · {indicadores.retrabalho_voltas} retrabalho{indicadores.retrabalho_voltas > 1 ? 's' : ''}</>}
                  {' '}· <span title="O histórico por etapa existe desde a virada do quadro — antes disso não havia registro para medir.">
                    dados desde {new Date(indicadores.desde + 'T12:00:00').toLocaleDateString('pt-BR')}
                  </span>
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {souAdmin && (
              <button
                type="button"
                onClick={alternarCadeado}
                title={fluxoTravado
                  ? 'Fluxo travado: arraste coluna a coluna. Clique para descadear.'
                  : 'Fluxo livre: pode saltar colunas. Clique para travar de novo.'}
                className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm ${
                  fluxoTravado
                    ? 'border-foreground/20 text-foreground hover:bg-muted'
                    : 'border-amber-500/50 bg-amber-500/10 text-amber-800 dark:text-amber-300'
                }`}
              >
                {fluxoTravado ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}
                {fluxoTravado ? 'Fluxo travado' : 'Descadeado'}
              </button>
            )}
            <button
              onClick={() => setVerDescartados((v) => !v)}
              className="rounded-md border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
            >
              {verDescartados ? 'Ocultar descartados' : `Descartados (${descartados.length})`}
            </button>
            {podeMover && (
              <button
                onClick={() => setCriando(true)}
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Nova demanda
              </button>
            )}
          </div>
        </div>

        {/* Filtros. Ficam acima do quadro e não dentro dele: recorte é decisão
            de quem olha, e some da vista assim que o quadro rola. */}
        <DevFilterBar
          filtros={filtros}
          onChange={setFiltros}
          empresas={empresasDosCards}
          pessoas={pessoasFiltro}
          total={cards.length}
          visiveis={visiveis.length}
        />
        <div className="mb-3 shrink-0">
          <DevSortBar ordenacao={ordenacao} onChange={setOrdenacao} temTimes={temTimes} />
        </div>

        {avisoDrag && (
          <div className="mb-2 shrink-0 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
            {avisoDrag}
          </div>
        )}
        <div className="flex flex-1 min-h-0 gap-3 overflow-hidden pb-4">
          <div className="flex-1 min-h-0 min-w-0 overflow-x-auto overflow-y-hidden">
            <div className="flex h-full gap-3">
              <DndContext sensors={sensores} onDragStart={aoComecarArrasto} onDragEnd={aoSoltar}>
              {DEV_COLUNAS.map((col) => {
                const doGrupo = ordenarCards(visiveis.filter((c) => col.statuses.includes(c.status)), ordenacao, ctxOrdenacao)
                return (
                  <ColunaDrop key={col.id} colId={col.id}>
                    <div className="flex items-center justify-between px-3 py-2.5">
                      <span className="text-sm font-semibold text-foreground">{col.titulo}</span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{doGrupo.length}</span>
                    </div>
                    <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-2">
                      {doGrupo.map((c) => (
                        <CartaoArrastavel key={c.id} card={c} habilitado={podeMover} alvoDeOrdem={manual && podeMover}>
                          <CardDev card={c} podeMover={podeMover} fluxoLivre={fluxoLivre} onAbrir={setDetalhe}
                            onMover={(para) => setMovendo({ card: c, para })} />
                        </CartaoArrastavel>
                      ))}
                    </div>
                  </ColunaDrop>
                )
              })}
              <DragOverlay>
                {arrastando && (
                  <div className="w-[260px] rotate-2 opacity-90">
                    <CardDev card={arrastando} podeMover={false} fluxoLivre={false} onMover={() => {}} />
                  </div>
                )}
              </DragOverlay>
              </DndContext>
              {verDescartados && (
                <div className="flex h-full w-[280px] shrink-0 flex-col rounded-lg bg-muted/20 opacity-75">
                  <div className="px-3 py-2.5 text-sm font-semibold text-muted-foreground">Descartados</div>
                  <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-2">
                    {descartados.map((c) => (
                      <CardDev key={c.id} card={c} podeMover={false} fluxoLivre={false} onAbrir={setDetalhe} onMover={() => {}} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          <ServidoresHmlPanel cards={cards} />
        </div>
      </main>

      {movendo && (
        <DialogoMover card={movendo.card} para={movendo.para}
          cards={cards}
          devs={devs} euId={user?.id || ''}
          onFechar={() => setMovendo(null)}
          onFeito={() => { setMovendo(null); carregar() }} />
      )}
      {detalhe && (
        <PainelDetalhe card={detalhe} devs={devs} onFechar={() => setDetalhe(null)}
          onAtualizado={carregar} />
      )}
      {criando && (
        <DialogoCriar onFechar={() => setCriando(false)}
          onFeito={() => { setCriando(false); carregar() }} />
      )}
    </div>
  )
}

// ── Prazo do card (onda 5) ────────────────────────────────────────────────────
/**
 * `YYYY-MM-DD` → `DD/MM/AAAA` pelo próprio texto. `new Date('2026-09-20')` é
 * meia-noite em UTC, e no Brasil a data aparecia como o dia ANTERIOR.
 */
function dataCurta(valor: string): string {
  const m = String(valor).match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : new Date(valor).toLocaleDateString('pt-BR')
}

function duracaoCurta(min: number): string {
  const a = Math.abs(min)
  if (a < 60) return `${a}m`
  if (a < 24 * 60) return `${Math.round(a / 60)}h`
  return `${Math.round(a / (24 * 60))}d`
}

/** Selo único de prazo: SLA do chamado de origem, previsão de sprint ou ASAP. */
function PrazoSelo({ card, vazio }: { card: Card; vazio?: string }) {
  const p = prazoDoCard(card)
  if (p.fonte === 'asap') {
    return (
      <span title="ASAP — entregar o mais cedo possível" className="rounded px-1.5 py-0.5 font-medium bg-sem-error text-sem-error-fg">
        ASAP
      </span>
    )
  }
  if (p.situacao === 'sem_prazo') {
    return vazio ? <span className="text-muted-foreground/70">{vazio}</span> : null
  }
  const cor =
    p.situacao === 'vencido' ? 'bg-sem-error text-sem-error-fg'
      : p.situacao === 'em_risco' ? 'bg-sem-warning text-sem-warning-fg'
        : 'bg-muted text-muted-foreground'
  const texto =
    p.fonte === 'sla'
      ? p.situacao === 'vencido'
        ? 'SLA vencido'
        : `SLA ${p.minutos !== null ? duracaoCurta(p.minutos) : ''}`.trim()
      : `prev. ${dataCurta(card.previsao_entrega || '')}${p.situacao === 'vencido' ? ' · atrasada' : ''}`
  const titulo =
    p.fonte === 'sla'
      ? `${SITUACAO_PRAZO_LABEL[p.situacao]} — SLA do chamado de origem`
      : `${SITUACAO_PRAZO_LABEL[p.situacao]} — previsão de entrega${card.esforco_entrega ? ` (${labelEsforco(card.esforco_entrega as EsforcoEntrega)})` : ''}`
  return <span title={titulo} className={`rounded px-1.5 py-0.5 font-medium ${cor}`}>{texto}</span>
}

function CardDev({ card, podeMover, fluxoLivre, onMover, onAbrir }: {
  card: Card; podeMover: boolean; fluxoLivre?: boolean; onMover: (para: DevStatus) => void; onAbrir?: (c: Card) => void
}) {
  const marcador = DEV_MARCADOR[card.status]
  const grafo = DEV_TRANSICOES[card.status] || []
  // Fluxo livre (admin descadeado): qualquer coluna do quadro + descartar se o grafo permitir.
  const listaDestinos: DevStatus[] = fluxoLivre
    ? [
        ...DEV_COLUNAS.flatMap((c) => c.statuses).filter((s) => s !== card.status),
        ...(grafo.includes('descartado') ? (['descartado'] as DevStatus[]) : []),
      ]
    : grafo
  const urgente = prazoDoCard(card).urgente
  return (
    <div
      onClick={onAbrir ? () => onAbrir(card) : undefined}
      className={`rounded-md border border-l-4 bg-background p-3 shadow-sm ${onAbrir ? 'cursor-pointer hover:border-primary/50' : ''} ${getPriorityBorder(card.priority || 'medium')} ${urgente ? 'ring-2 ring-red-500/50 bg-red-500/[0.06]' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs font-semibold text-muted-foreground">{numeroDev(card.ticket_number)}</span>
        {/* Um card pode ser bug E melhoria: mostra todos, não só o principal. */}
        <span className="flex flex-wrap justify-end gap-1">
          {tiposDoCard(card).map((t) => (
            <span key={t} className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">{t}</span>
          ))}
        </span>
      </div>
      <p className="mt-1 text-sm font-medium leading-snug text-foreground">{card.title}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
        {marcador && <span className={`rounded px-1.5 py-0.5 font-medium ${marcador.classe}`}>{marcador.texto}</span>}
        {card.migrado && <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-600 dark:text-amber-400">migrado</span>}
        {card.origem_ticket_id
          ? <span>de chamado</span>
          : <span className="rounded bg-muted px-1.5 py-0.5">interna</span>}
        {card.pull_request_url && (
          <a href={card.pull_request_url} target="_blank" rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="rounded bg-muted px-1.5 py-0.5 font-medium text-primary hover:underline">
            GitHub ↗
          </a>
        )}
        {card.version && <span>v{card.version}</span>}
        {card.environment && travaHml(card.status) && (
          <span className="rounded bg-primary/10 px-1.5 py-0.5 font-medium text-primary" title="Servidor HML">
            HML {labelServidorHml(card.environment)}
          </span>
        )}
        <PrazoSelo card={card} />
        {card.assignee?.full_name && <span className="truncate">· {card.assignee.full_name}</span>}
      </div>
      {podeMover && listaDestinos.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {listaDestinos.map((d) => (
            <button key={d} onClick={(e) => { e.stopPropagation(); onMover(d) }}
              className="rounded border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted">
              → {DEV_LABELS[d]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Diálogo de movimentação: pede o que a etapa exige; o servidor confere ────
// ── Reprovação estruturada (item 2.6 da documentação de melhorias) ───────────
function limparReprovacao(r: Reprovacao): Reprovacao {
  const t = (v?: string) => (v || '').trim()
  return {
    motivo: t(r.motivo),
    encontrado: t(r.encontrado),
    esperado: t(r.esperado),
    ...(t(r.observacoes) ? { observacoes: t(r.observacoes) } : {}),
    ...(t(r.orientacoes) ? { orientacoes: t(r.orientacoes) } : {}),
  }
}

function CampoReprovacao({ rotulo, obrigatorio, valor, onChange, placeholder, linhas }: {
  rotulo: string; obrigatorio?: boolean; valor: string; onChange: (v: string) => void
  placeholder: string; linhas: number
}) {
  return (
    <div>
      <label className="text-sm font-medium text-foreground">
        {rotulo}
        {obrigatorio ? ' *' : <span className="font-normal text-muted-foreground"> (opcional)</span>}
      </label>
      <textarea value={valor} onChange={(e) => onChange(e.target.value)} rows={linhas} placeholder={placeholder}
        className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm" />
    </div>
  )
}

function DialogoMover({ card, para, cards, devs, euId, onFechar, onFeito }: {
  card: Card; para: DevStatus; cards: Card[]; devs: { id: string; nome: string }[]; euId: string
  onFechar: () => void; onFeito: () => void
}) {
  const exige = { ...(DEV_EXIGE[para] || {}) }

  // Servidores livres = não ocupados por outro card em Pronto p/ Teste ou Em
  // Testes. O próprio card (se já tiver HML) continua selecionável.
  const servidoresLivres = useMemo(() => {
    const ocupados = new Set<string>()
    for (const c of cards) {
      if (c.id === card.id) continue
      if (!travaHml(c.status)) continue
      const env = String(c.environment || '').trim()
      if (env) ocupados.add(env)
    }
    return SERVIDORES_HML.filter((s) => !ocupados.has(s) || s === card.environment)
  }, [cards, card.id, card.environment])

  // Quadro de puxar trabalho: quem move assume por padrão; o card que já tem
  // responsável mantém o dele até alguém escolher diferente.
  const [responsavel, setResponsavel] = useState(card.assignee?.id || euId)
  const [declarado, setDeclarado] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [reprovacao, setReprovacao] = useState<Reprovacao>({ motivo: '', encontrado: '', esperado: '', observacoes: '', orientacoes: '' })
  const [evidencias, setEvidencias] = useState<File[]>([])
  // Movido mas com evidência que não subiu: o card já mudou de coluna, então o
  // botão vira "Fechar" em vez de deixar mover de novo.
  const [movido, setMovido] = useState(false)
  const [versao, setVersao] = useState(card.version || '')
  const [servidorHml, setServidorHml] = useState(
    ehServidorHml(card.environment) && servidoresLivres.includes(card.environment)
      ? card.environment
      : '',
  )
  const [linkGithub, setLinkGithub] = useState(card.pull_request_url || '')
  const [versoes, setVersoes] = useState<Versao[]>([])
  const [novaVersao, setNovaVersao] = useState('')
  const [esforco, setEsforco] = useState<EsforcoEntrega | ''>('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const previsaoPreview = esforco && esforcoValido(esforco) ? previsaoDeEsforco(esforco) : null

  useEffect(() => {
    if (exige.versao) kanbanDevApi.versoes.listar().then((r) => setVersoes(r.data || [])).catch(() => {})
  }, [exige.versao])

  const confirmar = async () => {
    setErro(''); setSalvando(true)
    try {
      let v = versao
      // Cadastro rápido (decisão 14): a lista padroniza, não bloqueia às 23h.
      if (exige.versao && !v && novaVersao.trim()) {
        const r = await kanbanDevApi.versoes.criar(novaVersao.trim())
        v = r.data.numero
      }
      const extras: Parameters<typeof kanbanDevApi.mover>[2] = {
        declaracao: exige.declaracao && declarado ? exige.declaracao : undefined,
        motivo: exige.motivo ? motivo.trim() : undefined,
        version: exige.versao ? v : undefined,
        environment: exige.servidorHml ? servidorHml : undefined,
        assigned_to: exige.responsavel ? responsavel : undefined,
        pull_request_url: exige.linkGithub ? linkGithub.trim() : undefined,
        reprovacao: exige.reprovacao ? limparReprovacao(reprovacao) : undefined,
      }
      if (exige.esforco && esforcoValido(esforco)) {
        extras.esforco_entrega = esforco
        extras.previsao_entrega = previsaoDeEsforco(esforco)
      }
      await kanbanDevApi.mover(card.id, para, extras)
      // Evidências sobem DEPOIS do mover, no próprio card. Se uma falhar, a
      // reprovação já está registrada — o QA só precisa reenviar o arquivo.
      const falhas: string[] = []
      for (const f of evidencias) {
        try {
          await anexarAoChamado(card.id, f)
        } catch (e) {
          falhas.push(`${f.name}: ${e instanceof Error ? e.message : String(e)}`)
        }
      }
      if (falhas.length) {
        setMovido(true)
        setErro(`Card movido, mas ${falhas.length === 1 ? 'uma evidência não subiu' : `${falhas.length} evidências não subiram`} — ${falhas.join('; ')}`)
        return
      }
      onFeito()
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setSalvando(false)
    }
  }

  const pronto =
    (!exige.responsavel || !!responsavel) &&
    (!exige.linkGithub || linkGithub.trim() || card.migrado) &&
    (!exige.declaracao || declarado || card.migrado) &&
    (!exige.motivo || motivo.trim() || card.migrado) &&
    (!exige.versao || versao || novaVersao.trim() || card.migrado) &&
    (!exige.servidorHml || ehServidorHml(servidorHml) || card.migrado) &&
    (!exige.esforco || esforcoValido(esforco) || card.migrado) &&
    (!exige.reprovacao || card.migrado ||
      (reprovacao.motivo.trim() && reprovacao.encontrado.trim() && reprovacao.esperado.trim()))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onFechar}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg border bg-background p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-semibold text-foreground">
          {numeroDev(card.ticket_number)} → {DEV_LABELS[para]}
        </h2>
        {exige.qa && <p className="mt-1 text-xs text-muted-foreground">Esta etapa exige a permissão de QA.</p>}

        {exige.esforco && (
          <div className="mt-4">
            <label className="text-sm font-medium text-foreground">Prazo / esforço *</label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Sprint = 2 semanas (terça → sexta meio-dia). A opção define a data de entrega.
            </p>
            <div className="mt-2 space-y-1.5">
              {ESFORCO_OPCOES.map((op) => (
                <label key={op.value} className={`flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm ${esforco === op.value ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}>
                  <input
                    type="radio"
                    name="esforco"
                    className="mt-0.5"
                    checked={esforco === op.value}
                    onChange={() => setEsforco(op.value)}
                  />
                  <span>
                    <span className="font-medium text-foreground">{op.label}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{op.ajuda}</span>
                  </span>
                </label>
              ))}
            </div>
            {esforco === 'asap' && (
              <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">Sem data — o card fica destacado como urgente.</p>
            )}
            {previsaoPreview && (
              <p className="mt-2 text-xs text-muted-foreground">
                Entrega até <strong className="text-foreground">{dataCurta(previsaoPreview)}</strong> às 12:00.
              </p>
            )}
            {esforco === 'indeterminado' && (
              <p className="mt-2 text-xs text-muted-foreground">Sem data de entrega.</p>
            )}
          </div>
        )}

        {exige.responsavel && (
          <div className="mt-4">
            <label className="text-sm font-medium text-foreground">Responsável pelo desenvolvimento</label>
            <select value={responsavel} onChange={(e) => setResponsavel(e.target.value)}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm">
              {devs.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nome}{d.id === euId ? ' (eu)' : ''}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              Quem move assume por padrão — troque se estiver puxando para outra pessoa.
            </p>
          </div>
        )}
        {exige.linkGithub && (
          <div className="mt-4">
            <label className="text-sm font-medium text-foreground">Link do GitHub (branch ou Pull Request)</label>
            <input value={linkGithub} onChange={(e) => setLinkGithub(e.target.value)}
              placeholder="https://github.com/araratec/…/pull/123"
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm" />
            <p className="mt-1 text-xs text-muted-foreground">Branch ou Pull Request desta entrega.</p>
          </div>
        )}
        {exige.servidorHml && (
          <div className="mt-4">
            <label className="text-sm font-medium text-foreground">Servidor HML *</label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Em qual homologação o código foi publicado? Só aparecem servidores livres.
            </p>
            <select
              value={servidorHml}
              onChange={(e) => setServidorHml(e.target.value)}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="">— escolher servidor —</option>
              {servidoresLivres.map((s) => (
                <option key={s} value={s}>{labelServidorHml(s)}</option>
              ))}
            </select>
            {servidoresLivres.length === 0 && (
              <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">
                Todos os servidores HML estão ocupados. Liberte um saindo de Pronto p/ Teste ou Em Testes.
              </p>
            )}
          </div>
        )}
        {exige.declaracao && (
          <label className="mt-4 flex items-start gap-2 text-sm text-foreground">
            <input type="checkbox" checked={declarado} onChange={(e) => setDeclarado(e.target.checked)} className="mt-0.5" />
            <span>{exige.declaracao}<br />
              <span className="text-xs text-muted-foreground">Fica registrado no histórico com seu nome e a hora.</span></span>
          </label>
        )}
        {exige.motivo && (
          <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3}
            placeholder={para === 'descartado' ? 'Motivo — ele volta para o atendente responder ao cliente' : 'O que precisa ser corrigido — é o que o desenvolvedor vai ler'}
            className="mt-4 w-full rounded-md border bg-background px-3 py-2 text-sm" />
        )}
        {exige.reprovacao && (
          <div className="mt-4 space-y-3">
            <CampoReprovacao rotulo="Motivo da reprovação" obrigatorio linhas={2}
              placeholder="Em uma frase: por que não passou"
              valor={reprovacao.motivo} onChange={(v) => setReprovacao({ ...reprovacao, motivo: v })} />
            <CampoReprovacao rotulo="Comportamento encontrado" obrigatorio linhas={3}
              placeholder="O que aconteceu, com os passos para reproduzir"
              valor={reprovacao.encontrado} onChange={(v) => setReprovacao({ ...reprovacao, encontrado: v })} />
            <CampoReprovacao rotulo="Comportamento esperado" obrigatorio linhas={2}
              placeholder="O que deveria ter acontecido"
              valor={reprovacao.esperado} onChange={(v) => setReprovacao({ ...reprovacao, esperado: v })} />
            <CampoReprovacao rotulo="Orientações para correção" linhas={2}
              placeholder="Pista de onde mexer, se você souber"
              valor={reprovacao.orientacoes || ''} onChange={(v) => setReprovacao({ ...reprovacao, orientacoes: v })} />
            <CampoReprovacao rotulo="Observações" linhas={2}
              placeholder="Ambiente, dados usados, o que mais ajudar"
              valor={reprovacao.observacoes || ''} onChange={(v) => setReprovacao({ ...reprovacao, observacoes: v })} />
            <div>
              <label className="text-sm font-medium text-foreground">
                Evidências <span className="font-normal text-muted-foreground">(opcional)</span>
              </label>
              <input type="file" multiple accept={ANEXO_ACCEPT}
                onChange={(e) => setEvidencias(Array.from(e.target.files || []))}
                className="mt-1 block w-full text-sm text-muted-foreground" />
              <p className="mt-1 text-xs text-muted-foreground">
                Prints, vídeo curto ou arquivo — até {ANEXO_MAX_MB} MB cada. Ficam anexados ao próprio card.
              </p>
            </div>
          </div>
        )}
        {exige.versao && (
          <div className="mt-4 space-y-2">
            <select value={versao} onChange={(e) => setVersao(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm">
              <option value="">— escolher versão —</option>
              {versoes.map((v) => <option key={v.id} value={v.numero}>{v.numero}</option>)}
            </select>
            <input value={novaVersao} onChange={(e) => { setNovaVersao(e.target.value); setVersao('') }}
              placeholder="…ou cadastrar nova (ex.: 2.7.2)"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
          </div>
        )}

        {erro && <p className="mt-3 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">{erro}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onFechar} className="rounded-md border px-3 py-1.5 text-sm">Cancelar</button>
          <button onClick={movido ? onFeito : confirmar} disabled={!movido && (!pronto || salvando)}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50">
            {movido ? 'Fechar' : salvando ? 'Movendo…' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Demanda que nasce no Dev (decisão 16) ────────────────────────────────────
function DialogoCriar({ onFechar, onFeito }: { onFechar: () => void; onFeito: () => void }) {
  const [titulo, setTitulo] = useState('')
  // Seleção MÚLTIPLA (18/09/2026): a mesma tela costuma render melhoria e bug
  // juntos, e separar em dois cards espalha a conversa.
  const [tipos, setTipos] = useState<('desenvolvimento' | 'bug' | 'melhoria')[]>(['melhoria'])
  const [descricao, setDescricao] = useState('')
  const [prioridade, setPrioridade] = useState('medium')
  const [empresaId, setEmpresaId] = useState('')
  const [arquivos, setArquivos] = useState<File[]>([])
  const [recusados, setRecusados] = useState<string[]>([])
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  // Criado, mas com arquivo que não subiu: o card já existe, então o botão vira
  // "Fechar" em vez de deixar criar de novo (item 2.1).
  const [criado, setCriado] = useState(false)

  // Só o cadastro real: as "empresas" nascidas do texto livre de chamados antigos
  // são a origem da duplicação e não podem ser oferecidas para escolha.
  const { cadastradas, loading: carregandoEmpresas } = useCompanies()
  const empresas = [...cadastradas].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))

  const escolherArquivos = (lista: FileList | null) => {
    const aceitos: File[] = []
    const fora: string[] = []
    for (const f of Array.from(lista || [])) {
      const motivo = motivoRecusaAnexo(f)
      if (motivo) fora.push(`${f.name}: ${motivo}`)
      else aceitos.push(f)
    }
    setArquivos((atual) => [...atual, ...aceitos])
    setRecusados(fora)
  }

  const confirmar = async () => {
    setErro(''); setSalvando(true)
    try {
      const r = await kanbanDevApi.criar({
        title: titulo.trim(),
        tipos,
        description: descricao.trim() || undefined,
        priority: prioridade,
        company_id: empresaId || undefined,
      })
      const cardId = String((r.data as { id?: unknown })?.id || '')
      // Arquivos sobem DEPOIS de o card existir: anexo precisa do id. Se um
      // falhar, a demanda já está criada — avisa qual arquivo, não desfaz.
      const falhas: string[] = []
      if (cardId) {
        for (const f of arquivos) {
          try {
            await anexarAoChamado(cardId, f)
          } catch (e) {
            falhas.push(`${f.name}: ${e instanceof Error ? e.message : String(e)}`)
          }
        }
      }
      if (falhas.length) {
        setCriado(true)
        setErro(`Demanda criada, mas ${falhas.length === 1 ? 'um arquivo não subiu' : `${falhas.length} arquivos não subiram`} — ${falhas.join('; ')}. Anexe de novo pelo painel do card.`)
        return
      }
      onFeito()
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onFechar}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg border bg-background p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-semibold text-foreground">Nova demanda</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Nasce no Dev, sem chamado de origem. Demanda que veio de um cliente pelo
          Suporte deve ser escalada de lá — assim o chamado acompanha o card.
        </p>

        <label className="mt-4 block text-sm font-medium text-foreground">Título *</label>
        <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="O que precisa ser feito"
          className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm" />

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {(['desenvolvimento', 'bug', 'melhoria'] as const).map((t) => {
            const marcado = tipos.includes(t)
            return (
              <button key={t} type="button" aria-pressed={marcado}
                onClick={() => setTipos(marcado ? tipos.filter((x) => x !== t) : [...tipos, t])}
                className={`rounded-md border px-3 py-1.5 text-sm capitalize ${marcado ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground'}`}>
                {t}
              </button>
            )
          })}
          <span className="text-xs text-muted-foreground">pode marcar mais de um</span>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-foreground">
              Empresa <span className="font-normal text-muted-foreground">(opcional)</span>
            </label>
            <select value={empresaId} onChange={(e) => setEmpresaId(e.target.value)} disabled={carregandoEmpresas}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm disabled:opacity-50">
              <option value="">{carregandoEmpresas ? 'Carregando…' : 'Sem empresa (interna)'}</option>
              {empresas.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Prioridade</label>
            <select value={prioridade} onChange={(e) => setPrioridade(e.target.value)}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm">
              {PRIORITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>

        <label className="mt-3 block text-sm font-medium text-foreground">Descrição</label>
        <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3}
          placeholder="Obrigatória para sair do Backlog"
          className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm" />

        <div className="mt-3">
          <label className="text-sm font-medium text-foreground">
            Arquivos <span className="font-normal text-muted-foreground">(opcional)</span>
          </label>
          <input type="file" multiple accept={ANEXO_ACCEPT}
            onChange={(e) => { escolherArquivos(e.target.files); e.target.value = '' }}
            className="mt-1 block w-full text-sm text-muted-foreground" />
          <p className="mt-1 text-xs text-muted-foreground">
            Prints, documentos, planilhas, scripts ou vídeo curto — até {ANEXO_MAX_MB} MB cada.
          </p>
          {arquivos.length > 0 && (
            <ul className="mt-2 space-y-1">
              {arquivos.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-2 py-1 text-xs">
                  <span className="truncate">{f.name}</span>
                  <button type="button" onClick={() => setArquivos((a) => a.filter((_, k) => k !== i))}
                    className="shrink-0 text-muted-foreground hover:text-foreground" aria-label={`Tirar ${f.name}`}>✕</button>
                </li>
              ))}
            </ul>
          )}
          {recusados.length > 0 && (
            <p className="mt-2 text-xs text-destructive">Não entram: {recusados.join('; ')}</p>
          )}
        </div>

        {erro && <p className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{erro}</p>}
        <div className="mt-5 flex justify-end gap-2">
          {!criado && <button onClick={onFechar} className="rounded-md border px-3 py-1.5 text-sm">Cancelar</button>}
          <button onClick={criado ? onFeito : confirmar} disabled={!criado && (!titulo.trim() || tipos.length === 0 || salvando)}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50">
            {criado ? 'Fechar' : salvando ? (arquivos.length ? 'Criando e enviando…' : 'Criando…') : 'Criar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Auxiliares do drag-and-drop ──────────────────────────────────────────────
function ColunaDrop({ colId, children }: { colId: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: colId })
  return (
    <div ref={setNodeRef}
      className={`flex h-full w-[280px] shrink-0 flex-col rounded-lg transition-colors ${isOver ? 'bg-primary/10 ring-1 ring-primary/40' : 'bg-muted/40'}`}>
      {children}
    </div>
  )
}

function CartaoArrastavel({ card, habilitado, alvoDeOrdem, children }: {
  card: Card; habilitado: boolean
  /** Em ordem Manual o card também é ALVO: soltar outro card sobre ele reordena. */
  alvoDeOrdem: boolean
  children: React.ReactNode
}) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: card.id, disabled: !habilitado,
  })
  const { setNodeRef: setAlvoRef, isOver } = useDroppable({ id: `card:${card.id}`, disabled: !alvoDeOrdem })
  return (
    <div ref={setAlvoRef} className={isOver && alvoDeOrdem ? 'rounded-lg ring-2 ring-primary/50' : undefined}>
      <div ref={setNodeRef} {...attributes} {...listeners}
        className={isDragging ? 'opacity-40' : habilitado ? 'cursor-grab active:cursor-grabbing' : undefined}>
        {children}
      </div>
    </div>
  )
}

// ── Detalhe do card ──────────────────────────────────────────────────────────
// Painel do PRÓPRIO quadro, de propósito: a tela de detalhe do Suporte oferece
// as ações daquele quadro (Em Atendimento, Resolvido…), que corromperiam o
// estado de um card Dev. Aqui é leitura + o link para o chamado de origem.
function PainelDetalhe({ card, devs, onFechar, onAtualizado }: {
  card: Card; devs: { id: string; nome: string }[]
  onFechar: () => void; onAtualizado: () => void
}) {
  // Branch/PR editável AQUI, a qualquer momento — não só na transição para
  // Dev Finalizado, onde o link passa a ser obrigatório.
  const { user: usuarioPainel } = useAuth()
  // Mesma régua para as duas edições do painel (link do PR e responsável):
  // quem move o card no quadro Dev é developer+.
  const podeEditar = hasMinRole(usuarioPainel?.roles?.[0], 'developer')
  const [linkEdit, setLinkEdit] = useState(card.pull_request_url || '')
  const [salvandoLink, setSalvandoLink] = useState(false)
  const [linkSalvo, setLinkSalvo] = useState(card.pull_request_url || '')
  const salvarLink = async () => {
    setSalvandoLink(true)
    try {
      await araraFetch.put(`/api/tickets/${card.id}`, { pull_request_url: linkEdit.trim() || null })
      setLinkSalvo(linkEdit.trim())
      card.pull_request_url = linkEdit.trim() || null
    } finally {
      setSalvandoLink(false)
    }
  }
  // Responsável editável AQUI. Antes só dava para escolher dentro do diálogo de
  // mover, e mesmo assim apenas nas transições que EXIGEM responsável — então
  // trocar o dono de um card parado dependia de movê-lo, que é justamente o que
  // não se quer fazer. Usa a rota dedicada `/assign` e não um PUT cru: é ela que
  // notifica quem recebeu o card.
  const [responsavelAtual, setResponsavelAtual] = useState(card.assignee?.id || '')
  const [salvandoResp, setSalvandoResp] = useState(false)
  const [erroResp, setErroResp] = useState('')
  // `devs` traz só developer+. Se o card estiver com alguém de fora dessa régua
  // (veio do Suporte, ou a pessoa mudou de papel depois), o seletor mostraria
  // vazio e a primeira troca apagaria o dono sem ninguém perceber. Então o
  // responsável atual entra na lista, mesmo fora da régua.
  const opcoes = card.assignee && !devs.some((d) => d.id === card.assignee!.id)
    ? [{ id: card.assignee.id, nome: card.assignee.full_name || 'Responsável atual' }, ...devs]
    : devs

  const trocarResponsavel = async (novo: string) => {
    const anterior = responsavelAtual
    setResponsavelAtual(novo)
    setSalvandoResp(true)
    setErroResp('')
    try {
      await araraFetch.post(`/api/tickets/${card.id}/assign`, { assignee_id: novo || null })
      const achado = opcoes.find((d) => d.id === novo)
      card.assignee = novo ? { id: novo, full_name: achado?.nome ?? null } : null
      onAtualizado()
    } catch (e) {
      // Volta ao que era: deixar o seletor mostrando um dono que o servidor
      // recusou é pior do que não ter trocado.
      setResponsavelAtual(anterior)
      setErroResp(e instanceof Error ? e.message : 'Não foi possível trocar o responsável.')
    } finally {
      setSalvandoResp(false)
    }
  }

  // O atendimento vem PARA CÁ: o dev lê evidências, mensagens e anexos sem
  // trocar de página. O link para o Suporte vira atalho, não caminho.
  const [origem, setOrigem] = useState<OrigemPacote | null>(null)
  const [carregandoOrigem, setCarregandoOrigem] = useState(false)
  useEffect(() => {
    if (!card.origem_ticket_id) return
    setCarregandoOrigem(true)
    carregarOrigem(card.origem_ticket_id)
      .then(setOrigem)
      .finally(() => setCarregandoOrigem(false))
  }, [card.origem_ticket_id])

  // Anexos do PRÓPRIO card (onda 2): evidência de teste, script, documento de
  // homologação. Os do chamado de origem continuam abaixo, só leitura.
  // Comentários do PRÓPRIO card (onda 4): análise, testes, pendências. Só os
  // internos — a cópia ao cliente mora no chamado de origem, não aqui.
  const [comentariosCard, setComentariosCard] = useState<InternalComment[]>([])
  const carregarComentarios = useCallback(() => {
    kanbanDevApi.mensagens(card.id)
      .then((r) => setComentariosCard((Array.isArray(r.data) ? r.data : []).filter((m) => m.is_internal)))
      .catch(() => setComentariosCard([]))
  }, [card.id])
  useEffect(() => { carregarComentarios() }, [carregarComentarios])

  const [anexosCard, setAnexosCard] = useState<AttachmentItem[]>([])
  useEffect(() => {
    kanbanDevApi.anexos(card.id)
      .then((r) => setAnexosCard(Array.isArray(r.data) ? r.data : []))
      .catch(() => setAnexosCard([]))
  }, [card.id])

  // A lista do quadro corta a descrição em 220 chars (performance). Aqui
  // buscamos o ticket completo pela rota própria — senão o painel mostra
  // só o trecho com "…" e parece que o campo não dá pra expandir.
  const [descricaoCompleta, setDescricaoCompleta] = useState<string | null>(null)
  const [carregandoDesc, setCarregandoDesc] = useState(true)
  useEffect(() => {
    let vivo = true
    setCarregandoDesc(true)
    setDescricaoCompleta(null)
    carregarDescricaoCompleta(card.id)
      .then((d) => { if (vivo) setDescricaoCompleta(d) })
      .catch(() => { if (vivo) setDescricaoCompleta(card.description || '') })
      .finally(() => { if (vivo) setCarregandoDesc(false) })
    return () => { vivo = false }
  }, [card.id, card.description])

  const textoDescricao = descricaoCompleta ?? card.description ?? ''

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onFechar}>
      <div className="h-full w-full max-w-2xl overflow-y-auto border-l bg-background p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-semibold text-muted-foreground">{numeroDev(card.ticket_number)}</span>
              <span className="rounded bg-muted px-2 py-0.5 text-xs">{DEV_LABELS[card.status]}</span>
              {card.migrado && <span className="rounded bg-amber-500/15 px-2 py-0.5 text-xs text-amber-600 dark:text-amber-400">migrado</span>}
            </div>
            <h2 className="mt-1 text-lg font-semibold leading-snug text-foreground">{card.title}</h2>
          </div>
          <button onClick={onFechar} className="rounded-md border px-2 py-1 text-sm text-muted-foreground hover:bg-muted">✕</button>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          {tiposDoCard(card).length > 0 && (
            <><dt className="text-muted-foreground">{tiposDoCard(card).length > 1 ? 'Tipos' : 'Tipo'}</dt>
            <dd className="capitalize">{tiposDoCard(card).join(' · ')}</dd></>
          )}
          {card.priority && <><dt className="text-muted-foreground">Prioridade</dt><dd>{getPriorityLabel(card.priority)}</dd></>}
          {card.company_name && <><dt className="text-muted-foreground">Cliente</dt><dd>{card.company_name}</dd></>}
          <dt className="text-muted-foreground">Responsável</dt>
          <dd>
            {podeEditar ? (
              <>
                <select value={responsavelAtual} disabled={salvandoResp}
                  onChange={(e) => trocarResponsavel(e.target.value)}
                  className="w-full rounded-md border bg-background px-2 py-1 text-sm disabled:opacity-50">
                  <option value="">Sem responsável</option>
                  {opcoes.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
                </select>
                {erroResp && <p className="mt-1 text-xs text-destructive">{erroResp}</p>}
              </>
            ) : (
              card.assignee?.full_name || <span className="text-muted-foreground/70">Sem responsável</span>
            )}
          </dd>
          {card.version && <><dt className="text-muted-foreground">Versão</dt><dd>{card.version}</dd></>}
          {card.environment && (
            <><dt className="text-muted-foreground">Servidor HML</dt>
            <dd>{labelServidorHml(card.environment)}{travaHml(card.status) ? ' · ocupado' : ''}</dd></>
          )}
          {card.esforco_entrega && <><dt className="text-muted-foreground">Esforço</dt>
            <dd>{labelEsforco(card.esforco_entrega as EsforcoEntrega) || card.esforco_entrega}</dd></>}
          {card.previsao_entrega && <><dt className="text-muted-foreground">Previsão (interna)</dt>
            <dd>{dataCurta(card.previsao_entrega)}{String(card.previsao_entrega).includes('T12') || !String(card.previsao_entrega).includes('T') ? ' · 12:00' : ''}</dd></>}
          <dt className="text-muted-foreground">Prazo</dt>
          <dd><PrazoSelo card={card} vazio="Sem prazo" /></dd>
          {card.created_at && <><dt className="text-muted-foreground">Criado em</dt>
            <dd>{new Date(card.created_at).toLocaleDateString('pt-BR')}</dd></>}
        </dl>

        <div className="mt-4">
          <label className="text-xs font-medium uppercase text-muted-foreground">Branch / Pull Request no GitHub</label>
          {podeEditar ? (
            <div className="mt-1 flex gap-2">
              <input value={linkEdit} onChange={(e) => setLinkEdit(e.target.value)}
                placeholder="https://github.com/araratec/…"
                className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm" />
              <button onClick={salvarLink} disabled={salvandoLink || linkEdit.trim() === linkSalvo}
                className="shrink-0 rounded-md border px-3 py-2 text-sm disabled:opacity-50">
                {salvandoLink ? '…' : 'Salvar'}
              </button>
              {linkSalvo && (
                <a href={linkSalvo} target="_blank" rel="noreferrer"
                  className="flex shrink-0 items-center rounded-md border px-3 py-2 text-sm text-primary hover:bg-muted">↗</a>
              )}
            </div>
          ) : linkSalvo ? (
            <a href={linkSalvo} target="_blank" rel="noreferrer"
              className="mt-1 flex items-center justify-between rounded-md border px-3 py-2 text-sm text-primary hover:bg-muted">
              <span className="truncate">{linkSalvo}</span><span aria-hidden>↗</span>
            </a>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">Ainda sem link.</p>
          )}
        </div>
        {!card.origem_ticket_id && (
          <p className="mt-4 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
            Demanda interna — não veio de chamado.
          </p>
        )}

        {(carregandoDesc || textoDescricao) && (
          <div className="mt-4">
            <h3 className="text-sm font-semibold text-foreground">Descrição</h3>
            {carregandoDesc && !textoDescricao ? (
              <p className="mt-1 text-sm text-muted-foreground">Carregando descrição…</p>
            ) : (
              <p className="mt-1 whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-sm leading-relaxed text-foreground">
                {textoDescricao}
              </p>
            )}
          </div>
        )}

        {card.origem_ticket_id && (
          <div className="mt-5 border-t pt-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">
                Chamado de origem{origem?.ticket ? ` — ${String((origem.ticket as { ticket_number?: unknown }).ticket_number || '')}` : ''}
              </h3>
              <a href={`/admin/tickets/view/?id=${encodeURIComponent(card.origem_ticket_id)}`}
                target="_blank" rel="noreferrer"
                className="text-xs text-primary hover:underline">abrir no Suporte ↗</a>
            </div>
            {carregandoOrigem && <p className="mt-2 text-sm text-muted-foreground">Carregando atendimento…</p>}
            {origem && (
              <>
                {Boolean((origem.ticket as { description?: unknown } | null)?.description) && (
                  <div className="mt-2">
                    <h4 className="text-xs font-medium uppercase text-muted-foreground">Descrição do chamado</h4>
                    <p className="mt-1 whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-sm leading-relaxed">
                      {String((origem.ticket as { description?: unknown }).description)}
                    </p>
                  </div>
                )}
                {origem.anexos.length > 0 && (
                  <div className="mt-3">
                    <h4 className="text-xs font-medium uppercase text-muted-foreground">Anexos ({origem.anexos.length})</h4>
                    <div className="mt-1 space-y-2">
                      {origem.anexos.map((an) => {
                        // Anexos do sistema ANTIGO apontam para /uploads/… — o
                        // filesystem efêmero do deploy Next, perdido nos
                        // redeploys (dívida conhecida). O arquivo não existe
                        // mais; dizer isso é melhor que um ícone quebrado. Os
                        // atuais vêm embutidos (data:) e renderizam normal.
                        const perdido = an.url.startsWith('/uploads/')
                        if (perdido) {
                          return (
                            <div key={an.id}
                              className="flex items-center justify-between rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
                              <span className="truncate">{an.nome}</span>
                              <span className="shrink-0 text-xs">arquivo do sistema antigo — indisponível</span>
                            </div>
                          )
                        }
                        return an.tipo.startsWith('image/') && an.url ? (
                          <a key={an.id} href={an.url} target="_blank" rel="noreferrer" className="block">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={an.url} alt={an.nome}
                              className="max-h-56 rounded-md border object-contain"
                              onError={(e) => { e.currentTarget.style.display = 'none' }} />
                            <span className="mt-0.5 block text-xs text-muted-foreground">{an.nome}</span>
                          </a>
                        ) : (
                          <a key={an.id} href={an.url || undefined} target="_blank" rel="noreferrer"
                            className="flex items-center justify-between rounded-md border px-3 py-2 text-sm text-primary hover:bg-muted">
                            <span className="truncate">{an.nome}</span><span aria-hidden>↗</span>
                          </a>
                        )
                      })}
                    </div>
                  </div>
                )}
                {origem.mensagens.length > 0 && (
                  <div className="mt-3">
                    <h4 className="text-xs font-medium uppercase text-muted-foreground">Mensagens ({origem.mensagens.length})</h4>
                    <ul className="mt-1 max-h-72 space-y-2 overflow-y-auto pr-1">
                      {origem.mensagens.map((msg) => (
                        <li key={msg.id}
                          className={`rounded-md border p-2.5 text-sm ${msg.is_internal ? 'border-amber-500/30 bg-amber-500/5' : ''}`}>
                          <div className="text-xs text-muted-foreground">
                            {msg.sender_name || 'Sem nome'}
                            {msg.is_internal && <span className="ml-1.5 rounded bg-amber-500/15 px-1 py-0.5 text-[10px] text-amber-600 dark:text-amber-400">interna</span>}
                            {msg.created_at && <> · {new Date(msg.created_at).toLocaleString('pt-BR')}</>}
                          </div>
                          <p className="mt-0.5 whitespace-pre-wrap">{msg.message}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {!origem.anexos.length && !origem.mensagens.length && !(origem.ticket as { description?: unknown } | null)?.description && (
                  <p className="mt-2 text-sm text-muted-foreground">O chamado não tem descrição, mensagens nem anexos.</p>
                )}
              </>
            )}
          </div>
        )}

        <div className="mt-4">
          <TicketInternalComments
            ticketId={card.id}
            comments={comentariosCard}
            currentUserId={String(usuarioPainel?.id || '')}
            onChanged={carregarComentarios}
            copiaOrigem={card.origem_ticket_id ? { numero: card.origem_numero || card.ticket_number || '' } : null}
          />
        </div>

        <div className="mt-4">
          <TicketAttachments ticketId={card.id} attachments={anexosCard} />
        </div>

        {Array.isArray(card.reprovacoes) && card.reprovacoes.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-semibold text-foreground">Reprovações no teste</h3>
            <ul className="mt-1 space-y-2">
              {[...card.reprovacoes].reverse().map((r, i) => (
                <li key={i} className="rounded-md border p-3 text-sm">
                  {r.em && <div className="text-xs text-muted-foreground">{new Date(r.em).toLocaleString('pt-BR')}</div>}
                  <p className="mt-1 font-medium text-foreground">{r.motivo}</p>
                  <dl className="mt-2 space-y-1.5 text-xs">
                    {([
                      ['Encontrado', r.encontrado],
                      ['Esperado', r.esperado],
                      ['Orientações', r.orientacoes],
                      ['Observações', r.observacoes],
                    ] as const).filter(([, v]) => v).map(([rotulo, v]) => (
                      <div key={rotulo}>
                        <dt className="text-muted-foreground">{rotulo}</dt>
                        <dd className="whitespace-pre-wrap text-foreground">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </li>
              ))}
            </ul>
          </div>
        )}

        {Array.isArray(card.declaracoes) && card.declaracoes.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-semibold text-foreground">Declarações registradas</h3>
            <ul className="mt-1 space-y-2">
              {card.declaracoes.map((d, i) => (
                <li key={i} className="rounded-md border p-3 text-sm">
                  <div className="text-xs text-muted-foreground">
                    {DEV_LABELS[d.etapa as DevStatus] || d.etapa}
                    {d.em && <> · {new Date(d.em).toLocaleString('pt-BR')}</>}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap">{d.texto}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
