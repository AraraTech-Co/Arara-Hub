// Todo `setAlgumaCoisa(...)` chamado num componente existe de verdade.
//
// `emGrupos` é derivado da aba (`tab === 'grupos'`), e não estado próprio — mas
// havia uma chamada a `setEmGrupos(false)` dentro de um efeito. Em JavaScript
// isso não é erro até o efeito rodar: aí lança ReferenceError e a tela inteira
// cai. O build não pega porque `next.config.mjs` tem `ignoreBuildErrors: true`,
// e não há como clicar na tela daqui.
//
// Esta é a rede mais simples que pega essa classe de erro sem navegador e sem
// instalar nada: varre os componentes, acha cada identificador no formato
// `setAlgo(` e confere que ele está declarado NO MESMO arquivo — como estado,
// como variável, como função, como campo desestruturado das props ou como
// import. Duas coisas ficam de fora de propósito: chamada de MÉTODO
// (`algo.setItem(...)`, `audio.setValueAtTime(...)`), porque quem declara é o
// objeto, e os temporizadores do próprio runtime (`setTimeout`,
// `setInterval`), que são globais.
//
// Roda com: node setters-existem.test.js
const fs = require('fs')
const path = require('path')
const { ok, fim } = require('./_carregar.js')

const APP = path.resolve(__dirname, '../..')
const PASTAS = ['app/_components', 'app/(admin)', 'app/(public)', 'app/lib', 'app/hooks']
/** Globais do runtime: existem sem ninguém declarar. */
const DO_RUNTIME = new Set(['setTimeout', 'setInterval', 'setImmediate'])

function arquivos(dir) {
  const achados = []
  let itens = []
  try { itens = fs.readdirSync(dir, { withFileTypes: true }) } catch { return achados }
  for (const it of itens) {
    const caminho = path.join(dir, it.name)
    if (it.isDirectory()) achados.push(...arquivos(caminho))
    else if (/\.(tsx|ts)$/.test(it.name) && !/\.d\.ts$/.test(it.name)) achados.push(caminho)
  }
  return achados
}

/** Tira comentários e textos, para não cobrar um `setX(` citado em comentário. */
function semComentarios(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
}

const alvos = PASTAS.flatMap((p) => arquivos(path.join(APP, p)))
ok('achou os componentes para varrer', alvos.length > 100, alvos.length)

const problemas = []
for (const arq of alvos) {
  const bruto = fs.readFileSync(arq, 'utf8')
  const src = semComentarios(bruto)
  // A espiada para trás tira `objeto.setAlgo(` — ali quem declara é o objeto.
  const chamados = new Set((src.match(/(?<![.\w$])set[A-Z]\w*(?=\s*\()/g) || []))
  for (const nome of chamados) {
    if (DO_RUNTIME.has(nome)) continue
    const escapado = nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const declarado = new RegExp(
      // const [x, setX] = useState(...)        → estado
      `,\\s*${escapado}\\s*\\]`
      // const setX = ... | function setX(... | let setX
      + `|(?:const|let|var|function)\\s+${escapado}\\b`
      // { setX } nas props, ou setX: (…) => void no tipo, ou setX, numa lista
      + `|${escapado}\\s*[,}:]`
      // import { setX } from …
      + `|import[^;]*\\b${escapado}\\b`,
      '',
    )
    if (!declarado.test(src)) {
      problemas.push(`${path.relative(APP, arq)}: ${nome}(...) é chamado e não está declarado no arquivo`)
    }
  }
}

ok('nenhum set* é chamado sem existir', problemas.length === 0, problemas.slice(0, 10))

fim()
