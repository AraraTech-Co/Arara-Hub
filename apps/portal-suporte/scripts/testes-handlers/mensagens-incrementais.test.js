// A conversa aberta (434) aceita leitura INCREMENTAL: `limite`, `antes` e `depois`.
//
//   ?limite=N             as N mais recentes (1 a 200) + `incremental.tem_mais`
//   ?antes=<id>&limite=N  as N anteriores à mensagem <id> (rolar para cima)
//   ?depois=<id>          só as posteriores à mensagem <id> (o ciclo de ~5 s): lê só as 100
//                         mais recentes; <id> fora delas dá `incremental.lacuna: true`
//
// Sem parâmetro a rota responde EXATAMENTE como antes (conversa inteira, `historico`, sem
// `incremental`), então a tela atual continua funcionando.
//
// O QUE SE GARANTE:
//   - `limite`: as últimas N em ordem, `tem_mais` correto, UMA leitura de N+1 linhas; com
//     `tem_mais` o `historico` é parcial (sem `lacuna` falsa, `total: null`); sem `tem_mais`
//     o `historico` é o completo;
//   - `antes`, encadeado do fim ao começo: junta TODA a conversa sem buraco nem repetição;
//   - `depois`: [] quando não há novidade, só as novas quando há, UMA leitura de 100 linhas, sem
//     varredura de reserva, sem `historico`; cursor fora da janela: `lacuna: true`;
//   - todas as leituras seguem mascarando o anexo (`media_data`), e o não lido é zerado como antes;
//   - `depois` vence `antes`; `limite` inválido ou acima de 200 é tratado.
// MUTAÇÕES: cada uma aplicada uma vez e reprovada por asserção.
//
// Roda com: node mensagens-incrementais.test.js
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
const NOVO = codigoDe('434 whatsapp GET /whatsapp/:id/messages')

const BASE = Date.UTC(2026, 0, 1)
const msg = (i, extra) => ({ id: 'm' + i, conversation_id: 'c1', from_me: i % 3 === 0, body: 'texto ' + i, sender_jid: '5511999990001@s.whatsapp.net', timestamp: new Date(BASE + i * 60000).toISOString(), ...extra })
const massa = (n, extra) => Array.from({ length: n }, (_, i) => msg(i, extra && extra(i)))   // em ordem de criação

async function rodar(codigo, query, linhas, { unread = 0, conversaId = 'c1' } = {}) {
  const leituras = []
  const updates = []
  const handler = compilar(codigo)
  const conversa = { id: 'c1', remote_jid: '5511999990001@s.whatsapp.net', conta_id: 'default', status: 'open', unread_count: unread, created_at: new Date(BASE).toISOString() }
  const vazio = { findMany: async () => [], findById: async () => null }
  const models = {
    Sessao: { findById: async () => null },
    Profile: { findById: async () => ({ id: 'u1', role: 'admin' }), findMany: async () => [] },
    WhatsAppConversation: { findById: async () => ({ ...conversa }), findMany: async () => [{ ...conversa }], update: async (id, p) => { updates.push(p); return {} } },
    WhatsAppMessage: { findMany: async (f) => { leituras.push({ ...(f || {}) }); return camadaFindMany(linhas, f) }, findById: async () => null },
    SystemSettings: vazio, CompanyContact: vazio, WaConversationEvents: vazio, Ticket: vazio, Company: vazio,
  }
  const r = await handler({ params: { id: conversaId }, query, body: {}, headers: {}, user: { id: 'u1' }, secrets: { get: async () => '' }, fetch: async () => ({ status: 200, body: '{}' }), models, reply: reply() })
  return { status: r.status, c: r.body, leituras, updates, ids: ((r.body && r.body.data) || []).map((x) => x.id) }
}
const seq = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => 'm' + (a + i))
const igual = (x, y) => JSON.stringify(x) === JSON.stringify(y)

async function bateria(codigo) {
  const f = []
  const L = massa(80)
  const a = await rodar(codigo, { limite: '30' }, L)
  if (!igual(a.ids, seq(50, 79)) || !a.c.incremental || a.c.incremental.tem_mais !== true) f.push('ultimas')
  if (a.leituras.length !== 1 || a.leituras[0].limit !== 31) f.push('ultimas-le-n-mais-1')
  if (!a.c.historico || a.c.historico.parcial !== true || a.c.historico.lacuna !== false || a.c.historico.total !== null) f.push('ultimas-historico-parcial')
  const curta = await rodar(codigo, { limite: '30' }, massa(20))
  if (!igual(curta.ids, seq(0, 19)) || curta.c.incremental.tem_mais !== false || curta.c.historico.total !== 20 || curta.c.historico.parcial) f.push('ultimas-conversa-curta')
  // encadeia ANTES do fim ao começo
  let acumulado = a.ids.slice(), cursor = a.ids[0], voltas = 0, temMais = a.c.incremental.tem_mais
  while (temMais && voltas++ < 10) {
    const p = await rodar(codigo, { antes: cursor, limite: '30' }, L)
    acumulado = p.ids.concat(acumulado)
    cursor = p.ids[0]; temMais = p.c.incremental.tem_mais
    if (p.c.historico !== undefined) f.push('antes-sem-historico')
  }
  if (!igual(acumulado, seq(0, 79))) f.push('antes-encadeado')
  const semCursor = await rodar(codigo, { antes: 'mNaoExiste', limite: '30' }, L)
  if (semCursor.ids.length || semCursor.c.incremental.lacuna !== true) f.push('antes-cursor-desconhecido')
  // depois
  const d0 = await rodar(codigo, { depois: 'm79' }, L)
  if (d0.ids.length || d0.c.incremental.lacuna !== false) f.push('depois-sem-novidade')
  if (d0.leituras.length !== 1 || d0.leituras[0].limit !== 100) f.push('depois-le-100')
  if (d0.c.historico !== undefined) f.push('depois-sem-historico')
  const d1 = await rodar(codigo, { depois: 'm79' }, massa(83))
  if (!igual(d1.ids, seq(80, 82))) f.push('depois-so-as-novas')
  const longe = await rodar(codigo, { depois: 'm10' }, massa(300))
  if (longe.ids.length || longe.c.incremental.lacuna !== true) f.push('depois-fora-da-janela')
  const vazia = await rodar(codigo, { depois: 'm1' }, [])
  if (vazia.ids.length || vazia.leituras.length !== 1) f.push('depois-conversa-vazia-sem-reserva')
  // máscara e não lido
  for (const q of [{ limite: '30' }, { depois: 'm10' }]) {
    const r = await rodar(codigo, q, L)
    if (!r.leituras.every((l) => Array.isArray(l.mascararCampos) && l.mascararCampos.includes('media_data'))) f.push('mascara:' + Object.keys(q)[0])
  }
  const u = await rodar(codigo, { depois: 'm79' }, L, { unread: 2 })
  if (!u.updates.some((p) => p.unread_count === 0)) f.push('zera-nao-lido-no-depois')
  // parâmetros
  const p1 = await rodar(codigo, { limite: '999' }, massa(300)); if (p1.leituras[0].limit !== 201 || p1.ids.length !== 200) f.push('limite-teto-200')
  const p2 = await rodar(codigo, { limite: 'abc' }, L); if (p2.ids.length !== 80 || p2.c.incremental) f.push('limite-invalido-vira-legado')
  const p3 = await rodar(codigo, { depois: 'm70', antes: 'm10', limite: '5' }, L); if (!igual(p3.ids, seq(71, 79))) f.push('depois-vence-antes')
  // sem parâmetro: igual a antes
  const g = await rodar(codigo, {}, L)
  if (!igual(g.ids, seq(0, 79)) || 'incremental' in g.c || !g.c.historico || g.c.historico.total !== 80 || g.leituras.length !== 1 || 'limit' in g.leituras[0]) f.push('legado')
  const g2 = await rodar(codigo, {}, massa(600))
  if (g2.ids.length !== 600) f.push('legado-paginas')
  // ORDEM DE CHEGADA: a mensagem que chega DEPOIS (gravada por último) com carimbo ANTIGO
  const atrasada = { ...msg(10), id: 'mATRASADA', body: 'chegou tarde', timestamp: new Date(BASE + 2 * 60000 + 30000).toISOString() }
  const comAtraso = massa(10).concat([atrasada])
  const t1 = await rodar(codigo, { depois: 'm9' }, comAtraso)
  if (!igual(t1.ids, ['mATRASADA'])) f.push('depois-nao-perde-a-atrasada')
  const t2 = await rodar(codigo, { depois: 'mATRASADA' }, comAtraso.concat([{ ...msg(11), id: 'm11' }]))
  if (!igual(t2.ids, ['m11'])) f.push('depois-da-atrasada')
  const t3 = await rodar(codigo, { limite: '3' }, comAtraso)
  if (!igual(t3.ids, ['mATRASADA', 'm8', 'm9']) || t3.c.incremental.tem_mais !== true) f.push('ultimas-pela-chegada-exibe-por-carimbo')
  const t4 = await rodar(codigo, { antes: 'm5', limite: '3' }, comAtraso)
  if (!igual(t4.ids, seq(2, 4)) || t4.c.incremental.tem_mais !== true) f.push('antes-pela-chegada')
  const t5 = await rodar(codigo, { antes: 'mATRASADA', limite: '2' }, comAtraso)
  if (!igual(t5.ids, ['m8', 'm9'])) f.push('antes-da-atrasada')
  const t6 = await rodar(codigo, {}, comAtraso)
  if (t6.ids.indexOf('mATRASADA') !== 3) f.push('exibicao-por-carimbo')
  // conversa sem mensagem: UMA leitura, com filtro, em todos os modos (sem reserva sem filtro)
  for (const q of [{}, { limite: '5' }, { antes: 'x' }, { depois: 'x' }]) {
    const v = await rodar(codigo, q, [])
    if (v.ids.length || v.leituras.length !== 1 || !v.leituras.every((l) => 'conversation_id' in l)) f.push('vazia-sem-reserva:' + Object.keys(q).join(''))
  }
  return f
}

;(async () => {
  const L = massa(80)
  const a = await rodar(NOVO, { limite: '30' }, L)
  ok('TRAVA: `limite=30` respondeu 200 com 30 mensagens', a.status === 200 && a.ids.length === 30, [a.status, a.ids.length])
  ok('`limite`: as 30 mais recentes, em ordem, e `tem_mais: true`', igual(a.ids, seq(50, 79)) && a.c.incremental.tem_mais === true, a.ids.slice(0, 3))
  ok('`limite`: UMA leitura de 31 linhas (N+1), não a conversa inteira', a.leituras.length === 1 && a.leituras[0].limit === 31, a.leituras)
  ok('`limite` com `tem_mais`: historico parcial (sem lacuna falsa, total nulo)', a.c.historico.parcial === true && a.c.historico.lacuna === false && a.c.historico.total === null, a.c.historico)
  const curta = await rodar(NOVO, { limite: '30' }, massa(20))
  ok('`limite` numa conversa curta: devolve tudo, `tem_mais: false`, historico completo (total 20)', igual(curta.ids, seq(0, 19)) && curta.c.incremental.tem_mais === false && curta.c.historico.total === 20 && !curta.c.historico.parcial, curta.c.historico)
  let acumulado = a.ids.slice(), cursor = a.ids[0], voltas = 0, temMais = a.c.incremental.tem_mais, pags = 0
  while (temMais && voltas++ < 10) { const p = await rodar(NOVO, { antes: cursor, limite: '30' }, L); acumulado = p.ids.concat(acumulado); cursor = p.ids[0]; temMais = p.c.incremental.tem_mais; pags++ }
  ok(`\`antes\` encadeado (${pags} páginas) junta as 80 mensagens, sem buraco nem repetição`, igual(acumulado, seq(0, 79)), acumulado.length)
  const sc = await rodar(NOVO, { antes: 'mNaoExiste', limite: '30' }, L)
  ok('`antes` com cursor desconhecido: vazio e `lacuna: true`', sc.ids.length === 0 && sc.c.incremental.lacuna === true, sc.c.incremental)
  const d0 = await rodar(NOVO, { depois: 'm79' }, L)
  ok('`depois` sem novidade: vazio, sem lacuna, UMA leitura de 100 linhas, sem `historico`', d0.ids.length === 0 && d0.c.incremental.lacuna === false && d0.leituras.length === 1 && d0.leituras[0].limit === 100 && d0.c.historico === undefined, [d0.c.incremental, d0.leituras])
  const d1 = await rodar(NOVO, { depois: 'm79' }, massa(83))
  ok('`depois` com 3 novas: devolve exatamente m80..m82', igual(d1.ids, seq(80, 82)), d1.ids)
  const longe = await rodar(NOVO, { depois: 'm10' }, massa(300))
  ok('`depois` com cursor fora das 100 mais recentes: `lacuna: true` (a tela refaz a abertura)', longe.ids.length === 0 && longe.c.incremental.lacuna === true, longe.c.incremental)
  const vazia = await rodar(NOVO, { depois: 'm1' }, [])
  ok('`depois` numa conversa vazia: vazio e sem varredura de reserva (uma leitura só)', vazia.ids.length === 0 && vazia.leituras.length === 1, vazia.leituras)
  const semNada = [await rodar(NOVO, {}, []), await rodar(NOVO, { limite: '5' }, []), await rodar(NOVO, { antes: 'x' }, [])]
  ok('conversa sem mensagem, em TODOS os modos: uma leitura, com filtro, nenhuma sem filtro', semNada.every((v) => v.ids.length === 0 && v.leituras.length === 1 && 'conversation_id' in v.leituras[0]), semNada.map((v) => v.leituras))
  const atr = { ...msg(10), id: 'mATRASADA', body: 'chegou tarde', timestamp: new Date(BASE + 2 * 60000 + 30000).toISOString() }
  const comAtraso = massa(10).concat([atr])
  const ta = await rodar(NOVO, { depois: 'm9' }, comAtraso)
  ok('`depois`: a mensagem que chega tarde (gravada depois do cursor, carimbo antigo) NÃO se perde', igual(ta.ids, ['mATRASADA']), ta.ids)
  const tb = await rodar(NOVO, { limite: '3' }, comAtraso)
  ok('`limite`: a janela é a das 3 últimas que CHEGARAM, exibidas por carimbo', igual(tb.ids, ['mATRASADA', 'm8', 'm9']) && tb.c.incremental.tem_mais === true, tb.ids)
  const tc = await rodar(NOVO, { antes: 'm5', limite: '3' }, comAtraso)
  ok('`antes`: o cursor e a janela seguem a ordem de chegada (a atrasada, que chegou depois, não entra)', igual(tc.ids, seq(2, 4)), tc.ids)
  const td = await rodar(NOVO, {}, comAtraso)
  ok('a resposta inteira continua exibida por carimbo (a atrasada entre m2 e m3)', td.ids.indexOf('mATRASADA') === 3, td.ids)
  const u = await rodar(NOVO, { depois: 'm79' }, L, { unread: 2 })
  ok('o não lido é zerado também no ciclo `depois`', u.updates.some((p) => p.unread_count === 0), u.updates)
  ok('todas as leituras mascaram o anexo (`media_data`)', [await rodar(NOVO, { limite: '30' }, L), await rodar(NOVO, { depois: 'm10' }, L)].every((r) => r.leituras.every((l) => Array.isArray(l.mascararCampos) && l.mascararCampos.includes('media_data'))), 'sem máscara')
  const p1 = await rodar(NOVO, { limite: '999' }, massa(300))
  ok('`limite=999` vira 200 (leitura de 201 linhas)', p1.leituras[0].limit === 201 && p1.ids.length === 200, [p1.leituras[0], p1.ids.length])
  const p2 = await rodar(NOVO, { limite: 'abc' }, L)
  ok('`limite` inválido: responde como antes (conversa inteira, sem `incremental`)', p2.ids.length === 80 && !p2.c.incremental, p2.ids.length)
  const p3 = await rodar(NOVO, { depois: 'm70', antes: 'm10', limite: '5' }, L)
  ok('`depois` vence `antes`', igual(p3.ids, seq(71, 79)), p3.ids)
  const g = await rodar(NOVO, {}, L)
  ok('SEM parâmetro: a conversa inteira, `historico` completo, sem `incremental`, uma leitura sem `limit`', igual(g.ids, seq(0, 79)) && !('incremental' in g.c) && g.c.historico.total === 80 && g.leituras.length === 1 && !('limit' in g.leituras[0]), [g.ids.length, Object.keys(g.c)])
  const g2 = await rodar(NOVO, {}, massa(600))
  ok('SEM parâmetro, 600 mensagens: as páginas seguem lendo tudo (600)', g2.ids.length === 600, g2.ids.length)
  ok('a bateria passa limpa no código novo', (await bateria(NOVO)).length === 0, await bateria(NOVO))

  const muts = [
    ['limite lê N em vez de N+1', '_argLeitura.limit = _limite + 1;', '_argLeitura.limit = _limite;'],
    ['depois lê a conversa inteira', 'if (_modo === "depois") _argLeitura.limit = 100;', 'if (false) _argLeitura.limit = 100;'],
    ['limite lê a conversa inteira (de fato)', 'else if (_modo === "ultimas") _argLeitura.limit = _limite + 1;', ''],
    ['sem tem_mais', '_inc.tem_mais = true; rows = _exibir(_chegada.slice(0, _limite));', 'rows = _exibir(_chegada.slice(0, _limite));'],
    ['historico parcial com lacuna falsa', '_hist.parcial = true; _hist.lacuna = false; _hist.total = null;', '_hist.parcial = true;'],
    ['depois devolve a partir do cursor (repete a dele)', 'if (_ix >= 0) rows = _exibir(_chegada.slice(0, _ix));', 'if (_ix >= 0) rows = _exibir(_chegada.slice(0, _ix + 1));'],
    ['depois com cursor fora da janela devolve tudo', 'else if (_chegada.length) { _inc.lacuna = true; rows = []; }', ''],
    ['antes devolve a janela errada (inclui o cursor)', 'var _anteriores = _chegada.slice(_ia + 1, _ia + 1 + _tam);', 'var _anteriores = _chegada.slice(_ia, _ia + _tam);'],
    ['antes sem tem_mais', '_inc.tem_mais = (_chegada.length - (_ia + 1 + _anteriores.length)) > 0 || _ultimaPaginaCheia;', '_inc.tem_mais = false;'],
    ['a reserva sem filtro volta', '  var _lidas = all.length;', '  if (!all.length && _modo !== "depois") { try { all = (await m.Msg.findMany({ mascararCampos: _MASCARAR_MIDIA })) || []; } catch (e) { all = []; } }\n  var _lidas = all.length;'],
    ['cursor na ordem do carimbo (o defeito corrigido)', '  var _inc = { modo: _modo, tem_mais: false, lacuna: false };', '  _chegada.sort(function (a, b) { return _porTimestamp(b, a); });\n  var _inc = { modo: _modo, tem_mais: false, lacuna: false };'],
    ['exibição pela chegada em vez do carimbo', 'return lista.slice().sort(_porTimestamp).map(serializeMsg);', 'return lista.slice().reverse().map(serializeMsg);'],
    ['teto de 200 some', 'else if (_limite > 200) _limite = 200;', ''],
    ['depois não vence antes', 'var _modo = _depois ? "depois" : (_antes ? "antes" : (_limite ? "ultimas" : ""));', 'var _modo = _antes ? "antes" : (_depois ? "depois" : (_limite ? "ultimas" : ""));'],
    ['depois devolve historico', '(_modo === "depois" || _modo === "antes") ? undefined : _hist', '_hist'],
    ['sem parâmetro devolve incremental', '_modo ? _inc : undefined);', '_inc);'],
    ['não zera o não lido no depois', 'if (conv && naoLidasAoAbrir > 0) {', 'if (conv && naoLidasAoAbrir > 0 && _modo !== "depois") {'],
  ]
  for (const [nome, de, para] of muts) {
    const n = NOVO.split(de).length - 1
    if (n !== 1) { ok(`mutação "${nome}" aplica exatamente uma vez`, false, n); continue }
    let fm
    try { fm = await bateria(NOVO.replace(de, () => para)) } catch (e) { ok(`mutação "${nome}" reprova por asserção, não por erro de carga`, false, String(e)); continue }
    ok(`mutação "${nome}" é pega (${fm.slice(0, 3).join(',')})`, fm.length > 0, 'sobreviveu')
  }
  fim()
})()
