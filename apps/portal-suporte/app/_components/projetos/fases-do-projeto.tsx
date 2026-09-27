'use client'

// =============================================================================
// As fases do projeto e os cards dentro delas.
//
// DOIS EIXOS, e a tela precisa deixar isso óbvio: a FASE diz onde o card está
// no plano ("Backend"); o STATUS diz onde ele está na esteira do Dev ("Em
// Revisão"). São coisas diferentes — por isso a fase é o cabeçalho do grupo e o
// status é uma etiqueta dentro do card, nunca lado a lado como se fossem a
// mesma escala.
// =============================================================================

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronRight, Plus, Trash2, TriangleAlert, Pencil, Layers } from 'lucide-react'
import { projetosApi, type CardDoProjeto, type ProjetoDetalhe, type ProjetoFase } from '@/lib/api/projetos'
import { dataBR, duracaoBR } from '@/lib/projetos'
import { DEV_LABELS, numeroDev, type DevStatus } from '@/lib/kanban-dev'

export function FasesDoProjeto({
  projeto,
  podePlanejar,
  podeMexerNoCard,
  aoMudar,
  aoPlanejar,
}: {
  projeto: ProjetoDetalhe
  podePlanejar: boolean
  podeMexerNoCard: boolean
  aoMudar: () => void
  /** O diálogo de planejamento é do PAI: a lista e o Gantt abrem o mesmo. */
  aoPlanejar: (card: CardDoProjeto) => void
}) {
  const [fechadas, setFechadas] = useState<Record<string, boolean>>({})
  const [novaFase, setNovaFase] = useState('')
  const [criandoFase, setCriandoFase] = useState(false)
  const [erro, setErro] = useState('')

  const semFase = projeto.cards.filter((c) => !c.fase_id)

  async function criarFase() {
    if (!novaFase.trim()) return
    setCriandoFase(true)
    try {
      await projetosApi.fases.criar(projeto.id, { nome: novaFase.trim() })
      setNovaFase('')
      aoMudar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao criar a fase.')
    } finally {
      setCriandoFase(false)
    }
  }

  async function removerFase(f: ProjetoFase) {
    const quantos = projeto.cards.filter((c) => c.fase_id === f.id).length
    const aviso = quantos
      ? `Remover a fase "${f.nome}"? Os ${quantos} card(s) dela voltam para "sem fase" — nenhum card é apagado.`
      : `Remover a fase "${f.nome}"?`
    if (!window.confirm(aviso)) return
    try {
      await projetosApi.fases.remover(projeto.id, f.id)
      aoMudar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao remover a fase.')
    }
  }

  function grupo(titulo: string, chave: string, cards: CardDoProjeto[], fase?: ProjetoFase) {
    const aberta = !fechadas[chave]
    return (
      <div key={chave} className="rounded-xl border border-border bg-background overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <button
            onClick={() => setFechadas({ ...fechadas, [chave]: aberta })}
            className="text-muted-foreground hover:text-foreground"
          >
            {aberta ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          <h3 className="font-semibold text-foreground text-sm flex-1">
            {titulo}
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {cards.length} card(s)
            </span>
          </h3>
          {fase && (
            <>
              <div className="hidden sm:flex items-center gap-2 w-40">
                <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${fase.progresso || 0}%` }} />
                </div>
                <span className="text-xs text-muted-foreground w-9 text-right">{fase.progresso || 0}%</span>
              </div>
              <span className="hidden md:block text-xs text-muted-foreground">
                {dataBR(fase.inicio_efetivo)} → {dataBR(fase.fim_efetivo)}
              </span>
              {podePlanejar && (
                <button
                  onClick={() => removerFase(fase)}
                  title="Remover fase (os cards voltam para sem fase)"
                  className="text-muted-foreground hover:text-red-500"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </>
          )}
        </div>

        {aberta && (
          cards.length === 0 ? (
            <p className="px-4 py-4 text-xs text-muted-foreground">Nenhum card nesta fase.</p>
          ) : (
            <ul className="divide-y divide-border">
              {cards.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <Link
                    href={`/admin/kanban-dev`}
                    className="font-mono text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    {numeroDev(c.ticket_number)}
                  </Link>
                  <span className="flex-1 min-w-[12rem] text-sm text-foreground truncate">{c.title}</span>

                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-foreground/70">
                    {DEV_LABELS[c.status as DevStatus] || c.status}
                  </span>

                  {c.atrasado && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-600 dark:text-red-400">
                      <TriangleAlert className="w-3 h-3" /> atrasado
                    </span>
                  )}

                  <span className="hidden lg:block text-xs text-muted-foreground w-44">
                    {dataBR(c.inicio_planejado)} → {dataBR(c.previsao_entrega)}
                  </span>
                  <span className="hidden xl:block text-xs text-muted-foreground w-20">
                    {duracaoBR(c.estimativa_min)}
                  </span>

                  <div className="flex items-center gap-2 w-28">
                    <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${c.progresso_efetivo || 0}%` }} />
                    </div>
                    <span
                      className="text-xs text-muted-foreground w-9 text-right"
                      title={c.progresso === null || c.progresso === undefined
                        ? 'Derivado do status do card no quadro Dev'
                        : 'Ajustado à mão'}
                    >
                      {c.progresso_efetivo || 0}%
                    </span>
                  </div>

                  {podeMexerNoCard && (
                    <button
                      onClick={() => aoPlanejar(c)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-foreground/70 hover:text-foreground"
                    >
                      <Pencil className="w-3 h-3" /> Planejar
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-foreground flex items-center gap-2">
          <Layers className="w-4 h-4 text-indigo-500" /> Fases
        </h2>
      </div>

      {erro && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
          {erro}
        </div>
      )}

      {projeto.fases.map((f) =>
        grupo(f.nome, f.id, projeto.cards.filter((c) => c.fase_id === f.id), f),
      )}

      {semFase.length > 0 && grupo('Sem fase', '__sem_fase__', semFase)}

      {podePlanejar && (
        <div className="flex items-center gap-2">
          <input
            value={novaFase}
            onChange={(e) => setNovaFase(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') criarFase() }}
            placeholder="Nome da nova fase"
            className="h-9 flex-1 max-w-xs rounded-lg border border-border bg-background px-3 text-sm"
          />
          <button
            onClick={criarFase}
            disabled={criandoFase || !novaFase.trim()}
            className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:underline disabled:opacity-40 dark:text-indigo-400"
          >
            <Plus className="w-4 h-4" /> Acrescentar fase
          </button>
        </div>
      )}
    </div>
  )
}
