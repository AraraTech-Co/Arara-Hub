'use client'

// =============================================================================
// O Gantt do projeto — Entrega 3: desenha, lê e deixa planejar.
//
// Desenhado com CSS e posicionamento absoluto, SEM biblioteca de Gantt: barra,
// régua e seta são geometria simples, e uma biblioteca traria peso, tema
// próprio para domar e mais uma dependência num package.json que já tem 14
// pacotes presos em "latest".
//
// O ARRASTO usa eventos de ponteiro crus, e não o @dnd-kit que o portal já tem:
// aquele resolve "solte este cartão naquela coluna", e aqui o gesto é contínuo
// e em pixel, com encaixe em dia e dois pegadores de redimensionar. Ponteiro
// cru também dá suporte a toque de graça.
//
// A edição por CAMPO (o diálogo de planejamento) continua existindo e não é
// paliativo: é o caminho que funciona no celular, no teclado e para quem
// prefere digitar uma data a mirar um pixel.
// =============================================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { CalendarDays, Flag, Lock, TriangleAlert, Undo2 } from 'lucide-react'
import { projetosApi, type CardDoProjeto, type ProjetoDetalhe } from '@/lib/api/projetos'
import { ESCALA_LABELS, dataDoDia, diaDe, fimDeSemana, type Escala } from '@/lib/projetos-datas'
import { useGanttDatas } from '@/hooks/use-gantt-datas'
import { dataBR } from '@/lib/projetos'
import { numeroDev } from '@/lib/kanban-dev'
import { GanttEscala } from './gantt-escala'
import { GanttBarra, type ModoArrasto } from './gantt-barra'
import { GanttDependencias, type Seta } from './gantt-dependencias'
import { ALTURA_LINHA, AvisoSemData, GanttNome, tituloDaBarra } from './gantt-linha'

const ALTURA_CABECALHO = 52 // faixa de meses (24) + marcas (28)
const ALTURA_MARCOS = 26

type Arrasto = {
  ticketId: string
  modo: Exclude<ModoArrasto, 'ligar'>
  xInicial: number
  iniDia: number | null
  fimDia: number | null
  delta: number
}

type Ligacao = { origemId: string; x: number; y: number; xAtual: number; yAtual: number }

type Desfazer = { ticketId: string; inicio: string; fim: string; updated_at?: string; rotulo: string }

export function Gantt({
  projeto,
  podeMexerNoCard,
  podePlanejar,
  aoPlanejar,
  aoMudar,
}: {
  projeto: ProjetoDetalhe
  podeMexerNoCard: boolean
  podePlanejar: boolean
  aoPlanejar: (card: CardDoProjeto) => void
  aoMudar: () => void
}) {
  const [escala, setEscala] = useState<Escala>('semana')
  const rolagem = useRef<HTMLDivElement>(null)
  const corpo = useRef<HTMLDivElement>(null)
  const g = useGanttDatas(projeto, escala)

  const [arrasto, setArrasto] = useState<Arrasto | null>(null)
  const [ligacao, setLigacao] = useState<Ligacao | null>(null)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [desfazer, setDesfazer] = useState<Desfazer | null>(null)

  const irParaHoje = useCallback(() => {
    const el = rolagem.current
    if (!el) return
    // Hoje a um terço da esquerda: sobra passado à esquerda para contexto e
    // futuro à direita, que é para onde se olha.
    el.scrollTo({ left: Math.max(0, g.x(g.hoje) - el.clientWidth / 3), behavior: 'smooth' })
  }, [g])

  // Ao abrir, a régua já chega no dia de hoje — sem isso um projeto que começou
  // em maio abre mostrando maio, e ninguém quer saber de maio.
  useEffect(() => {
    const el = rolagem.current
    if (!el) return
    el.scrollLeft = Math.max(0, g.x(g.hoje) - el.clientWidth / 3)
    // Só na troca de escala: reposicionar a cada render brigaria com a rolagem
    // de quem está olhando.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [escala])

  // ── Gravação ───────────────────────────────────────────────────────────────
  const gravarDatas = useCallback(async (
    card: CardDoProjeto,
    inicio: string,
    fim: string,
    guardarDesfazer = true,
  ) => {
    setSalvando(true)
    setErro('')
    const antes = {
      inicio: String(card.inicio_planejado || ''),
      fim: String(card.previsao_entrega || ''),
    }
    try {
      const r = await projetosApi.cards.planejar(projeto.id, card.id, {
        inicio_planejado: inicio,
        previsao_entrega: fim,
        // O carimbo que a tela leu: se outra pessoa mexeu no meio, o servidor
        // responde 409 em vez de sobrescrever calado. É o cenário garantido de
        // um Gantt — duas pessoas planejando na mesma reunião.
        updated_at: card.updated_at,
      })
      if (guardarDesfazer) {
        setDesfazer({
          ticketId: card.id,
          inicio: antes.inicio,
          fim: antes.fim,
          updated_at: r.data?.updated_at,
          rotulo: numeroDev(card.ticket_number),
        })
      } else {
        setDesfazer(null)
      }
      aoMudar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível gravar as datas.')
      aoMudar()
    } finally {
      setSalvando(false)
    }
  }, [projeto.id, aoMudar])

  const desfazerUltimo = useCallback(async () => {
    if (!desfazer) return
    const card = projeto.cards.find((c) => c.id === desfazer.ticketId)
    if (!card) { setDesfazer(null); return }
    await gravarDatas(
      { ...card, updated_at: desfazer.updated_at || card.updated_at },
      desfazer.inicio,
      desfazer.fim,
      false,
    )
  }, [desfazer, projeto.cards, gravarDatas])

  // ── Arrasto das barras ─────────────────────────────────────────────────────
  const iniciarArrasto = useCallback((card: CardDoProjeto, modo: ModoArrasto, e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (modo === 'ligar') {
      const r = corpo.current?.getBoundingClientRect()
      if (!r) return
      setLigacao({
        origemId: card.id,
        x: e.clientX - r.left, y: e.clientY - r.top,
        xAtual: e.clientX - r.left, yAtual: e.clientY - r.top,
      })
      return
    }
    setArrasto({
      ticketId: card.id,
      modo,
      xInicial: e.clientX,
      iniDia: diaDe(card.inicio_planejado),
      fimDia: diaDe(card.previsao_entrega),
      delta: 0,
    })
  }, [])

  useEffect(() => {
    if (!arrasto && !ligacao) return

    function mover(e: PointerEvent) {
      if (arrasto) {
        // Encaixe em DIA inteiro: meio dia não existe no planejamento, e sem o
        // arredondamento a barra escorregaria um pixel a cada gesto.
        const delta = Math.round((e.clientX - arrasto.xInicial) / g.pxPorDia)
        if (delta !== arrasto.delta) setArrasto({ ...arrasto, delta })
        return
      }
      if (ligacao) {
        const r = corpo.current?.getBoundingClientRect()
        if (!r) return
        setLigacao({ ...ligacao, xAtual: e.clientX - r.left, yAtual: e.clientY - r.top })
      }
    }

    async function soltar(e: PointerEvent) {
      if (arrasto) {
        const atual = arrasto
        setArrasto(null)
        if (!atual.delta) return
        const card = projeto.cards.find((c) => c.id === atual.ticketId)
        if (!card) return
        const { inicio, fim } = aplicarDelta(atual)
        if (!inicio || !fim) return
        await gravarDatas(card, inicio, fim)
        return
      }
      if (ligacao) {
        const atual = ligacao
        setLigacao(null)
        const r = corpo.current?.getBoundingClientRect()
        if (!r) return
        const indice = Math.floor((e.clientY - r.top) / ALTURA_LINHA)
        const linha = g.linhas[indice]
        if (!linha || linha.tipo !== 'card' || linha.card.id === atual.origemId) return
        setSalvando(true)
        setErro('')
        try {
          await projetosApi.dependencias.criar(projeto.id, atual.origemId, linha.card.id)
          aoMudar()
        } catch (err) {
          setErro(err instanceof Error ? err.message : 'Não foi possível criar a dependência.')
        } finally {
          setSalvando(false)
        }
      }
    }

    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', soltar)
    return () => {
      window.removeEventListener('pointermove', mover)
      window.removeEventListener('pointerup', soltar)
    }
  }, [arrasto, ligacao, g, projeto.cards, projeto.id, gravarDatas, aoMudar])

  const removerDependencia = useCallback(async (id: string) => {
    setSalvando(true)
    setErro('')
    try {
      await projetosApi.dependencias.remover(projeto.id, id)
      aoMudar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível remover a dependência.')
    } finally {
      setSalvando(false)
    }
  }, [projeto.id, aoMudar])

  if (projeto.cards.length === 0 && projeto.fases.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-10 text-center">
        <CalendarDays className="w-8 h-8 mx-auto text-muted-foreground/50 mb-3" />
        <p className="text-sm text-muted-foreground">
          Sem fases e sem cards ainda — não há o que desenhar.
        </p>
      </div>
    )
  }

  const alturaCorpo = g.linhas.length * ALTURA_LINHA

  // Posições das barras já com o arrasto em curso aplicado — o desenho segue o
  // dedo, mas o servidor só é chamado ao soltar.
  const linhaDe: Record<string, number> = {}
  g.linhas.forEach((l, i) => { if (l.tipo === 'card') linhaDe[l.card.id] = i })

  function janelaDaLinha(i: number): { inicio: number | null; fim: number | null } {
    const l = g.linhas[i]
    if (!l) return { inicio: null, fim: null }
    if (l.tipo === 'card' && arrasto && arrasto.ticketId === l.card.id) {
      const d = aplicarDelta(arrasto)
      return { inicio: diaDe(d.inicio), fim: diaDe(d.fim) }
    }
    return { inicio: l.inicio ?? l.fim, fim: l.fim ?? l.inicio }
  }

  const setas: Seta[] = (projeto.dependencias || []).flatMap((dep) => {
    const io = linhaDe[dep.origem_ticket_id]
    const id = linhaDe[dep.destino_ticket_id]
    if (io === undefined || id === undefined) return []
    const o = janelaDaLinha(io)
    const d = janelaDaLinha(id)
    if (o.fim === null || d.inicio === null) return []
    return [{
      id: dep.id,
      xOrigem: g.x(o.fim) + g.pxPorDia,
      xDestino: g.x(d.inicio),
      linhaOrigem: io,
      linhaDestino: id,
    }]
  })

  return (
    <div className="space-y-3">
      {/* Controles + legenda */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-border overflow-hidden">
          {(Object.keys(ESCALA_LABELS) as Escala[]).map((e) => (
            <button
              key={e}
              onClick={() => setEscala(e)}
              className={`px-3 h-8 text-xs font-medium transition-colors ${
                escala === e
                  ? 'bg-indigo-600 text-white'
                  : 'bg-background text-foreground/70 hover:bg-muted'
              }`}
            >
              {ESCALA_LABELS[e]}
            </button>
          ))}
        </div>
        <button
          onClick={irParaHoje}
          className="h-8 px-3 rounded-lg border border-border text-xs font-medium text-foreground/70 hover:bg-muted"
        >
          Hoje
        </button>

        {desfazer && (
          <button
            onClick={desfazerUltimo}
            disabled={salvando}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border text-xs font-medium text-foreground/70 hover:bg-muted disabled:opacity-50"
          >
            <Undo2 className="w-3.5 h-3.5" />
            Desfazer {desfazer.rotulo}
          </button>
        )}
        {salvando && <span className="text-xs text-muted-foreground">salvando…</span>}

        <div className="flex items-center gap-4 text-[11px] text-muted-foreground ml-auto">
          <span className="inline-flex items-center gap-1">
            <span className="w-3 h-2 rounded-sm bg-indigo-500/70" /> no prazo
          </span>
          <span className="inline-flex items-center gap-1">
            <TriangleAlert className="w-3 h-3 text-red-500" /> atrasado
          </span>
          <span className="inline-flex items-center gap-1">
            <Lock className="w-3 h-3 text-red-500" /> bloqueado
          </span>
          <span className="inline-flex items-center gap-1">
            <Flag className="w-3 h-3 text-amber-500" /> marco
          </span>
        </div>
      </div>

      {erro && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
          {erro}
        </div>
      )}

      {g.semData.length > 0 && <AvisoSemData quantos={g.semData.length} />}

      <div className="rounded-xl border border-border bg-background overflow-hidden">
        <div className="flex">
          {/* Coluna fixa — nomes */}
          <div className="w-[15rem] sm:w-[20rem] shrink-0 border-r border-border">
            <div className="border-b border-border bg-background" style={{ height: ALTURA_CABECALHO }}>
              <div className="h-full flex items-end px-3 pb-1.5">
                <span className="text-[11px] font-medium text-muted-foreground">Fase / card</span>
              </div>
            </div>
            {g.marcos.length > 0 && (
              <div
                className="flex items-center px-3 border-b border-border bg-amber-500/5"
                style={{ height: ALTURA_MARCOS }}
              >
                <span className="text-[11px] font-medium text-amber-700 dark:text-amber-400">Marcos</span>
              </div>
            )}
            {g.linhas.map((l) => (
              <GanttNome
                key={l.chave}
                linha={l}
                onAbrir={l.tipo === 'card' && podeMexerNoCard ? () => aoPlanejar(l.card) : undefined}
              />
            ))}
          </div>

          {/* Linha do tempo — rola só aqui dentro; o corpo da página nunca rola na horizontal */}
          <div ref={rolagem} className="flex-1 overflow-x-auto">
            <div className="relative" style={{ width: g.larguraPx }}>
              <GanttEscala g={g} escala={escala} />

              {/* Marcos */}
              {g.marcos.length > 0 && (
                <div className="relative border-b border-border bg-amber-500/5" style={{ height: ALTURA_MARCOS }}>
                  {g.marcos.filter((m) => m.dia !== null).map((m) => (
                    <span
                      key={m.id}
                      title={`${m.nome} · ${dataBR(m.data)}${m.atingido_em ? ' · atingido' : ''}`}
                      className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2"
                      style={{ left: g.x(m.dia as number) + g.pxPorDia / 2 }}
                    >
                      <span
                        className={`block w-3 h-3 rotate-45 border ${
                          m.atingido_em
                            ? 'bg-emerald-500 border-emerald-600'
                            : 'bg-amber-400 border-amber-600'
                        }`}
                      />
                    </span>
                  ))}
                </div>
              )}

              {/* Corpo */}
              <div ref={corpo} className="relative" style={{ height: alturaCorpo }}>
                {/* Fundo: fim de semana também NO CORPO, não só na régua —
                    é o que deixa a escala de dia legível, e é onde o olho
                    procura "isso cai no sábado?". */}
                {escala === 'dia' && Array.from({ length: g.totalDias }, (_, i) => g.inicio + i)
                  .filter(fimDeSemana)
                  .map((d) => (
                    <div
                      key={`fdsb_${d}`}
                      className="absolute top-0 bottom-0 bg-muted/50"
                      style={{ left: g.x(d), width: g.pxPorDia }}
                    />
                  ))}
                {g.marcas.map((m) => (
                  <div
                    key={`v_${m.dia}`}
                    className={`absolute top-0 bottom-0 border-l ${m.forte ? 'border-border' : 'border-border/30'}`}
                    style={{ left: g.x(m.dia) }}
                  />
                ))}

                {/* Hoje */}
                {g.hoje >= g.inicio && g.hoje <= g.fim && (
                  <div
                    className="absolute top-0 bottom-0 w-px bg-red-500/70 z-[1]"
                    style={{ left: g.x(g.hoje) + g.pxPorDia / 2 }}
                    title="Hoje"
                  />
                )}

                {/* Barras */}
                {g.linhas.map((l, i) => {
                  const { inicio, fim } = janelaDaLinha(i)
                  const emArrasto = l.tipo === 'card' && arrasto?.ticketId === l.card.id
                  return (
                    <div
                      key={l.chave}
                      className={`absolute left-0 right-0 border-b border-border ${l.tipo === 'fase' ? 'bg-muted/40' : ''}`}
                      style={{ top: i * ALTURA_LINHA, height: ALTURA_LINHA }}
                    >
                      {inicio !== null && fim !== null && (
                        <GanttBarra
                          esquerda={g.x(inicio)}
                          largura={(fim - inicio + 1) * g.pxPorDia}
                          progresso={l.tipo === 'fase' ? (l.fase.progresso || 0) : (l.card.progresso_efetivo || 0)}
                          titulo={emArrasto
                            ? `${dataBR(dataDoDia(inicio))} → ${dataBR(dataDoDia(fim))}`
                            : tituloDaBarra(l)}
                          atrasado={l.tipo === 'card' && l.card.atrasado}
                          bloqueado={l.tipo === 'card' && l.bloqueado}
                          tipo={l.tipo}
                          arrastando={emArrasto}
                          onClick={l.tipo === 'card' && podeMexerNoCard && !arrasto
                            ? () => aoPlanejar(l.card)
                            : undefined}
                          aoIniciarArrasto={l.tipo === 'card' && podePlanejar
                            ? (modo, e) => iniciarArrasto(l.card, modo, e)
                            : undefined}
                        />
                      )}
                    </div>
                  )
                })}

                <GanttDependencias
                  setas={setas}
                  largura={g.larguraPx}
                  altura={alturaCorpo}
                  podeRemover={podePlanejar}
                  aoRemover={removerDependencia}
                />

                {/* Linha guia enquanto se puxa uma dependência */}
                {ligacao && (
                  <svg className="absolute top-0 left-0 pointer-events-none z-[25]" width={g.larguraPx} height={alturaCorpo}>
                    <line
                      x1={ligacao.x} y1={ligacao.y} x2={ligacao.xAtual} y2={ligacao.yAtual}
                      className="stroke-indigo-500" strokeWidth={2} strokeDasharray="4 3"
                    />
                  </svg>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {podePlanejar
          ? 'Arraste a barra para mover, as pontas para esticar, e o ponto da direita até outro card para criar dependência. Clicar abre o painel — o mesmo, para quem prefere digitar a data.'
          : 'Clique numa barra para ver e editar as datas pelo painel.'}
      </p>
    </div>
  )
}

/** Aplica o deslocamento do arrasto sobre as datas originais. */
function aplicarDelta(a: Arrasto): { inicio: string; fim: string } {
  let ini = a.iniDia
  let fim = a.fimDia
  if (a.modo === 'mover') {
    ini = ini === null ? null : ini + a.delta
    fim = fim === null ? null : fim + a.delta
  } else if (a.modo === 'inicio' && ini !== null) {
    ini = ini + a.delta
    // Não deixa o início passar do fim: uma barra invertida não é planejamento,
    // é erro de gesto. O servidor recusaria de qualquer forma.
    if (fim !== null && ini > fim) ini = fim
  } else if (a.modo === 'fim' && fim !== null) {
    fim = fim + a.delta
    if (ini !== null && fim < ini) fim = ini
  }
  return {
    inicio: ini === null ? '' : dataDoDia(ini),
    fim: fim === null ? '' : dataDoDia(fim),
  }
}
