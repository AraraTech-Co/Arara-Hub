// `POST /auth/change-password`: o handler que fica entre a tela Minha conta e a
// operação da plataforma (`ctx.users.changeOwnPassword`, provada contra Postgres real
// em packages/api/scripts/testes/troca-de-senha-real.test.mjs).
//
// O QUE SE GARANTE:
//   - identidade pelo JWT (`ctx.user`) ou pela sessão do portal; sem nenhuma, 401 e a
//     plataforma NÃO é chamada;
//   - o `userId` entregue à plataforma é o do chamador, NUNCA um valor do corpo;
//   - senha atual, nova e o token de renovação do chamador seguem para a plataforma;
//   - cada recusa da plataforma vira o status certo: nova inválida 400, igual 400, limite
//     429 (com a espera), senha atual errada 403, usuário inexistente 404;
//   - no sucesso, as OUTRAS sessões do portal do usuário são revogadas e a atual segue;
//     sessões de outros usuários e as já revogadas não são tocadas;
//   - a resposta de sucesso não leva senha, hash nem token;
//   - falha ao revogar sessões não desfaz a troca: 200 com aviso.
//
// MUTAÇÕES: cada uma é aplicada uma vez e reprovada por asserção.
//
// Roda com: node troca-de-senha-handler.test.js
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
    RegExp, Buffer, Error, TypeError, setTimeout, clearTimeout, module: { exports: {} },
  }
  c.exports = c.module.exports; c.globalThis = c
  vm.createContext(c); vm.runInContext(codigo, c)
  return c.module.exports.handler
}

const NOVO = codigoDe('160 auth POST /auth/change-password')
const FUTURO = new Date(Date.now() + 3600e3).toISOString()
const sessoesIniciais = () => ({
  ses_atual: { id: 'ses_atual', user_id: 'u1', verificador: 'ver1', revogada: false, expira_em: FUTURO },
  ses_outra1: { id: 'ses_outra1', user_id: 'u1', verificador: 'v', revogada: false, expira_em: FUTURO },
  ses_outra2: { id: 'ses_outra2', user_id: 'u1', verificador: 'v', revogada: false, expira_em: FUTURO },
  ses_ja: { id: 'ses_ja', user_id: 'u1', verificador: 'v', revogada: true, expira_em: FUTURO },
  ses_alheia: { id: 'ses_alheia', user_id: 'u2', verificador: 'v', revogada: false, expira_em: FUTURO },
})

async function rodar(codigo, { user, sessaoHeader, body = { current_password: 'atual-123', new_password: 'nova-senha-1' }, resposta = { ok: true, refreshTokensEncerrados: 2 }, semUsers = false, falhaSessao = false } = {}) {
  const chamadas = []
  const sessoes = sessoesIniciais()
  const handler = compilar(codigo)
  const ctx = {
    params: {}, query: {}, body, user,
    headers: sessaoHeader ? { 'x-portal-sessao': sessaoHeader } : {},
    users: semUsers ? {} : { changeOwnPassword: async (a) => { chamadas.push(a); return typeof resposta === 'function' ? resposta(a) : resposta } },
    models: {
      Sessao: {
        findById: async (id) => sessoes[id] || null,
        findMany: async (f) => { if (falhaSessao) throw new Error('banco'); return Object.values(sessoes).filter((s) => !f || !f.user_id || s.user_id === f.user_id) },
        update: async (id, p) => { Object.assign(sessoes[id], p); return sessoes[id] },
      },
    },
    reply: reply(),
  }
  let r
  try { r = await handler(ctx) } catch (e) { r = { status: 'exceção', body: { success: false, error: String(e) } } }
  return { status: r.status, corpo: r.body, chamadas, sessoes }
}
const revogadas = (s) => Object.values(s).filter((x) => x.revogada).map((x) => x.id).sort()

async function bateria(codigo) {
  const f = []
  const a = await rodar(codigo, { user: { id: 'u1' }, sessaoHeader: 'atual.ver1', body: { current_password: 'atual-123', new_password: 'nova-senha-1', refresh_token: 'RT-DO-CHAMADOR', userId: 'u2', user_id: 'u2' } })
  if (a.status !== 200 || a.corpo.success !== true) f.push('sucesso')
  if (a.chamadas.length !== 1 || a.chamadas[0].userId !== 'u1') f.push('userid-do-chamador')
  if (a.chamadas[0].current !== 'atual-123' || a.chamadas[0].next !== 'nova-senha-1' || a.chamadas[0].keepRefreshToken !== 'RT-DO-CHAMADOR') f.push('argumentos')
  if (JSON.stringify(revogadas(a.sessoes)) !== JSON.stringify(['ses_ja', 'ses_outra1', 'ses_outra2'])) f.push('revoga-as-outras')
  if (a.sessoes.ses_atual.revogada || a.sessoes.ses_alheia.revogada) f.push('toca-na-atual-ou-alheia')
  if (a.corpo.sessoes_encerradas !== 2 || a.corpo.tokens_encerrados !== 2) f.push('contagens')
  if (/atual-123|nova-senha-1|RT-DO-CHAMADOR|hash/i.test(JSON.stringify(a.corpo))) f.push('vaza-segredo')
  const b = await rodar(codigo, { sessaoHeader: 'atual.ver1' })
  if (b.status !== 200 || b.chamadas[0].userId !== 'u1') f.push('so-sessao')
  const c = await rodar(codigo, {})
  if (c.status !== 401 || c.chamadas.length !== 0) f.push('sem-identidade')
  const c2 = await rodar(codigo, { sessaoHeader: 'atual.errado' })
  if (c2.status !== 401 || c2.chamadas.length !== 0) f.push('sessao-invalida')
  for (const [nome, resposta, status] of [
    ['invalida', { ok: false, codigo: 'invalida' }, 400], ['igual', { ok: false, codigo: 'igual' }, 400],
    ['limite', { ok: false, codigo: 'limite', esperaSegundos: 600 }, 429], ['senha_atual', { ok: false, codigo: 'senha_atual' }, 403],
    ['nao_encontrado', { ok: false, codigo: 'nao_encontrado' }, 404],
  ]) {
    const d = await rodar(codigo, { user: { id: 'u1' }, sessaoHeader: 'atual.ver1', resposta })
    if (d.status !== status || d.corpo.success !== false || revogadas(d.sessoes).length !== 1) f.push('recusa-' + nome)
    if (nome === 'limite' && !/10 min/.test(d.corpo.error)) f.push('limite-informa-espera')
  }
  const e = await rodar(codigo, { user: { id: 'u1' }, semUsers: true })
  if (e.status !== 500) f.push('sem-operacao')
  const g = await rodar(codigo, { user: { id: 'u1' }, falhaSessao: true })
  if (g.status !== 200 || !g.corpo.aviso || g.corpo.success !== true) f.push('falha-ao-revogar')
  const h = await rodar(codigo, { user: { id: 'u1' }, body: { current_password: 123, new_password: null } })
  if (h.chamadas[0].current !== '' || h.chamadas[0].next !== '') f.push('tipos-do-corpo')
  return f
}

;(async () => {
  const a = await rodar(NOVO, { user: { id: 'u1' }, sessaoHeader: 'atual.ver1', body: { current_password: 'atual-123', new_password: 'nova-senha-1', refresh_token: 'RT-DO-CHAMADOR', userId: 'u2', user_id: 'u2' } })
  ok('TRAVA: a plataforma foi chamada uma vez', a.chamadas.length === 1, a.chamadas.length)
  ok('sucesso: 200 e a resposta traz as contagens', a.status === 200 && a.corpo.success === true && a.corpo.sessoes_encerradas === 2 && a.corpo.tokens_encerrados === 2, a.corpo)
  ok('o userId entregue é o do chamador, nunca o do corpo (corpo dizia u2)', a.chamadas[0].userId === 'u1', a.chamadas[0])
  ok('senha atual, nova e token de renovação seguem para a plataforma', a.chamadas[0].current === 'atual-123' && a.chamadas[0].next === 'nova-senha-1' && a.chamadas[0].keepRefreshToken === 'RT-DO-CHAMADOR', a.chamadas[0])
  ok('as outras sessões do portal são revogadas; a atual, a alheia e as já revogadas ficam como estavam', JSON.stringify(revogadas(a.sessoes)) === JSON.stringify(['ses_ja', 'ses_outra1', 'ses_outra2']) && !a.sessoes.ses_atual.revogada && !a.sessoes.ses_alheia.revogada, revogadas(a.sessoes))
  ok('a resposta não leva senha, hash nem token', !/atual-123|nova-senha-1|RT-DO-CHAMADOR|hash/i.test(JSON.stringify(a.corpo)), a.corpo)
  const b = await rodar(NOVO, { sessaoHeader: 'atual.ver1' })
  ok('só com a sessão do portal (sem JWT): troca a do dono da sessão', b.status === 200 && b.chamadas[0].userId === 'u1', b)
  const c = await rodar(NOVO, {})
  ok('sem identidade: 401 e a plataforma não é chamada', c.status === 401 && c.chamadas.length === 0, c)
  const c2 = await rodar(NOVO, { sessaoHeader: 'atual.errado' })
  ok('sessão com verificador errado: 401 e a plataforma não é chamada', c2.status === 401 && c2.chamadas.length === 0, c2)
  for (const [nome, resposta, status] of [['nova inválida', { ok: false, codigo: 'invalida' }, 400], ['igual à atual', { ok: false, codigo: 'igual' }, 400], ['limite de tentativas', { ok: false, codigo: 'limite', esperaSegundos: 600 }, 429], ['senha atual errada', { ok: false, codigo: 'senha_atual' }, 403], ['usuário inexistente', { ok: false, codigo: 'nao_encontrado' }, 404]]) {
    const d = await rodar(NOVO, { user: { id: 'u1' }, sessaoHeader: 'atual.ver1', resposta })
    ok(`recusa "${nome}": ${status}, sem revogar sessão alguma`, d.status === status && d.corpo.success === false && revogadas(d.sessoes).length === 1, [d.status, revogadas(d.sessoes)])
    if (status === 429) ok('  o limite informa a espera (10 min)', /10 min/.test(d.corpo.error) && d.corpo.espera_s === 600, d.corpo)
  }
  const e = await rodar(NOVO, { user: { id: 'u1' }, semUsers: true })
  ok('runtime sem a operação: 500 claro, sem quebrar', e.status === 500, e.status)
  const g = await rodar(NOVO, { user: { id: 'u1' }, falhaSessao: true })
  ok('falha ao revogar sessões não desfaz a troca: 200 com aviso', g.status === 200 && g.corpo.success === true && !!g.corpo.aviso, g.corpo)
  const h = await rodar(NOVO, { user: { id: 'u1' }, body: { current_password: 123, new_password: null } })
  ok('corpo com tipos errados: a plataforma recebe textos vazios (e recusa)', h.chamadas[0].current === '' && h.chamadas[0].next === '', h.chamadas[0])

  ok('a bateria passa limpa no código novo', (await bateria(NOVO)).length === 0, await bateria(NOVO))
  const muts = [
    ['o userId vem do corpo', 'userId: String(quem),', 'userId: String(corpo.user_id || quem),'],
    ['sem identidade segue adiante', 'if (!quem) return ctx.reply.status(401).send({ success: false, error: "Requer sessão do portal" });', ''],
    ['não repassa o token de renovação', 'keepRefreshToken: typeof corpo.refresh_token === "string" && corpo.refresh_token ? corpo.refresh_token : undefined,', ''],
    ['revoga também a sessão atual', 'if (sessao && l.id === sessao.id) continue;', ''],
    ['revoga as sessões já revogadas de novo', 'if (l.revogada === true) continue;', ''],
    ['não revoga as outras sessões', 'await S.update(l.id, { revogada: true });', ''],
    ['revoga sessões de qualquer usuário', 'S.findMany({ user_id: String(quem) })', 'S.findMany({})'],
    ['limite vira 403', 'return ctx.reply.status(429)', 'return ctx.reply.status(403)'],
    ['senha atual errada vira 200', 'if (codigo === "senha_atual") return ctx.reply.status(403)', 'if (codigo === "senha_atual") return ctx.reply.status(200)'],
    ['recusa da plataforma vira sucesso', 'if (!r || r.ok !== true) {', 'if (false) {'],
    ['a resposta vaza a senha nova', 'var saida = { success: true,', 'var saida = { nova: corpo.new_password, success: true,'],
    ['falha ao revogar derruba a resposta', '    aviso = "A senha foi alterada, mas não foi possível encerrar as outras sessões";', '    throw e;'],
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
