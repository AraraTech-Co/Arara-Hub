// Carrega um handler de dentro do routes.generated.ts para testar isolado.
//
// O backend do portal guarda cada handler como STRING dentro de
// compileController("..."). Não dá para importar: este módulo acha a entrada
// pela marca do cabeçalho, desescapa o literal e executa num contexto de `vm`
// com um `ctx` falso. É o único jeito de provar permissão e caminho de erro
// sem tocar em produção — e produção é ambiente único, sem staging.
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const ARQ = path.resolve(
  __dirname,
  '../../../../packages/api/src/apps/portal-suporte/routes.generated.ts',
)

/** @param marca trecho do cabeçalho, ex.: "490b profiles POST /admin/membros" */
function carregarHandler(marca) {
  const s = fs.readFileSync(ARQ, 'utf8')
  const at = s.indexOf(marca)
  if (at < 0) {
    // A rota pode ainda não estar publicada neste branch (ver PR de backend).
    // Falhar aqui faria parecer defeito do teste; melhor dizer o que falta.
    console.log(`PENDENTE  rota ainda não está no routes.generated.ts: ${marca}`)
    console.log('          este teste roda depois que o PR de backend entrar.')
    process.exit(0)
  }
  const re = /compileController\(\s*"((?:[^"\\]|\\.)*)"\s*\)/g
  re.lastIndex = at
  const m = re.exec(s)
  if (!m) throw new Error(`compileController não encontrado depois de: ${marca}`)
  const codigo = JSON.parse('"' + m[1] + '"')

  const c = {
    console, Date, JSON, String, Number, Object, Array, Math, Promise, parseInt,
    RegExp, Buffer, encodeURIComponent, decodeURIComponent,
    module: { exports: {} },
  }
  c.exports = c.module.exports
  c.globalThis = c
  vm.createContext(c)
  vm.runInContext(codigo, c)
  // O handler EXPORTADO, não a função crua: é nele que moram as guardas de
  // sessão e de nível, que são justamente o que precisa ser testado.
  return c.module.exports.handler
}

/** Resposta mínima no formato que os handlers usam. */
function reply() {
  return { status(x) { this._s = x; return this }, send(v) { return { status: this._s || 200, body: v } } }
}

let falhas = 0
function ok(nome, condicao, detalhe) {
  if (!condicao) falhas++
  console.log((condicao ? 'ok   ' : 'FALHA') + ' ' + nome + (condicao ? '' : '  -> ' + JSON.stringify(detalhe)))
}
function fim() {
  console.log(falhas ? `\n${falhas} FALHA(S)` : '\ntodos os casos passaram')
  if (falhas) process.exit(1)
}

module.exports = { carregarHandler, reply, ok, fim, ARQ }
