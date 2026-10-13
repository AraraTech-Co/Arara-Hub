// =============================================================================
// Formatação do WhatsApp: *negrito*, _itálico_, ~tachado~, ```monospace```.
//
// SEGURANÇA, e é o motivo de este arquivo existir: o texto vem do CLIENTE.
// Gerar HTML a partir dele — mesmo "escapando" antes — é a porta que esta
// função fecha por construção. O parser devolve uma ÁRVORE DE NÓS; quem
// renderiza usa elementos React, que escapam texto por natureza. Não existe
// caminho daqui até `dangerouslySetInnerHTML`.
//
// CUSTO: varredura linear com índice, sem regex aninhada. O handoff alertava
// para regex de custo exponencial; aqui o problema não existe porque não há
// backtracking — 10 kB de `*` percorre 10 kB uma vez.
//
// As regras são as do WhatsApp, não as do Markdown:
//   - o delimitador precisa cercar conteúdo: `**` não é negrito vazio, é texto;
//   - não pode haver espaço logo depois da abertura nem antes do fechamento —
//     `* oi *` é literal, que é o que faz "2 * 3 * 4" não virar negrito;
//   - `_` só abre/fecha em borda de palavra, senão toda URL com underline
//     (`arara_tech/meu_arquivo`) viraria itálico;
//   - ``` é literal por dentro: dentro de monospace não há formatação.
// =============================================================================

export type NoFormatado =
  | { tipo: 'texto'; texto: string }
  | { tipo: 'negrito' | 'italico' | 'tachado'; filhos: NoFormatado[] }
  | { tipo: 'mono'; texto: string }

/** Marcador → tipo de nó. A ordem não importa: a decisão é por caractere. */
const MARCAS: Record<string, 'negrito' | 'italico' | 'tachado'> = {
  '*': 'negrito',
  _: 'italico',
  '~': 'tachado',
}

const ESPACO = /\s/
/** Borda de palavra para o `_`: letra, número ou o próprio `_` contam como "dentro". */
const PALAVRA = /[\p{L}\p{N}_]/u

/**
 * Acha o fechamento de uma marca aberta em `abre`, ou -1.
 *
 * Um fechamento vale quando: não é o caractere seguinte à abertura (conteúdo
 * vazio não formata), o caractere ANTES dele não é espaço, e — só para `_` — o
 * caractere DEPOIS dele não é de palavra.
 */
function acharFechamento(texto: string, marca: string, abre: number): number {
  for (let i = abre + 1; i < texto.length; i++) {
    if (texto[i] !== marca) continue
    if (i === abre + 1) return -1            // `**`: vazio, não formata
    if (ESPACO.test(texto[i - 1])) continue  // `*oi *`: espaço antes do fecha
    if (marca === '_' && i + 1 < texto.length && PALAVRA.test(texto[i + 1])) continue
    return i
  }
  return -1
}

/** Uma abertura vale se o que vem depois dela não é espaço (e borda, para `_`). */
function aberturaValida(texto: string, marca: string, i: number): boolean {
  const depois = texto[i + 1]
  if (depois === undefined || ESPACO.test(depois)) return false
  if (marca === '_') {
    const antes = texto[i - 1]
    // `_` no meio de palavra é parte da palavra (nome_de_arquivo, URL).
    if (antes !== undefined && PALAVRA.test(antes)) return false
  }
  return true
}

/**
 * Converte o texto do WhatsApp numa árvore de nós.
 *
 * Nunca lança: texto malformado vira texto. O pior caso é o cliente ver o
 * asterisco que ele mesmo digitou.
 */
/**
 * Acima disto o texto sai sem formatação nenhuma.
 *
 * Uma mensagem de WhatsApp vai até ~65 kB, e 16 kB já não é conversa — é
 * despejo. Formatar não acrescenta nada ali, e a rede de proteção custa uma
 * comparação.
 */
const LIMITE_DE_FORMATACAO = 16 * 1024

export function formatarWhatsApp(entrada: string | null | undefined): NoFormatado[] {
  const texto = String(entrada ?? '')
  if (!texto) return []
  if (texto.length > LIMITE_DE_FORMATACAO) return [{ tipo: 'texto', texto }]

  const nos: NoFormatado[] = []
  let buffer = ''

  // ── Memória de fechamento ausente ───────────────────────────────────────
  //
  // Sem isto o parser é QUADRÁTICO no pior caso real: `*a *a *a …`. Cada `*` é
  // abertura válida (vem letra depois), e nenhum dos `*` seguintes serve de
  // fechamento (todos têm espaço antes), então cada abertura varre o texto até
  // o fim. Medido: 65 kB levavam 3,0 s — e a bolha re-renderiza a cada ciclo
  // do polling, com texto que vem do cliente.
  //
  // Por que guardar um índice basta: se a varredura a partir de `abre` rejeitou
  // TODOS os candidatos, uma varredura a partir de um índice MAIOR olha um
  // subconjunto deles. O único motivo de rejeição que depende de `abre` é
  // "candidato colado na abertura" (conteúdo vazio), e esse candidato fica para
  // trás quando a abertura anda para a frente. Logo, não há fechamento adiante
  // para nenhuma abertura posterior da mesma marca.
  //
  // A memória é LOCAL a esta chamada de propósito: a recursão trabalha sobre um
  // pedaço fatiado, com índices próprios.
  const semFechamento: Record<string, number> = {}
  const despejar = () => {
    if (buffer) { nos.push({ tipo: 'texto', texto: buffer }); buffer = '' }
  }

  let i = 0
  while (i < texto.length) {
    // ``` tem precedência: o conteúdo é literal, inclusive outros marcadores.
    if (texto.startsWith('```', i)) {
      const fim = texto.indexOf('```', i + 3)
      if (fim > i + 2) {
        despejar()
        nos.push({ tipo: 'mono', texto: texto.slice(i + 3, fim) })
        i = fim + 3
        continue
      }
      // Sem fechamento: as três crases são texto.
      buffer += '```'
      i += 3
      continue
    }

    const marca = MARCAS[texto[i]]
    const jaSemFecho = semFechamento[texto[i]] !== undefined && i >= semFechamento[texto[i]]
    if (marca && !jaSemFecho && aberturaValida(texto, texto[i], i)) {
      const fim = acharFechamento(texto, texto[i], i)
      if (fim < 0) semFechamento[texto[i]] = i
      if (fim > i) {
        despejar()
        // Recursão no conteúdo: *negrito com _itálico_ dentro* funciona, e a
        // profundidade é limitada pelo tamanho do texto.
        nos.push({ tipo: marca, filhos: formatarWhatsApp(texto.slice(i + 1, fim)) })
        i = fim + 1
        continue
      }
    }

    buffer += texto[i]
    i++
  }
  despejar()
  return nos
}

/** O texto sem marcação — para busca, prévia curta e exportação. */
export function textoPuro(nos: NoFormatado[]): string {
  return nos.map((n) => {
    if (n.tipo === 'texto') return n.texto
    if (n.tipo === 'mono') return n.texto
    return textoPuro(n.filhos)
  }).join('')
}
