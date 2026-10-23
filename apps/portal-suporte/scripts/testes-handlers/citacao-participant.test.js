// Responder citando (rota 464): o `Participant` que chega à Avisa.
//
// O WhatsApp só desenha a caixa de citação quando o `Participant` é o TELEFONE de quem escreveu a
// mensagem citada. Dois erros aconteciam:
//   - citando mensagem do CLIENTE cujo `sender_jid` é um LID (15 dígitos), o `Participant` saía como
//     `<lid>@s.whatsapp.net`: o aparelho mostrava o identificador cru e uma caixa sem texto;
//   - citando mensagem NOSSA sem `sender_jid`, o `Participant` saía `undefined` e a caixa sumia.
//
// O QUE SE GARANTE (afirmando o `Participant`, não só o `StanzaId`):
//   - `sender_jid` com telefone: inalterado;
//   - `sender_jid` LID em conversa 1:1: o telefone do `remote_jid`; se ele também é LID, o do cadastro;
//   - mensagem nossa sem `sender_jid`: o número de outra mensagem nossa da MESMA conversa;
//   - sem telefone utilizável (ou LID em grupo): nenhum `contextInfo`, a mensagem sai e a resposta traz
//     `citacao_nao_enviada: true`; nunca um `Participant` inválido.
//
// Roda com: node citacao-participant.test.js
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

const TEL = '5519993999446'
const NOSSO = '5511988887777'
const LID = '208086904115285'
const LID2 = '99887766554433'

const cliente = (extra) => ({ id: 'wam_c', conversation_id: 'c1', message_id: 'WA_CLIENTE', from_me: false, body: 'bom dia', timestamp: '2026-10-23T13:40:00.000Z', ...extra })
const nossa = (extra) => ({ id: 'wam_n', conversation_id: 'c1', message_id: 'WA_NOSSA', from_me: true, body: 'oi', timestamp: '2026-10-23T13:41:00.000Z', ...extra })

async function rodar(codigo, { remote = `${TEL}@s.whatsapp.net`, linhas, cita, cadastro, grupo }) {
  const avisa = []
  const leituras = []
  const handler = compilar(codigo)
  const conversa = { id: 'c1', remote_jid: remote, conta_id: 'default', phase: 'em_atendimento', assigned_to_id: 'u1', status: 'open', client_user_id: cadastro ? 'cu1' : null, is_group: !!grupo }
  const msgs = linhas.map((l) => ({ ...l }))
  const vazio = { findMany: async () => [], findById: async () => null }
  const models = {
    WhatsAppConversation: { findById: async () => ({ ...conversa }), findMany: async () => [{ ...conversa }], create: async (c) => c, update: async (id, p) => Object.assign(conversa, p) },
    WhatsAppMessage: {
      findMany: async (f) => { const res = msgs.filter((m) => !f || ((!f.message_id || m.message_id === f.message_id) && (!f.conversation_id || m.conversation_id === f.conversation_id))); leituras.push({ filtro: f, n: res.length }); return res },
      create: async (m) => { msgs.push(m); return m }, findById: async () => null, update: async () => null,
    },
    Profile: { findById: async () => ({ id: 'u1', role: 'support', full_name: 'Alexandre Ferreira' }), findMany: async () => [] },
    Sessao: vazio, SystemSettings: { findMany: async () => [{}] }, WaConversationEvents: { findMany: async () => [], create: async (e) => e },
    SupportSchedule: vazio, WaFlows: vazio, Company: vazio, Contact: vazio, Ticket: vazio, Unit: vazio, WaConta: vazio, CompanyContact: vazio,
    ClientUser: { findMany: async () => [], findById: async () => (cadastro ? { id: 'cu1', whatsapp: cadastro } : null) },
  }
  const r = await handler({
    params: {}, headers: {}, query: {}, user: { id: 'u1' }, models, secrets: { get: async () => 'tok' },
    fetch: async (url, init) => { avisa.push({ url, corpo: JSON.parse(init.body) }); return { status: 200, body: '{"success":true}' } },
    reply: reply(), body: { conversationId: 'c1', message: 'resposta', responder_a: { message_id: cita } },
  })
  const envio = avisa.find((a) => /\/actions\/send/.test(a.url))
  return { r, dados: r.body && r.body.data, ci: envio && envio.corpo.contextInfo, envio, leituras }
}

const ehCaixa = (x, p) => !!x.ci && x.ci.StanzaId && x.ci.Participant === p && x.dados.citacao_nao_enviada === undefined
const semCaixa = (x) => !!x.envio && x.ci === undefined && x.r.status === 201 && x.dados.entregue === true && x.dados.citacao_nao_enviada === true
const J = (d) => d + '@s.whatsapp.net'

async function bateria(codigo) {
  const f = []
  const t = async (nome, args, esperado) => {
    let x
    try { x = await rodar(codigo, args) } catch (e) { f.push(nome + '(erro)'); return }
    const certo = esperado === null ? semCaixa(x) : ehCaixa(x, esperado)
    if (!certo) f.push(nome)
  }
  await t('cliente-telefone', { linhas: [cliente({ sender_jid: TEL })], cita: 'WA_CLIENTE' }, J(TEL))
  await t('cliente-lid-remote-telefone', { linhas: [cliente({ sender_jid: LID })], cita: 'WA_CLIENTE' }, J(TEL))
  await t('cliente-sem-sender-remote-telefone', { linhas: [cliente({})], cita: 'WA_CLIENTE' }, J(TEL))
  await t('cliente-lid-remote-lid-usa-cadastro', { remote: `${LID}@lid`, linhas: [cliente({ sender_jid: LID })], cita: 'WA_CLIENTE', cadastro: TEL }, J(TEL))
  await t('cliente-lid-remote-lid-cadastro-formatado', { remote: `${LID}@lid`, linhas: [cliente({ sender_jid: LID })], cita: 'WA_CLIENTE', cadastro: '(19) 99399-9446' }, J('55' + '19993999446'))
  await t('nossa-com-sender', { linhas: [nossa({ sender_jid: NOSSO })], cita: 'WA_NOSSA' }, J(NOSSO))
  await t('nossa-sem-sender-usa-irma', { linhas: [nossa({}), nossa({ id: 'wam_n2', message_id: 'WA_OUTRA', sender_jid: NOSSO })], cita: 'WA_NOSSA' }, J(NOSSO))
  await t('nossa-sem-sender-sem-irma', { linhas: [nossa({}), cliente({ sender_jid: TEL })], cita: 'WA_NOSSA' }, null)
  // a irmã tem de ser NOSSA: o número do cliente nunca vira o "nosso"
  await t('nossa-nao-pega-do-cliente', { linhas: [nossa({}), cliente({ sender_jid: TEL })], cita: 'WA_NOSSA' }, null)
  // a irmã tem de ser da MESMA conversa
  await t('nossa-nao-pega-de-outra-conversa', { linhas: [nossa({}), nossa({ id: 'wam_x', conversation_id: 'c9', message_id: 'WA_X', sender_jid: NOSSO })], cita: 'WA_NOSSA' }, null)
  await t('nossa-irma-com-lid', { linhas: [nossa({}), nossa({ id: 'wam_n2', message_id: 'WA_OUTRA', sender_jid: LID })], cita: 'WA_NOSSA' }, null)
  return f
}

;(async () => {
  const f = await bateria(NOVO)
  ok('o Participant que chega à Avisa é sempre telefone@s.whatsapp.net, ou a citação não vai', f.length === 0, f)
  // Grupo: a rota de envio a grupos (`sendMessageGroup`) não leva citação — comportamento de antes, intocado.
  // Por isso o ramo de grupo da resolução (não assumir o dono da conversa) não tem efeito observável hoje e
  // não é afirmado aqui.
  const a = await rodar(NOVO, { remote: '120363@g.us', grupo: true, linhas: [cliente({ sender_jid: LID })], cita: 'WA_CLIENTE', cadastro: TEL })
  ok('  grupo: a mensagem sai pelo envio de grupo, sem contextInfo e sem LID no corpo, como antes', !!a.envio && /sendMessageGroup/.test(a.envio.url) && JSON.stringify(a.envio.corpo).indexOf(LID) < 0 && a.ci === undefined, a.envio)
  // O dublê responde como a camada: `findMany({ message_id })` devolve SÓ a citada. Com esse retorno, citar
  // mensagem nossa tem de produzir Participant (a irmã vem da leitura por conversa), não `citacao_nao_enviada`.
  const b = await rodar(NOVO, { linhas: [nossa({}), nossa({ id: 'wam_n2', message_id: 'WA_OUTRA', sender_jid: NOSSO })], cita: 'WA_NOSSA' })
  const porId = b.leituras.find((l) => l.filtro && l.filtro.message_id)
  ok('  o dublê devolveu só a citada para findMany({ message_id }) e mesmo assim há Participant', !!porId && porId.n === 1 && b.ci && b.ci.Participant === J(NOSSO) && b.dados.citacao_nao_enviada === undefined, { porId, ci: b.ci })
  ok('  a irmã vem de leitura filtrada por conversa (não por from_me na camada)', b.leituras.some((l) => l.filtro && l.filtro.conversation_id === 'c1' && l.filtro.message_id === undefined && l.filtro.from_me === undefined), b.leituras)

  const muts = [
    ['volta a colar @s.whatsapp.net em qualquer coisa', 'var d = numeroCanonico(cru);\n  return (d.length === 12 || d.length === 13) && !_ehLid(d) ? d : "";', 'var d = String(cru || "").replace(/\\D/g, "");\n  return d;'],
    ['aceita LID como telefone', '(d.length === 12 || d.length === 13) && !_ehLid(d)', '(d.length === 12 || d.length === 13 || d.length === 15)'],
    ['ignora o cadastro', ' || (await _telefoneDoCadastro(ctx, conv)) || "";', ' || "";'],
    ['ignora o remote_jid', '_telefoneValido(_rj.split("@")[0]) ||', '"" ||'],
    ['nossa: ignora a linha irmã', 'if (!_quemFalou && _deNosCit) {', 'if (false) {'],
    ['nossa: aceita irmã do cliente', 'if (_irmas[_ir].from_me !== true && _irmas[_ir].fromMe !== true) continue;', ''],
    ['nossa: irmã de qualquer conversa', 'findMany({ conversation_id: conversationId })', 'findMany({})'],
    ['não levanta citacao_nao_enviada sem Participant', '} else if (_citar && !_citar.participant) {', '} else if (false) {'],
    ['manda a citação mesmo sem Participant', '    _citarEnvio = null;\n    _citacaoNaoEnviada = true;\n  }\n  var _rjCru', '    _citacaoNaoEnviada = true;\n  }\n  var _rjCru'],
    ['cliente: só confia no sender_jid', '_telefoneValido(_mm.sender_jid || _mm.senderJid);', '_telefoneValido(_mm.sender_jid || _mm.senderJid) || (_deNosCit ? "" : "");\n        if (false)'],
  ]
  for (const [nome, de, para] of muts) {
    const n = NOVO.split(de).length - 1
    if (n !== 1) { ok(`mutação "${nome}" aplica exatamente uma vez`, false, n); continue }
    let fm
    try { fm = await bateria(NOVO.replace(de, () => para)) } catch (e) { ok(`mutação "${nome}" reprova por asserção, não por erro de carga`, false, String(e)); continue }
    ok(`mutação "${nome}" é pega (${fm.slice(0, 2).join(',')})`, fm.length > 0, 'sobreviveu')
  }
  fim()
})()
