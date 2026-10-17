// As quatro sondas de diagnóstico da entrada (rota 485) param no teto e não
// leem a tabela de eventos inteira.
//
//   diag_shape      (formato desconhecido)      teto 6
//   diag_midia      (mapa de campos do anexo)   teto 5
//   diag_grupo_nome (nome de grupo não achado)  teto 6
//   diag_eco        (eco de mensagem nossa)     teto 30   (coberta também em sonda-eco-sem-conteudo.test.js)
//
// O QUE SE GARANTE, para cada sonda:
//   - com a tabela vazia, grava (TRAVA: o caminho acontece);
//   - com o teto cheio, não grava e só lê com filtro por `kind`;
//   - se a leitura da contagem FALHAR, não grava. Sem contagem não há teto: se a
//     falha deixasse a contagem em 0 a sonda gravaria sem limite, e justamente
//     quando o banco está pior. Sonda silenciosa é aceitável; sonda que grava sem
//     limite não é;
//   - ela nunca derruba a entrada (a rota responde 200, ou 201 quando cria a conversa).
//
// O CONTROLE: o bloco de ANTES (sem teto na diag_shape, com reserva por varredura
// nas outras) é reconstituído e rodado sobre a mesma massa.
//
// Roda com: node sondas-com-teto.test.js
const fs = require('fs')
const vm = require('vm')
const { reply, ok, fim, ARQ } = require('./_carregar.js')

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

const SEG = 'segredo'
const CLI = '5519999990001@s.whatsapp.net'
const GRUPO = '120363000000000001@g.us'
const SONDAS = {
  shape: { kind: 'diag_shape', teto: 6, chat: CLI, msg: { coisaDesconhecida: { x: 1 } } },
  midia: { kind: 'diag_midia', teto: 5, chat: CLI, msg: { imageMessage: { mimetype: 'image/jpeg', fileLength: 1000, URL: 'https://mmg.whatsapp.net/x', mediaKey: 'AAAA' } } },
  grupo: { kind: 'diag_grupo_nome', teto: 6, chat: GRUPO, msg: { conversation: 'oi grupo' }, grupos: true },
}

async function rodar(codigo, sonda, { cheios = 0, falhaLeitura = false, lerSemFiltroConta = null } = {}) {
  const S = SONDAS[sonda]
  const eventos = Array.from({ length: cheios }, (_, i) => ({ id: 'e' + i, kind: S.kind, conversation_id: 'diagnostico', payload: '{}', created_at: new Date().toISOString() }))
  const criados = []
  const leituras = []
  const conversa = { id: 'c1', remote_jid: S.chat, conta_id: 'default', phase: 'em_atendimento', assigned_to_id: 'u1', status: 'open' }
  const existentes = S.grupos ? [] : [conversa]
  const vazio = { findMany: async () => [], findById: async () => null }
  const models = {
    WhatsAppConversation: { findById: async () => ({ ...conversa }), findMany: async () => existentes.map((c) => ({ ...c })), create: async (c) => c, update: async (id, p) => Object.assign(conversa, p) },
    WhatsAppMessage: { findMany: async () => [], create: async (m) => m, update: async () => null },
    WaConversationEvents: {
      findMany: async (f) => {
        leituras.push(Object.keys(f || {}))
        if (falhaLeitura && f && f.kind === S.kind) throw new Error('banco indisponível')
        return eventos.filter((e) => !f || !f.kind || e.kind === f.kind)
      },
      create: async (e) => { criados.push(e); return e },
    },
    Profile: { findById: async () => ({ id: 'u1', role: 'support' }), findMany: async () => [] },
    SystemSettings: { findMany: async () => [{ waMenuEnabled: false, waGruposEnabled: !!S.grupos }] },
    SupportSchedule: vazio, WaFlows: vazio, Company: vazio, Contact: vazio, Ticket: vazio, Unit: vazio, ClientUser: vazio, WaConta: vazio,
  }
  const handler = compilar(codigo)
  const r = await handler({
    params: {}, headers: {}, query: { token: SEG }, models,
    secrets: { get: async (n) => (n === 'avisa_webhook_secret' ? SEG : 'tok') },
    fetch: async () => ({ status: 200, body: '{}' }), reply: reply(),
    body: { jsonData: JSON.stringify({ event: { Info: { Chat: S.chat, Sender: S.chat, PushName: 'Cli', ID: 'WA1', IsFromMe: false }, Message: S.msg } }) },
  })
  await new Promise((res) => setTimeout(res, 100))
  return { status: r.status, gravou: criados.filter((e) => e.kind === S.kind).length, leituras }
}

// o bloco de ANTES, reconstituído por sonda
function antigo(sonda) {
  let c = NOVO
  const troca = (a, b) => { if (c.split(a).length - 1 !== 1) throw new Error('âncora do controle: ' + a.slice(0, 60)); c = c.replace(a, b) }
  if (sonda === 'shape') {
    troca('        if (_evd && _quantosShape < 6) {\n', '        if (_evd) {\n')
  }
  return c
}

;(async () => {
  for (const sonda of Object.keys(SONDAS)) {
    const S = SONDAS[sonda]
    const vazia = await rodar(NOVO, sonda)
    ok(`${sonda}: TRAVA — com a tabela vazia, grava (o caminho acontece) e a entrada é aceita (200, ou 201 quando cria a conversa)`, vazia.gravou === 1 && (vazia.status === 200 || vazia.status === 201), vazia)
    const cheia = await rodar(NOVO, sonda, { cheios: S.teto })
    ok(`${sonda}: com o teto cheio (${S.teto}), não grava`, cheia.gravou === 0 && (cheia.status === 200 || cheia.status === 201), cheia)
    ok(`${sonda}: só lê com filtro por kind (nenhuma leitura da tabela inteira)`, cheia.leituras.length >= 1 && cheia.leituras.every((ks) => ks.includes('kind')), cheia.leituras)
    const quase = await rodar(NOVO, sonda, { cheios: S.teto - 1 })
    ok(`${sonda}: abaixo do teto (${S.teto - 1}), ainda grava`, quase.gravou === 1, quase)
    const falha = await rodar(NOVO, sonda, { falhaLeitura: true })
    ok(`${sonda}: se a leitura da contagem falha, NÃO grava e a entrada segue (200/201)`, falha.gravou === 0 && (falha.status === 200 || falha.status === 201), falha)
  }

  // controle da diag_shape: o bloco de antes gravava sem teto
  const semTeto = await rodar(antigo('shape'), 'shape', { cheios: 6 })
  ok('CONTROLE diag_shape: o bloco de antes gravava mesmo com 6 registros (sem teto)', semTeto.gravou === 1, semTeto)

  // ── mutações ──
  const muts = [
    ['shape: sem teto', '        if (_evd && _quantosShape < 6) {\n', '        if (_evd) {\n', 'shape'],
    ['shape: teto 6 -> 60', '        if (_evd && _quantosShape < 6) {\n', '        if (_evd && _quantosShape < 60) {\n', 'shape'],
    ['shape: falha de leitura conta 0', 'catch (e) { _quantosShape = 6; }', 'catch (e) { _quantosShape = 0; }', 'shape'],
    ['midia: falha de leitura conta 0', ': 5;\n          if (_jaTem < 5) {', ': 0;\n          if (_jaTem < 5) {', 'midia'],
    ['midia: teto 5 -> 50', 'if (_jaTem < 5) {', 'if (_jaTem < 50) {', 'midia'],
    ['grupo: falha de leitura conta 0', ': 6;\n      if (quantos < 6) {', ': 0;\n      if (quantos < 6) {', 'grupo'],
    ['grupo: teto 6 -> 60', 'if (quantos < 6) {', 'if (quantos < 60) {', 'grupo'],
  ]
  for (const [nome, de, para, sonda] of muts) {
    const n = NOVO.split(de).length - 1
    if (n !== 1) { ok(`mutação "${nome}" aplica exatamente uma vez`, false, n); continue }
    const c = NOVO.replace(de, () => para)
    let falhou = []
    try {
      const S = SONDAS[sonda]
      const a = await rodar(c, sonda, { cheios: S.teto }); if (a.gravou !== 0) falhou.push('teto')
      const b = await rodar(c, sonda, { falhaLeitura: true }); if (b.gravou !== 0) falhou.push('falha')
      const d = await rodar(c, sonda); if (d.gravou !== 1) falhou.push('trava')
    } catch (e) { ok(`mutação "${nome}" reprova por asserção, não por erro de carga`, false, String(e)); continue }
    ok(`mutação "${nome}" é pega (${falhou.join(',')})`, falhou.length > 0, 'sobreviveu')
  }
  fim()
})()
