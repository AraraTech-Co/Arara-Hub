// Responder citando uma mensagem (rota 464): a citação que SAI para o WhatsApp só
// leva um id que o WhatsApp conhece.
//
// O identificador provisório `local_…` é nosso: nasce na gravação da própria rota e,
// numa mensagem de arquivo enviada pelo portal, nunca é trocado pelo do WhatsApp
// (o eco de mídia fica fora da reconciliação). Citar essa mensagem mandava o
// `local_…` como `StanzaId`. Agora a mensagem sai SEM a citação, que continua
// gravada para a bolha do portal, e a resposta traz `citacao_nao_enviada: true`.
//
// O QUE SE GARANTE:
//   - citar mensagem NOSSA com id `local_…`: nenhum `contextInfo` vai à Avisa, o
//     texto sai, a resposta é 201 com `entregue: true` e `citacao_nao_enviada: true`,
//     e a linha gravada guarda a citação (message_id citado) para a bolha;
//   - citar mensagem do CLIENTE (id real): `contextInfo` com `StanzaId` e
//     `Participant`, como antes;
//   - citar mensagem NOSSA com id real (já reconciliada): `StanzaId` real, como antes;
//   - sem citação: nenhum `contextInfo`, sem `citacao_nao_enviada`.
//
// O CONTROLE: o bloco de antes (a citação vai como está) é reconstituído e rodado
// sobre a mesma massa.
//
// Roda com: node citacao-de-id-provisorio.test.js
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

const NOVO = codigoDe('464 whatsapp POST /whatsapp')
const ANTIGO = (() => {
  const de = 'message, _citarEnvio, _contaDaConversa(conv)'
  if (NOVO.split(de).length - 1 !== 3) throw new Error('âncora do controle')
  return NOVO.split(de).join('message, _citar, _contaDaConversa(conv)')
})()

const JID = '5512992446758@s.whatsapp.net'
const TEXTO = 'Você poderia me dizer por favor por onde foi feito o cadastro desses itens?'
const nossaImagemLocal = { id: 'wam_1', conversation_id: 'c1', message_id: 'local_1760000000000', from_me: true, sender_jid: '5511988887777', sender_name: 'Alexandre Ferreira', body: '[imagem enviada]', media_type: 'image', timestamp: '2026-10-16T13:56:00.000Z' }
const nossaTextoReal = { id: 'wam_2', conversation_id: 'c1', message_id: '3EB0NOSSAREAL', from_me: true, sender_jid: '5511988887777', sender_name: 'Alexandre Ferreira', body: 'oi', timestamp: '2026-10-16T13:50:00.000Z' }
const doCliente = { id: 'wam_0', conversation_id: 'c1', message_id: '3EB0REALDOCLIENTE', from_me: false, sender_jid: JID, body: 'bom dia', timestamp: '2026-10-16T13:40:00.000Z' }

async function rodar(codigo, linhaCitada, idCitado) {
  const avisa = []
  const gravadas = []
  const handler = compilar(codigo)
  const conversa = { id: 'c1', remote_jid: JID, conta_id: 'default', phase: 'em_atendimento', assigned_to_id: 'u1', status: 'open' }
  const msgs = linhaCitada ? [linhaCitada] : []
  const vazio = { findMany: async () => [], findById: async () => null }
  const models = {
    WhatsAppConversation: { findById: async () => ({ ...conversa }), findMany: async () => [{ ...conversa }], create: async (c) => c, update: async (id, p) => Object.assign(conversa, p) },
    WhatsAppMessage: {
      findMany: async (f) => msgs.filter((m) => !f || !f.message_id || m.message_id === f.message_id),
      create: async (m) => { gravadas.push(m); msgs.push(m); return m }, findById: async () => null, update: async () => null,
    },
    Profile: { findById: async () => ({ id: 'u1', role: 'support', full_name: 'Alexandre Ferreira' }), findMany: async () => [] },
    Sessao: vazio, SystemSettings: { findMany: async () => [{}] }, WaConversationEvents: { findMany: async () => [], create: async (e) => e },
    SupportSchedule: vazio, WaFlows: vazio, Company: vazio, Contact: vazio, Ticket: vazio, Unit: vazio, ClientUser: vazio, WaConta: vazio,
  }
  const body = { conversationId: 'c1', message: TEXTO }
  if (idCitado) body.responder_a = { message_id: idCitado }
  const r = await handler({
    params: {}, headers: {}, query: {}, user: { id: 'u1' }, models, secrets: { get: async () => 'tok' },
    fetch: async (url, init) => { avisa.push({ url, corpo: JSON.parse(init.body) }); return { status: 200, body: '{"success":true}' } },
    reply: reply(), body,
  })
  const envio = avisa.find((a) => a.url.endsWith('/actions/sendMessage'))
  return { r, dados: r.body && r.body.data, envio, gravada: gravadas[0] }
}

async function bateria(codigo) {
  const f = []
  const a = await rodar(codigo, nossaImagemLocal, 'local_1760000000000')
  if (!a.envio || a.envio.corpo.contextInfo !== undefined || !String(a.envio.corpo.message).includes('cadastro desses itens')) f.push('local-sem-contextInfo')
  if (a.r.status !== 201 || a.dados.entregue !== true || a.dados.citacao_nao_enviada !== true) f.push('local-resposta')
  if (!a.gravada || !a.gravada.citacao || a.gravada.citacao.message_id !== 'local_1760000000000') f.push('local-citacao-gravada')
  const b = await rodar(codigo, doCliente, '3EB0REALDOCLIENTE')
  const ci = b.envio && b.envio.corpo.contextInfo
  if (!ci || ci.StanzaId !== '3EB0REALDOCLIENTE' || ci.Participant !== JID || b.dados.citacao_nao_enviada !== undefined) f.push('cliente-real')
  const c = await rodar(codigo, nossaTextoReal, '3EB0NOSSAREAL')
  const cc = c.envio && c.envio.corpo.contextInfo
  if (!cc || cc.StanzaId !== '3EB0NOSSAREAL' || c.dados.citacao_nao_enviada !== undefined) f.push('nossa-real')
  const d = await rodar(codigo, null, null)
  if (!d.envio || d.envio.corpo.contextInfo !== undefined || d.dados.citacao_nao_enviada !== undefined) f.push('sem-citacao')
  return f
}

;(async () => {
  const a = await rodar(NOVO, nossaImagemLocal, 'local_1760000000000')
  ok('TRAVA: a Avisa foi chamada com o texto da resposta', !!a.envio && String(a.envio.corpo.message).includes('cadastro desses itens'), a.envio)
  ok('citar mensagem NOSSA com id local_…: nenhum contextInfo vai à Avisa', a.envio.corpo.contextInfo === undefined, a.envio.corpo)
  ok('  a resposta é 201, entregue e diz que a citação não foi ao WhatsApp', a.r.status === 201 && a.dados.entregue === true && a.dados.citacao_nao_enviada === true, a.dados)
  ok('  a linha gravada guarda a citação para a bolha do portal', a.gravada && a.gravada.citacao && a.gravada.citacao.message_id === 'local_1760000000000', a.gravada && a.gravada.citacao)
  const b = await rodar(NOVO, doCliente, '3EB0REALDOCLIENTE')
  ok('citar mensagem do CLIENTE (id real): contextInfo com StanzaId e Participant, como antes', b.envio.corpo.contextInfo && b.envio.corpo.contextInfo.StanzaId === '3EB0REALDOCLIENTE' && b.envio.corpo.contextInfo.Participant === JID, b.envio.corpo)
  ok('  e sem citacao_nao_enviada', b.dados.citacao_nao_enviada === undefined, b.dados)
  const c = await rodar(NOVO, nossaTextoReal, '3EB0NOSSAREAL')
  ok('citar mensagem NOSSA com id real (já reconciliada): StanzaId real, como antes', c.envio.corpo.contextInfo && c.envio.corpo.contextInfo.StanzaId === '3EB0NOSSAREAL', c.envio.corpo)
  const d = await rodar(NOVO, null, null)
  ok('sem citação: nenhum contextInfo e nenhum citacao_nao_enviada', d.envio.corpo.contextInfo === undefined && d.dados.citacao_nao_enviada === undefined, d.dados)

  const antigo = await rodar(ANTIGO, nossaImagemLocal, 'local_1760000000000')
  ok('CONTROLE: o bloco de antes mandava StanzaId local_… à Avisa e respondia "entregue"', antigo.envio.corpo.contextInfo && antigo.envio.corpo.contextInfo.StanzaId === 'local_1760000000000' && antigo.dados.entregue === true, antigo.envio.corpo)

  ok('a bateria passa limpa no código novo', (await bateria(NOVO)).length === 0, await bateria(NOVO))
  const muts = [
    ['sem o filtro do id provisório', '_citar && String(_citar.stanzaId || "").indexOf("local_") === 0', 'false'],
    ['descarta TODA citação', 'var _citarEnvio = _citar;', 'var _citarEnvio = null;'],
    ['toda citação é tratada como provisória', 'String(_citar.stanzaId || "").indexOf("local_") === 0', 'String(_citar.stanzaId || "").indexOf("local_") >= 0 || true'],
    ['não avisa que a citação não foi', '  if (_citacaoNaoEnviada) corpo.citacao_nao_enviada = true;\n', ''],
    ['avisa sempre', 'if (_citacaoNaoEnviada) corpo.citacao_nao_enviada = true;', 'corpo.citacao_nao_enviada = true;'],
  ]
  for (const [nome, de, para] of muts) {
    const n = NOVO.split(de).length - 1
    if (n !== 1) { ok(`mutação "${nome}" aplica exatamente uma vez`, false, n); continue }
    let f
    try { f = await bateria(NOVO.replace(de, () => para)) } catch (e) { ok(`mutação "${nome}" reprova por asserção, não por erro de carga`, false, String(e)); continue }
    ok(`mutação "${nome}" é pega (${f.join(',')})`, f.length > 0, 'sobreviveu')
  }
  fim()
})()
