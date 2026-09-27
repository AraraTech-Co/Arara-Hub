'use client'

// =============================================================================
// Planejamento de um card — datas, estimativa, fase e progresso.
//
// É a alternativa ao arrasto exigida pelo PRD, e não um paliativo: é o caminho
// que funciona no celular, no teclado e para quem prefere digitar uma data a
// mirar um pixel. O Gantt da entrega 3 arrasta as MESMAS datas.
//
// `previsao_entrega` é o fim planejado — o campo já existia no card desde a
// decisão 17 do Kanban Dev, e não ganhou um irmão gêmeo aqui.
// =============================================================================

import { useState } from 'react'
import { X, Trash2, Plus } from 'lucide-react'
import { projetosApi, type CardDoProjeto, type ProjetoDetalhe } from '@/lib/api/projetos'
import { dataCal } from '@/lib/projetos'
import { DEV_LABELS, numeroDev, type DevStatus } from '@/lib/kanban-dev'
import { PROGRESSO_POR_STATUS } from '@/lib/projetos'

export function PlanejarCardDialog({
  projeto,
  card,
  onFechar,
  onSalvo,
  aoAtualizar,
  podePlanejar = false,
}: {
  projeto: ProjetoDetalhe
  card: CardDoProjeto
  onFechar: () => void
  onSalvo: () => void
  /** Recarrega sem fechar — ligar/desligar dependência não é "terminei aqui". */
  aoAtualizar: () => void
  podePlanejar?: boolean
}) {
  const [inicio, setInicio] = useState(dataCal(card.inicio_planejado))
  const [fim, setFim] = useState(dataCal(card.previsao_entrega))
  const [horas, setHoras] = useState(
    card.estimativa_min ? String(Math.round((card.estimativa_min / 60) * 10) / 10) : '',
  )
  const [faseId, setFaseId] = useState(card.fase_id || '')
  const [manual, setManual] = useState(card.progresso !== null && card.progresso !== undefined)
  const [progresso, setProgresso] = useState(String(card.progresso ?? ''))
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [novaDep, setNovaDep] = useState('')

  const derivado = PROGRESSO_POR_STATUS[String(card.status || '')] ?? 0

  const depsDoCard = (projeto.dependencias || []).filter((d) => d.destino_ticket_id === card.id)
  const jaLigados = new Set(depsDoCard.map((d) => d.origem_ticket_id))
  // O próprio card e os que já são pré-requisito ficam fora da lista. Ciclo mais
  // longo (A→B→C→A) quem recusa é o servidor, com 409 — a tela só evita o óbvio.
  const candidatos = projeto.cards.filter((c) => c.id !== card.id && !jaLigados.has(c.id))

  /** Ação que fala com o servidor e recarrega — o erro dele aparece como veio. */
  async function acao(fn: () => Promise<unknown>) {
    setSalvando(true)
    setErro('')
    try {
      await fn()
      aoAtualizar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar.')
    } finally {
      setSalvando(false)
    }
  }

  async function salvar() {
    setErro('')
    if (inicio && fim && fim < inicio) { setErro('A previsão não pode ser anterior ao início.'); return }
    setSalvando(true)
    try {
      await projetosApi.cards.planejar(projeto.id, card.id, {
        inicio_planejado: inicio,
        previsao_entrega: fim,
        estimativa_min: horas ? Math.round(Number(horas) * 60) : 0,
        fase_id: faseId,
        progresso: manual ? Number(progresso || 0) : null,
        // Carimbo lido pela tela: se alguém alterou o card no meio, o servidor
        // devolve 409 em vez de sobrescrever calado.
        updated_at: card.updated_at,
      })
      onSalvo()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao salvar.')
    } finally {
      setSalvando(false)
    }
  }

  async function soltar() {
    if (!window.confirm(`Tirar ${numeroDev(card.ticket_number)} do projeto? O card continua no quadro Dev; as dependências dele neste projeto são apagadas.`)) return
    setSalvando(true)
    try {
      await projetosApi.cards.soltar(projeto.id, card.id)
      onSalvo()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao soltar o card.')
      setSalvando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-background shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div>
            <h2 className="font-semibold text-foreground text-sm">
              Planejamento · {numeroDev(card.ticket_number)}
            </h2>
            <p className="text-xs text-muted-foreground truncate max-w-[20rem]">{card.title}</p>
          </div>
          <button onClick={onFechar} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Início planejado</label>
              <input
                type="date" value={inicio} onChange={(e) => setInicio(e.target.value)}
                className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Previsão de entrega</label>
              <input
                type="date" value={fim} onChange={(e) => setFim(e.target.value)}
                className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Estimativa (horas)</label>
              <input
                type="number" min="0" step="0.5" value={horas} onChange={(e) => setHoras(e.target.value)}
                placeholder="4"
                className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Fase</label>
              <select
                value={faseId} onChange={(e) => setFaseId(e.target.value)}
                className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm"
              >
                <option value="">Sem fase</option>
                {projeto.fases.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            </div>
          </div>

          {/* Progresso: derivado por padrão, com escape manual. */}
          <div className="rounded-lg border border-border p-3">
            <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <input type="checkbox" checked={manual} onChange={(e) => setManual(e.target.checked)} />
              Definir o progresso à mão
            </label>
            {manual ? (
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="number" min="0" max="100" value={progresso}
                  onChange={(e) => setProgresso(e.target.value)}
                  className="h-9 w-24 rounded-lg border border-border bg-background px-3 text-sm"
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                Segue o status do quadro Dev: <strong className="text-foreground/80">
                  {DEV_LABELS[card.status as DevStatus] || card.status}</strong> = {derivado}%.
              </p>
            )}
          </div>

          {/* Dependências — o caminho por CAMPO. No Gantt dá para puxar de uma
              barra à outra; aqui dá para fazer o mesmo sem mirar pixel, e é o
              único caminho no celular. */}
          <div className="rounded-lg border border-border p-3">
            <p className="text-sm font-medium text-foreground mb-2">Depende de</p>
            {depsDoCard.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Nada — este card pode começar quando quiser.
              </p>
            ) : (
              <ul className="space-y-1.5 mb-2">
                {depsDoCard.map((d) => {
                  const origem = projeto.cards.find((c) => c.id === d.origem_ticket_id)
                  return (
                    <li key={d.id} className="flex items-center gap-2 text-xs">
                      <span className="font-mono text-muted-foreground">
                        {numeroDev(origem?.ticket_number)}
                      </span>
                      <span className="flex-1 truncate text-foreground/80">{origem?.title || '—'}</span>
                      {podePlanejar && (
                        <button
                          onClick={() => acao(() => projetosApi.dependencias.remover(projeto.id, d.id))}
                          className="text-muted-foreground hover:text-red-500"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
            {podePlanejar && (
              <div className="flex items-center gap-2">
                <select
                  value={novaDep}
                  onChange={(e) => setNovaDep(e.target.value)}
                  className="h-8 flex-1 rounded-lg border border-border bg-background px-2 text-xs"
                >
                  <option value="">Escolha o card que vem antes…</option>
                  {candidatos.map((c) => (
                    <option key={c.id} value={c.id}>
                      {numeroDev(c.ticket_number)} — {c.title}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => {
                    if (!novaDep) return
                    acao(async () => {
                      await projetosApi.dependencias.criar(projeto.id, novaDep, card.id)
                      setNovaDep('')
                    })
                  }}
                  disabled={!novaDep || salvando}
                  className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline disabled:opacity-40 dark:text-indigo-400"
                >
                  <Plus className="w-3 h-3" /> Ligar
                </button>
              </div>
            )}
          </div>

          {erro && <p className="text-sm text-red-600 dark:text-red-400">{erro}</p>}
        </div>

        <div className="flex items-center justify-between border-t border-border px-5 py-3">
          <button
            onClick={soltar}
            disabled={salvando}
            className="text-xs text-muted-foreground hover:text-red-500"
          >
            Tirar do projeto
          </button>
          <div className="flex gap-2">
            <button onClick={onFechar} className="px-4 py-2 text-sm text-foreground/70 hover:text-foreground">
              Cancelar
            </button>
            <button
              onClick={salvar}
              disabled={salvando}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg"
            >
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
