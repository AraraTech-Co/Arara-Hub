// A busca de nomes (tabela de contatos inteira e configuração) só acontece quando alguma
// mensagem tem uma menção `@<número>` (rotas 434, conversa aberta, e 432, lista).
//
// `_nomesPorJid` só é lido por `_comNomes`, que troca exatamente `@(\d{8,20})` no corpo da
// mensagem. Sem menção o resultado é o mesmo, e a conversa aberta (consultada a cada ~5 s
// por atendente) deixava de gastar duas leituras, uma delas da tabela de contatos inteira.
//
// O QUE SE GARANTE, nas duas rotas:
//   - a resposta é IDÊNTICA à do bloco de antes, com e sem menção;
//   - sem menção, a leitura de contatos e a de configuração do mapa de nomes não acontecem;
//   - com menção, acontecem, e o nome aparece no lugar do número;
//   - menção com número curto demais (<8 dígitos) ou sem `@` não conta.
//
// O CONTROLE: o bloco de antes (sempre busca) é reconstituído e rodado sobre a mesma massa.
// MUTAÇÕES: cada uma aplicada uma vez e reprovada por asserção.
//
// Roda com: node nomes-so-quando-ha-mencao.test.js
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

const R434 = codigoDe('434 whatsapp GET /whatsapp/:id/messages')
const R432 = codigoDe('432 whatsapp GET /whatsapp')
const GATE_434 = '  if (_temMencao(all)) { await _carregarNomes(ctx, all); } else { _nomesPorJid = {}; }\n'
const GATE_432 = 'if (_temMencao(_todasMsgs)) { await _carregarNomes(ctx, _todasMsgs); } else { _nomesPorJid = {}; }'
const sempre = (cod, gate, chamada) => { if (cod.split(gate).length - 1 !== 1) throw new Error('âncora do controle'); return cod.replace(gate, chamada) }
const A434 = sempre(R434, GATE_434, '  await _carregarNomes(ctx, all);\n')
const A432 = sempre(R432, GATE_432, 'await _carregarNomes(ctx, _todasMsgs);')

// relógio FIXO: com `Date.now()` a cada chamada os carimbos diferem em milissegundos entre as duas execuções
const BASE = Date.now()
const ts = (n) => new Date(BASE - (100 - n) * 60000).toISOString()
const MENCAO = 'oi @5511999990001 tudo bem?'
const contatos = [{ id: 'ct1', name: 'Fulana de Tal', whatsapp: '5511999990001', active: true }]

function leituras() { return { contatos: 0, config: 0 } }
function ctxDe(corpos, cont) {
  const mensagens = corpos.map((b, i) => ({ id: 'm' + i, conversation_id: 'c1', from_me: false, body: b, sender_jid: '5511888887777@s.whatsapp.net', sender_name: 'Cliente', timestamp: ts(i) }))
  const conversa = { id: 'c1', remote_jid: '5511888887777@s.whatsapp.net', status: 'open', phase: 'em_atendimento', updated_at: ts(50), created_at: ts(0), unread_count: 0, conta_id: 'default' }
  const vazio = { findMany: async () => [], findById: async () => null }
  return {
    params: { id: 'c1' }, query: {}, body: {}, headers: {}, user: { id: 'u1' },
    models: {
      Sessao: { findById: async () => null },
      Profile: { findById: async () => ({ id: 'u1', role: 'admin' }), findMany: async () => [] },
      WhatsAppConversation: { findById: async () => ({ ...conversa }), findMany: async () => [{ ...conversa }], update: async () => ({}) },
      WhatsAppMessage: { findMany: async (f) => mensagens.filter((m) => !f || !f.conversation_id || m.conversation_id === f.conversation_id).slice().reverse(), findById: async () => null },
      SystemSettings: { findMany: async () => { cont.config++; return [{}] } },
      CompanyContact: { findMany: async () => { cont.contatos++; return contatos.map((c) => ({ ...c })) } },
      WaDepartment: vazio, Company: vazio, Ticket: vazio, WaCloseReason: vazio, WaTag: vazio, WaConversationTag: vazio, WaConversationEvents: vazio,
    },
    reply: reply(),
  }
}
async function rodar(codigo, corpos) {
  const cont = leituras()
  const r = await compilar(codigo)(ctxDe(corpos, cont))
  return { status: r.status, corpo: JSON.stringify(r.body), cont, obj: r.body }
}
const bodiesDe = (r) => JSON.stringify(r.obj)

async function bateria(c434, c432) {
  const f = []
  const sem = ['oi', 'tudo bem?', 'ok']
  const com = ['oi', 'ok', MENCAO]
  for (const [rotulo, cod, antigo] of [['434', c434, A434], ['432', c432, A432]]) {
    const n1 = await rodar(cod, sem); const a1 = await rodar(antigo, sem)
    if (n1.corpo !== a1.corpo) f.push(rotulo + ':resposta-sem-mencao')
    if (!(n1.cont.contatos < a1.cont.contatos) || !(n1.cont.config < a1.cont.config)) f.push(rotulo + ':leituras-sem-mencao')
    const n2 = await rodar(cod, com); const a2 = await rodar(antigo, com)
    if (n2.corpo !== a2.corpo) f.push(rotulo + ':resposta-com-mencao')
    if (n2.cont.contatos !== a2.cont.contatos || n2.cont.config !== a2.cont.config) f.push(rotulo + ':leituras-com-mencao')
    if (!bodiesDe(n2).includes('@Fulana de Tal')) f.push(rotulo + ':nome-no-lugar-do-numero')
    const n3 = await rodar(cod, ['oi @123', 'email a@b.com', '@ 5511999990001'])
    const a3 = await rodar(antigo, ['oi @123', 'email a@b.com', '@ 5511999990001'])
    if (n3.corpo !== a3.corpo || !(n3.cont.contatos < a3.cont.contatos)) f.push(rotulo + ':nao-e-mencao')
  }
  return f
}

;(async () => {
  for (const [rotulo, cod, antigo] of [['434 (conversa aberta)', R434, A434], ['432 (lista)', R432, A432]]) {
    const n1 = await rodar(cod, ['oi', 'tudo bem?', 'ok']); const a1 = await rodar(antigo, ['oi', 'tudo bem?', 'ok'])
    ok(`${rotulo}: TRAVA — a rota respondeu 200 com as mensagens/conversa`, n1.status === 200 && n1.corpo.length > 100, [n1.status, n1.corpo.length])
    ok(`${rotulo}: sem menção, a resposta é IDÊNTICA à do bloco de antes`, n1.corpo === a1.corpo, 'divergiu')
    ok(`${rotulo}: sem menção, contatos e configuração deixam de ser lidos (antes: ${a1.cont.contatos} e ${a1.cont.config}; agora: ${n1.cont.contatos} e ${n1.cont.config})`, n1.cont.contatos < a1.cont.contatos && n1.cont.config < a1.cont.config, [n1.cont, a1.cont])
    const n2 = await rodar(cod, ['oi', 'ok', MENCAO]); const a2 = await rodar(antigo, ['oi', 'ok', MENCAO])
    ok(`${rotulo}: com menção, a resposta é idêntica e as leituras acontecem como antes`, n2.corpo === a2.corpo && n2.cont.contatos === a2.cont.contatos && n2.cont.config === a2.cont.config, [n2.cont, a2.cont])
    ok(`${rotulo}: com menção, o nome aparece no lugar do número`, bodiesDe(n2).includes('@Fulana de Tal') && !bodiesDe(n2).includes('@5511999990001'), 'sem nome')
    const n3 = await rodar(cod, ['oi @123', 'email a@b.com', '@ 5511999990001']); const a3 = await rodar(antigo, ['oi @123', 'email a@b.com', '@ 5511999990001'])
    ok(`${rotulo}: texto parecido com menção (curto, e-mail, @ solto) não conta`, n3.corpo === a3.corpo && n3.cont.contatos < a3.cont.contatos, [n3.cont, a3.cont])
  }
  ok('a bateria passa limpa no código novo', (await bateria(R434, R432)).length === 0, await bateria(R434, R432))

  const muts = [
    ['434: nunca busca nomes', GATE_434, '  _nomesPorJid = {};\n', '434'],
    ['434: sempre busca nomes', GATE_434, '  await _carregarNomes(ctx, all);\n', '434'],
    ['434: a menção exige 20+ dígitos', '/@\\d{8,20}\\b/.test(', '/@\\d{20,30}\\b/.test(', '434'],
    ['432: nunca busca nomes', GATE_432, '_nomesPorJid = {};', '432'],
    ['432: sempre busca nomes', GATE_432, 'await _carregarNomes(ctx, _todasMsgs);', '432'],
  ]
  for (const [nome, de, para, rota] of muts) {
    const base = rota === '434' ? R434 : R432
    const n = base.split(de).length - 1
    if (n !== 1) { ok(`mutação "${nome}" aplica exatamente uma vez`, false, n); continue }
    const mut = base.replace(de, () => para)
    let fm
    try { fm = rota === '434' ? await bateria(mut, R432) : await bateria(R434, mut) } catch (e) { ok(`mutação "${nome}" reprova por asserção, não por erro de carga`, false, String(e)); continue }
    ok(`mutação "${nome}" é pega (${fm.slice(0, 3).join(',')})`, fm.length > 0, 'sobreviveu')
  }
  fim()
})()
