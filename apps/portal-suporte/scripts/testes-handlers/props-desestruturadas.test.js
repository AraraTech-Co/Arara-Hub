// =============================================================================
// Toda propriedade declarada no tipo de props e USADA no corpo do componente
// precisa estar na desestruturação do parâmetro.
//
// Por que este teste existe: o build do portal roda com `ignoreBuildErrors`
// (next.config.mjs), então o compilador não reclama de identificador que não
// existe. Um nome usado no corpo sem estar na desestruturação compila, sobe, e
// quebra a tela inteira no navegador com "<nome> is not defined" — o resto do
// portal continua de pé e só aquela área cai.
//
// O teste varre os .tsx de app/, casa cada tipo `*Props` com a função que o
// recebe desestruturado, e cobra que todo campo citado no corpo tenha sido
// desestruturado.
// =============================================================================
'use strict'

const fs = require('node:fs')
const path = require('node:path')

const RAIZ = path.resolve(__dirname, '../../app')

/** Todos os .tsx de app/, menos node_modules. */
function arquivos(dir) {
  const saida = []
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (item.name === 'node_modules') continue
    const p = path.join(dir, item.name)
    if (item.isDirectory()) saida.push(...arquivos(p))
    else if (item.name.endsWith('.tsx')) saida.push(p)
  }
  return saida
}

const achados = []
for (const arquivo of arquivos(RAIZ)) {
  const src = fs.readFileSync(arquivo, 'utf8')
  const tipos = src.matchAll(/(?:interface|type)\s+(\w*Props)\s*=?\s*\{([\s\S]*?)\n\}/g)
  for (const tipo of tipos) {
    const nome = tipo[1]
    // Campos no primeiro nível do tipo (dois espaços de indentação).
    const campos = new Set(
      [...tipo[2].matchAll(/^ {2}(\w+)\??\s*:/gm)].map((m) => m[1]),
    )
    if (!campos.size) continue
    // A função que recebe esse tipo desestruturado: ({ a, b }: XProps)
    const usos = src.matchAll(
      new RegExp(`\\(\\s*\\{([^}]*)\\}\\s*:\\s*${nome}\\s*\\)`, 'g'),
    )
    for (const uso of usos) {
      const destruturados = new Set(
        [...uso[1].matchAll(/(\w+)\s*(?:=|,|$|:)/g)].map((m) => m[1]),
      )
      const corpo = src.slice(uso.index + uso[0].length)
      for (const campo of campos) {
        if (destruturados.has(campo)) continue
        // Citado no corpo como identificador solto (não `obj.campo`).
        const citado = new RegExp(`(?<![\\w.$])${campo}(?![\\w$])`).test(corpo)
        if (citado) {
          achados.push(`${path.relative(RAIZ, arquivo)} — ${nome}.${campo}`)
        }
      }
    }
  }
}

if (achados.length) {
  console.error('FALHA  propriedade usada no corpo e fora da desestruturação:')
  for (const a of achados) console.error('   ' + a)
  console.error('\nIsso quebra a tela com "<nome> is not defined" em produção.')
  process.exit(1)
}

console.log('ok    toda propriedade usada no corpo está desestruturada')
console.log('todos os casos passaram')
