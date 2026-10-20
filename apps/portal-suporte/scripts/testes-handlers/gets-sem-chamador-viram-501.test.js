// Vinte e três rotas GET que o gerador da integração deixou como LEITURA GENÉRICA de um
// modelo sem relação com o caminho (ex.: `GET /sla/breached` e `GET /cache` devolviam a
// lista de chamados) passam a responder 501 e não ler modelo algum.
//
// Nenhuma tem chamador no front (busca por caminho e por texto em app, lib e components).
// A guarda de sessão que envolve cada handler segue de pé. `GET /tickets/:id/checklists`
// tem forma própria (filtra por chamado) e fica fora.
//
// O QUE SE GARANTE, para cada rota: com identidade, 501 `{ success: false, route }` e nenhum
// modelo de negócio acessado; sem identidade, 401.
//
// O CONTROLE: o corpo de antes (a leitura genérica) é reconstituído e, sobre a mesma massa,
// devolve as linhas do modelo com 200.
// MUTAÇÕES: reinstalar a leitura genérica em cada rota reprova por asserção.
//
// Roda com: node gets-sem-chamador-viram-501.test.js
const fs = require('fs')
const vm = require('vm')
const { reply, ok, fim, ARQ } = require('./_carregar.js')

const ROTAS = [
  '/admin/ai/fine-tune',
  '/admin/companies/groups',
  '/admin/view-as',
  '/api-keys/:id/usage',
  '/cache',
  '/change-requests/:id',
  '/change-requests/dashboard',
  '/change-requests/stats',
  '/file-explorer/list',
  '/file-explorer/read',
  '/integrations/:name/stats',
  '/integrations/dashboard',
  '/integrations/errors',
  '/kpi/metrics',
  '/notifications/stream',
  '/schedules/calendar',
  '/schedules/current',
  '/schedules/daily',
  '/sla/at-risk',
  '/sla/breached',
  '/sla/compliance',
  '/sla/escalated',
  '/tickets/:id/next-actions',
]
const TEXTO = fs.readFileSync(ARQ, 'utf8')
const RE = /compileController\(\s*"((?:[^"\\]|\\.)*)"\s*\)/g

function codigoDe(texto, path) {
  const marca = `    method: "GET",\n    path: "${path}",`
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
  const filter = Object.assign({}, ctx.query || {});
  const rows = await model.findMany(filter);
  return ctx.reply.send({ data: rows, count: rows.length });
}`
const BLOCO_NOVO = /async function handler\(ctx\) \{\n  \/\/ A integração gerou esta rota como leitura genérica[\s\S]*?\n  \}\);\n\}/
const comStub = (codigo, modelo) => { if (!BLOCO_NOVO.test(codigo)) throw new Error('bloco novo ausente'); return codigo.replace(BLOCO_NOVO, () => STUB(modelo)) }

async function rodar(codigo, { identidade = true } = {}) {
  const tocados = []
  const LINHAS = [{ id: 't1', title: 'chamado de alguém' }]
  const modelos = new Proxy({}, {
    get: (_, nome) => {
      if (nome === 'Profile') return { findById: async (id) => ({ id, role: 'admin' }) }
      if (nome === 'Sessao') return { findById: async () => null }
      tocados.push(String(nome))
      return { findMany: async () => LINHAS, findById: async () => LINHAS[0] }
    },
  })
  const handler = compilar(codigo)
  const r = await handler({ params: { id: 'alvo' }, query: {}, headers: {}, user: identidade ? { id: 'u1' } : undefined, body: {}, models: modelos, reply: reply() })
  return { status: r.status, corpo: r.body, tocados }
}

async function bateria(textoArquivo, rotas = ROTAS) {
  const f = []
  for (const path of rotas) {
    const cod = codigoDe(textoArquivo, path)
    const a = await rodar(cod)
    if (a.status !== 501 || a.corpo.success !== false || a.corpo.route !== 'GET ' + path) f.push('501:' + path)
    if (a.tocados.length !== 0) f.push('le-modelo:' + path)
    const b = await rodar(cod, { identidade: false })
    if (b.status !== 401) f.push('guarda:' + path)
  }
  return f
}

;(async () => {
  const r = await bateria(TEXTO)
  ok('TRAVA: as 23 rotas existem no registro uma vez cada', ROTAS.length === 23 && ROTAS.every((p) => TEXTO.split(`    method: "GET",\n    path: "${p}",`).length === 2), ROTAS.length)
  for (const path of ROTAS) {
    const falhas = r.filter((x) => x.endsWith(':' + path))
    ok(`GET ${path}: 501, sem ler modelo de negócio, e 401 sem identidade`, falhas.length === 0, falhas)
  }
  const ck = comStub(codigoDe(TEXTO, '/sla/breached'), 'Ticket')
  const ac = await rodar(ck)
  ok('CONTROLE: a leitura genérica de antes devolvia as linhas do modelo com 200', ac.status === 200 && ac.corpo.count === 1 && ac.tocados.includes('Ticket'), ac)
  ok('a bateria passa limpa no registro atual', r.length === 0, r)

  for (const path of ROTAS) {
    const cod = codigoDe(TEXTO, path)
    const novoCod = comStub(cod, 'Ticket')
    const alvo = JSON.stringify(cod).slice(1, -1)
    if (TEXTO.split(alvo).length - 1 !== 1) { ok(`mutação "reinstalar a leitura em ${path}" aplica exatamente uma vez`, false, TEXTO.split(alvo).length - 1); continue }
    const mut = TEXTO.replace(alvo, () => JSON.stringify(novoCod).slice(1, -1))
    const f = await bateria(mut)
    ok(`mutação "reinstalar a leitura em ${path}" é pega (${f.slice(0, 2).join(',')})`, f.some((x) => x.endsWith(':' + path)), f)
  }
  fim()
})()
