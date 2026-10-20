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
  /** Pergunta ao cliente e confere a resposta (Fluxo v2 entrega 6b). */
  | 'question'
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
    /**
     * LEGADO (21/10/2026). O prazo do aviso ao plantão passou a ser uma configuração única
     * (Desempenho WhatsApp → Configuração de avisos): o editor não oferece mais este campo, o
     * motor não o lê e o salvamento não o valida. Fica no tipo só porque fluxos antigos podem
     * trazê-lo gravado, e o editor devolve o `data` inteiro ao salvar.
     */
    avisarApos?: number
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
    /** Card `question`: o que a resposta tem de ser para valer. */
    validacao?: 'qualquer' | 'numero' | 'email' | 'telefone' | 'cnpj'
    /** Card `question`: quantas vezes insistir antes de desistir. */
    tentativas?: number
    /** Card `question`: o que dizer quando a resposta não vale. */
    erro?: string
    /** Card `question`: campo da conversa onde guardar a resposta já limpa. */
    guardarEm?: string
    /**
     * Cards `menu` e `question`: quanto esperar pela resposta do cliente, em
     * minutos, antes de seguir pela saída "sem resposta" (porta `timeout`).
     *
     * Vazio, 0 ou ausente = espera para sempre, que é o que o portal sempre
     * fez. 1 a 1440 (um dia) = o relógio segue a saída `timeout` se o cliente
     * não escrever nesse prazo.
     *
     * Como o prazo do card Atendente, vale para quem PARAR no card depois da
     * publicação: conversa já parada não tem o prazo gravado.
     */
    semRespostaMin?: number
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
  'menu', 'content', 'handoff', 'condition', 'tag', 'question', 'delay',
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
    if (n.type === 'menu' || n.type === 'question') {
      // Minuto inteiro: o relógio bate de minuto em minuto, e 1440 é um dia —
      // acima disso o prazo não é mais "o cliente não respondeu", é abandono,
      // e quem fecha conversa parada é outro job.
      const t = n.data.semRespostaMin
      if (t !== undefined && t !== null && String(t) !== '') {
        const n2 = Number(t)
        if (!Number.isInteger(n2) || n2 < 0 || n2 > 1440) {
          erros.push(
            `card "${id}": o prazo de espera pela resposta precisa ser um número inteiro de 0 a 1440 minutos (0 = espera para sempre).`,
          )
        }
      }
    }
    if (n.type === 'question') {
      // Pergunta sem pergunta é um card que espera resposta sem dizer o que
      // quer: o cliente fica parado olhando a conversa.
      if (!String(n.data.text ?? '').trim()) {
        erros.push(`pergunta "${id}": está sem a pergunta — o cliente não saberia o que responder.`)
      }
      const t = n.data.tentativas
      if (t !== undefined && (!Number.isFinite(Number(t)) || Number(t) < 1)) {
        erros.push(`pergunta "${id}": o número de tentativas precisa ser 1 ou mais.`)
      }
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
    // Prazo e saída "sem resposta" só servem juntos: um sem o outro é metade
    // de um desenho, e o motor não faz nada em nenhum dos dois casos. Aviso, e
    // não erro, porque desenhar em partes é normal.
    if (no.type === 'menu' || no.type === 'question') {
      const prazo = Number(no.data.semRespostaMin ?? 0)
      const temSaida = saidas.has(`${id}|timeout`)
      if (prazo > 0 && !temSaida) {
        avisos.push(`card "${id}": espera ${prazo} min por resposta, mas a saída "sem resposta" não está ligada — nada vai acontecer quando o prazo vencer.`)
      }
      if (prazo <= 0 && temSaida) {
        avisos.push(`card "${id}": a saída "sem resposta" está ligada, mas o card não tem prazo de espera — esse caminho nunca vai ser usado.`)
      }
    }
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
    if (no.type === 'question') {
      if (!saidas.has(`${id}|next`)) {
        avisos.push(`pergunta "${id}": a saída de resposta válida não está ligada — quem responder certo vai para uma pessoa.`)
      }
      if (!saidas.has(`${id}|fail`)) {
        avisos.push(`pergunta "${id}": a saída de desistência não está ligada — quem errar as tentativas vai para uma pessoa.`)
      }
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
