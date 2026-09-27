'use client'

// =============================================================================
// Projeto — a visão geral.
//
// Rota por parâmetro (`/admin/projetos/ver?id=…`) e não por segmento dinâmico:
// o portal é exportado estático (`output: 'export'`), e `[id]` exigiria conhecer
// todos os ids em tempo de build. É o mesmo caminho de /admin/tickets/view.
//
// O que esta tela NÃO faz: recalcular regra. Progresso, atraso e datas
// derivadas das fases vêm prontos de GET /projetos/:id.
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft, TriangleAlert, Plus, Archive, List, GanttChartSquare } from 'lucide-react'
import { projetosApi, type CardDoProjeto, type ProjetoDetalhe } from '@/lib/api/projetos'
import {
  PROJETO_STATUS_CLASSES, PROJETO_STATUS_LABELS, PROJETO_TIPO_LABELS,
  dataBR, type ProjetoStatus,
} from '@/lib/projetos'
import { useMeuAcesso } from '@/hooks/use-meu-acesso'
import { FasesDoProjeto } from '@/components/projetos/fases-do-projeto'
import { VincularCardsDialog } from '@/components/projetos/vincular-cards-dialog'
import { PlanejarCardDialog } from '@/components/projetos/planejar-card-dialog'
import { Gantt } from '@/components/projetos/gantt/gantt'
import { MarcosDoProjeto } from '@/components/projetos/marcos-do-projeto'

export default function ProjetoVerClient() {
  const params = useSearchParams()
  const id = params?.get('id') || ''
  const acesso = useMeuAcesso()
  const [projeto, setProjeto] = useState<ProjetoDetalhe | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [vinculando, setVinculando] = useState(false)
  // O diálogo de planejamento vive AQUI: a lista e o Gantt abrem o mesmo, e
  // duas cópias do mesmo diálogo é como as duas telas começam a divergir.
  const [planejando, setPlanejando] = useState<CardDoProjeto | null>(null)
  const [vista, setVista] = useState<'lista' | 'gantt'>('gantt')

  const carregar = useCallback(() => {
    if (!id) { setCarregando(false); setErro('Projeto não informado.'); return }
    projetosApi
      .detalhe(id)
      .then((r) => { setProjeto(r.data); setErro('') })
      .catch((e) => setErro(e.message))
      .finally(() => setCarregando(false))
  }, [id])

  useEffect(() => { carregar() }, [carregar])

  // Com o painel aberto, um recarregamento precisa apontar para o card NOVO —
  // senão o painel segue mostrando a versão anterior e a próxima gravação vai
  // com um `updated_at` velho, levando um 409 que ninguém entenderia.
  useEffect(() => {
    setPlanejando((atual) => (atual ? projeto?.cards.find((c) => c.id === atual.id) ?? null : null))
  }, [projeto])

  if (carregando) return <div className="p-6 text-sm text-muted-foreground">Carregando…</div>
  if (erro || !projeto) {
    return (
      <div className="p-6 space-y-4">
        <Link href="/admin/projetos" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Projetos
        </Link>
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-600 dark:text-red-400">
          {erro || 'Projeto não encontrado.'}
        </div>
      </div>
    )
  }

  const semFase = projeto.cards.filter((c) => !c.fase_id)
  const podeMexerNoCard = acesso.temNivel('developer') || acesso.podePlanejar

  return (
    <div className="p-6 space-y-6">
      <Link href="/admin/projetos" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4" /> Projetos
      </Link>

      {/* Cabeçalho */}
      <div className="rounded-xl bg-card p-5 shadow-[var(--shadow-media)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-xs text-muted-foreground">{projeto.codigo}</span>
              <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${PROJETO_STATUS_CLASSES[projeto.status as ProjetoStatus] || ''}`}>
                {PROJETO_STATUS_LABELS[projeto.status as ProjetoStatus] || projeto.status}
              </span>
              {projeto.arquivado_em && (
                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Archive className="w-3 h-3" /> arquivado
                </span>
              )}
            </div>
            <h1 className="text-2xl font-bold text-foreground">{projeto.nome}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {PROJETO_TIPO_LABELS[projeto.tipo] || projeto.tipo} ·{' '}
              {dataBR(projeto.inicio_planejado)} → {dataBR(projeto.fim_planejado)}
            </p>
            {projeto.descricao && (
              <p className="text-sm text-foreground/70 mt-2 max-w-2xl">{projeto.descricao}</p>
            )}
          </div>
          {acesso.podePlanejar && (
            <button
              onClick={() => setVinculando(true)}
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-lg"
            >
              <Plus className="w-4 h-4" />
              Pendurar cards
            </button>
          )}
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Progresso</p>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${projeto.progresso || 0}%` }} />
            </div>
            <p className="text-xs text-foreground/70 mt-1">{projeto.progresso || 0}%</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Cards</p>
            <p className="text-lg font-semibold text-foreground">{projeto.total_cards || 0}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Atrasados</p>
            <p className={`text-lg font-semibold ${(projeto.cards_atrasados || 0) > 0 ? 'text-red-600 dark:text-red-400' : 'text-foreground'}`}>
              {projeto.cards_atrasados || 0}
              {(projeto.cards_atrasados || 0) > 0 && <TriangleAlert className="inline w-4 h-4 ml-1 mb-0.5" />}
            </p>
          </div>
        </div>
      </div>

      <MarcosDoProjeto projeto={projeto} podePlanejar={acesso.podePlanejar} aoMudar={carregar} />

      {/* Lista e Gantt são a MESMA informação em duas leituras: a lista responde
          "o que existe", o Gantt responde "quando". Nenhuma das duas é a
          versão reduzida da outra. */}
      <div className="inline-flex rounded-lg border border-border overflow-hidden">
        <button
          onClick={() => setVista('gantt')}
          className={`inline-flex items-center gap-1.5 px-3 h-8 text-xs font-medium transition-colors ${
            vista === 'gantt' ? 'bg-indigo-600 text-white' : 'bg-background text-foreground/70 hover:bg-muted'
          }`}
        >
          <GanttChartSquare className="w-3.5 h-3.5" /> Cronograma
        </button>
        <button
          onClick={() => setVista('lista')}
          className={`inline-flex items-center gap-1.5 px-3 h-8 text-xs font-medium transition-colors ${
            vista === 'lista' ? 'bg-indigo-600 text-white' : 'bg-background text-foreground/70 hover:bg-muted'
          }`}
        >
          <List className="w-3.5 h-3.5" /> Lista
        </button>
      </div>

      {vista === 'gantt' ? (
        <Gantt
          projeto={projeto}
          podeMexerNoCard={podeMexerNoCard}
          podePlanejar={acesso.podePlanejar}
          aoPlanejar={setPlanejando}
          aoMudar={carregar}
        />
      ) : (
        <FasesDoProjeto
          projeto={projeto}
          podePlanejar={acesso.podePlanejar}
          podeMexerNoCard={podeMexerNoCard}
          aoMudar={carregar}
          aoPlanejar={setPlanejando}
        />
      )}

      {vista === 'lista' && semFase.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <p className="text-sm font-medium text-amber-700 dark:text-amber-400 mb-1">
            {semFase.length} card(s) sem fase
          </p>
          <p className="text-xs text-amber-700/80 dark:text-amber-400/80">
            Eles contam no progresso do projeto, mas não aparecem em nenhuma fase.
            Escolha a fase no bloco de planejamento de cada um.
          </p>
        </div>
      )}

      {planejando && (
        <PlanejarCardDialog
          projeto={projeto}
          card={planejando}
          podePlanejar={acesso.podePlanejar}
          onFechar={() => setPlanejando(null)}
          onSalvo={() => { setPlanejando(null); carregar() }}
          aoAtualizar={carregar}
        />
      )}

      {vinculando && (
        <VincularCardsDialog
          projeto={projeto}
          onFechar={() => setVinculando(false)}
          onVinculado={() => { setVinculando(false); carregar() }}
        />
      )}
    </div>
  )
}
