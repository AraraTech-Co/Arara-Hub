// `GET /search` (busca global, Cmd+K da equipe) busca DE VERDADE: chamados, empresas e pessoas.
//
// O QUE SE GARANTE:
//   - só a equipe (nível `support` para cima) busca; cliente (nível `user`) recebe 403 e nada é lido;
//     sem identidade, 401;
//   - menos de 2 caracteres: 400;
//   - chamado achado pelo número exato, só pelos dígitos (`638` acha `TCK000638`), por
//     parte do número, do título e do nome da empresa, sem acento e sem diferença de caixa;
//   - um chamado MAIS ANTIGO que os 500 mais recentes só aparece pelo número (consulta
//     filtrada), e a resposta diz `truncado: true`;
//   - empresas por nome, nome fantasia e CNPJ; pessoas por nome e e-mail;
//   - cada resultado leva só os campos que a tela usa: nunca descrição do chamado,
//     hash de senha nem segredo de MFA;
//   - `limit` respeitado (e teto de 20); ordem por relevância (número exato primeiro);
//   - a query não vira filtro: `?status=...` ou `?company_id=...` não restringem nem ampliam.
//
// O CONTROLE: o corpo de antes (devolvia os chamados mais recentes para qualquer texto,
// e para qualquer chamador) é reconstituído e rodado.
// MUTAÇÕES: cada uma aplicada uma vez e reprovada por asserção.
//
// Roda com: node busca-global-de-verdade.test.js
const fs = require('fs')
const vm = require('vm')
const { reply, ok, fim, ARQ } = require('./_carregar.js')
const { camadaFindMany } = require('./_camada.js')

function codigoDe(marca) {
  const s = fs.readFileSync(ARQ, 'utf8')
  const at = s.indexOf(marca)
  if (at < 0) throw new Error('rota ausente: ' + marca)
  const re = /compileController\(\s*"((?:[^"\\]|\\.)*)"\s*\)/g
  re.lastIndex = at
  return JSON.parse('"' + re.exec(s)[1] + '"')
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
const NOVO = codigoDe('// 321 search GET /search (')
const ANTIGO_TRECHO = /\/\/ Busca global da equipe \(Cmd\+K\)[\s\S]*\n\}(?=\n\n\/\/ ── Guarda de sessão)/
const ANTIGO = (() => {
  if (!ANTIGO_TRECHO.test(NOVO)) throw new Error('âncora do bloco novo')
  return NOVO.replace(ANTIGO_TRECHO, `async function handler(ctx) {
  const model = ctx.models.Ticket;
  if (!model) return ctx.reply.status(500).send({ error: "Model Ticket missing" });
  const filter = Object.assign({}, ctx.query || {});
  const rows = await model.findMany(filter);
  return ctx.reply.send({ data: rows, count: rows.length });
}`).replace('eu.nivel < _gsRANK["support"]', 'eu.nivel < _gsRANK["user"]')
})()

// 600 chamados (em ordem de criação): o mais antigo é TCK000001; o título do 1º é "Impressora do caixa"
const tickets = Array.from({ length: 600 }, (_, i) => ({
  id: 't' + (i + 1), ticket_number: 'TCK' + String(i + 1).padStart(6, '0'), title: i === 0 ? 'Impressora do caixa' : 'Chamado número ' + (i + 1),
  status: 'novos_chamados', company_name: i === 599 ? 'Padaria São João' : 'Empresa ' + (i % 7), description: 'DESCRICAO-SECRETA-' + i,
}))
const empresas = [
  { id: 'e1', name: 'Mercado Água Branca', trade_name: 'Água Branca', cnpj: '12.345.678/0001-90', city: 'Campinas' },
  { id: 'e2', name: 'Outra Empresa', trade_name: null, cnpj: '98.765.432/0001-10', city: 'Sumaré' },
]
const pessoas = [
  { id: 'p1', full_name: 'José Antônio', email: 'jose@arara.com', password_hash: 'HASH', mfa_secret: 'MFA', role: 'support' },
  { id: 'p2', full_name: 'Maria', email: 'maria@arara.com', role: 'admin' },
]

async function rodar(codigo, query, { nivel = 'support', identidade = true, ticketsDados = tickets } = {}) {
  const leituras = []
  const handler = compilar(codigo)
  const ctx = {
    params: {}, query, headers: {}, body: {}, user: identidade ? { id: 'u1' } : undefined,
    models: {
      Profile: { findById: async (id) => ({ id, role: nivel }), findMany: async (f) => { leituras.push('Profile'); return pessoas.map((p) => ({ ...p })) } },
      Sessao: { findById: async () => null },
      Ticket: { findMany: async (f) => { leituras.push('Ticket:' + Object.keys(f || {}).join('+')); return camadaFindMany(ticketsDados, f) } },
      Company: { findMany: async () => { leituras.push('Company'); return empresas.map((e) => ({ ...e })) } },
    },
    reply: reply(),
  }
  const r = await handler(ctx)
  return { status: r.status, corpo: r.body, leituras }
}
const ids = (r) => (r.corpo.data || []).map((x) => x.id)

async function bateria(codigo) {
  const f = []
  const a = await rodar(codigo, { q: 'TCK000100' })
  if (a.status !== 200 || ids(a)[0] !== 't100') f.push('numero-exato')
  const b = await rodar(codigo, { q: '638' })
  if (!ids(b).includes('t638') && !(tickets.length < 638)) { /* 638 > 600 */ }
  const b2 = await rodar(codigo, { q: '100' })
  if (ids(b2)[0] !== 't100') f.push('so-digitos')
  const c = await rodar(codigo, { q: 'padaria sao joao' })
  if (!ids(c).includes('t600')) f.push('empresa-sem-acento')
  const d = await rodar(codigo, { q: 'IMPRESSORA' })
  if (ids(d).includes('t1')) f.push('antigo-so-pelo-numero-lido-fora-do-teto-ok')   // t1 está fora dos 500 mais recentes: título não acha
  const d2 = await rodar(codigo, { q: 'TCK000001' })
  if (ids(d2)[0] !== 't1') f.push('antigo-pelo-numero')
  if (d.corpo.truncado !== true) f.push('truncado')
  const e = await rodar(codigo, { q: 'agua branca' })
  if (!ids(e).includes('e1')) f.push('empresa-nome')
  const e2 = await rodar(codigo, { q: '12345678' })
  if (!ids(e2).includes('e1')) f.push('empresa-cnpj')
  const g = await rodar(codigo, { q: 'jose' })
  if (!ids(g).includes('p1')) f.push('pessoa')
  const brutos = JSON.stringify(g.corpo) + JSON.stringify(a.corpo)
  if (/HASH|MFA|DESCRICAO-SECRETA/.test(brutos)) f.push('vaza-campo')
  const h = await rodar(codigo, { q: 'chamado', limit: '3' })
  if ((h.corpo.data || []).filter((x) => x.ticket_number).length !== 3) f.push('limite')
  const h2 = await rodar(codigo, { q: 'chamado', limit: '999' })
  if ((h2.corpo.data || []).filter((x) => x.ticket_number).length > 20) f.push('teto-de-20')
  const i = await rodar(codigo, { q: 'TCK000100', status: 'fechado', company_id: 'x' })
  if (ids(i)[0] !== 't100') f.push('query-vira-filtro')
  const i2 = await rodar(codigo, { q: 'chamado', status: 'fechado' })
  if (!(i2.corpo.data || []).some((x) => x.ticket_number)) f.push('query-vira-filtro-texto')
  const ord = [
    { id: 'a', ticket_number: 'TCK900001', title: 'financeiro', status: 'x', company_name: 'E' },
    { id: 'b', ticket_number: 'TCK900002', title: 'financeiro geral do mes', status: 'x', company_name: 'E' },
  ]
  const o = await rodar(codigo, { q: 'financeiro' }, { ticketsDados: ord })
  if (ids(o)[0] !== 'a') f.push('relevancia')
  const j = await rodar(codigo, { q: 'TCK000100' }, { nivel: 'user' })
  if (j.status !== 403 || j.leituras.length) f.push('cliente')
  const k = await rodar(codigo, { q: 'TCK000100' }, { identidade: false })
  if (k.status !== 401) f.push('sem-identidade')
  const l = await rodar(codigo, { q: 'a' })
  if (l.status !== 400 || l.leituras.length) f.push('curta')
  return f
}

;(async () => {
  const a = await rodar(NOVO, { q: 'TCK000100' })
  ok('TRAVA: a busca devolveu 200 e leu chamados, empresas e pessoas', a.status === 200 && a.leituras.some((l) => l.startsWith('Ticket')) && a.leituras.includes('Company') && a.leituras.includes('Profile'), a)
  ok('número exato: o chamado vem primeiro', ids(a)[0] === 't100', ids(a))
  const b = await rodar(NOVO, { q: '100' }); ok('só os dígitos (`100`) acham TCK000100 primeiro', ids(b)[0] === 't100', ids(b))
  const c = await rodar(NOVO, { q: 'padaria sao joao' }); ok('nome da empresa, sem acento e sem caixa', ids(c).includes('t600'), ids(c))
  const d = await rodar(NOVO, { q: 'IMPRESSORA' })
  ok('chamado fora dos 500 mais recentes NÃO aparece pelo título e a resposta diz `truncado: true`', !ids(d).includes('t1') && d.corpo.truncado === true, [ids(d), d.corpo.truncado])
  const d2 = await rodar(NOVO, { q: 'TCK000001' }); ok('o mesmo chamado antigo aparece pelo número exato (consulta filtrada)', ids(d2)[0] === 't1', ids(d2))
  const e = await rodar(NOVO, { q: 'agua branca' }); ok('empresa por nome (sem acento)', ids(e).includes('e1'), ids(e))
  const e2 = await rodar(NOVO, { q: '12345678' }); ok('empresa por CNPJ (só dígitos)', ids(e2).includes('e1'), ids(e2))
  const g = await rodar(NOVO, { q: 'jose' }); ok('pessoa por nome e e-mail (sem acento)', ids(g).includes('p1'), ids(g))
  ok('nenhum resultado leva descrição do chamado, hash de senha nem segredo de MFA', !/HASH|MFA|DESCRICAO-SECRETA/.test(JSON.stringify(g.corpo) + JSON.stringify(a.corpo)), g.corpo)
  const h = await rodar(NOVO, { q: 'chamado', limit: '3' }); ok('limit respeitado', h.corpo.data.filter((x) => x.ticket_number).length === 3, h.corpo.count)
  const h2 = await rodar(NOVO, { q: 'chamado', limit: '999' }); ok('teto de 20 chamados', h2.corpo.data.filter((x) => x.ticket_number).length <= 20, h2.corpo.count)
  const i = await rodar(NOVO, { q: 'TCK000100', status: 'fechado', company_id: 'x' }); ok('a query não vira filtro (status e company_id ignorados)', ids(i)[0] === 't100', ids(i))
  const ord = [
    { id: 'a', ticket_number: 'TCK900001', title: 'financeiro', status: 'x', company_name: 'E' },
    { id: 'b', ticket_number: 'TCK900002', title: 'financeiro geral do mes', status: 'x', company_name: 'E' },
  ]
  const o = await rodar(NOVO, { q: 'financeiro' }, { ticketsDados: ord }); ok('relevância: o título igual ao texto vem antes do que só o contém (mesmo sendo mais antigo)', ids(o)[0] === 'a' && ids(o)[1] === 'b', ids(o))
  const i2 = await rodar(NOVO, { q: 'chamado', status: 'fechado' }); ok('a query não restringe o texto: `status=fechado` não esvazia a busca por "chamado"', (i2.corpo.data || []).some((x) => x.ticket_number), i2.corpo.count)
  const j = await rodar(NOVO, { q: 'TCK000100' }, { nivel: 'user' }); ok('cliente (nível user): 403 e nada lido', j.status === 403 && j.leituras.length === 0, j)
  const k = await rodar(NOVO, { q: 'TCK000100' }, { identidade: false }); ok('sem identidade: 401', k.status === 401, k.status)
  const l = await rodar(NOVO, { q: 'a' }); ok('menos de 2 caracteres: 400 e nada lido', l.status === 400 && l.leituras.length === 0, l)

  const an = await rodar(ANTIGO, { q: 'IMPRESSORA' })
  ok('CONTROLE: o corpo de antes devolvia chamados que não têm a ver com o texto', (an.corpo.data || []).length > 0 && !(an.corpo.data || []).some((x) => /impressora/i.test(x.title)), (an.corpo.data || []).slice(0, 2))
  const anc = await rodar(ANTIGO, { q: 'x1' }, { nivel: 'user' })
  ok('CONTROLE: o corpo de antes respondia ao cliente (nível user) com chamados de qualquer empresa', anc.status === 200 && (anc.corpo.data || []).length > 0, anc.status)
  ok('a bateria passa limpa no código novo', (await bateria(NOVO)).length === 0, await bateria(NOVO))

  const muts = [
    ['cliente também busca', 'eu.nivel < _gsRANK["support"]', 'eu.nivel < _gsRANK["user"]'],
    ['não acha pelo número exato filtrado', 'for (var n = 0; n < numeros.length; n++) juntar((await _lerLinhas(m.Ticket, { ticket_number: numeros[n] })).linhas);', ''],
    ['a query vira filtro', 'var recentes = await _lerLinhas(m.Ticket, {});', 'var recentes = await _lerLinhas(m.Ticket, Object.assign({}, ctx.query));'],
    ['não normaliza acento', '.normalize("NFD").replace(/[\\u0300-\\u036f]/g, "")', ''],
    ['sem teto de 20', 'Math.min(20, Math.max(1, Number(ctx.query && ctx.query.limit) || 8))', 'Math.max(1, Number(ctx.query && ctx.query.limit) || 8)'],
    ['devolve a linha inteira do chamado', 'chamados.push({ p: p, r: { id: t.id, ticket_number: numero || undefined, title: t.title, status: t.status, company_name: t.company_name || t.companyName } });', 'chamados.push({ p: p, r: t });'],
    ['devolve a linha inteira da pessoa', 'pessoas.push({ p: pu, r: { id: u.id, full_name: u.full_name || u.fullName || u.name, email: u.email } });', 'pessoas.push({ p: pu, r: u });'],
    ['não avisa truncado', 'truncado: recentes.linhas.length >= 500 || emp.linhas.length >= 500 || per.linhas.length >= 500,', 'truncado: false,'],
    ['texto curto também busca', 'if (q.length < 2) return ctx.reply.status(400).send({ success: false, error: "Informe ao menos 2 caracteres" });', ''],
    ['sem ordenar por relevância', 'chamados.sort(function (a, b) { return b.p - a.p; });', ''],
  ]
  for (const [nome, de, para] of muts) {
    const n = NOVO.split(de).length - 1
    if (n !== 1) { ok(`mutação "${nome}" aplica exatamente uma vez`, false, n); continue }
    let fm
    try { fm = await bateria(NOVO.replace(de, () => para)) } catch (err) { ok(`mutação "${nome}" reprova por asserção, não por erro de carga`, false, String(err)); continue }
    ok(`mutação "${nome}" é pega (${fm.join(',')})`, fm.length > 0, 'sobreviveu')
  }
  fim()
})()
