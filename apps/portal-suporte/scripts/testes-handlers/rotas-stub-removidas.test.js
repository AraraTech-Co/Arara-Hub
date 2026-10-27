// Rotas que eram esqueleto da integração e não têm uso: saíram do registro.
//
//   GET/POST /auth/magic-link, POST /auth/forgot-password, POST /auth/reset-password,
//   POST /auth/reset-with-code   — a redefinição de senha usada pela tela é
//                                  /auth/senha/solicitar + /auth/senha/redefinir
//   GET/POST /cron/sla-check, POST /cron/worker — o agendamento é o agendador interno
//   GET /api/dashboard, GET /uptime — ninguém as chama e não tinham função própria
//
// `GET /health` passa a ser uma resposta de liveness constante, sem ler tabela alguma.
//
// O QUE SE GARANTE:
//   - as 10 rotas não existem mais no registro (e o registro tem 505, 515 menos elas);
//   - as rotas vizinhas que seguem valendo continuam (as de redefinição por código, /auth/me,
//     e os esqueletos de /auth/login, /auth/register, /auth/signout, /auth/change-password);
//   - `/health` devolve `{ ok: true, service: "portal-suporte" }` e não acessa nenhum modelo.
//
// MUTAÇÕES: reinserir qualquer rota removida reprova; `/health` lendo chamados reprova.
//
// Roda com: node rotas-stub-removidas.test.js
const fs = require('fs')
const vm = require('vm')
const { reply, ok, fim, ARQ } = require('./_carregar.js')

const REMOVIDAS = [
  ['GET', '/auth/magic-link'], ['POST', '/auth/magic-link'], ['POST', '/auth/forgot-password'],
  ['POST', '/auth/reset-password'], ['POST', '/auth/reset-with-code'], ['GET', '/cron/sla-check'],
  ['POST', '/cron/sla-check'], ['POST', '/cron/worker'], ['GET', '/api/dashboard'], ['GET', '/uptime'],
]
const MANTIDAS = [
  ['GET', '/auth/me'], ['POST', '/auth/senha/solicitar'], ['POST', '/auth/senha/redefinir'],
  ['GET', '/health'], ['POST', '/auth/login'], ['POST', '/auth/register'], ['POST', '/auth/signout'],
  ['POST', '/auth/change-password'], ['GET', '/auth/sessao/estado'], ['POST', '/auth/sessao/encerrar'],
]

function rotasDe(texto) {
  const out = []
  const re = /\n    method: "(\w+)",\n    path: "([^"]+)",/g
  let m
  while ((m = re.exec(texto))) out.push(m[1] + ' ' + m[2])
  return out
}
function codigoHealth(texto) {
  const at = texto.indexOf('    method: "GET",\n    path: "/health",')
  if (at < 0) return null
  const re = /compileController\(\s*"((?:[^"\\]|\\.)*)"\s*\)/g
  re.lastIndex = at
  return JSON.parse('"' + re.exec(texto)[1] + '"')
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

async function checar(texto) {
  const f = []
  const rotas = rotasDe(texto)
  const conj = new Set(rotas)
  if (rotas.length !== 504) f.push('total:' + rotas.length)
  for (const [m, p] of REMOVIDAS) if (conj.has(m + ' ' + p)) f.push('presente:' + m + ' ' + p)
  for (const [m, p] of MANTIDAS) if (!conj.has(m + ' ' + p)) f.push('ausente:' + m + ' ' + p)
  const cod = codigoHealth(texto)
  if (!cod) { f.push('health-ausente'); return f }
  const acessos = []
  const modelos = new Proxy({}, { get: (_, k) => { acessos.push(String(k)); throw new Error('não deveria acessar modelo ' + String(k)) } })
  let r
  try { r = await compilar(cod)({ params: {}, query: {}, headers: {}, body: {}, user: undefined, models: modelos, reply: reply() }) } catch (e) { f.push('health-lancou:' + e.message); return f }
  if (r.status !== 200 || !r.body || r.body.ok !== true || r.body.service !== 'portal-suporte') f.push('health-resposta')
  if (acessos.length) f.push('health-acessou-modelo')
  return f
}

;(async () => {
  const texto = fs.readFileSync(ARQ, 'utf8')
  const rotas = rotasDe(texto)
  ok('TRAVA: o leitor de rotas enxerga o registro (504 rotas)', rotas.length === 504, rotas.length)
  ok('as 10 rotas sem uso não existem mais', REMOVIDAS.every(([m, p]) => !rotas.includes(m + ' ' + p)), REMOVIDAS.filter(([m, p]) => rotas.includes(m + ' ' + p)))
  ok('as rotas vizinhas que seguem valendo continuam', MANTIDAS.every(([m, p]) => rotas.includes(m + ' ' + p)), MANTIDAS.filter(([m, p]) => !rotas.includes(m + ' ' + p)))
  const h = await checar(texto)
  ok('/health responde { ok: true, service: "portal-suporte" } sem acessar nenhum modelo', !h.some((x) => x.startsWith('health')), h)
  ok('a bateria passa limpa no registro atual', h.length === 0, h)

  // mutações
  const reinserir = (m, p) => texto.replace('\n    method: "GET",\n    path: "/health",', `\n    method: "${m}",\n    path: "${p}",\n    authMode: "actor",\n  },\n  {\n    method: "GET",\n    path: "/health",`)
  for (const [m, p] of REMOVIDAS) {
    const mut = reinserir(m, p)
    if (mut === texto) { ok(`mutação "reinserir ${m} ${p}" aplica`, false, 'âncora'); continue }
    const f = await checar(mut)
    ok(`mutação "reinserir ${m} ${p}" é pega (${f.join(',')})`, f.some((x) => x === 'presente:' + m + ' ' + p), f)
  }
  const cod = codigoHealth(texto)
  const muts = [
    ['/health lê os chamados', 'return ctx.reply.send({ ok: true, service: "portal-suporte" });', 'return ctx.reply.send({ ok: true, service: "portal-suporte", n: (await ctx.models.Ticket.findMany({})).length });'],
    ['/health devolve ok falso', 'ok: true', 'ok: false'],
    ['/health devolve outro serviço', 'service: "portal-suporte"', 'service: "x"'],
  ]
  for (const [nome, de, para] of muts) {
    if (cod.split(de).length - 1 !== 1) { ok(`mutação "${nome}" aplica exatamente uma vez`, false, 'âncora'); continue }
    const novoCod = cod.replace(de, () => para)
    const mutTexto = texto.replace(JSON.stringify(cod).slice(1, -1), () => JSON.stringify(novoCod).slice(1, -1))
    if (mutTexto === texto) { ok(`mutação "${nome}" aplica no arquivo`, false, 'não aplicou'); continue }
    const f = await checar(mutTexto)
    ok(`mutação "${nome}" é pega (${f.join(',')})`, f.some((x) => x.startsWith('health')), f)
  }
  fim()
})()
