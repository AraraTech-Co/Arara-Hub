// As sondas de diagnóstico do WhatsApp saíram:
//
//   17/11  diag_eco    → 485 POST /whatsapp/inbound   (eco de mensagem nossa)
//          diag_envio  → 464 POST /whatsapp           (resposta do envio)
//          diag_tempo  → 432 GET /whatsapp e 434 GET /whatsapp/:id/messages (chamada lenta)
//   18/11  diag_midia, diag_shape, diag_grupo_nome → 485 (anexo, mensagem sem texto,
//          nome de grupo não achado); diag_pagina_conversas em entrada-pagina.test.js
//
// e a leitura delas na 448. Ali fica só a contagem dos avisos ao plantonista.
//
// O QUE SE GARANTE: cada rota passa pelo caminho que acionava a sonda e responde
// como sempre, sem ler nem gravar evento `diag_*`.
//
// O CONTROLE: em cada rota, uma leitura de evento recolocada no ponto onde a sonda
// ficava é pega pelo teste. Isso prova que o caminho é percorrido de verdade.
//
// Roda com: node sondas-fora.test.js
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
function compilar(codigo, relogio) {
  class DataFalsa extends Date { static now() { return relogio ? relogio.t : super.now() } }
  const c = {
    console, Date: relogio ? DataFalsa : Date, JSON, String, Number, Object, Array, Math, Promise, parseInt, parseFloat, isNaN, isFinite,
    RegExp, Buffer, Error, TypeError, encodeURIComponent, decodeURIComponent, Intl, URL, URLSearchParams,
    setTimeout, clearTimeout, setInterval, clearInterval, module: { exports: {} },
  }
  c.exports = c.module.exports; c.globalThis = c
  vm.createContext(c); vm.runInContext(codigo, c)
  return c.module.exports.handler
}
const espera = () => new Promise((res) => setTimeout(res, 30))   // a sonda de tempos não era esperada pela resposta

const R432 = codigoDe('432 whatsapp GET /whatsapp')
const R434 = codigoDe('434 whatsapp GET /whatsapp/:id/messages')
const R448 = codigoDe('448 whatsapp GET /whatsapp/diagnostico/midia')
const R464 = codigoDe('464 whatsapp POST /whatsapp')
const R485 = codigoDe('485 whatsapp POST /whatsapp/inbound')
const DAS_SONDAS = /^diag_/

/** Eventos que registram cada leitura (`kind` pedido) e cada gravação. */
function eventos(iniciais = []) {
  const lista = iniciais.slice()
  const ev = {
    lidos: [], criados: [],
    findMany: async (f) => {
      ev.lidos.push((f && f.kind) || (Object.keys(f || {}).join('+') || 'TUDO'))
      return lista.filter((e) => !f || !f.kind || e.kind === f.kind)
    },
    create: async (e) => { ev.criados.push(e); lista.push(e); return e },
  }
  ev.dasSondas = () => ev.lidos.filter((k) => DAS_SONDAS.test(k)).concat(ev.criados.map((e) => e.kind).filter((k) => DAS_SONDAS.test(k)))
  return ev
}

// ── 485: eco de mensagem nossa ──────────────────────────────────────────────
const SEGREDO = 'segredo-da-rota'
const JID_CLIENTE = '5519999990001@s.whatsapp.net'
const MENSAGENS = {
  texto: { conversation: 'mensagem de teste' },
  imagem: { imageMessage: { mimetype: 'image/jpeg', fileLength: 1000, URL: 'https://mmg.whatsapp.net/x', mediaKey: 'AAAA', caption: 'foto' } },
  desconhecida: { coisaDesconhecida: { x: 1 } },
}
function corpoEco(deNos, tipo = 'texto') {
  return {
    jsonData: JSON.stringify({
      event: {
        Info: { Chat: JID_CLIENTE, Sender: deNos ? '5519333330001@s.whatsapp.net' : JID_CLIENTE, PushName: 'Cliente', ID: 'WAID' + deNos + tipo, IsFromMe: deNos },
        Message: MENSAGENS[tipo],
      },
    }),
  }
}
async function rodar485(codigo, deNos, tipo = 'texto') {
  const conversa = { id: 'c1', remote_jid: JID_CLIENTE, conta_id: 'default', phase: 'em_atendimento', assigned_to_id: 'u1', menu_node: null }
  const criadas = []
  const ev = eventos()
  const vazio = { findMany: async () => [], findById: async () => null }
  const models = {
    WhatsAppConversation: { findById: async () => ({ ...conversa }), findMany: async () => [{ ...conversa }], create: async (c) => c, update: async (id, p) => Object.assign(conversa, p) },
    WhatsAppMessage: { findMany: async () => criadas, create: async (m) => { criadas.push(m); return m }, update: async () => null },
    WaConversationEvents: ev,
    SystemSettings: { findMany: async () => [{ waMenuEnabled: false }] },
    Profile: { findMany: async () => [], findById: async () => null },
    SupportSchedule: vazio, WaFlows: vazio, Sessao: vazio, Company: vazio, Contact: vazio, Ticket: vazio, Unit: vazio, ClientUser: vazio, WaConta: vazio,
  }
  const r = await compilar(codigo)({
    params: {}, headers: {}, query: { token: SEGREDO }, body: corpoEco(deNos, tipo), models,
    secrets: { get: async (n) => (n === 'avisa_webhook_secret' ? SEGREDO : 'tok') },
    fetch: async () => ({ status: 200, body: '{}' }), reply: reply(),
  })
  return { status: r.status, corpo: r.body, criadas, ev }
}

// Nome de grupo não achado na Avisa: a função roda fora do caminho da mensagem.
async function rodarNomeDoGrupo(codigo) {
  const c = {
    console, Date, JSON, String, Number, Object, Array, Math, Promise, parseInt, parseFloat, isNaN, isFinite,
    RegExp, Buffer, Error, TypeError, encodeURIComponent, decodeURIComponent, Intl, URL, URLSearchParams,
    setTimeout, clearTimeout, setInterval, clearInterval, module: { exports: {} },
  }
  c.exports = c.module.exports; c.globalThis = c
  vm.createContext(c); vm.runInContext(codigo, c)
  const ev = eventos()
  const chamadas = []
  const ctx = {
    models: { WaConversationEvents: ev, WaConta: { findById: async () => null, findMany: async () => [] }, SystemSettings: { findMany: async () => [{}] } },
    secrets: { get: async () => 'TOKEN' },
    fetch: async (url) => { chamadas.push(String(url)); return { status: 200, body: '{"success":true,"data":[]}' } },
  }
  const nome = await c._nomeDoGrupoAvisa(ctx, '120363000000000001@g.us', 'default')
  return { nome, chamadas, ev }
}

// ── 464: envio aceito pelo provedor ─────────────────────────────────────────
async function rodar464(codigo, destino) {
  const conversa = { id: 'c1', remote_jid: destino, conta_id: 'default', phase: 'em_atendimento', assigned_to_id: 'u1', status: 'open' }
  const ev = eventos()
  const enviados = []
  const vazio = { findMany: async () => [], findById: async () => null }
  const models = {
    WhatsAppConversation: { findById: async () => ({ ...conversa }), findMany: async () => [{ ...conversa }], create: async (c) => c, update: async (id, p) => Object.assign(conversa, p) },
    WhatsAppMessage: { findMany: async () => [], create: async (m) => m, findById: async () => null, update: async () => null },
    WaConversationEvents: ev,
    Profile: { findById: async () => ({ id: 'u1', role: 'support', full_name: 'Atendente' }), findMany: async () => [] },
    Sessao: vazio, SystemSettings: { findMany: async () => [{}] }, SupportSchedule: vazio, WaFlows: vazio, Company: vazio, Contact: vazio, Ticket: vazio, Unit: vazio, ClientUser: vazio, WaConta: vazio,
  }
  const r = await compilar(codigo)({
    params: {}, headers: {}, query: {}, user: { id: 'u1' }, models, secrets: { get: async () => 'TOKEN' },
    fetch: async (url) => { enviados.push(String(url)); return { status: 200, body: '{"success":true,"data":{"id":"3EB0"}}' } },
    reply: reply(), body: { conversationId: 'c1', message: 'texto' },
  })
  return { status: r.status, dados: r.body && r.body.data, enviados, ev }
}

// ── 432 e 434: chamada lenta (cada leitura avança 2,5 s no relógio) ─────────
const BASE = Date.UTC(2026, 0, 1)
const ts = (n) => new Date(BASE + n * 60000).toISOString()
const MSGS = Array.from({ length: 20 }, (_, i) => ({ id: 'm' + i, conversation_id: 'c1', from_me: i % 2 === 0, body: 'texto ' + i, sender_jid: '5511999990001@s.whatsapp.net', timestamp: ts(i) }))
const CONV = { id: 'c1', remote_jid: '5511999990001@s.whatsapp.net', conta_id: 'default', status: 'open', phase: 'em_atendimento', updated_at: ts(50), created_at: ts(0), unread_count: 0, contact_name: 'Cliente' }
async function rodarLeitura(codigo) {
  const relogio = { t: BASE }
  const tica = () => { relogio.t += 2500 }
  const ev = eventos()
  const vazio = { findMany: async () => { tica(); return [] }, findById: async () => { tica(); return null } }
  const models = {
    Sessao: { findById: async () => null },
    Profile: { findById: async () => ({ id: 'u1', role: 'admin' }), findMany: async () => { tica(); return [] } },
    WhatsAppConversation: { findById: async () => { tica(); return { ...CONV } }, findMany: async () => { tica(); return [{ ...CONV }] }, update: async () => ({}) },
    WhatsAppMessage: { findMany: async (f) => { tica(); return camadaFindMany(MSGS, f) }, findById: async () => null },
    WaConversationEvents: ev,
    SystemSettings: vazio, CompanyContact: vazio, WaDepartment: vazio, Company: vazio, Ticket: vazio, WaCloseReason: vazio, WaTag: vazio, WaConversationTag: vazio,
  }
  const r = await compilar(codigo, relogio)({ params: { id: 'c1' }, query: {}, body: {}, headers: {}, user: { id: 'u1' }, secrets: { get: async () => '' }, fetch: async () => ({ status: 200, body: '{}' }), models, reply: reply() })
  await espera()
  return { status: r.status, linhas: r.body && Array.isArray(r.body.data) ? r.body.data.length : -1, lento: relogio.t - BASE, ev }
}

// ── 448: o diagnóstico ──────────────────────────────────────────────────────
async function rodar448(codigo) {
  const ev = eventos([
    { id: 'a', kind: 'diag_midia', created_at: '2026-10-20T09:00:00Z', payload: '{}' },
    { id: 'b', kind: 'diag_eco', created_at: '2026-10-20T10:00:00Z', payload: '{}' },
    { id: 'c', kind: 'aviso_plantao', created_at: '2026-10-20T11:00:00Z', payload: '{"enviado":true,"http":200}' },
  ])
  const r = await compilar(codigo)({ params: {}, query: {}, headers: {}, body: {}, user: { id: 'u1' }, reply: reply(), models: { WaConversationEvents: ev, Profile: { findById: async () => ({ id: 'u1', role: 'admin' }) }, Sessao: { findById: async () => null } } })
  return { status: r.status, dados: r.body && r.body.data, ev }
}

/** Falhas da bateria inteira sobre um conjunto de códigos. */
async function bateria(c) {
  const f = []
  for (const deNos of [true, false]) {
    const r = await rodar485(c[485], deNos)
    if (r.status !== 200 && r.status !== 201) f.push('485:status')
    if (r.criadas.length !== 1) f.push('485:mensagem-gravada')
    if (r.ev.dasSondas().length) f.push('485:sonda' + (deNos ? '-eco' : '-cliente'))
  }
  {
    const r = await rodar485(c[485], false, 'imagem')
    if ((r.status !== 200 && r.status !== 201) || r.criadas.length !== 1) f.push('485:imagem-gravada')
    if (r.ev.dasSondas().length) f.push('485:sonda-midia')
    const s = await rodar485(c[485], false, 'desconhecida')
    if (!s.corpo || !s.corpo.data || s.corpo.data.ignorado !== 'sem texto') f.push('485:sem-texto-ignorado')
    if (s.ev.dasSondas().length) f.push('485:sonda-shape')
    const g = await rodarNomeDoGrupo(c[485])
    if (g.nome !== null || g.chamadas.length < 2) f.push('485:busca-do-grupo')
    if (g.ev.dasSondas().length) f.push('485:sonda-grupo')
  }
  for (const destino of ['5512992446758@s.whatsapp.net', '120363000000000001@g.us']) {
    const r = await rodar464(c[464], destino)
    if (r.status !== 201 || !r.dados || r.dados.entregue !== true || !r.enviados.length) f.push('464:envio')
    if (r.ev.dasSondas().length) f.push('464:sonda' + (destino.endsWith('@g.us') ? '-grupo' : '-contato'))
  }
  for (const [n, cod] of [[432, c[432]], [434, c[434]]]) {
    const r = await rodarLeitura(cod)
    if (r.status !== 200 || r.linhas < 1 || r.lento < 3000) f.push(n + ':resposta')
    if (r.ev.dasSondas().length) f.push(n + ':sonda')
  }
  const d = await rodar448(c[448])
  if (d.status !== 200 || !d.dados || !d.dados.avisos_plantao || d.dados.avisos_plantao.enviado !== 1) f.push('448:avisos')
  if (d.dados && Object.keys(d.dados).join(',') !== 'avisos_plantao') f.push('448:campos')
  if (d.ev.lidos.join(',') !== 'aviso_plantao') f.push('448:leitura')
  return f
}

;(async () => {
  const ATUAL = { 432: R432, 434: R434, 448: R448, 464: R464, 485: R485 }

  for (const deNos of [true, false]) {
    const r = await rodar485(R485, deNos)
    ok(`485 ${deNos ? 'eco nosso' : 'mensagem do cliente'}: TRAVA, a mensagem é gravada (${r.status})`, (r.status === 200 || r.status === 201) && r.criadas.length === 1, [r.status, r.criadas.length])
    ok(`485 ${deNos ? 'eco nosso' : 'mensagem do cliente'}: nenhuma leitura nem gravação de diag_eco`, r.ev.dasSondas().length === 0, r.ev.lidos)
  }
  {
    const r = await rodar485(R485, false, 'imagem')
    ok('485 imagem do cliente: TRAVA, a mensagem é gravada', (r.status === 200 || r.status === 201) && r.criadas.length === 1, [r.status, r.criadas.length])
    ok('485 imagem do cliente: nenhuma leitura nem gravação de diag_midia', r.ev.dasSondas().length === 0, r.ev.lidos)
    const s = await rodar485(R485, false, 'desconhecida')
    ok('485 mensagem sem texto reconhecido: TRAVA, é ignorada como sempre', s.corpo && s.corpo.data && s.corpo.data.ignorado === 'sem texto', s.corpo)
    ok('485 mensagem sem texto reconhecido: nenhuma leitura nem gravação de diag_shape', s.ev.dasSondas().length === 0, s.ev.lidos)
    const g = await rodarNomeDoGrupo(R485)
    ok('485 nome de grupo não achado: TRAVA, consulta a Avisa duas vezes e devolve null', g.nome === null && g.chamadas.length === 2, g.chamadas)
    ok('485 nome de grupo não achado: nenhuma leitura nem gravação de diag_grupo_nome', g.ev.dasSondas().length === 0 && g.ev.criados.length === 0, g.ev.lidos)
  }
  for (const destino of ['5512992446758@s.whatsapp.net', '120363000000000001@g.us']) {
    const r = await rodar464(R464, destino)
    const nome = destino.endsWith('@g.us') ? 'grupo' : 'contato'
    ok(`464 envio para ${nome}: TRAVA, aceito e entregue`, r.status === 201 && r.dados.entregue === true && r.enviados.length >= 1, [r.status, r.dados, r.enviados])
    ok(`464 envio para ${nome}: nenhuma leitura nem gravação de diag_envio`, r.ev.dasSondas().length === 0, r.ev.lidos)
  }
  for (const [n, cod] of [[432, R432], [434, R434]]) {
    const r = await rodarLeitura(cod)
    ok(`${n}: TRAVA, chamada lenta (${r.lento} ms no relógio) responde 200 com linhas`, r.status === 200 && r.linhas >= 1 && r.lento >= 3000, [r.status, r.linhas, r.lento])
    ok(`${n}: chamada lenta não lê nem grava diag_tempo`, r.ev.dasSondas().length === 0 && r.ev.criados.length === 0, [r.ev.lidos, r.ev.criados.length])
  }
  const d = await rodar448(R448)
  ok('448: continua devolvendo a contagem dos avisos ao plantonista', d.status === 200 && d.dados.avisos_plantao.total === 1 && d.dados.avisos_plantao.enviado === 1, d.dados)
  ok('448: devolve só `avisos_plantao`', Object.keys(d.dados).join(',') === 'avisos_plantao', Object.keys(d.dados))
  ok('448: lê só os avisos (nem a tabela inteira, nem eventos das sondas)', d.ev.lidos.join(',') === 'aviso_plantao', d.ev.lidos)

  const texto = fs.readFileSync(ARQ, 'utf8')
  for (const nome of ['_sondaTempos', '_sondaEnvio', '_diagTempoCompleto', '_diagEnvioCompleto', '_formaDoValor', 'diag_eco', 'diag_envio', 'diag_tempo', 'diag_midia', 'diag_shape', 'diag_grupo_nome', 'diag_pagina_conversas', '_diagPaginaConversas']) {
    ok(`nenhuma rota tem mais \`${nome}\``, !texto.includes(nome), texto.split(nome).length - 1)
  }

  ok('a bateria passa limpa', (await bateria(ATUAL)).length === 0, await bateria(ATUAL))

  // Controle: uma leitura recolocada onde a sonda ficava é pega.
  const LER = (k) => `await ctx.models.WaConversationEvents.findMany({ kind: "${k}" }); `
  const muts = [
    ['485: lê diag_eco antes de gravar a mensagem', 485, '  if (!_casou && Msg && message) {', LER('diag_eco') + '\n  if (!_casou && Msg && message) {', '485:sonda-eco'],
    ['464: lê diag_envio no envio aceito', 464, 'if (r && r.status >= 200 && r.status < 300) return { ok: true };', '{ if (r && r.status >= 200 && r.status < 300) { ' + LER('diag_envio') + 'return { ok: true }; } }', '464:sonda'],
    ['432: lê diag_tempo antes de responder', 432, '  return ok(ctx, data);\n', '  ' + LER('diag_tempo_lista') + '\n  return ok(ctx, data);\n', '432:sonda'],
    ['434: lê diag_tempo antes de responder', 434, '  return ok(ctx, rows, undefined, naoLidasAoAbrir, _hist);', '  ' + LER('diag_tempo_conversa') + '\n  return ok(ctx, rows, undefined, naoLidasAoAbrir, _hist);', '434:sonda'],
    ['485: lê diag_midia ao receber anexo', 485, '    // ── Reação do cliente (17/09/2026) ──\n', '    if (_mid) ' + LER('diag_midia') + '\n    // ── Reação do cliente (17/09/2026) ──\n', '485:sonda-midia'],
    ['485: lê diag_shape antes de ignorar', 485, '      return ok(ctx, { ignorado: "sem texto" });', '      ' + LER('diag_shape') + '\n      return ok(ctx, { ignorado: "sem texto" });', '485:sonda-shape'],
    ['485: lê diag_grupo_nome quando não acha o nome', 485, '  } catch (e) {}\n  return null;\n}\n// A busca do nome do grupo', '  } catch (e) {}\n  ' + LER('diag_grupo_nome') + '\n  return null;\n}\n// A busca do nome do grupo', '485:sonda-grupo'],
    ['448: volta a ler a tabela inteira', 448, '  var Ev = ctx.models.WaConversationEvents;\n', '  var Ev = ctx.models.WaConversationEvents;\n  await Ev.findMany({});\n', '448:leitura'],
    ['448: volta a devolver `capturas`', 448, '    avisos_plantao: _avp,\n', '    avisos_plantao: _avp,\n    capturas: [],\n', '448:campos'],
  ]
  for (const [nome, rota, de, para, esperado] of muts) {
    const base = ATUAL[rota]
    const n = base.split(de).length - 1
    // A do envio troca todas as ocorrências (contato, grupo e arquivo); as outras, uma só.
    if (rota === 464 ? n < 2 : n !== 1) { ok(`mutação "${nome}" aplica (${n} ocorrência(s))`, false, n); continue }
    const mut = { ...ATUAL, [rota]: base.split(de).join(para) }
    let fm
    try { fm = await bateria(mut) } catch (e) { ok(`mutação "${nome}" reprova por asserção, não por erro de carga`, false, String(e)); continue }
    ok(`mutação "${nome}" é pega por ${esperado}`, fm.some((x) => x.startsWith(esperado)), fm)
  }
  fim()
})().catch((e) => { console.error(e); process.exit(1) })
