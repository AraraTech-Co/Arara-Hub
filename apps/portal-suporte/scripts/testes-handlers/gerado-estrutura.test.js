// Estrutura do routes.generated.ts — o arquivo INTEIRO, não só cada handler.
//
// O backend do portal é editado à mão neste arquivo. Três jeitos de quebrá-lo
// passam despercebidos por quem olha um handler de cada vez:
//   1. trecho colado no lugar errado (no cabeçalho, fora do array): cada
//      handler continua perfeito e o arquivo não compila;
//   2. entrada sem `handler:` ou com chave a mais: o array fica torto;
//   3. handler sem `module.exports = { handler }`: a sintaxe está certa, mas o
//      compileController LANÇA na carga do módulo e a API não sobe.
// Este teste confere as três camadas. Carrega cada handler do mesmo jeito que
// packages/api/src/lib/compile-controller.ts, para não aprovar o que lá falha.
//
// Roda com: node gerado-estrutura.test.js
//          node gerado-estrutura.test.js <outro-arquivo.ts>   (ex.: uma cópia alterada)
const fs = require('fs')
const { ok, fim, ARQ } = require('./_carregar.js')

const arquivo = process.argv[2] || ARQ
const linhas = fs.readFileSync(arquivo, 'utf8').split('\n')

// ── cabeçalho do arquivo ────────────────────────────────────────────────────
ok('linha 1 é o comentário de cabeçalho e termina em */',
  /^\/\*\*.*\*\/$/.test(linhas[0]) && !linhas[0].includes('compileController('), linhas[0].slice(0, 120))

const abre = linhas.findIndex((l) => l === 'export const PortalSuporteRoutes: StaticRoute[] = [')
ok('o array de rotas abre uma vez só', abre >= 0 &&
  linhas.filter((l) => l.startsWith('export const PortalSuporteRoutes')).length === 1, abre)

// ── fechamento: `  }` e `]` no fim, nada depois ─────────────────────────────
let ultima = linhas.length - 1
while (ultima > 0 && linhas[ultima].trim() === '') ultima--
ok('o array fecha no fim do arquivo', linhas[ultima] === ']' && linhas[ultima - 1] === '  }',
  linhas.slice(ultima - 1, ultima + 1))

// ── entradas ────────────────────────────────────────────────────────────────
// Entre a abertura e o fechamento, só pode haver: cabeçalho `  // …`, `  {`,
// as chaves da entrada (4 espaços) e `  },`/`  }`.
const corpo = linhas.slice(abre + 1, ultima)
const estranhas = []
corpo.forEach((l, i) => {
  if (/^  \/\/ /.test(l) || l === '  {' || l === '  },' || l === '  }' || /^    \S/.test(l) || l === '') return
  estranhas.push(`${abre + 2 + i}: ${l.slice(0, 80)}`)
})
ok('nada fora do formato de entrada dentro do array', estranhas.length === 0, estranhas.slice(0, 5))

const entradas = []
corpo.forEach((l, i) => {
  if (l !== '  {') return
  const n = abre + 1 + i // índice em `linhas`
  entradas.push({ linha: n + 1, cabecalho: linhas[n - 1], handler: null })
})
const semCabecalho = entradas.filter((e) => !/^  \/\/ /.test(e.cabecalho))
ok('toda entrada tem cabeçalho `// …` logo antes', semCabecalho.length === 0,
  semCabecalho.slice(0, 5).map((e) => e.linha))

const fechos = corpo.filter((l) => l === '  },' || l === '  }').length
const handlers = corpo.filter((l) => l.startsWith('    handler: compileController("'))
ok('entradas = fechamentos', entradas.length === fechos, { entradas: entradas.length, fechos })
ok('entradas = handlers', entradas.length === handlers.length, { entradas: entradas.length, handlers: handlers.length })
ok('o array não está vazio', entradas.length > 0, entradas.length)

// ── cada handler carrega como o compileController carrega ───────────────────
const quebrados = []
let i = -1
corpo.forEach((l, k) => {
  if (l === '  {') i++
  if (!l.startsWith('    handler: compileController(')) return
  const nome = (entradas[i] && entradas[i].cabecalho.trim()) || `linha ${abre + 2 + k}`
  const m = /^    handler: compileController\(("(?:[^"\\]|\\.)*")\),$/.exec(l)
  if (!m) { quebrados.push(`${nome}: a linha do handler não termina em "),"`); return }
  let codigo
  try { codigo = JSON.parse(m[1]) } catch (e) { quebrados.push(`${nome}: string inválida (${e.message})`); return }
  try {
    const fabrica = new Function('module', 'exports', `${codigo}\n;return module.exports;`)
    const mod = { exports: {} }
    const exp = fabrica(mod, mod.exports)
    const saco = exp && typeof exp === 'object' ? exp : mod.exports
    const fn = typeof saco === 'function' ? saco
      : saco && typeof saco.default === 'function' ? saco.default
        : saco && typeof saco.handler === 'function' ? saco.handler : null
    if (typeof fn !== 'function') quebrados.push(`${nome}: não exporta handler(ctx) por module.exports`)
  } catch (e) {
    quebrados.push(`${nome}: não carrega (${e.message})`)
  }
})
ok(`cada um dos ${handlers.length} handlers carrega e exporta uma função`, quebrados.length === 0, quebrados.slice(0, 5))

fim()
