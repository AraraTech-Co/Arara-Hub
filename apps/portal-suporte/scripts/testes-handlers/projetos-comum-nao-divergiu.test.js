// O bloco COMUM do módulo `projetos` não pode divergir do que está no ar.
//
// `scripts/_projetos_comum.py` guarda o bloco que os sete scripts do módulo
// escrevem dentro de cada handler, e `routes.generated.ts` guarda o que está
// NO AR. Nada obriga os dois a andarem juntos: o script é editado à mão e só
// alcança o arquivo de rotas quando alguém roda `--aplicar`.
//
// O desvio não aparece em teste nenhum porque os testes carregam o handler do
// arquivo de rotas, não o script. Foi assim que o `_PCT` do script perdeu o
// `em_revisao` enquanto os 18 handlers no ar tinham `em_revisao: 60`: rodar
// `projetos-regras.py --aplicar` naquele estado reescreveria os 18 sem a faixa,
// e todo card em revisão passaria a valer 0% de progresso no cálculo do
// projeto, sem erro, sem log e sem ninguém perceber.
//
// A conferência é do CÓDIGO, não do texto: comentário pode estar mais novo no
// script (é onde a decisão é escrita primeiro) sem mudar comportamento algum.
// Por isso o bloco é comparado sem comentários — e, para um comentário apagado
// não poder esconder código apagado junto, cada tabela que decide número é
// conferida também campo a campo.
//
// Roda com: node projetos-comum-nao-divergiu.test.js
const fs = require('node:fs')
const path = require('node:path')
const { ok, fim, ARQ } = require('./_carregar.js')

const SCRIPT = path.resolve(__dirname, '..', '_projetos_comum.py')

/** O valor de `COMUM = """..."""` no script, sem importar o módulo: o import
 *  roda `env()`, que abre `.env.local` — a chave privada da plataforma não
 *  entra num teste. */
function comumDoScript() {
  const fonte = fs.readFileSync(SCRIPT, 'utf8')
  const abre = fonte.indexOf('COMUM = """')
  if (abre < 0) throw new Error('não achei COMUM no script')
  const ini = abre + 'COMUM = """'.length
  const fecha = fonte.indexOf('"""', ini)
  if (fecha < 0) throw new Error('COMUM sem fechamento')
  // `"""..."""` do Python não é literal cru: a barra da expressão regular de
  // data está escrita `\\d` no arquivo e vale `\d` na string. Só essa escapa
  // existe hoje; qualquer outra que apareça vai sobrar diferente e o caso de
  // igualdade reprova, que é o lado certo para errar.
  return fonte.slice(ini, fecha).replace(/\\\\/g, '\\')
}

/** Linha a linha, sem comentário e sem espaço de sobra. */
function codigo(js) {
  return js
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('//'))
    .join('\n')
}

/** Os literais de todos os handlers do arquivo de rotas, com o cabeçalho. */
function literais() {
  const t = fs.readFileSync(ARQ, 'utf8')
  const saida = []
  let i = 0
  while ((i = t.indexOf('compileController(', i)) >= 0) {
    let a = t.indexOf('"', i)
    let b = a + 1
    for (;;) {
      if (t[b] === '\\') { b += 2; continue }
      if (t[b] === '"') break
      b++
    }
    const cab = t.lastIndexOf('\n  // ', a)
    saida.push({
      rota: t.slice(cab + 5, t.indexOf('\n', cab + 5)).trim(),
      corpo: JSON.parse(t.slice(a, b + 1)),
    })
    i = b
  }
  return saida
}

/** A tabela `var NOME = { ... };` lida como pares, para comparar campo a campo
 *  sem depender de espaço nem de ordem. */
function tabela(js, nome) {
  const abre = js.indexOf('var ' + nome + ' = {')
  if (abre < 0) return null
  const fecha = js.indexOf('};', abre)
  if (fecha < 0) return null
  const pares = {}
  for (const p of js.slice(abre + ('var ' + nome + ' = {').length, fecha).split(',')) {
    const t = p.trim()
    if (!t) continue
    const d = t.indexOf(':')
    if (d < 0) return null
    pares[t.slice(0, d).trim()] = t.slice(d + 1).trim()
  }
  return pares
}

;(() => {
  const comum = comumDoScript()
  const doScript = codigo(comum)
  const linhasDoScript = doScript.split('\n')

  // O laboratório mede: o bloco tem de ser substancial e começar pela guarda
  // de identidade. Um `comumDoScript()` que voltasse vazio faria toda
  // comparação abaixo passar de graça.
  ok('o-bloco-do-script-foi-lido',
    linhasDoScript.length > 100 && doScript.includes('async function _sessaoDoPortal(ctx)'),
    { linhas: linhasDoScript.length })

  const pctScript = tabela(comum, '_PCT')
  ok('o-script-tem-a-tabela-de-progresso', !!pctScript && Object.keys(pctScript).length >= 9,
    pctScript)

  // Os handlers do módulo: os que carregam a tabela de progresso.
  const comPct = literais().filter((h) => h.corpo.includes('var _PCT = {'))
  ok('os-handlers-do-modulo-foram-achados', comPct.length >= 18,
    { quantos: comPct.length, rotas: comPct.map((h) => h.rota.split(' ')[0]) })

  // ── 1. O código do bloco é o mesmo em todo handler ───────────────────────
  //
  // O recorte é ancorado SÓ na primeira linha do bloco, e segue o comprimento
  // do bloco do script. A última linha é `}`, que aparece dezenas de vezes no
  // handler: usá-la como âncora de fim pegaria o fecho da rota inteira e a
  // comparação viraria outra coisa.
  {
    const primeira = linhasDoScript[0]
    const divergiram = []
    const naoRecortou = []
    for (const h of comPct) {
      const linhas = codigo(h.corpo).split('\n')
      const a = linhas.indexOf(primeira)
      if (a < 0) { naoRecortou.push(h.rota); continue }
      if (linhas.slice(a, a + linhasDoScript.length).join('\n') !== doScript) {
        divergiram.push(h.rota)
      }
    }
    ok('o-recorte-do-bloco-acha-o-comeco', naoRecortou.length === 0, naoRecortou)
    ok('o-codigo-do-bloco-e-igual-em-todo-handler', divergiram.length === 0, divergiram)
  }

  // ── 2. A tabela de progresso, campo a campo ──────────────────────────────
  //
  // Esta é a tabela que o desvio atingiu. Vai conferida à parte porque é ela
  // que vira número na tela do projeto: faixa de menos, card naquele status
  // conta 0.
  {
    const faltando = []
    const diferente = []
    const sobrando = []
    for (const h of comPct) {
      const pct = tabela(h.corpo, '_PCT') || {}
      for (const k of Object.keys(pctScript)) {
        if (!(k in pct)) { faltando.push(h.rota + ':' + k); continue }
        if (pct[k] !== pctScript[k]) diferente.push(h.rota + ':' + k)
      }
      for (const k of Object.keys(pct)) if (!(k in pctScript)) sobrando.push(h.rota + ':' + k)
    }
    ok('nenhuma-faixa-de-progresso-falta-no-ar', faltando.length === 0, faltando)
    ok('nenhuma-faixa-de-progresso-mudou-de-valor', diferente.length === 0, diferente)
    ok('nenhuma-faixa-de-progresso-sobra-no-ar', sobrando.length === 0, sobrando)
    ok('em-revisao-vale-60-nos-dois-lados',
      pctScript.em_revisao === '60' &&
      comPct.every((h) => (tabela(h.corpo, '_PCT') || {}).em_revisao === '60'),
      { script: pctScript.em_revisao })
  }

  fim()
})()
