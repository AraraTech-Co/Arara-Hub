// O detalhe da conversa (rota 433, `GET /whatsapp/:id`) não busca a última mensagem.
//
// Quem chama esta rota é o painel lateral da inbox (crm-context-panel.tsx), que não lê
// `last_message`. Achar a última mensagem custava uma leitura de mensagens por conversa aberta,
// e essa leitura era quase todo o tempo da rota. O `PATCH /whatsapp/:id` continua buscando: a
// resposta dele vai para a lista da inbox, que mostra a prévia (ultima-mensagem-do-detalhe.test.js).
//
// O QUE SE GARANTE:
//   - o detalhe NÃO lê mensagem nenhuma;
//   - `last_message` continua na resposta, com `null`;
//   - fora `last_message`, a resposta é IDÊNTICA à do handler de antes (o mesmo literal com a
//     busca devolvida), numa conversa completa (responsável, empresa, chamado, etiqueta);
//   - o painel não lê `last_message` (lido no próprio componente, sem comentários);
//   - conversa inexistente continua 404.
//
// MUTAÇÕES: cada uma aplicada uma vez e reprovada na asserção que a nomeia.
//
// Roda com: node detalhe-sem-ultima-mensagem.test.js
const fs = require('fs')
const path = require('path')
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
    setTimeout, clearTimeout, module: { exports: {} },
  }
  c.exports = c.module.exports; c.globalThis = c
  vm.createContext(c); vm.runInContext(codigo, c)
  return c.module.exports.handler
}

const R433 = codigoDe('433 whatsapp GET /whatsapp/:id ')
const RPATCH = codigoDe('whatsapp PATCH /whatsapp/:id (')
const NOVO = '  var lastByConv = {};\n'
const ANTIGO = '  var lastByConv = await lastMessagesByConv(m.Msg, c.id);\n'
// O handler de antes: a chamada de volta, com o auxiliar (a cópia idêntica que ficou no PATCH).
const AUX = (() => { const i = RPATCH.indexOf('async function lastMessagesByConv'); return RPATCH.slice(i, RPATCH.indexOf('function serializeMsg', i)) })()
const ANTES = (() => {
  if (R433.split(NOVO).length - 1 !== 1) throw new Error('âncora nova')
  return R433.replace(NOVO, () => ANTIGO) + '\n' + AUX
})()

const CONV = {
  id: 'c1', remote_jid: '5511999990001@s.whatsapp.net', conta_id: 'default', status: 'open', phase: 'em_atendimento',
  assigned_to_id: 'u1', company_id: 'co1', ticket_id: 't1', department_id: 'd1',
  updated_at: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z',
}
const MSGS = [
  { id: 'm1', conversation_id: 'c1', from_me: false, body: 'oi', timestamp: '2026-01-01T10:00:00Z', created_at: '2026-01-01T10:00:00Z' },
  { id: 'm2', conversation_id: 'c1', from_me: true, body: 'ultima', timestamp: '2026-01-01T11:00:00Z', created_at: '2026-01-01T11:00:00Z' },
]

async function rodar(cod, id = 'c1') {
  const leituras = []
  const um = (linhas) => ({ findById: async (x) => linhas.find((l) => l.id === x) || null, findMany: async () => linhas })
  const models = {
    WhatsAppConversation: um([CONV]),
    WhatsAppMessage: {
      findMany: async (f) => { leituras.push(JSON.parse(JSON.stringify(f || {}))); return MSGS.filter((m) => !f || !f.conversation_id || m.conversation_id === f.conversation_id).slice().reverse().slice(0, (f && f.limit) || 500) },
      findById: async () => null,
    },
    Profile: um([{ id: 'u1', role: 'support', full_name: 'Ana Souza' }]),
    Sessao: um([]), SystemSettings: { findMany: async () => [{}] }, ClientUser: um([]), Unit: um([]),
    CompanyContact: um([]), Company: um([{ id: 'co1', name: 'Casa Rosa' }]),
    WaDepartments: um([{ id: 'd1', name: 'Suporte' }]), Ticket: um([{ id: 't1', number: 42, title: 'Sistema parado', status: 'open' }]),
    WaCloseReasons: um([]),
    WaConversationTags: { findMany: async (f) => (f && f.conversation_id === 'c1' ? [{ id: 'ct1', conversation_id: 'c1', tag_id: 'g1', createdAt: '2026-01-01T00:00:00Z' }] : []), findById: async () => null },
    WaTags: um([{ id: 'g1', name: 'urgente', color: '#f00' }]),
  }
  let r
  try {
    r = await compilar(cod)({ params: { id }, query: {}, body: {}, headers: {}, user: { id: 'u1' }, models, reply: reply() })
  } catch (e) {
    r = { status: 'estouro: ' + String(e && e.message).slice(0, 60), body: null }
  }
  return { r, leituras, d: r.body && r.body.data }
}
const semUltima = (d) => JSON.stringify({ ...d, last_message: undefined })

function codigoSemComentarios(arq) {
  return fs.readFileSync(arq, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

async function bateria(cod) {
  const f = []
  const novo = await rodar(cod)
  const antes = await rodar(ANTES)
  if (!(novo.r.status === 200 && novo.d && novo.d.id === 'c1')) f.push('TRAVA: o detalhe respondeu 200 com a conversa')
  if (!(antes.d && antes.d.last_message && antes.d.last_message.id === 'm2' && antes.leituras.length >= 1)) f.push('controle: o handler de antes lia e devolvia a última')
  if (novo.leituras.length !== 0) f.push('o detalhe não lê mensagem nenhuma')
  if (!(novo.d && 'last_message' in novo.d && novo.d.last_message === null)) f.push('last_message continua na resposta, com null')
  if (!(novo.d && semUltima(novo.d) === semUltima(antes.d))) f.push('fora last_message, a resposta é idêntica à de antes')
  if (!(novo.d && novo.d.ticket && novo.d.company && novo.d.assignedTo && (novo.d.tags || []).length === 1 && novo.d.department)) f.push('TRAVA DE MASSA: a conversa exercita chamado, empresa, responsável, etiqueta e departamento')
  const nada = await rodar(cod, 'nao-existe')
  if (nada.r.status !== 404) f.push('conversa inexistente continua 404')
  return { f, novo, antes }
}

;(async () => {
  const { f, novo, antes } = await bateria(R433)
  const NOMES = [
    'TRAVA: o detalhe respondeu 200 com a conversa',
    'controle: o handler de antes lia e devolvia a última',
    'o detalhe não lê mensagem nenhuma',
    'last_message continua na resposta, com null',
    'fora last_message, a resposta é idêntica à de antes',
    'TRAVA DE MASSA: a conversa exercita chamado, empresa, responsável, etiqueta e departamento',
    'conversa inexistente continua 404',
  ]
  for (const n of NOMES) ok(n, !f.includes(n), { novo: novo.d, leituras: novo.leituras, antes: antes.d && antes.d.last_message })

  const painel = codigoSemComentarios(path.resolve(__dirname, '../../app/_components/inbox/crm-context-panel.tsx'))
  ok('o painel lateral chama o detalhe e não lê last_message',
    painel.includes('whatsappApi.getConversation(') && !/last_message|lastMessage/.test(painel))
  ok('o PATCH segue buscando a última (a lista mostra a prévia)', RPATCH.includes('await lastMessagesByConv(m.Msg, c.id)'))

  // ── mutações ──────────────────────────────────────────────────────────────
  const MUTS = [
    ['a busca volta', NOVO, ANTIGO + '', 'o detalhe não lê mensagem nenhuma', true],
    ['last_message some da resposta', '    last_message: serializeMsg(last),\n', '', 'last_message continua na resposta, com null'],
    ['lastByConv indefinido', NOVO, '  var lastByConv;\n', 'TRAVA: o detalhe respondeu 200 com a conversa'],
    ['outro campo muda junto', '  data.remoteJid = data.remote_jid;\n', '  data.remoteJid = null;\n', 'fora last_message, a resposta é idêntica à de antes'],
  ]
  for (const [nome, de, para, assercao, comAux] of MUTS) {
    const n = R433.split(de).length - 1
    if (n !== 1) { ok(`mutação "${nome}" aplica exatamente uma vez`, false, n); continue }
    let fm
    try { fm = (await bateria(R433.replace(de, () => para) + (comAux ? '\n' + AUX : ''))).f } catch (e) { fm = ['erro: ' + e.message] }
    ok(`mutação "${nome}" morre em "${assercao}"`, fm.includes(assercao), fm)
  }
  fim()
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(1) })
