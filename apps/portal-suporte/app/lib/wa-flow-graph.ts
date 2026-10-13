// =============================================================================
// Converte a árvore de atendimento (wa-menu-flow) no grafo que o React Flow
// desenha: `nodes[]` + `edges[]`, com posições calculadas.
//
// Este é o formato canônico do editor (ver
// docs/plans/plano-editor-visual-de-fluxo-whatsapp.md): a aresta sai de uma
// PORTA do nó (`sourceHandle`), não de um campo embutido. Na Fase 2 o grafo
// passa a vir do banco — este conversor vira o seed/importador.
//
// Layout: camadas por profundidade (BFS a partir da raiz). Simples e sem
// dependência extra; na Fase 3, as posições passam a ser salvas por nó.
// =============================================================================

import { WA_MENU_FLOW, WA_MENU_ROOT_ID, type WAFlowNode } from '@/lib/wa-menu-flow'

export type WAGraphNodeType =
  | 'menu'
  | 'content'
  | 'handoff'
  | 'condition'
  | 'assistant'
  | 'delay'
  | 'random'
  | 'integration'

export interface WAGraphNode {
  id: string
  type: WAGraphNodeType
  position: { x: number; y: number }
  data: {
    label: string
    /** Texto principal mostrado no card. */
    text: string
    /** Opções (menus) — cada uma é uma porta de saída. */
    options?: { id: string; label: string; description?: string }[]
    /** Área do handoff (suporte/administrativo/vendas). */
    area?: string
    /** Condição avaliada num card `condition`. */
    check?: string
    /** Espera do card `delay`, em segundos. */
    seconds?: number
    /** Saídas do card `random` — cada uma é uma porta `out:<id>`. */
    branches?: { id: string; label: string; weight: number }[]
    /** Webhook do card `integration`. */
    url?: string
    /**
     * Card de mensagem que avisa NO MÁXIMO uma vez por janela fechada, por
     * conversa (Fluxo v2, entrega 2). É o aviso de fora do horário: cliente
     * que manda cinco mensagens às 23h recebe um aviso, não cinco.
     */
    umaVezPorJanela?: boolean
  }
}

export interface WAGraphEdge {
  id: string
  source: string
  target: string
  /** Porta de saída: `opt:<id>` num menu, `next` nos demais. */
  sourceHandle: string
  label?: string
}

export interface WAGraph {
  /** Nó de entrada do fluxo. */
  root: string
  nodes: WAGraphNode[]
  edges: WAGraphEdge[]
}

const COL_WIDTH = 340
const ROW_GAP = 28

/**
 * Altura estimada do card, para empilhar sem sobrepor. Um menu com 7 opções é
 * muito mais alto que uma mensagem — usar altura fixa fazia os cards colidirem.
 * (Cabeçalho + texto + uma linha por opção + respiro.)
 */
export function estimatedHeight(node: WAFlowNode): number {
  const HEADER = 34
  const PADDING = 24
  if (node.type === 'menu') {
    const textLines = Math.min(3, Math.ceil(node.text.length / 42))
    return HEADER + PADDING + textLines * 16 + node.options.length * 30
  }
  if (node.type === 'condition') return HEADER + PADDING + 16 + 2 * 28 // pergunta + Sim/Não
  if (node.type === 'assistant') return HEADER + PADDING + 2 * 16 + 18
  if (node.type === 'delay') return HEADER + PADDING + 16
  if (node.type === 'random') return HEADER + PADDING + 16 + node.branches.length * 28
  if (node.type === 'integration') return HEADER + PADDING + 2 * 16 + 2 * 28 // url + Sucesso/Erro
  const textLines = Math.min(4, Math.ceil(node.text.length / 42))
  const extra = node.type === 'handoff' ? 18 : 0 // linha "Encerra o menu e chama a equipe"
  return HEADER + PADDING + textLines * 16 + extra
}

/** Arestas que saem de um nó, já com a porta de origem. */
function outgoing(node: WAFlowNode): { handle: string; target: string; label?: string }[] {
  if (node.type === 'menu') {
    return node.options.map((o) => ({ handle: `opt:${o.id}`, target: o.next, label: o.label }))
  }
  // Conteúdo sem `next` é terminal (encerra sem escalar) — não gera aresta.
  if (node.type === 'content') return node.next ? [{ handle: 'next', target: node.next }] : []
  if (node.type === 'condition') {
    const saidas: { handle: string; target: string; label?: string }[] = []
    if (node.whenTrue) saidas.push({ handle: 'true', target: node.whenTrue, label: 'Sim' })
    if (node.whenFalse) saidas.push({ handle: 'false', target: node.whenFalse, label: 'Não' })
    return saidas
  }
  if (node.type === 'delay') return node.next ? [{ handle: 'next', target: node.next }] : []
  if (node.type === 'random') {
    return node.branches
      .filter((b) => b.next)
      .map((b) => ({ handle: `out:${b.id}`, target: b.next, label: b.label }))
  }
  if (node.type === 'integration') {
    const saidas: { handle: string; target: string; label?: string }[] = []
    if (node.onSuccess) saidas.push({ handle: 'success', target: node.onSuccess, label: 'Sucesso' })
    if (node.onError) saidas.push({ handle: 'error', target: node.onError, label: 'Erro' })
    return saidas
  }
  return [] // handoff e assistant são terminais
}

function labelFor(node: WAFlowNode): string {
  if (node.type === 'menu') return node.header
  if (node.type === 'handoff') return `Atendente — ${node.area}`
  if (node.type === 'condition') return 'Condição'
  if (node.type === 'assistant') return 'Assistente'
  if (node.type === 'delay') return 'Atraso'
  if (node.type === 'random') return 'Randomizador'
  if (node.type === 'integration') return 'Integração'
  return 'Mensagem'
}

function textFor(node: WAFlowNode): string {
  return node.type === 'menu' ? node.text : node.text
}

/**
 * Monta o grafo a partir da árvore, posicionando por camadas (profundidade da
 * raiz). Nós inalcançáveis entram numa camada extra ao final, para nada sumir.
 */
export function buildFlowGraph(
  flow: Record<string, WAFlowNode> = WA_MENU_FLOW,
  rootId: string = WA_MENU_ROOT_ID,
): WAGraph {
  const depth = new Map<string, number>()
  const order: string[] = []

  // BFS: define a camada (x) de cada nó alcançável.
  const queue: string[] = flow[rootId] ? [rootId] : []
  if (queue.length) depth.set(rootId, 0)
  while (queue.length) {
    const id = queue.shift()!
    order.push(id)
    const node = flow[id]
    if (!node) continue
    for (const { target } of outgoing(node)) {
      if (!flow[target] || depth.has(target)) continue
      depth.set(target, (depth.get(id) ?? 0) + 1)
      queue.push(target)
    }
  }
  // Órfãos (não alcançáveis) — não somem do mapa.
  const maxDepth = order.length ? Math.max(...depth.values()) : 0
  for (const id of Object.keys(flow)) {
    if (!depth.has(id)) {
      depth.set(id, maxDepth + 1)
      order.push(id)
    }
  }

  // Empilha verticalmente dentro de cada camada, usando a ALTURA de cada card
  // (o topo do próximo começa onde o anterior terminou + respiro).
  const nextY = new Map<number, number>()
  const nodes: WAGraphNode[] = order.map((id) => {
    const node = flow[id]
    const col = depth.get(id) ?? 0
    const y = nextY.get(col) ?? 0
    nextY.set(col, y + estimatedHeight(node) + ROW_GAP)
    return {
      id,
      type: node.type,
      position: { x: col * COL_WIDTH, y },
      data: {
        label: labelFor(node),
        text: textFor(node),
        options: node.type === 'menu' ? node.options.map((o) => ({ id: o.id, label: o.label, description: o.description })) : undefined,
        area: node.type === 'handoff' ? node.area : undefined,
        check: node.type === 'condition' ? node.check : undefined,
        seconds: node.type === 'delay' ? node.seconds : undefined,
        branches: node.type === 'random'
          ? node.branches.map((b) => ({ id: b.id, label: b.label, weight: b.weight }))
          : undefined,
        url: node.type === 'integration' ? node.url : undefined,
      },
    }
  })

  const edges: WAGraphEdge[] = []
  for (const id of order) {
    const node = flow[id]
    if (!node) continue
    for (const { handle, target, label } of outgoing(node)) {
      if (!flow[target]) continue // aresta apontando para nó inexistente é ignorada
      edges.push({ id: `${id}--${handle}--${target}`, source: id, target, sourceHandle: handle, label })
    }
  }

  return { root: rootId, nodes, edges }
}

/**
 * Grafo inicial de um fluxo NOVO. Mínimo porém já válido (menu com uma opção
 * ligada), para o fluxo nascer salvável — um grafo vazio seria rejeitado pela
 * validação e o usuário abriria um editor que não deixa salvar.
 */
export function starterGraph(): WAGraph {
  return {
    root: 'inicio',
    nodes: [
      {
        id: 'inicio',
        type: 'menu',
        position: { x: 0, y: 0 },
        data: {
          label: 'Início',
          text: 'Olá! Como podemos ajudar?',
          options: [{ id: 'atendente', label: 'Falar com um atendente' }],
        },
      },
      {
        id: 'atendente',
        type: 'handoff',
        position: { x: COL_WIDTH, y: 0 },
        data: {
          label: 'Atendente — suporte',
          text: 'Certo! Já estou chamando um atendente para continuar com você.',
          area: 'suporte',
        },
      },
    ],
    edges: [
      {
        id: 'inicio--opt:atendente--atendente',
        source: 'inicio',
        target: 'atendente',
        sourceHandle: 'opt:atendente',
        label: 'Falar com um atendente',
      },
    ],
  }
}

/**
 * Caminho inverso: o grafo salvo no banco vira a estrutura que o MOTOR executa.
 *
 * É aqui que a aresta volta a ser um campo: a porta `opt:<id>` de um menu vira o
 * `next` daquela opção, e a porta `next` de um conteúdo vira o `next` dele. Um
 * conteúdo sem aresta de saída continua terminal (encerra sem escalar).
 *
 * Defensivo de propósito: o grafo vem de um editor visual, então nó com tipo
 * desconhecido ou aresta órfã é ignorado em vez de derrubar o atendimento.
 */
export function graphToFlow(graph: WAGraph): { root: string; flow: Record<string, WAFlowNode> } {
  const flow: Record<string, WAFlowNode> = {}
  const nodeIds = new Set(graph.nodes.map((n) => n.id))

  /** Alvo da porta `handle` saindo de `source` (só se o destino existir). */
  const targetOf = (source: string, handle: string): string | undefined => {
    const edge = graph.edges.find(
      (e) => e.source === source && e.sourceHandle === handle && nodeIds.has(e.target),
    )
    return edge?.target
  }

  for (const n of graph.nodes) {
    if (n.type === 'menu') {
      const options = (n.data.options ?? [])
        .map((o) => {
          const next = targetOf(n.id, `opt:${o.id}`)
          return next ? { id: o.id, label: o.label, description: o.description, next } : null
        })
        .filter((o): o is NonNullable<typeof o> => o !== null)
      // Menu sem nenhuma opção com destino não é navegável — descarta.
      if (!options.length) continue
      flow[n.id] = { id: n.id, type: 'menu', header: n.data.label, text: n.data.text, options }
    } else if (n.type === 'content') {
      flow[n.id] = { id: n.id, type: 'content', text: n.data.text, next: targetOf(n.id, 'next') }
    } else if (n.type === 'handoff') {
      const area = (n.data.area ?? 'suporte') as 'suporte' | 'administrativo' | 'vendas'
      flow[n.id] = { id: n.id, type: 'handoff', text: n.data.text, area }
    } else if (n.type === 'condition') {
      const check = (n.data.check === 'hasTicket' ? 'hasTicket' : 'businessHours') as
        | 'businessHours'
        | 'hasTicket'
      flow[n.id] = {
        id: n.id,
        type: 'condition',
        text: n.data.text,
        check,
        whenTrue: targetOf(n.id, 'true'),
        whenFalse: targetOf(n.id, 'false'),
      }
    } else if (n.type === 'assistant') {
      flow[n.id] = { id: n.id, type: 'assistant', text: n.data.text }
    } else if (n.type === 'delay') {
      flow[n.id] = {
        id: n.id,
        type: 'delay',
        text: n.data.text,
        seconds: Number(n.data.seconds) > 0 ? Number(n.data.seconds) : 5,
        next: targetOf(n.id, 'next'),
      }
    } else if (n.type === 'random') {
      const branches = (n.data.branches ?? [])
        .map((b) => {
          const next = targetOf(n.id, `out:${b.id}`)
          return next ? { id: b.id, label: b.label, weight: b.weight > 0 ? b.weight : 1, next } : null
        })
        .filter((b): b is NonNullable<typeof b> => b !== null)
      // Sem nenhuma saída ligada não há o que sortear — descarta o nó.
      if (!branches.length) continue
      flow[n.id] = { id: n.id, type: 'random', text: n.data.text, branches }
    } else if (n.type === 'integration') {
      flow[n.id] = {
        id: n.id,
        type: 'integration',
        text: n.data.text,
        url: n.data.url ?? '',
        onSuccess: targetOf(n.id, 'success'),
        onError: targetOf(n.id, 'error'),
      }
    }
  }

  return { root: graph.root, flow }
}

// ===========================================================================
// Validação do grafo (Fluxo v2 entrega 5, 13/10/2026)
//
// Até aqui nenhuma camada validava — nem o editor normal, nem o `PATCH`, nem o
// `publish`. O diagnóstico de 09/10 registrou isso, e os comentários do código
// falavam de uma validação que não existia. Grafo malformado trava o editor na
// carga; com a importação de JSON desta mesma entrega, a porta ficaria aberta.
//
// ERRO x AVISO é a distinção que faz esta função ser usável:
//   erro  — o motor não funciona: id faltando ou repetido, ligação para card
//           inexistente, raiz inválida, tipo desconhecido, menu sem opção.
//   aviso — desenho incompleto: opção sem destino, condição com um ramo solto,
//           card inalcançável. Passa, porque desenhar em partes é normal e o
//           motor sabe lidar (opção sem destino entrega a uma pessoa).
//
// O servidor tem o espelho desta função (PATCH e publish). A duplicação é
// inevitável — TypeScript aqui, string compilada lá, sem módulo comum — e está
// coberta por scripts/testes-handlers/validar-grafo.test.js.
// ===========================================================================

const TIPOS_VALIDOS: WAGraphNodeType[] = [
  'menu', 'content', 'handoff', 'condition', 'delay', 'assistant', 'random', 'integration',
]

export interface ValidacaoDoGrafo {
  erros: string[]
  avisos: string[]
  ok: boolean
}

export function validarGrafo(g: unknown): ValidacaoDoGrafo {
  const erros: string[] = []
  const avisos: string[] = []
  const pronto = () => ({ erros, avisos, ok: erros.length === 0 })

  if (!g || typeof g !== 'object' || Array.isArray(g)) {
    erros.push('O fluxo não é um objeto.')
    return pronto()
  }
  const graph = g as Partial<WAGraph>
  if (!Array.isArray(graph.nodes) || graph.nodes.length === 0) {
    erros.push('O fluxo não tem nenhum card.')
    return pronto()
  }
  if (graph.edges !== undefined && !Array.isArray(graph.edges)) {
    erros.push('As ligações do fluxo não são uma lista.')
    return pronto()
  }

  const porId = new Map<string, WAGraphNode>()
  graph.nodes.forEach((n, i) => {
    const onde = `card ${i + 1}`
    if (!n || typeof n !== 'object') { erros.push(`${onde}: não é um objeto.`); return }
    const id = String(n.id ?? '')
    if (!id) { erros.push(`${onde}: está sem id.`); return }
    if (porId.has(id)) { erros.push(`há dois cards com o id "${id}".`); return }
    porId.set(id, n)
    if (!n.type || !TIPOS_VALIDOS.includes(n.type)) {
      erros.push(`card "${id}": tipo "${String(n.type)}" não existe.`)
      return
    }
    if (!n.data || typeof n.data !== 'object') { erros.push(`card "${id}": está sem conteúdo.`); return }
    if (n.type === 'menu') {
      const ops = n.data.options
      if (!Array.isArray(ops) || ops.length === 0) {
        erros.push(`menu "${id}": menu sem opção nenhuma não deixa o cliente escolher nada.`)
      } else {
        const vistos = new Set<string>()
        ops.forEach((op, o) => {
          const oid = String(op?.id ?? '')
          if (!oid) { erros.push(`menu "${id}": a opção ${o + 1} está sem id.`); return }
          if (vistos.has(oid)) { erros.push(`menu "${id}": duas opções com o id "${oid}".`); return }
          vistos.add(oid)
          if (!String(op.label ?? '').trim()) {
            erros.push(`menu "${id}": a opção "${oid}" está sem texto.`)
          }
        })
      }
      if (!String(n.data.text ?? '').trim()) avisos.push(`menu "${id}": está sem a pergunta.`)
    }
    if ((n.type === 'content' || n.type === 'handoff') && !String(n.data.text ?? '').trim()) {
      avisos.push(`card "${id}": está sem mensagem.`)
    }
  })

  const raiz = graph.root ? String(graph.root) : String(graph.nodes[0]?.id ?? '')
  if (!raiz || !porId.has(raiz)) {
    erros.push('o fluxo não tem começo: a raiz aponta para um card que não existe.')
  }

  const saidas = new Map<string, string>()
  ;(graph.edges ?? []).forEach((ed, e) => {
    const de = String(ed?.source ?? '')
    const para = String(ed?.target ?? '')
    if (!porId.has(de)) { erros.push(`ligação ${e + 1}: sai de um card que não existe ("${de}").`); return }
    if (!porId.has(para)) { erros.push(`ligação ${e + 1}: vai para um card que não existe ("${para}").`); return }
    saidas.set(`${de}|${ed.sourceHandle ?? 'next'}`, para)
  })
  if (erros.length) return pronto()

  // ── avisos: desenho incompleto, não quebrado ──
  for (const [id, no] of porId) {
    if (no.type === 'menu') {
      for (const op of no.data.options ?? []) {
        if (!saidas.has(`${id}|opt:${op.id}`)) {
          avisos.push(`menu "${id}": a opção "${op.label || op.id}" não leva a nenhum card — quem escolher vai para uma pessoa.`)
        }
      }
    }
    if (no.type === 'condition') {
      if (!saidas.has(`${id}|true`)) avisos.push(`condição "${id}": a saída Sim não está ligada; o fluxo para aí.`)
      if (!saidas.has(`${id}|false`)) avisos.push(`condição "${id}": a saída Não não está ligada; o fluxo para aí.`)
    }
  }

  const alcancados = new Set<string>()
  const fila = [raiz]
  while (fila.length) {
    const atual = fila.shift()
    if (!atual || alcancados.has(atual)) continue
    alcancados.add(atual)
    for (const [chave, destino] of saidas) {
      if (chave.slice(0, chave.lastIndexOf('|')) === atual) fila.push(destino)
    }
  }
  for (const id of porId.keys()) {
    if (!alcancados.has(id)) avisos.push(`card "${id}": não é alcançável a partir do começo do fluxo.`)
  }

  return pronto()
}
