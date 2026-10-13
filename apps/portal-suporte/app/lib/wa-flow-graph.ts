// =============================================================================
// O formato do fluxo do WhatsApp: `nodes[]` + `edges[]`, com a aresta saindo de
// uma PORTA do nó (`sourceHandle`), não de um campo embutido.
//
// É o formato que o editor desenha, que o banco guarda e que o motor do inbound
// executa — um só, do começo ao fim.
//
// Até 13/10/2026 este arquivo também carregava a conversão de e para um
// SEGUNDO formato (`WA_MENU_FLOW`, `buildFlowGraph`, `graphToFlow`,
// `starterGraph`, `estimatedHeight`), herança da época em que o fluxo vinha de
// uma árvore no código. O motor nunca leu esse formato: ele lê o grafo cru. As
// 600+ linhas eram código morto que ninguém sabia se ainda batia com o runtime
// — o defeito 6 do diagnóstico de 09/10 — e saíram na entrega 6 do Fluxo v2,
// depois de conferir que nenhum arquivo do repositório as usava.
// =============================================================================

export type WAGraphNodeType =
  | 'menu'
  | 'content'
  | 'handoff'
  | 'condition'
  /** Aplica ou remove etiquetas na conversa (Fluxo v2 entrega 6). */
  | 'tag'
  | 'delay'
  // Os três abaixo o motor NUNCA executou: caíam em "chamar atendente", em
  // silêncio. Saíram do editor na entrega 6 e continuam aqui pelos fluxos
  // antigos que já os têm — o tipo precisa existir para eles serem desenhados.
  | 'assistant'
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
    /** Etiquetas que o card `tag` aplica na conversa. */
    tagsAplicar?: string[]
    /** Etiquetas que o card `tag` remove da conversa. */
    tagsRemover?: string[]
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
  'menu', 'content', 'handoff', 'condition', 'tag', 'delay',
  // continuam válidos para os fluxos antigos que já os têm
  'assistant', 'random', 'integration',
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
