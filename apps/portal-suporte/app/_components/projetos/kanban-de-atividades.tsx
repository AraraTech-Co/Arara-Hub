'use client'

// =============================================================================
// Quadro das atividades — Kanban LOCAL do projeto.
//
// Local de propósito: a decisão do Leonardo é que atividade de projeto não
// polui os quadros globais, e nada aqui lê nem escreve card do Dev.
//
// As 7 etapas, os campos obrigatórios, quem pode mover e o texto de erro vêm
// de `app/lib/projetos-atividades.ts`. Nada disso é decidido aqui: é lá que a
// regra mora, e é lá que ela é testada.
//
// MOVER TEM DOIS CAMINHOS, e isso não é redundância:
//   - arraste, com `@dnd-kit` (o mesmo do quadro Dev), que cobre ponteiro e toque;
//   - botões ‹ › em cada cartão, que são botões de verdade: funcionam no Tab +
//     Enter, no leitor de tela e no toque. Arraste não funciona com leitor de
//     tela e, no celular, disputa com o rolar da página.
//
// Os dois respeitam a MESMA porta: quem planeja move qualquer atividade, o
// responsável move a dele, e o resto só olha. A trava real é do servidor; isto
// existe para a tela não oferecer o que a rota vai recusar.
//
// A gravação é otimista e DESFAZ no erro: sem desfazer, o cartão fica na coluna
// nova com o servidor dizendo outra coisa, e a próxima leitura o joga de volta
// sem explicação.
// =============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DndContext, PointerSensor, useSensor, useSensors, useDraggable, useDroppable,
  type DragEndEvent,
} from '@dnd-kit/core'
import { ChevronLeft, ChevronRight, Loader2, Pencil, RotateCw, TriangleAlert } from 'lucide-react'
import { projetosApi } from '@/lib/api/projetos'
import { usersApi } from '@/lib/api/users'
import {
  COLUNAS, STATUS_LABELS, agrupar, atrasada, destinoDoTeclado, extrairAtividades,
  mensagemDeErro, podeMover, resumo, type Atividade, type AtividadeStatus,
} from '@/lib/projetos-atividades'
import { NovaAtividade } from '@/components/projetos/nova-atividade'
import { EditarAtividade } from '@/components/projetos/editar-atividade'
import { dataBR } from '@/lib/projetos'

type Pessoa = { id: string; nome: string }

function Cartao({
  a, hoje, podeMexer, salvando, pessoas, aoMover, aoEditar,
}: {
  a: Atividade
  hoje: string
  podeMexer: boolean
  salvando: boolean
  pessoas: Pessoa[]
  aoMover: (a: Atividade, destino: AtividadeStatus) => void
  aoEditar: (a: Atividade) => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: a.id, disabled: !podeMexer || salvando,
  })
  const anterior = destinoDoTeclado(a.status, 'anterior')
  const proxima = destinoDoTeclado(a.status, 'proxima')
  const tarde = atrasada(a, hoje)
  const dono = pessoas.find((p) => p.id === String(a.responsavel_id || ''))

  return (
    <div
      ref={setNodeRef}
      className={`rounded-lg border bg-card p-2.5 text-left ${isDragging ? 'opacity-40' : ''} ${
        tarde ? 'border-red-500/40' : 'border-border'
      }`}
    >
      <div {...listeners} {...attributes} className={podeMexer ? 'cursor-grab active:cursor-grabbing' : ''}>
        <p className="text-sm text-foreground break-words">{a.titulo}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          {!!dono && <span className="truncate max-w-[12rem]">{dono.nome}</span>}
          {!!a.previsao_entrega && (
            <span className={tarde ? 'text-red-600 dark:text-red-400' : ''}>
              {tarde && <TriangleAlert className="inline w-3 h-3 mr-1 mb-0.5" />}
              {dataBR(a.previsao_entrega)}
            </span>
          )}
        </div>
      </div>

      {podeMexer && (
        <div className="mt-2 flex items-center gap-1">
          <button
            onClick={() => anterior && aoMover(a, anterior)}
            disabled={!anterior || salvando}
            aria-label={anterior ? `Mover "${a.titulo}" para ${STATUS_LABELS[anterior]}` : 'Já está na primeira etapa'}
            className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-border text-foreground/70 hover:bg-muted disabled:opacity-30"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => proxima && aoMover(a, proxima)}
            disabled={!proxima || salvando}
            aria-label={proxima ? `Mover "${a.titulo}" para ${STATUS_LABELS[proxima]}` : 'Já está na última etapa'}
            className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-border text-foreground/70 hover:bg-muted disabled:opacity-30"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => aoEditar(a)}
            aria-label={`Editar "${a.titulo}"`}
            className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-border text-foreground/70 hover:bg-muted"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          {salvando && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
        </div>
      )}
    </div>
  )
}

function Coluna({
  status, titulo, quantas, children,
}: {
  status: AtividadeStatus
  titulo: string
  quantas: number
  children: React.ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  return (
    <div
      ref={setNodeRef}
      className={`rounded-xl border p-2.5 min-h-32 sm:w-56 sm:shrink-0 ${
        isOver ? 'border-indigo-500 bg-indigo-500/5' : 'border-border bg-muted/30'
      }`}
    >
      <div className="flex items-center justify-between mb-2 gap-2">
        <p className="text-xs font-medium text-foreground leading-tight">{titulo}</p>
        <span className="text-xs text-muted-foreground">{quantas}</span>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

export function KanbanDeAtividades({
  projetoId, fases, podePlanejar, meuId,
}: {
  projetoId: string
  fases: { id: string; nome: string }[]
  podePlanejar: boolean
  meuId: string
}) {
  const [atividades, setAtividades] = useState<Atividade[] | null>(null)
  const [resumoDoServidor, setResumoDoServidor] = useState<
    { total: number; concluidas: number; canceladas: number; progresso: number } | null
  >(null)
  const [pessoas, setPessoas] = useState<Pessoa[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState<string | null>(null)
  const [erroDeMover, setErroDeMover] = useState('')
  const [editando, setEditando] = useState<Atividade | null>(null)
  const hoje = useMemo(() => new Date().toISOString().slice(0, 10), [])

  // Arraste só com uma distância mínima: sem isso, um toque para ler o cartão
  // no celular começa um arraste e a pessoa move sem querer.
  const sensores = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const carregar = useCallback(() => {
    setCarregando(true)
    projetosApi.atividades
      .listar(projetoId)
      .then((r) => {
        // A extração mora numa função pura, e é por ela que o teste de
        // contrato passa o corpo REAL do handler. Forma inesperada vira
        // ESTADO DE ERRO, não exceção: foi uma exceção aqui que derrubou a
        // página do projeto inteira, porque o Kanban é a vista padrão.
        const { lista, resumo: doServidor, erro: erroDeForma } = extrairAtividades(r)
        setAtividades(lista)
        setResumoDoServidor(doServidor)
        setErro(erroDeForma)
      })
      .catch((e) => setErro(mensagemDeErro(e, 'ler')))
      .finally(() => setCarregando(false))
  }, [projetoId])

  useEffect(() => { carregar() }, [carregar])

  // A lista de pessoas é só para MOSTRAR nome e escolher responsável. Falhar
  // aqui não pode derrubar o quadro: sem ela, o cartão mostra o resto.
  useEffect(() => {
    let ativo = true
    usersApi
      .list()
      .then((r) => {
        if (!ativo) return
        setPessoas((r.data || [])
          .map((p) => ({ id: String(p.id || ''), nome: String(p.full_name || p.email || p.id || '') }))
          .filter((p) => !!p.id))
      })
      .catch(() => { /* o quadro funciona sem os nomes */ })
    return () => { ativo = false }
  }, [])

  const mover = useCallback(async (a: Atividade, destino: AtividadeStatus) => {
    if (destino === a.status || salvando) return
    if (!podeMover(a, { podePlanejar, meuId })) return
    const antes = atividades || []
    setAtividades(antes.map((x) => (x.id === a.id ? { ...x, status: destino } : x)))
    setSalvando(a.id)
    setErroDeMover('')
    try {
      const r = await projetosApi.atividades.editar(projetoId, a.id, {
        status: destino, updated_at: a.updated_at,
      })
      // A resposta é a verdade: o servidor carimba a conclusão e mexe no
      // `updated_at`, e seguir com o objeto local deixaria o próximo PATCH com
      // um carimbo velho, levando um 409 que ninguém entenderia.
      setAtividades((atual) => (atual || []).map((x) => (x.id === a.id ? r.data : x)))
    } catch (e) {
      setAtividades(antes)
      setErroDeMover(mensagemDeErro(e, 'gravar'))
    } finally {
      setSalvando(null)
    }
  }, [atividades, meuId, podePlanejar, projetoId, salvando])

  function aoSoltar(ev: DragEndEvent) {
    const destino = ev.over?.id as AtividadeStatus | undefined
    const a = (atividades || []).find((x) => x.id === ev.active.id)
    if (a && destino) mover(a, destino)
  }

  if (carregando) {
    return (
      <div className="rounded-xl border border-border p-6 text-sm text-muted-foreground">
        <Loader2 className="inline w-4 h-4 mr-2 animate-spin" aria-hidden="true" />
        Carregando atividades…
      </div>
    )
  }

  if (erro) {
    return (
      <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 space-y-2">
        <p className="text-sm text-red-600 dark:text-red-400">{erro}</p>
        <button
          onClick={carregar}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border text-xs text-foreground/80 hover:bg-muted"
        >
          <RotateCw className="w-3.5 h-3.5" /> Tentar de novo
        </button>
      </div>
    )
  }

  const todas = atividades || []
  const { colunas, canceladas, foraDasColunas } = agrupar(todas)
  // O número que vale é o do SERVIDOR; o local existe para a conta não piscar
  // entre mover e a resposta chegar.
  const r = resumoDoServidor || resumo(todas)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {r.total === 0
            ? 'Nenhuma atividade'
            : `${r.concluidas} de ${r.total} com deploy feito — ${r.progresso}%`}
          {r.canceladas > 0 && ` · ${r.canceladas} cancelada(s), fora da conta`}
        </p>
        {/* Criar é só de quem planeja (D6c): o botão não aparece para o resto. */}
        {podePlanejar && (
          <NovaAtividade projetoId={projetoId} fases={fases} pessoas={pessoas} aoCriar={carregar} />
        )}
      </div>

      {erroDeMover && (
        <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">
          {erroDeMover}
        </p>
      )}

      {/* Projeto sem atividade nenhuma mostra o quadro assim mesmo: as 7 etapas
          vazias SÃO a informação — é por elas que se vê o caminho que uma
          atividade percorre. Trocar o quadro por um cartão de aviso, como era
          antes, escondia justamente isso de quem abria o projeto pela primeira
          vez. O aviso continua, como uma linha acima do quadro. */}
      {todas.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Este projeto ainda não tem atividades.{' '}
          {podePlanejar
            ? 'Crie a primeira em "Nova atividade". Elas valem só dentro deste projeto.'
            : 'Quem planeja o projeto pode criar a primeira.'}
        </p>
      )}

      <DndContext sensors={sensores} onDragEnd={aoSoltar}>
        {/* Em celular as 7 etapas empilham; no desktop viram uma faixa que
            rola para o lado. Sete colunas lado a lado numa tela estreita
            dariam cartões de ~100px, estreitos demais para ler o título. */}
        <div className="flex flex-col sm:flex-row gap-3 sm:overflow-x-auto sm:pb-2">
          {colunas.map((c) => (
            <Coluna key={c.status} status={c.status} titulo={c.titulo} quantas={c.itens.length}>
              {c.itens.length === 0 ? (
                <p className="px-1 py-3 text-xs text-muted-foreground">Nada aqui.</p>
              ) : (
                c.itens.map((a) => (
                  <Cartao
                    key={a.id} a={a} hoje={hoje} pessoas={pessoas}
                    podeMexer={podeMover(a, { podePlanejar, meuId })}
                    salvando={salvando === a.id} aoMover={mover} aoEditar={setEditando}
                  />
                ))
              )}
            </Coluna>
          ))}
        </div>
      </DndContext>

      {canceladas.length > 0 && (
        <div className="rounded-xl border border-border bg-muted/20 p-3">
          <p className="text-xs font-medium text-muted-foreground mb-2">
            Canceladas ({canceladas.length}) — fora do progresso, e aqui para não desaparecerem
          </p>
          <div className="flex flex-wrap gap-2">
            {canceladas.map((a) => (
              <span key={a.id} className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground line-through">
                {a.titulo}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Etapa que o quadro não conhece não desaparece: se o servidor passar a
          devolver uma etapa nova, ela aparece aqui em vez de a atividade sumir
          da tela sem ninguém notar. */}
      {foraDasColunas.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
          <p className="text-xs text-amber-700 dark:text-amber-400">
            {foraDasColunas.length} atividade(s) em etapa que este quadro ainda não mostra em coluna:
            {' '}{[...new Set(foraDasColunas.map((a) => a.status))].join(', ')}.
          </p>
        </div>
      )}

      {editando && (
        <EditarAtividade
          projetoId={projetoId}
          atividade={editando}
          fases={fases}
          pessoas={pessoas}
          podePlanejar={podePlanejar}
          onFechar={() => setEditando(null)}
          onSalvo={() => { setEditando(null); carregar() }}
        />
      )}
    </div>
  )
}
