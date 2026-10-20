// Onze rotas de AÇÃO que o gerador da integração deixou como CRUD genérico
// (`model.create(body)`, resposta 201) passam a responder 501 sem gravar nada.
//
//   POST /profiles/:id/role                    POST /tickets/:id/ai-summary
//   POST /admin/users/:id/set-password         POST /tickets/:id/client-action
//   POST /admin/automation/seed-defaults       POST /ai/analyze-ticket
//   POST /admin/backfill-ticket-numbers        POST /integrations/chatgpt/analyze-ticket
//   POST /admin/incidents/:id/tickets          POST /integrations/trello/sync-ticket
//                                              POST /integrations/whatsapp/sync-group
//
// Nenhuma delas tem chamador no front. A guarda de sessão do arquivo (401 sem identidade,
// nível mínimo) continua em volta do handler.
//
// O QUE SE GARANTE, para cada rota:
//   - com identidade, 501 `{ success: false, route }`, nenhuma gravação e nenhum modelo
//     de negócio acessado (só o `Profile` que a própria guarda lê);
//   - sem identidade, 401 (a guarda segue de pé);
//   - `/profiles/:id/role`, que a guarda deixa passar para qualquer usuário identificado:
//     um chamador de nível `user` também recebe 501 e nada é gravado.
//
// O CONTROLE: o corpo de antes (o CRUD genérico) é reconstituído e, sobre a mesma massa,
// responde 201 e grava a linha com o corpo da requisição.
// MUTAÇÕES: reinstalar o CRUD genérico em cada rota reprova por asserção.
//
// Roda com: node rotas-de-acao-viram-501.test.js
const fs = require('fs')
const vm = require('vm')
const { reply, ok, fim, ARQ } = require('./_carregar.js')

const ROTAS = [
  ['/profiles/:id/role', 'Profile'], ['/admin/users/:id/set-password', 'User'],
  ['/admin/automation/seed-defaults', 'AutomationRule'], ['/admin/backfill-ticket-numbers', 'Ticket'],
  ['/admin/incidents/:id/tickets', 'Ticket'], ['/ai/analyze-ticket', 'Ticket'],
  ['/integrations/chatgpt/analyze-ticket', 'Ticket'], ['/integrations/trello/sync-ticket', 'Ticket'],
  ['/integrations/whatsapp/sync-group', 'WhatsAppConversation'], ['/tickets/:id/ai-summary', 'Ticket'],
  ['/tickets/:id/client-action', 'Ticket'],
]
const TEXTO = fs.readFileSync(ARQ, 'utf8')
const RE = /compileController\(\s*"((?:[^"\\]|\\.)*)"\s*\)/g

function codigoDe(texto, path) {
  const marca = `    method: "POST",\n    path: "${path}",`
  if (texto.split(marca).length !== 2) throw new Error('rota ausente ou repetida: ' + path)
  RE.lastIndex = texto.indexOf(marca)
  return JSON.parse('"' + RE.exec(texto)[1] + '"')
}
function compilar(codigo) {
  const c = {
    console, Date, JSON, String, Number, Object, Array, Math, Promise, parseInt, parseFloat, isNaN, isFinite,
    RegExp, Buffer, Error, TypeError, setTimeout, clearTimeout, module: { exports: {} },
  }
  c.exports = c.module.exports; c.globalThis = c
  vm.createContext(c); vm.runInContext(codigo, c)
  return c.module.exports.handler
}
const STUB = (modelo) => `async function handler(ctx) {
  const model = ctx.models.${modelo};
  if (!model) return ctx.reply.status(500).send({ error: "Model ${modelo} missing" });
  const body = Object.assign({}, ctx.body || {});
  
  const row = await model.create(body);
  return ctx.reply.status(201).send(row);
}`
const BLOCO_NOVO = /async function handler\(ctx\) \{\n  \/\/ A integração gerou esta rota[\s\S]*?\n  \}\);\n\}/
const comStub = (codigo, modelo) => { if (!BLOCO_NOVO.test(codigo)) throw new Error('bloco novo ausente'); return codigo.replace(BLOCO_NOVO, () => STUB(modelo)) }

async function rodar(codigo, { nivel = 'admin', identidade = true } = {}) {
  const criados = []
  const tocados = []
  const modelos = new Proxy({}, {
    get: (_, nome) => {
      if (nome === 'Profile') return { findById: async (id) => ({ id, role: nivel }), create: async (b) => { criados.push({ modelo: 'Profile', b }); return { id: 'novo', ...b } } }
      if (nome === 'Sessao') return { findById: async () => null }
      tocados.push(String(nome))
      return { create: async (b) => { criados.push({ modelo: String(nome), b }); return { id: 'novo', ...b } } }
    },
  })
  const handler = compilar(codigo)
  const r = await handler({ params: { id: 'alvo' }, query: {}, headers: {}, user: identidade ? { id: 'u1' } : undefined, body: { role: 'admin', password: 'senha-em-texto', ticket: 'x' }, models: modelos, reply: reply() })
  return { status: r.status, corpo: r.body, criados, tocados }
}

async function bateria(textoArquivo, rotas = ROTAS) {
  const f = []
  for (const [path, modelo] of rotas) {
    const cod = codigoDe(textoArquivo, path)
    const a = await rodar(cod)
    if (a.status !== 501 || a.corpo.success !== false || a.corpo.route !== 'POST ' + path) f.push('501:' + path)
    if (a.criados.length !== 0) f.push('grava:' + path)
    if (a.tocados.length !== 0) f.push('toca-modelo:' + path)
    const b = await rodar(cod, { identidade: false })
    if (b.status !== 401 || b.criados.length !== 0) f.push('guarda:' + path)
  }
  const cod = codigoDe(textoArquivo, '/profiles/:id/role')
  const u = await rodar(cod, { nivel: 'user' })
  if (u.status !== 501 || u.criados.length !== 0) f.push('role-nivel-user')
  return f
}

;(async () => {
  const r = await bateria(TEXTO)
  ok('TRAVA: as 11 rotas existem no registro uma vez cada', ROTAS.every(([p]) => TEXTO.split(`    method: "POST",\n    path: "${p}",`).length === 2), ROTAS.map(([p]) => p))
  for (const [path] of ROTAS) {
    const falhas = r.filter((x) => x.endsWith(':' + path))
    ok(`${path}: 501, sem gravar, sem tocar modelo de negócio, e 401 sem identidade`, falhas.length === 0, falhas)
  }
  const u = await rodar(codigoDe(TEXTO, '/profiles/:id/role'), { nivel: 'user' })
  ok('/profiles/:id/role com chamador de nível `user` (o mínimo da guarda): 501 e nada gravado', u.status === 501 && u.criados.length === 0, u)

  // controle: o corpo de antes
  const cp = comStub(codigoDe(TEXTO, '/profiles/:id/role'), 'Profile')
  const ap = await rodar(cp, { nivel: 'user' })
  ok('CONTROLE: o corpo de antes de /profiles/:id/role, com nível `user`, respondia 201 e gravava um Profile com o corpo da requisição', ap.status === 201 && ap.criados.length === 1 && ap.criados[0].b.role === 'admin', ap)
  const cs = comStub(codigoDe(TEXTO, '/admin/users/:id/set-password'), 'User')
  const as = await rodar(cs)
  ok('CONTROLE: o corpo de antes de set-password respondia 201 e gravava a linha com o corpo da requisição', as.status === 201 && as.criados.length === 1 && as.criados[0].b.password === 'senha-em-texto', as)
  ok('a bateria passa limpa no registro atual', r.length === 0, r)

  // mutações: reinstalar o CRUD genérico em cada rota
  for (const [path, modelo] of ROTAS) {
    const cod = codigoDe(TEXTO, path)
    const novoCod = comStub(cod, modelo)
    const alvo = JSON.stringify(cod).slice(1, -1)
    if (TEXTO.split(alvo).length - 1 !== 1) { ok(`mutação "reinstalar CRUD em ${path}" aplica exatamente uma vez`, false, TEXTO.split(alvo).length - 1); continue }
    const mut = TEXTO.replace(alvo, () => JSON.stringify(novoCod).slice(1, -1))
    const f = await bateria(mut)
    ok(`mutação "reinstalar CRUD em ${path}" é pega (${f.slice(0, 3).join(',')})`, f.some((x) => x.endsWith(':' + path)), f)
  }
  fim()
})()
