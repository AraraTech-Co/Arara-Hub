'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  useNodesState,
  useEdgesState,
  useReactFlow,
  addEdge,
  type Connection,
  type Edge,
  type Node,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  Loader2, Save, Rocket, ListChecks, MessageSquareText, UserRoundCheck, GitBranch, Sparkles,
  Timer, Shuffle, Webhook,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { waFlowApi, type WAFlowDetail } from '@/lib/api/wa-flow'
import type { WAGraph, WAGraphNode, WAGraphNodeType } from '@/lib/wa-flow-graph'
import { waFlowNodeTypes } from './flow-nodes'
import { FlowCardEditor } from './flow-card-editor'

/**
 * Editor do fluxo de atendimento.
 *
 * Edita o RASCUNHO: nada do que se faz aqui afeta quem está sendo atendido
 * agora — só "Publicar" promove o rascunho para produção.
 *
 * Fase 3: além de editar textos, dá para criar/apagar cards, adicionar/remover
 * opções e ligar os caminhos arrastando das portas.
 */
export function FlowEditor({ flowId, canEdit }: { flowId: string; canEdit: boolean }) {
  return (
    <ReactFlowProvider>
      <FlowEditorInner flowId={flowId} canEdit={canEdit} />
    </ReactFlowProvider>
  )
}

const NOVO_CARD: Record<WAGraphNodeType, { label: string; text: string; data: Partial<WAGraphNode['data']> }> = {
  menu: {
    label: 'Menu',
    text: 'Escreva aqui a pergunta do menu.',
    data: { options: [{ id: 'op1', label: 'Primeira opção' }] },
  },
  content: { label: 'Mensagem', text: 'Escreva aqui a mensagem enviada ao cliente.', data: {} },
  handoff: { label: 'Atendente', text: 'Vou te encaminhar para um atendente.', data: { area: 'suporte' } },
  condition: { label: 'Condição', text: '', data: { check: 'businessHours' } },
  assistant: {
    label: 'Assistente',
    text: 'Um instante, vou verificar isso para você.',
    data: {},
  },
  delay: { label: 'Atraso', text: '', data: { seconds: 5 } },
  random: {
    label: 'Randomizador',
    text: '',
    // Nasce com duas saídas: com uma só não há o que sortear (e a validação recusa).
    data: { branches: [{ id: 'a', label: 'Saída A', weight: 1 }, { id: 'b', label: 'Saída B', weight: 1 }] },
  },
  integration: { label: 'Integração', text: '', data: { url: '' } },
}

function FlowEditorInner({ flowId, canEdit }: { flowId: string; canEdit: boolean }) {
  const { toast } = useToast()
  const { screenToFlowPosition } = useReactFlow()
  const [flow, setFlow] = useState<WAFlowDetail | null>(null)
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  // Carrega o fluxo escolhido na tela de lista.
  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const detalhe = await waFlowApi.get(flowId)
        if (!active) return
        const g = detalhe.data.graph
        setFlow(detalhe.data)
        setNodes(g.nodes.map((n) => ({ id: n.id, type: n.type, position: n.position, data: n.data })))
        setEdges(
          g.edges.map((e) => ({
            id: e.id,
            source: e.source,
            target: e.target,
            sourceHandle: e.sourceHandle,
            label: e.label,
            style: { strokeWidth: 1.5 },
          })),
        )
      } catch {
        setLoadError(true)
      } finally {
        setLoading(false)
      }
    })()
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowId])

  const patchNode = useCallback(
    (id: string, patch: Partial<WAGraphNode['data']>) => {
      setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...(n.data as object), ...patch } } : n)))
      // Opção removida → a conexão que saía dela deixa de existir.
      if (patch.options) {
        const ids = new Set(patch.options.map((o) => `opt:${o.id}`))
        setEdges((es) => es.filter((e) => e.source !== id || !e.sourceHandle?.startsWith('opt:') || ids.has(e.sourceHandle)))
      }
      // Idem para as saídas do randomizador.
      if (patch.branches) {
        const ids = new Set(patch.branches.map((b) => `out:${b.id}`))
        setEdges((es) => es.filter((e) => e.source !== id || !e.sourceHandle?.startsWith('out:') || ids.has(e.sourceHandle)))
      }
      setDirty(true)
    },
    [setNodes, setEdges],
  )

  /** Liga uma porta a um card. Cada porta tem UM destino — reconectar substitui. */
  const onConnect = useCallback(
    (c: Connection) => {
      setEdges((es) => {
        const semAntiga = es.filter((e) => !(e.source === c.source && e.sourceHandle === c.sourceHandle))
        return addEdge({ ...c, style: { strokeWidth: 1.5 } }, semAntiga)
      })
      setDirty(true)
    },
    [setEdges],
  )

  function addNode(type: WAGraphNodeType) {
    const modelo = NOVO_CARD[type]
    const id = `${type}_${Math.random().toString(36).slice(2, 8)}`
    // Solta o card no centro da área visível.
    const el = document.querySelector('.react-flow')?.getBoundingClientRect()
    const position = screenToFlowPosition({
      x: (el?.left ?? 0) + (el?.width ?? 600) / 2,
      y: (el?.top ?? 0) + (el?.height ?? 400) / 2,
    })
    setNodes((ns) => [
      ...ns,
      { id, type, position, data: { label: modelo.label, text: modelo.text, ...modelo.data } as WAGraphNode['data'] },
    ])
    setSelectedId(id)
    setDirty(true)
  }

  function deleteNode(id: string) {
    if (flow && id === flow.graph.root) return // raiz é protegida
    setNodes((ns) => ns.filter((n) => n.id !== id))
    setEdges((es) => es.filter((e) => e.source !== id && e.target !== id))
    setSelectedId(null)
    setDirty(true)
  }

  function currentGraph(): WAGraph | null {
    if (!flow) return null
    return {
      root: flow.graph.root,
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.type as WAGraphNodeType,
        position: n.position,
        data: n.data as WAGraphNode['data'],
      })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? 'next',
        label: typeof e.label === 'string' ? e.label : undefined,
      })),
    }
  }

  async function handleSave() {
    const graph = currentGraph()
    if (!flow || !graph) return
    setSaving(true)
    try {
      await waFlowApi.saveDraft(flow.id, graph)
      setDirty(false)
      setFlow({ ...flow, hasUnpublished: true })
      toast({ title: 'Rascunho salvo', description: 'As conversas em andamento não mudaram.' })
    } catch (err) {
      toast({
        title: 'Erro ao salvar',
        description: err instanceof Error ? err.message : 'Tente novamente.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  async function handlePublish() {
    if (!flow) return
    if (dirty) {
      toast({ title: 'Salve o rascunho antes de publicar', variant: 'destructive' })
      return
    }
    setPublishing(true)
    try {
      const res = await waFlowApi.publish(flow.id)
      setFlow({ ...flow, hasUnpublished: false, version: res.data.version })
      toast({ title: 'Fluxo publicado', description: 'Novas conversas já usam esta versão.' })
    } catch (err) {
      toast({
        title: 'Não foi possível publicar',
        description: err instanceof Error ? err.message : 'Verifique o fluxo e tente novamente.',
        variant: 'destructive',
      })
    } finally {
      setPublishing(false)
    }
  }

  const selected = nodes.find((n) => n.id === selectedId) ?? null

  if (loading) {
    return (
      <div className="flex h-[calc(100dvh-14rem)] items-center justify-center rounded-xl border border-border">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (loadError || !flow) {
    return (
      <div className="flex h-[calc(100dvh-14rem)] flex-col items-center justify-center gap-3 rounded-xl border border-border text-center">
        <p className="text-sm text-muted-foreground">
          {loadError ? 'Não foi possível carregar o fluxo.' : 'Fluxo não encontrado.'}
        </p>
        <Button size="sm" variant="secondary" onClick={() => window.location.reload()}>
          Tentar novamente
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {canEdit && (
          <>
            <Button size="sm" onClick={handleSave} disabled={!dirty || saving}>
              {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
              Salvar rascunho
            </Button>
            <Button size="sm" variant="secondary" onClick={handlePublish} disabled={publishing || dirty || !flow.hasUnpublished}>
              {publishing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Rocket className="mr-1.5 h-3.5 w-3.5" />}
              Publicar
            </Button>

            <span className="mx-1 h-5 w-px bg-border" aria-hidden />
            <span className="text-xs text-muted-foreground">Adicionar:</span>
            <Button size="sm" variant="outline" onClick={() => addNode('menu')}>
              <ListChecks className="mr-1 h-3.5 w-3.5" /> Menu
            </Button>
            <Button size="sm" variant="outline" onClick={() => addNode('content')}>
              <MessageSquareText className="mr-1 h-3.5 w-3.5" /> Mensagem
            </Button>
            <Button size="sm" variant="outline" onClick={() => addNode('handoff')}>
              <UserRoundCheck className="mr-1 h-3.5 w-3.5" /> Atendente
            </Button>
            <Button size="sm" variant="outline" onClick={() => addNode('condition')}>
              <GitBranch className="mr-1 h-3.5 w-3.5" /> Condição
            </Button>
            <Button size="sm" variant="outline" onClick={() => addNode('assistant')}>
              <Sparkles className="mr-1 h-3.5 w-3.5" /> Assistente
            </Button>
            <Button size="sm" variant="outline" onClick={() => addNode('delay')}>
              <Timer className="mr-1 h-3.5 w-3.5" /> Atraso
            </Button>
            <Button size="sm" variant="outline" onClick={() => addNode('random')}>
              <Shuffle className="mr-1 h-3.5 w-3.5" /> Randomizador
            </Button>
            <Button size="sm" variant="outline" onClick={() => addNode('integration')}>
              <Webhook className="mr-1 h-3.5 w-3.5" /> Integração
            </Button>
          </>
        )}

        {dirty && <span className="text-xs text-sem-warning-fg">Alterações não salvas</span>}
        {!dirty && flow.hasUnpublished && (
          <span className="text-xs text-muted-foreground">Rascunho salvo — falta publicar</span>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {flow.name} · versão {flow.version}
        </span>
      </div>

      {/* "Publicar" hoje só promove o rascunho e soma 1 na versão: nenhum
          controller do módulo lê o grafo, e o webhook de entrada não consulta
          fluxo nenhum. Sem este aviso, quem monta o fluxo acredita que ele
          passou a atender. Sai quando existir o motor de execução. */}
      <p className="mb-3 rounded-lg border border-sem-warning-bd bg-sem-warning px-3 py-2 text-xs text-sem-warning-fg">
        <span className="font-semibold">Este fluxo ainda não é executado.</span>{' '}
        O desenho fica salvo e versionado, mas não há motor que o rode nas conversas —
        publicar registra a versão, não coloca o fluxo no ar.
      </p>

      <div className="relative h-[calc(100dvh-16rem)] w-full overflow-hidden rounded-xl border border-border bg-muted/20">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={(c) => {
            onNodesChange(c)
            if (c.some((ch) => ch.type === 'position' && ch.dragging === false)) setDirty(true)
          }}
          onEdgesChange={(c) => {
            onEdgesChange(c)
            if (c.some((ch) => ch.type === 'remove')) setDirty(true)
          }}
          onConnect={onConnect}
          onNodeClick={(_, n) => setSelectedId(n.id)}
          nodeTypes={waFlowNodeTypes}
          fitView
          nodesDraggable={canEdit}
          nodesConnectable={canEdit}
          // Só Delete (não Backspace) para não apagar sem querer enquanto edita texto.
          deleteKeyCode={canEdit ? ['Delete'] : null}
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
          <Controls showInteractive={false} />
        </ReactFlow>

        {selected && (
          <FlowCardEditor
            node={selected}
            isRoot={selected.id === flow.graph.root}
            canEdit={canEdit}
            onChange={(patch) => patchNode(selected.id, patch)}
            onDelete={() => deleteNode(selected.id)}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>

      {canEdit && (
        <p className="text-xs text-muted-foreground">
          Ligue os caminhos arrastando da bolinha à direita de um card (ou de cada opção do menu) até
          o card de destino. Selecione uma conexão e tecle <kbd>Delete</kbd> para removê-la.
        </p>
      )}
    </div>
  )
}
