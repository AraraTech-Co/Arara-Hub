// O carimbo `aguardando_desde` passa a ser gravado em TODA conversa que espera atendimento,
// não só na que o fluxo respondeu. Sem ele a varredura do plantão não enxerga a conversa:
// "cliente que escreve pela primeira vez, sem o fluxo responder, é invisível para o plantão".
//
// É um bloco de ESCRITURAÇÃO, depois da triagem, sem `return`. O bloco da triagem que já
// grava o carimbo (e interrompe o processamento) não foi tocado.
//
// O QUE SE GARANTE (rota 485, entrada do webhook, com o relógio real da rota e a camada emulada):
//   - cliente novo, sem fluxo que responda: a conversa fica com o carimbo;
//   - 2ª mensagem do mesmo cliente: o carimbo NÃO é reescrito (marca o início da espera);
//   - ficam sem carimbo: grupo, mensagem nossa, conversa com dono, robô pausado por humano
//     (`robo_pausado_ate` no futuro), fluxo ainda conversando (`menu_node`);
//   - fluxo que responde ao cliente novo: a mensagem do fluxo sai e a conversa fica SEM carimbo
//     (o bloco decide com o estado final, relido depois da triagem);
//   - uma falha ao gravar o carimbo não derruba a entrada (a resposta continua 200/201).
// MUTAÇÕES: cada uma aplicada uma vez e reprovada por asserção.
//
// Roda com: node carimbo-da-espera.test.js
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
const COD = codigoDe('485 whatsapp POST /whatsapp/inbound')

const SEGREDO = 'segredo-da-rota'
const JID = '5519999990001@s.whatsapp.net'
const GRUPO = '120363000000000001@g.us'
function corpo({ deNos = false, chat = JID, id = 'W1', texto = 'oi' } = {}) {
  const info = { Chat: chat, Sender: deNos ? '5519333330001@s.whatsapp.net' : chat, PushName: 'Cliente', ID: id, IsFromMe: deNos }
  if (chat.endsWith('@g.us')) { info.IsGroup = true; info.GroupName = 'Grupo' }
  return { jsonData: JSON.stringify({ event: { Info: info, Message: { conversation: texto } } }) }
}
const FLUXO_QUE_FALA = { root: 'q', nodes: [{ id: 'q', type: 'question', data: { text: 'Qual o seu nome?', var: 'nome' } }], edges: [] }

function cenario({ conv = null, fluxo = null, falhaCarimbo = false } = {}) {
  const store = conv ? [{ ...conv }] : []
  const enviadas = []
  const gravacoes = []
  const casa = (c, f) => Object.entries(f || {}).every(([k, v]) => ['limit', 'offset', 'mascararCampos'].includes(k) || String(c[k] ?? '') === String(v))
  const Conv = {
    findById: async (id) => { const c = store.find((x) => x.id === id); return c ? { ...c } : null },
    findMany: async (f) => store.filter((c) => casa(c, f)).map((c) => ({ ...c })),
    create: async (c) => { const n = { ...c }; store.push(n); return { ...n } },
    update: async (id, p) => {
      if (falhaCarimbo && 'aguardando_desde' in p) throw new Error('boom')
      gravacoes.push({ id, ...p })
      const c = store.find((x) => x.id === id); if (c) Object.assign(c, p); return c ? { ...c } : null
    },
  }
  const vazio = { findMany: async () => [], findById: async () => null, create: async (x) => x, update: async () => ({}) }
  const models = {
    WhatsAppConversation: Conv,
    WhatsAppMessage: { findMany: async () => [], findById: async () => null, create: async (m) => m, update: async () => ({}) },
    SystemSettings: { findMany: async () => [{ waMenuEnabled: !!fluxo, waGruposEnabled: true }] },
    WaFlows: { findMany: async () => (fluxo ? [{ id: 'f1', enabled: true, priority: 0, published: fluxo }] : []) },
    Profile: vazio, SupportSchedule: vazio, WaConversationEvents: vazio, Sessao: vazio, Company: vazio,
    Contact: vazio, Ticket: vazio, Unit: vazio, ClientUser: vazio, WaConta: vazio, CompanyContact: vazio,
  }
  const ctx = (body) => ({
    params: {}, headers: {}, query: { token: SEGREDO }, body, models,
    secrets: { get: async (n) => (n === 'avisa_webhook_secret' ? SEGREDO : 'tok') },
    fetch: async (url, o) => { enviadas.push({ url, body: o && o.body }); return { status: 200, body: '{}' } },
    reply: reply(),
  })
  return { store, enviadas, gravacoes, ctx }
}
const NOVA = { id: 'c1', remote_jid: JID, conta_id: 'default', status: 'open', phase: 'novo', menu_node: null }

async function bateria(cod) {
  const h = compilar(cod)
  const falhas = []
  const t = (nome, cond, det) => { if (!cond) falhas.push(nome + (det !== undefined ? ' ' + JSON.stringify(det).slice(0, 160) : '')) }
  const carimbo = (c) => c.store.find((x) => x.aguardando_desde)

  { const c = cenario(); const r = await h(c.ctx(corpo()))
    t('cliente novo sem fluxo: entrada aceita', r.status === 200 || r.status === 201, r.status)
    t('cliente novo sem fluxo: conversa fica com o carimbo', c.store.length === 1 && !!c.store[0].aguardando_desde, c.store) }
  { const c = cenario(); await h(c.ctx(corpo({ id: 'W1' }))); const antes = c.store[0].aguardando_desde
    await new Promise((r) => setTimeout(r, 15)); await h(c.ctx(corpo({ id: 'W2', texto: 'alguém?' })))
    t('2ª mensagem: carimbo não é reescrito', !!antes && c.store[0].aguardando_desde === antes, [antes, c.store[0].aguardando_desde]) }
  { const c = cenario({ conv: { id: 'g1', remote_jid: GRUPO, conta_id: 'default', status: 'open', phase: 'novo', menu_node: null, is_group: true } }); await h(c.ctx(corpo({ chat: GRUPO, id: 'G1' }))); t('grupo: sem carimbo', c.store.length >= 1 && !carimbo(c), c.store) }
  { const c = cenario({ conv: NOVA }); await h(c.ctx(corpo({ deNos: true, id: 'N1' }))); t('mensagem nossa: sem carimbo', !carimbo(c), c.store) }
  { const c = cenario({ conv: { ...NOVA, assigned_to_id: 'u1' } }); await h(c.ctx(corpo({ id: 'D1' }))); t('conversa com dono: sem carimbo', !carimbo(c), c.store) }
  { const c = cenario({ conv: { ...NOVA, robo_pausado_ate: new Date(Date.now() + 3600000).toISOString() } }); await h(c.ctx(corpo({ id: 'P1' }))); t('robô pausado por humano: sem carimbo', !carimbo(c), c.store) }
  { const c = cenario({ conv: { ...NOVA, menu_node: 'q' } }); await h(c.ctx(corpo({ id: 'M1' }))); t('fluxo ainda conversando (menu_node): sem carimbo', !carimbo(c), c.store) }
    { const c = cenario({ fluxo: FLUXO_QUE_FALA }); await h(c.ctx(corpo({ id: 'X1' })))
    t('fluxo que responde: a mensagem do fluxo sai', c.enviadas.length >= 1, c.enviadas.length)
    t('fluxo que responde: a conversa fica sem carimbo (o fluxo cuida)', c.store.length === 1 && !carimbo(c), c.store) }
  { const c = cenario({ falhaCarimbo: true }); const r = await h(c.ctx(corpo({ id: 'E1' })))
    t('falha ao gravar o carimbo não derruba a entrada', r.status === 200 || r.status === 201, r.status) }
  return falhas
}

;(async () => {
  const f0 = await bateria(COD)
  ok('a bateria passa limpa', f0.length === 0, f0)
  const ini = COD.indexOf('  // ── Escrituração da espera')
  const fimB = COD.indexOf('  return ok(ctx, {', ini)
  const bloco = COD.slice(ini, fimB)
  const antesTriagem = COD.indexOf('  // Triagem automática — ver scripts/wa-triagem-motor.py')
  const muts = [
    ['carimbo gravado ANTES da triagem', (() => { const sem = COD.slice(0, ini) + COD.slice(fimB); return sem.slice(0, antesTriagem) + bloco + sem.slice(antesTriagem) })()],
    ['sem a guarda de grupo', COD.replace('(ctx.body && ctx.body.from_me) !== true && !(conv.is_group || conv.isGroup) && !ehGrupoConv) {\n      var _cEsp', '(ctx.body && ctx.body.from_me) !== true) {\n      var _cEsp').replace('!(_cEsp.is_group || _cEsp.isGroup)\n          && ', '')],
    ['sem a guarda de dono', COD.replace('          && !(_cEsp.assigned_to_id || _cEsp.assignedToId)\n', '')],
    ['sem a guarda de robô pausado', COD.replace('          && !(_pausaEsp && _pausaEsp > _agoraEsp)) {', '          ) {')],
    ['sem a guarda do fluxo conversando', COD.replace('          && !_cEsp.menu_node && !(_cEsp.fluxo_esperando_desde || _cEsp.fluxoEsperandoDesde)\n', '')],
    ['reescreve o carimbo', COD.replace('          && !_cEsp.aguardando_desde\n', '')],
    ['falha derruba a entrada', COD.replace('        await Conv.update(conv.id, { aguardando_desde: _agoraEsp, updated_at: _agoraEsp });\n      }\n    }\n  } catch (e) {}', '        await Conv.update(conv.id, { aguardando_desde: _agoraEsp, updated_at: _agoraEsp });\n      }\n    }\n  } catch (e) { throw e; }')],
  ]
  for (const [nome, cod] of muts) {
    if (cod === COD) { ok(`mutação "${nome}" aplicou`, false, 'não mudou'); continue }
    let fm
    try { fm = await bateria(cod) } catch (e) { fm = ['erro: ' + e.message] }
    ok(`mutação "${nome}" é pega (${fm.slice(0, 1).join('').slice(0, 70)})`, fm.length > 0, 'sobreviveu')
  }
  fim()
})()
