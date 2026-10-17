// A reação do cliente (rota 485) acha a mensagem alvo pelo id; quando o filtro por
// `message_id` não acha (a mensagem foi gravada com o campo `messageId`), a rota
// lê a tabela como reserva. Essa leitura traz até 500 mensagens e, com elas, o
// `media_data` de cada uma, que a reação não usa.
//
// O QUE SE GARANTE: a reserva pede `mascararCampos: ["media_data"]`; a reação cai
// na mesma mensagem, com o mesmo emoji, e o que sai do banco nessa leitura encolhe.
//
// A REGRA QUE TORNA ISSO SEGURO: a gravação é `update(id, { reacoes })`, campo a
// campo. O objeto lido não volta ao banco, então o "1" da máscara não é
// persistido. O teste prova isso olhando o que foi gravado e o anexo guardado
// depois. Uma mutação que regrava o objeto lido inteiro tem de reprovar.
//
// O CONTROLE: o bloco de antes (reserva sem máscara) é reconstituído e rodado
// sobre a mesma massa.
//
// Roda com: node reacao-com-mascara.test.js
const fs = require('fs')
const vm = require('vm')
const { reply, ok, fim, ARQ } = require('./_carregar.js')
const { camadaFindMany } = require('./_camada.js')

const MARCA = '485 whatsapp POST /whatsapp/inbound'
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

const NOVO = codigoDe(MARCA)
const PEDIDO = 'findMany({ mascararCampos: ["media_data"] })'
const SEM_MASCARA = NOVO.replace(PEDIDO, 'findMany({})')

const JID = '5519999990001@s.whatsapp.net'
const SEGREDO = 'segredo-da-rota'
const ANEXO = 'data:image/jpeg;base64,' + 'A'.repeat(200 * 1024)

/** 300 mensagens, TODAS gravadas com `messageId` (o filtro por `message_id` não acha nenhuma). */
function massa() {
  const l = []
  for (let i = 0; i < 300; i++) {
    l.push({
      id: 'm' + i, conversation_id: 'c1', messageId: 'WA_' + i, from_me: false, body: 'msg ' + i,
      sender_jid: JID, timestamp: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
      ...(i % 2 === 0 ? { media_data: ANEXO, media_type: 'image' } : {}),
    })
  }
  return l
}

async function rodar(codigo, idAlvo, linhas = massa()) {
  const chamadas = []
  const patches = []
  let bytesReserva = 0
  const handler = compilar(codigo)
  const conversa = { id: 'c1', remote_jid: JID, conta_id: 'default', phase: 'em_atendimento', assigned_to_id: 'u1', status: 'open' }
  const models = {
    WhatsAppConversation: { findById: async () => ({ ...conversa }), findMany: async () => [{ ...conversa }], create: async (c) => c, update: async (id, p) => Object.assign(conversa, p) },
    WhatsAppMessage: {
      findMany: async (f) => {
        const r = camadaFindMany(linhas, f)
        chamadas.push({ filtro: f || {}, linhas: r.length })
        if (f && f.mascararCampos) bytesReserva += JSON.stringify(r).length
        if (f && !f.mascararCampos && Object.keys(f).length === 0) bytesReserva += JSON.stringify(r).length
        return r
      },
      findById: async (id) => linhas.find((x) => x.id === id) || null,
      create: async (m) => { linhas.push(m); return m },
      update: async (id, p) => { patches.push({ id, ...p }); const m = linhas.find((x) => x.id === id); if (m) Object.assign(m, p); return m || null },
    },
    Profile: { findById: async () => ({ id: 'u1', role: 'support', full_name: 'Ana' }), findMany: async () => [] },
    Sessao: { findById: async () => null },
    SystemSettings: { findMany: async () => [{ waMenuEnabled: false }] },
    WaConversationEvents: { findMany: async () => [], create: async (e) => e },
    SupportSchedule: { findMany: async () => [] }, WaFlows: { findMany: async () => [] },
    Company: { findMany: async () => [], findById: async () => null }, Contact: { findMany: async () => [], findById: async () => null },
    Ticket: { findMany: async () => [], findById: async () => null }, Unit: { findMany: async () => [] },
    ClientUser: { findMany: async () => [] }, WaConta: { findMany: async () => [], findById: async () => null },
  }
  const r = await handler({
    params: {}, headers: {}, query: { token: SEGREDO },
    body: { jsonData: JSON.stringify({ event: { Info: { Chat: JID, Sender: JID, PushName: 'Cliente', ID: 'WA_REAC', IsFromMe: false }, Message: { reactionMessage: { key: { ID: idAlvo }, text: '👍' } } } }) },
    models, secrets: { get: async (n) => (n === 'avisa_webhook_secret' ? SEGREDO : 'tok') },
    fetch: async () => ({ status: 200, body: '{}' }), reply: reply(),
  })
  return { r, chamadas, patches, bytesReserva, linhas }
}

;(async () => {
  ok('o pedido de máscara aparece exatamente uma vez no código da rota', NOVO.split(PEDIDO).length - 1 === 1 && SEM_MASCARA !== NOVO, 'âncora')

  // alvo COM anexo (m10 tem media_data) e alvo SEM anexo (m11)
  const com = await rodar(NOVO, 'WA_10')
  ok('TRAVA: a reserva rodou (a leitura por message_id veio vazia e a mascarada veio com 300 linhas)',
    com.chamadas.length === 2 && com.chamadas[0].filtro.message_id === 'WA_10' && com.chamadas[0].linhas === 0
    && com.chamadas[1].filtro.mascararCampos && com.chamadas[1].linhas === 300, com.chamadas)
  ok('a reação cai na mensagem certa, com o emoji', com.patches.length === 1 && com.patches[0].id === 'm10'
    && com.patches[0].reacoes.some((x) => x.emoji === '👍'), com.patches)
  ok('a gravação leva SÓ `reacoes` (o objeto lido não volta ao banco)', JSON.stringify(Object.keys(com.patches[0]).sort()) === JSON.stringify(['id', 'reacoes']), Object.keys(com.patches[0]))
  const alvo = com.linhas.find((x) => x.id === 'm10')
  ok('o anexo do alvo continua intacto no banco depois da reação (nada de "1" persistido)', alvo.media_data === ANEXO, String(alvo.media_data).slice(0, 20))
  ok('nenhum outro anexo foi tocado', com.linhas.filter((x) => x.media_data !== undefined).every((x) => x.media_data === ANEXO), 'anexo alterado')

  const sem = await rodar(NOVO, 'WA_11')
  ok('alvo sem anexo: a reação também cai nele', sem.patches.length === 1 && sem.patches[0].id === 'm11', sem.patches)

  const ausente = await rodar(NOVO, 'WA_NAO_EXISTE')
  ok('TRAVA: id inexistente também passou pela reserva', ausente.chamadas.length === 2, ausente.chamadas.length)
  ok('id inexistente: nenhuma gravação e a rota responde sem erro', ausente.patches.length === 0 && ausente.r.status === 200, [ausente.patches.length, ausente.r.status])

  // controle e economia
  const antigo = await rodar(SEM_MASCARA, 'WA_10')
  ok('CONTROLE: o bloco de antes leu a mesma reserva com os anexos (150 anexos de 200 KB)', antigo.chamadas[1].linhas === 300 && antigo.bytesReserva > 20 * 1024 * 1024, antigo.bytesReserva)
  ok('a reação gravada é a mesma com e sem a máscara', JSON.stringify(com.patches.map((p) => ({ ...p, reacoes: p.reacoes.map((x) => ({ ...x, em: 0 })) }))) === JSON.stringify(antigo.patches.map((p) => ({ ...p, reacoes: p.reacoes.map((x) => ({ ...x, em: 0 })) }))), 'divergiu')
  ok('a reserva mascarada lê ao menos 20 vezes menos', com.bytesReserva * 20 < antigo.bytesReserva, { novo: com.bytesReserva, antigo: antigo.bytesReserva })
  console.log(`INFO  bytes da leitura de reserva: sem máscara ${(antigo.bytesReserva / 1048576).toFixed(1)} MB | com máscara ${(com.bytesReserva / 1024).toFixed(1)} KB`)

  // mutações
  const muts = [
    ['reserva sem a máscara', PEDIDO, 'findMany({})'],
    ['reserva removida', PEDIDO, 'findMany({ message_id: "__nunca__" })'],
    ['regrava o objeto lido inteiro', 'update(_alvo.id, { reacoes: _reacs })', 'update(_alvo.id, Object.assign({}, _alvo, { reacoes: _reacs }))'],
  ]
  async function bateria(codigo) {
    const f = []
    const a = await rodar(codigo, 'WA_10')
    if (!(a.patches.length === 1 && a.patches[0].id === 'm10')) f.push('reacao')
    if (JSON.stringify(Object.keys(a.patches[0] || {}).sort()) !== JSON.stringify(['id', 'reacoes'])) f.push('so-reacoes')
    if (a.linhas.find((x) => x.id === 'm10').media_data !== ANEXO) f.push('anexo-intacto')
    if (!(a.bytesReserva * 20 < antigo.bytesReserva)) f.push('bytes')
    return f
  }
  ok('a bateria passa limpa no código novo', (await bateria(NOVO)).length === 0, await bateria(NOVO))
  for (const [nome, de, para] of muts) {
    const n = NOVO.split(de).length - 1
    if (n !== 1) { ok('mutação "' + nome + '" aplica exatamente uma vez', false, n); continue }
    let f
    try { f = await bateria(NOVO.replace(de, () => para)) } catch (e) { ok('mutação "' + nome + '" reprova por asserção, não por erro de carga', false, String(e)); continue }
    ok('mutação "' + nome + '" é pega (' + f.join(',') + ')', f.length > 0, 'sobreviveu')
  }
  fim()
})()
