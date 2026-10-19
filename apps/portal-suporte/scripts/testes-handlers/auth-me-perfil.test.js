// `GET /auth/me` devolve o PERFIL de quem chama.
//
// A tela "Minha conta" lê este endpoint para montar o formulário (nome, e-mail,
// função) e usa o `id` devolvido para salvar o perfil. A identidade vem do JWT
// (`ctx.user`) ou da sessão do portal (`x-portal-sessao`); sem nenhuma das duas, 401.
//
// O QUE SE GARANTE:
//   - com JWT: devolve a linha de Profile do chamador, com `id`, `full_name`, `email`
//     e `role`, SEM hash de senha nem segredos de MFA;
//   - com sessão do portal (sem JWT): idem, pelo `user_id` da sessão;
//   - NADA da requisição escolhe de quem é o perfil (query com `id` de outra pessoa é ignorada);
//   - sem identidade (nem JWT, nem sessão válida): 401 e nenhuma leitura de perfil;
//   - sessão revogada, vencida ou com verificador errado: 401;
//   - perfil inexistente: 404;
//   - não lê a tabela de chamados.
//
// O CONTROLE: o bloco de antes (que lia a tabela de chamados) é reconstituído e rodado.
//
// Roda com: node auth-me-perfil.test.js
const fs = require('fs')
const vm = require('vm')
const { reply, ok, fim, ARQ } = require('./_carregar.js')

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
    RegExp, Buffer, Error, TypeError, encodeURIComponent, decodeURIComponent, Intl, URL, URLSearchParams,
    setTimeout, clearTimeout, setInterval, clearInterval, module: { exports: {} },
  }
  c.exports = c.module.exports; c.globalThis = c
  vm.createContext(c); vm.runInContext(codigo, c)
  return c.module.exports.handler
}

const NOVO = codigoDe('157 auth GET /auth/me')
const ANTIGO = `async function handler(ctx) {
  const model = ctx.models.Ticket;
  if (!model) return ctx.reply.status(500).send({ error: "Model Ticket missing" });
  const filter = Object.assign({}, ctx.query || {});
  const rows = await model.findMany(filter);
  return ctx.reply.send({ data: rows, count: rows.length });
}
module.exports = { handler };`

const PERFIS = {
  u1: { id: 'u1', full_name: 'Alexandre Ferreira', email: 'alexandre@arara.com', role: 'support', password_hash: 'HASH-SECRETO', mfa_secret: 'MFA-SECRETO' },
  u2: { id: 'u2', full_name: 'Outra Pessoa', email: 'outra@arara.com', role: 'admin', passwordHash: 'HASH2' },
}
const SESSAO_OK = { id: 'ses_abc', user_id: 'u1', verificador: 'ver123', revogada: false, expira_em: new Date(Date.now() + 3600e3).toISOString() }

async function rodar(codigo, { user = undefined, sessaoHeader = undefined, sessoes = {}, query = {}, perfis = PERFIS } = {}) {
  const leituras = { perfil: [], ticket: 0 }
  const handler = compilar(codigo)
  const ctx = {
    params: {}, query, body: {}, user,
    headers: sessaoHeader ? { 'x-portal-sessao': sessaoHeader } : {},
    models: {
      Profile: { findById: async (id) => { leituras.perfil.push(id); return perfis[id] ? { ...perfis[id] } : null } },
      Sessao: { findById: async (id) => sessoes[id] || null },
      Ticket: { findMany: async () => { leituras.ticket++; return [{ id: 't1', title: 'chamado de alguém' }] } },
    },
    reply: reply(),
  }
  const r = await handler(ctx)
  return { status: r.status, corpo: r.body, leituras }
}
const semSegredos = (c) => c && !('password_hash' in c) && !('passwordHash' in c) && !('mfa_secret' in c)

async function bateria(codigo) {
  const f = []
  const a = await rodar(codigo, { user: { id: 'u1' } })
  if (a.status !== 200 || !a.corpo || a.corpo.id !== 'u1' || a.corpo.full_name !== 'Alexandre Ferreira' || a.corpo.email !== 'alexandre@arara.com' || a.corpo.role !== 'support') f.push('jwt-perfil')
  if (!semSegredos(a.corpo)) f.push('segredos')
  const b = await rodar(codigo, { sessaoHeader: 'abc.ver123', sessoes: { ses_abc: SESSAO_OK } })
  if (b.status !== 200 || !b.corpo || b.corpo.id !== 'u1') f.push('sessao-perfil')
  const c = await rodar(codigo, { user: { id: 'u1' }, query: { id: 'u2', email: 'outra@arara.com' } })
  if (!c.corpo || c.corpo.id !== 'u1') f.push('query-escolhe-perfil')
  const d = await rodar(codigo, {})
  if (d.status !== 401 || d.leituras.perfil.length !== 0) f.push('sem-identidade')
  for (const [nome, sessoes, header] of [
    ['sessao-revogada', { ses_abc: { ...SESSAO_OK, revogada: true } }, 'abc.ver123'],
    ['sessao-vencida', { ses_abc: { ...SESSAO_OK, expira_em: new Date(Date.now() - 1000).toISOString() } }, 'abc.ver123'],
    ['sessao-verificador-errado', { ses_abc: SESSAO_OK }, 'abc.errado'],
  ]) {
    const e = await rodar(codigo, { sessaoHeader: header, sessoes })
    if (e.status !== 401 || e.leituras.perfil.length !== 0) f.push(nome)
  }
  const g = await rodar(codigo, { user: { id: 'u9' } })
  if (g.status !== 404) f.push('perfil-inexistente')
  if (a.leituras.ticket !== 0 || b.leituras.ticket !== 0) f.push('le-chamados')
  return f
}

;(async () => {
  const a = await rodar(NOVO, { user: { id: 'u1' } })
  ok('TRAVA: o handler leu o perfil do chamador (u1)', a.leituras.perfil.length === 1 && a.leituras.perfil[0] === 'u1', a.leituras)
  ok('com JWT: devolve o perfil dele (id, nome, e-mail, função)', a.status === 200 && a.corpo.id === 'u1' && a.corpo.full_name === 'Alexandre Ferreira' && a.corpo.email === 'alexandre@arara.com' && a.corpo.role === 'support', a.corpo)
  ok('  sem hash de senha nem segredo de MFA', semSegredos(a.corpo), Object.keys(a.corpo))
  ok('  e não lê a tabela de chamados', a.leituras.ticket === 0, a.leituras)
  const b = await rodar(NOVO, { sessaoHeader: 'abc.ver123', sessoes: { ses_abc: SESSAO_OK } })
  ok('com sessão do portal (sem JWT): devolve o perfil do `user_id` da sessão', b.status === 200 && b.corpo.id === 'u1', b)
  const c = await rodar(NOVO, { user: { id: 'u1' }, query: { id: 'u2' } })
  ok('query com id de outra pessoa é ignorada', c.corpo.id === 'u1' && c.leituras.perfil.every((x) => x === 'u1'), c)
  const d = await rodar(NOVO, {})
  ok('sem identidade: 401 e nenhuma leitura de perfil', d.status === 401 && d.leituras.perfil.length === 0, d)
  const e1 = await rodar(NOVO, { sessaoHeader: 'abc.ver123', sessoes: { ses_abc: { ...SESSAO_OK, revogada: true } } })
  const e2 = await rodar(NOVO, { sessaoHeader: 'abc.ver123', sessoes: { ses_abc: { ...SESSAO_OK, expira_em: new Date(Date.now() - 1000).toISOString() } } })
  const e3 = await rodar(NOVO, { sessaoHeader: 'abc.errado', sessoes: { ses_abc: SESSAO_OK } })
  ok('sessão revogada, vencida ou com verificador errado: 401', e1.status === 401 && e2.status === 401 && e3.status === 401, [e1.status, e2.status, e3.status])
  const g = await rodar(NOVO, { user: { id: 'u9' } })
  ok('perfil inexistente: 404', g.status === 404, g.status)
  const an = await rodar(ANTIGO, { user: { id: 'u1' } })
  ok('CONTROLE: o bloco de antes devolvia linhas da tabela de chamados e nenhum perfil', an.leituras.ticket === 1 && an.leituras.perfil.length === 0 && !an.corpo.id, an)

  ok('a bateria passa limpa no código novo', (await bateria(NOVO)).length === 0, await bateria(NOVO))
  const muts = [
    ['volta a devolver os chamados', 'return ctx.reply.send(limpar(linha));', 'return ctx.reply.send({ data: await ctx.models.Ticket.findMany({}) });'],
    ['sem identidade vira "qualquer um"', 'if (!quem) return ctx.reply.status(401).send({ success: false, error: "Requer sessão do portal" });', ''],
    ['sem limpar os segredos', 'return ctx.reply.send(limpar(linha));', 'return ctx.reply.send(linha);'],
    ['a query escolhe o perfil', 'var quem = u.id || u.userId || (await _sessaoDoPortal(ctx));', 'var quem = (ctx.query && ctx.query.id) || u.id || u.userId || (await _sessaoDoPortal(ctx));'],
    ['sessão revogada vale', 'if (!linha || linha.revogada === true) return null;', 'if (!linha) return null;'],
    ['sessão vencida vale', 'if (linha.expira_em && new Date(linha.expira_em).getTime() < Date.now()) return null;', ''],
    ['verificador não conferido', 'if (String(linha.verificador || "") !== partes[1]) return null;', ''],
    ['perfil inexistente devolve 200', 'if (!linha) return ctx.reply.status(404).send({ error: "Perfil não encontrado" });', ''],
  ]
  for (const [nome, de, para] of muts) {
    const n = NOVO.split(de).length - 1
    if (n !== 1) { ok(`mutação "${nome}" aplica exatamente uma vez`, false, n); continue }
    let f
    try { f = await bateria(NOVO.replace(de, () => para)) } catch (err) { ok(`mutação "${nome}" reprova por asserção, não por erro de carga`, false, String(err)); continue }
    ok(`mutação "${nome}" é pega (${f.join(',')})`, f.length > 0, 'sobreviveu')
  }
  fim()
})()
