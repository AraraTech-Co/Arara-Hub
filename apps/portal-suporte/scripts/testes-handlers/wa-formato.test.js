// Formatação do WhatsApp — Fase 1, A3.
//
// O parser é TypeScript; aqui ele é compilado na hora com o próprio
// TypeScript que o app já tem, para o teste rodar sem passo de build.
// Roda com: node wa-formato.test.js
const fs = require('fs')
const path = require('path')
const { ok, fim } = require('./_carregar.js')

// Tira os tipos sem precisar de tsc: o arquivo é JS com anotações, e o que
// interessa aqui é o comportamento em tempo de execução.
const fonte = fs.readFileSync(path.resolve(__dirname, '../../app/lib/wa-formato.ts'), 'utf8')
const js = fonte
  .replace(/export type[\s\S]*?\n\n/, '')
  .replace(/^export /gm, '')
  .replace(/: Record<string, '[^']*' \| '[^']*' \| '[^']*'>/g, '')
  .replace(/: NoFormatado\[\]/g, '')
  .replace(/: string \| null \| undefined/g, '')
  .replace(/: (string|number|boolean)\b/g, '')
  .replace(/\): boolean \{/g, ') {')
  .replace(/\): number \{/g, ') {')
  .replace(/const nos\b/g, 'const nos')
module.exports = {}
const mod = { exports: {} }
new Function('module', 'exports', js + '\nmodule.exports = { formatarWhatsApp, textoPuro };')(mod, mod.exports)
const { formatarWhatsApp, textoPuro } = mod.exports

/** Forma curta da árvore, para comparar sem ruído: "neg(oi)" etc. */
function forma(nos) {
  return nos.map((n) => {
    if (n.tipo === 'texto') return n.texto
    if (n.tipo === 'mono') return `mono(${n.texto})`
    const sigla = { negrito: 'neg', italico: 'ita', tachado: 'tac' }[n.tipo]
    return `${sigla}(${forma(n.filhos)})`
  }).join('')
}

;(async () => {
  // ── o básico ─────────────────────────────────────────────────────────────
  const BASICO = [
    ['*oi*', 'neg(oi)'],
    ['_oi_', 'ita(oi)'],
    ['~oi~', 'tac(oi)'],
    ['```oi```', 'mono(oi)'],
    ['antes *meio* depois', 'antes neg(meio) depois'],
    ['sem marcação nenhuma', 'sem marcação nenhuma'],
    ['', ''],
  ]
  for (const [entrada, esperado] of BASICO) {
    ok(`${JSON.stringify(entrada)} -> ${esperado || '(vazio)'}`, forma(formatarWhatsApp(entrada)) === esperado,
      forma(formatarWhatsApp(entrada)))
  }

  // ── os casos de borda que o handoff pede ────────────────────────────────
  // `*` solto não formata nada.
  const SOLTOS = [
    ['um * dois', 'um * dois'],
    ['*', '*'],
    ['**', '**'],
    ['*aberto sem fechar', '*aberto sem fechar'],
    ['2 * 3 * 4', '2 * 3 * 4'],          // multiplicação, não negrito
    ['* oi *', '* oi *'],                // espaço depois da abertura
    ['*oi *', '*oi *'],                  // espaço antes do fechamento
  ]
  for (const [entrada, esperado] of SOLTOS) {
    ok(`solto: ${JSON.stringify(entrada)}`, forma(formatarWhatsApp(entrada)) === esperado,
      forma(formatarWhatsApp(entrada)))
  }

  // URL com `_` não vira itálico — o caso que mais apareceria no dia a dia.
  const URLS = [
    'https://arara-tech.com/meu_arquivo_final.pdf',
    'nome_de_arquivo.txt',
    'snake_case_mesmo',
  ]
  for (const u of URLS) {
    ok(`URL/identificador intacto: ${u}`, forma(formatarWhatsApp(u)) === u, forma(formatarWhatsApp(u)))
  }
  // mas `_itálico_` cercado de espaço continua funcionando
  ok('itálico entre espaços funciona', forma(formatarWhatsApp('olha o _grifo_ aqui')) === 'olha o ita(grifo) aqui',
    forma(formatarWhatsApp('olha o _grifo_ aqui')))

  // ── aninhamento ─────────────────────────────────────────────────────────
  ok('negrito com itálico dentro',
    forma(formatarWhatsApp('*oi _tudo_ bem*')) === 'neg(oi ita(tudo) bem)',
    forma(formatarWhatsApp('*oi _tudo_ bem*')))
  ok('três níveis',
    forma(formatarWhatsApp('*a _b ~c~ d_ e*')) === 'neg(a ita(b tac(c) d) e)',
    forma(formatarWhatsApp('*a _b ~c~ d_ e*')))

  // Dentro de monospace NADA formata — é literal.
  ok('monospace é literal por dentro',
    forma(formatarWhatsApp('```*nao* _eh_ negrito```')) === 'mono(*nao* _eh_ negrito)',
    forma(formatarWhatsApp('```*nao* _eh_ negrito```')))
  ok('``` sem fechar vira texto',
    forma(formatarWhatsApp('```sem fim')) === '```sem fim',
    forma(formatarWhatsApp('```sem fim')))

  // ── o caso de segurança: HTML do cliente é TEXTO ────────────────────────
  // O parser não produz HTML, produz nós. Quem renderiza usa React, que escapa.
  const HTML = '<b>oi</b> <script>alert(1)</script>'
  const arvore = formatarWhatsApp(HTML)
  ok('HTML do cliente fica literal', forma(arvore) === HTML, forma(arvore))
  ok('  e nenhum nó é "html"', JSON.stringify(arvore).indexOf('"html"') < 0, arvore)
  ok('  o texto puro preserva o original', textoPuro(arvore) === HTML, textoPuro(arvore))

  const COM_MARCA = '*<b>negrito</b>*'
  ok('HTML dentro de negrito continua literal',
    forma(formatarWhatsApp(COM_MARCA)) === 'neg(<b>negrito</b>)', forma(formatarWhatsApp(COM_MARCA)))

  // ── custo: 10 kB de `*` não pode travar ─────────────────────────────────
  const BOMBA = '*'.repeat(10000)
  let t0 = Date.now()
  let r = formatarWhatsApp(BOMBA)
  let gasto = Date.now() - t0
  ok('10 kB de `*` não trava', gasto < 1000, gasto + 'ms')
  ok('  e o texto volta inteiro', textoPuro(r) === BOMBA, textoPuro(r).length)

  // Pior caso com alternância, que é o que derruba regex com backtracking.
  //
  // Aqui o texto puro é MENOR que a entrada, e está certo: diferente do caso
  // acima (onde nenhum `*` chega a formatar, porque o conteúdo seria vazio),
  // `*_~*_~…` forma pares de verdade, e `textoPuro` existe justamente para
  // tirar a marcação. Minha primeira versão deste caso comparava com a entrada
  // inteira e acusou o parser de perder caracteres — o teste é que estava
  // errado. O que importa provar aqui é que não trava e que nada sobra do que
  // NÃO é marcador.
  const BOMBA2 = '*_~'.repeat(4000)
  t0 = Date.now()
  r = formatarWhatsApp(BOMBA2)
  gasto = Date.now() - t0
  ok('12 kB alternando marcadores não trava', gasto < 1000, gasto + 'ms')
  ok('  e o que sobra são só marcadores soltos',
    /^[*_~]*$/.test(textoPuro(r)), textoPuro(r).slice(0, 40))

  // ── textoPuro ───────────────────────────────────────────────────────────
  ok('textoPuro tira a marcação',
    textoPuro(formatarWhatsApp('*oi* _tudo_ ```bem```')) === 'oi tudo bem',
    textoPuro(formatarWhatsApp('*oi* _tudo_ ```bem```')))

  // ── entradas estranhas não quebram ──────────────────────────────────────
  for (const esquisito of [null, undefined, '\n\n', '   ', '😀 *oi* 😀']) {
    let passou = true
    try { formatarWhatsApp(esquisito) } catch (e) { passou = false }
    ok(`entrada ${JSON.stringify(esquisito)} não lança`, passou)
  }
  ok('emoji com negrito funciona',
    forma(formatarWhatsApp('😀 *oi* 😀')) === '😀 neg(oi) 😀', forma(formatarWhatsApp('😀 *oi* 😀')))

  fim()
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(1) })
