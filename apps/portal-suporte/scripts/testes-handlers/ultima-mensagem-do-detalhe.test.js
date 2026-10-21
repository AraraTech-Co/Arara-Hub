// A "última mensagem" do detalhe da conversa (rota 433 e o PATCH que reaproveita `loadDepsDaConversa`)
// lê UMA mensagem, e não a conversa inteira: o auxiliar `lastMessagesByConv` tinha a própria cópia
// em cada handler e a correção do `limit: 1` (#103) só entrou na da lista.
//
// O QUE SE GARANTE (rota 433, com a camada de modelos emulada):
//   - a leitura pelo campo `conversation_id` sai com `limit: 1`;
//   - a leitura em camelCase (`conversationId`) NÃO acontece quando a primeira achou mensagem, e
//     acontece (com `limit: 1`) quando não achou;
//   - a resposta é IDÊNTICA à de antes quando a ordem de gravação e a do carimbo coincidem;
//   - CRITÉRIO: a última é a mais recente por ORDEM DE GRAVAÇÃO (`created_at`, a da camada), não o
//     maior `timestamp`. Com os dois em ordens contrárias o teste fixa quem vence, antes e agora;
//   - as duas cópias do auxiliar (433 e PATCH) são idênticas.
// MUTAÇÕES: cada uma aplicada uma vez e reprovada por asserção.
//
// Roda com: node ultima-mensagem-do-detalhe.test.js
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
    RegExp, Buffer, Error, TypeError, encodeURIComponent, decodeURIComponent, Intl, URL, URLSearchParams,
    setTimeout, clearTimeout, module: { exports: {} },
  }
  c.exports = c.module.exports; c.globalThis = c
  vm.createContext(c); vm.runInContext(codigo, c)
  return c.module.exports.handler
}
const R433 = codigoDe('433 whatsapp GET /whatsapp/:id')
const RPATCH = codigoDe('whatsapp PATCH /whatsapp/:id (')
const NOVO_TRECHO = '    all = await Msg.findMany({ conversation_id: conversaId, limit: 1 });\n    if (!all.length) all = await Msg.findMany({ conversationId: conversaId, limit: 1 });\n'
const ANTIGO_TRECHO = '    all = _juntarPorRecencia(await Msg.findMany({ conversation_id: conversaId }), await Msg.findMany({ conversationId: conversaId }));\n'
const ANTES = (() => { if (R433.split(NOVO_TRECHO).length - 1 !== 1) throw new Error('âncora'); return R433.replace(NOVO_TRECHO, ANTIGO_TRECHO) })()

const CONV = { id: 'c1', remote_jid: '5511999990001@s.whatsapp.net', conta_id: 'default', status: 'open', phase: 'em_atendimento', assigned_to_id: 'u1', updated_at: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z' }
const msg = (id, corpo, ts, extra = {}) => ({ id, conversation_id: 'c1', from_me: false, body: corpo, timestamp: ts, created_at: ts, ...extra })

async function rodar(cod, linhas) {
  const leituras = []
  const vazio = { findMany: async () => [], findById: async () => null }
  const models = {
    WhatsAppConversation: { findById: async () => ({ ...CONV }), findMany: async () => [{ ...CONV }] },
    WhatsAppMessage: { findMany: async (f) => { leituras.push(JSON.parse(JSON.stringify(f || {}))); return camadaFindMany(linhas, f) }, findById: async () => null },
    Profile: { findById: async () => ({ id: 'u1', role: 'support', full_name: 'Ana' }), findMany: async () => [] },
    Sessao: vazio, SystemSettings: { findMany: async () => [{}] }, ClientUser: vazio, CompanyContact: vazio, Company: vazio, Unit: vazio,
    WaDepartments: vazio, Ticket: vazio, WaCloseReasons: vazio, WaConversationTags: vazio, WaTags: vazio,
  }
  const r = await compilar(cod)({ params: { id: 'c1' }, query: {}, body: {}, headers: {}, user: { id: 'u1' }, models, reply: reply() })
  return { status: r.status, corpo: JSON.stringify(r.body), leituras, ultima: r.body && r.body.data && r.body.data.last_message }
}

async function bateria(cod = R433) {
  const falhas = []
  const t = (nome, cond, det) => { if (!cond) falhas.push(nome + (det !== undefined ? ' ' + JSON.stringify(det).slice(0, 220) : '')) }
  const normal = [msg('m1', 'primeira', '2026-01-01T10:00:00Z'), msg('m2', 'segunda', '2026-01-01T11:00:00Z'), msg('m3', 'ultima', '2026-01-01T12:00:00Z', { media_data: 'AAAA'.repeat(50) })]
  const a = await rodar(cod, normal)
  const doc = a.leituras.filter((f) => 'conversation_id' in f), cam = a.leituras.filter((f) => 'conversationId' in f)
  t('a leitura por conversation_id sai com limit: 1', doc.length === 1 && doc[0].limit === 1, a.leituras)
  t('a leitura em camelCase NÃO acontece quando a primeira achou', cam.length === 0, a.leituras)
  t('a última mensagem é a mais recente', a.status === 200 && a.ultima && a.ultima.body === 'ultima', a.ultima)
  const antes = await rodar(ANTES, normal)
  t('a resposta é IDÊNTICA à de antes (ordem e carimbo coincidem)', a.corpo === antes.corpo && a.corpo.length > 100, 'divergiu')
  // CRITÉRIO: gravada por último, com carimbo mais antigo
  const fora = [msg('m1', 'carimbo recente', '2026-01-01T12:00:00Z', { created_at: '2026-01-01T09:00:00Z' }), msg('m2', 'gravada por ultimo', '2026-01-01T08:00:00Z', { created_at: '2026-01-01T10:00:00Z' })]
  const x = await rodar(cod, fora)
  t('critério: vence a gravada por último (created_at), mesmo com carimbo antigo', x.ultima && x.ultima.body === 'gravada por ultimo', x.ultima)
  // o código de antes escolhia o maior timestamp
  const y = await rodar(ANTES, fora)
  t('controle: antes vencia o maior timestamp', y.ultima && y.ultima.body === 'carimbo recente', y.ultima)
  // reserva: só o campo em camelCase
  const camel = [{ id: 'k1', conversationId: 'c1', from_me: false, body: 'so camel', timestamp: '2026-01-01T10:00:00Z', created_at: '2026-01-01T10:00:00Z' }]
  const k = await rodar(cod, camel)
  const kc = k.leituras.filter((f) => 'conversationId' in f)
  t('sem mensagem pelo nome de sempre, tenta o camelCase (com limit: 1)', kc.length === 1 && kc[0].limit === 1 && k.ultima && k.ultima.body === 'so camel', k.leituras)
  const vazia = await rodar(cod, [])
  t('conversa sem mensagem: responde 200 sem última', vazia.status === 200 && !vazia.ultima, vazia.status)
  return falhas
}

;(async () => {
  const f0 = await bateria()
  ok('a bateria passa limpa', f0.length === 0, f0)
  const aux = (s) => { const i = s.indexOf('async function lastMessagesByConv'); return s.slice(i, s.indexOf('function serializeMsg', i)) }
  ok('as duas cópias do auxiliar (433 e PATCH) são idênticas e têm o limit', aux(R433) === aux(RPATCH) && aux(R433).includes('limit: 1'), [aux(R433).length, aux(RPATCH).length])
  const muts = [
    ['sem limit na leitura principal', 'conversation_id: conversaId, limit: 1 }', 'conversation_id: conversaId }'],
    ['camelCase sempre lido', 'if (!all.length) all = await Msg.findMany({ conversationId: conversaId, limit: 1 });', 'all = all.concat(await Msg.findMany({ conversationId: conversaId, limit: 1 }));'],
    ['camelCase sem limit', 'conversationId: conversaId, limit: 1 }', 'conversationId: conversaId }'],
    ['sem a reserva em camelCase', '    if (!all.length) all = await Msg.findMany({ conversationId: conversaId, limit: 1 });\n', ''],
  ]
  for (const [nome, de, para] of muts) {
    const n = R433.split(de).length - 1
    if (n !== 1) { ok(`mutação "${nome}" aplica exatamente uma vez`, false, n); continue }
    let fm
    try { fm = await bateria(R433.replace(de, () => para)) } catch (e) { fm = ['erro: ' + e.message] }
    ok(`mutação "${nome}" é pega (${fm.slice(0, 1).join('').slice(0, 70)})`, fm.length > 0, 'sobreviveu')
  }
  fim()
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(1) })
