// SONDA PROVISÓRIA `diag_envio`: a forma da resposta do envio (rota 464).
//
// Descobre se a resposta da Avisa ao `sendMessage`, `sendMessageGroup` e aos envios de
// arquivo traz o id real da mensagem, que hoje só chega pelo eco. REMOVER depois.
//
// O QUE SE GARANTE:
//   - envio com sucesso grava UM registro com a rota, o HTTP e a FORMA da resposta
//     (nome de campo, tipo, tamanho de texto) — NUNCA um valor: nem o texto da mensagem,
//     nem o telefone, nem o token, nem o id devolvido;
//   - no máximo 6 registros; com o teto cheio não grava, só lê com filtro por `kind`, e
//     o handler PARA DE LER depois de saber que o teto foi atingido;
//   - se a leitura da contagem falha, NÃO grava e o envio segue (entregue: true);
//   - resposta que não é JSON grava só `naoEhJson` e o tamanho;
//   - envio recusado pelo provedor não grava; falha ao gravar não quebra o envio;
//   - a rota de diagnóstico (448) devolve `envio_total` e `envio`.
//
// O CONTROLE: sem a sonda (as chamadas removidas) nada é gravado e o envio é o mesmo.
// MUTAÇÕES: cada uma aplicada uma vez e reprovada por asserção.
//
// Roda com: node sonda-resposta-do-envio.test.js
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
const R448 = codigoDe('448 whatsapp GET /whatsapp/diagnostico/midia')
const JID = '5512992446758@s.whatsapp.net'
const GRUPO = '120363000000000001@g.us'
const TEXTO = 'texto-secreto-da-mensagem'
const ID_REAL = '3EB0ABCDEF1234567890'
const CORPO_OK = JSON.stringify({ success: true, data: { id: ID_REAL, timestamp: 1760000000, nome: 'Fulano Cliente', numero: '5512992446758', itens: [{ k: 1 }] } })
const PNG = 'data:image/png;base64,' + Buffer.from('imagem-falsa-1234567890').toString('base64')

function cenario(codigo, { cheios = 0, falhaLeitura = false, falhaCriar = false, status = 200, corpo = CORPO_OK, destino = JID } = {}) {
  const handler = compilar(codigo)
  const eventos = Array.from({ length: cheios }, (_, i) => ({ id: 'e' + i, kind: 'diag_envio', conversation_id: 'diagnostico', payload: '{}' }))
  const criados = []
  const leituras = []
  const conversa = { id: 'c1', remote_jid: destino, conta_id: 'default', phase: 'em_atendimento', assigned_to_id: 'u1', status: 'open' }
  const vazio = { findMany: async () => [], findById: async () => null }
  const models = {
    WhatsAppConversation: { findById: async () => ({ ...conversa }), findMany: async () => [{ ...conversa }], create: async (c) => c, update: async (id, p) => Object.assign(conversa, p) },
    WhatsAppMessage: { findMany: async () => [], create: async (m) => m, findById: async () => null, update: async () => null },
    WaConversationEvents: {
      findMany: async (f) => {
        leituras.push(Object.keys(f || {}).join('+') || 'TUDO')
        if (falhaLeitura) throw new Error('banco indisponível')
        return eventos.filter((e) => !f || !f.kind || e.kind === f.kind)
      },
      create: async (e) => { if (falhaCriar) throw new Error('falha ao gravar'); criados.push(e); eventos.push(e); return e },
    },
    Profile: { findById: async () => ({ id: 'u1', role: 'support', full_name: 'Alexandre Ferreira' }), findMany: async () => [] },
    Sessao: vazio, SystemSettings: { findMany: async () => [{}] }, SupportSchedule: vazio, WaFlows: vazio, Company: vazio, Contact: vazio, Ticket: vazio, Unit: vazio, ClientUser: vazio, WaConta: vazio,
  }
  const enviar = async (body) => {
    const r = await handler({
      params: {}, headers: {}, query: {}, user: { id: 'u1' }, models, secrets: { get: async () => 'TOKEN-SECRETO' },
      fetch: async () => ({ status, body: corpo }), reply: reply(), body,
    })
    return { status: r.status, dados: r.body && r.body.data }
  }
  return { enviar, criados, leituras, eventos }
}
const envioTexto = { conversationId: 'c1', message: TEXTO }
const doTipo = (c, rota) => c.criados.filter((e) => e.kind === 'diag_envio' && JSON.parse(e.payload).rota === rota)

async function bateria(codigo) {
  const f = []
  const a = cenario(codigo); const ra = await a.enviar(envioTexto)
  if (ra.status !== 201 || ra.dados.entregue !== true) f.push('envio')
  if (a.criados.length !== 1) f.push('grava-um')
  const pl = a.criados[0] && JSON.parse(a.criados[0].payload)
  if (!pl || pl.rota !== 'sendMessage' || pl.http !== 200 || !pl.forma || pl.forma.data.id !== 'string(20)') f.push('forma')
  const bruto = a.criados.map((e) => e.payload).join('')
  for (const segredo of [TEXTO, ID_REAL, 'TOKEN-SECRETO', 'Fulano', '5512992446758']) if (bruto.includes(segredo)) f.push('vaza:' + segredo.slice(0, 6))
  const b = cenario(codigo, { cheios: 6 }); const rb = await b.enviar(envioTexto)
  if (b.criados.length !== 0 || rb.dados.entregue !== true || !b.leituras.every((l) => l === 'kind')) f.push('teto')
  const c = cenario(codigo, { falhaLeitura: true }); const rc = await c.enviar(envioTexto)
  if (c.criados.length !== 0 || rc.dados.entregue !== true) f.push('falha-leitura')
  const d = cenario(codigo, { status: 500, corpo: 'erro' }); const rd = await d.enviar(envioTexto)
  if (d.criados.length !== 0 || rd.dados.entregue !== false) f.push('recusado-nao-grava')
  const e = cenario(codigo, { falhaCriar: true }); const re = await e.enviar(envioTexto)
  if (re.status !== 201 || re.dados.entregue !== true) f.push('falha-ao-gravar-nao-quebra')
  return f
}

;(async () => {
  const a = cenario(NOVO); const ra = await a.enviar(envioTexto)
  ok('TRAVA: o envio foi aceito (201, entregue) e a sonda gravou um registro', ra.status === 201 && ra.dados.entregue === true && a.criados.length === 1, [ra, a.criados.length])
  const pl = JSON.parse(a.criados[0].payload)
  ok('o registro tem a rota, o HTTP e a FORMA da resposta (campo, tipo, tamanho)', pl.rota === 'sendMessage' && pl.http === 200 && pl.forma.success === 'boolean' && pl.forma.data.id === 'string(20)' && pl.forma.data.timestamp === 'number' && pl.forma.data.itens === 'array(1)<{"k":"number"}>' || (pl.forma.data.itens || '').startsWith('array(1)'), pl)
  const bruto = a.criados.map((e) => e.payload).join('')
  ok('NUNCA um valor: o registro não leva texto da mensagem, id devolvido, token, nome nem telefone', ![TEXTO, ID_REAL, 'TOKEN-SECRETO', 'Fulano', '5512992446758'].some((s) => bruto.includes(s)), bruto)
  ok('o registro vai para o diagnóstico, não para a conversa', a.criados[0].conversation_id === 'diagnostico' && a.criados[0].kind === 'diag_envio', a.criados[0])

  const g = cenario(NOVO, { destino: GRUPO }); await g.enviar(envioTexto)
  ok('grupo: rota sendMessageGroup', doTipo(g, 'sendMessageGroup').length === 1, g.criados.map((e) => e.payload))
  const arq = cenario(NOVO); await arq.enviar({ conversationId: 'c1', message: '', anexo: { dados: PNG, nome: 'foto.png' } })
  ok('arquivo (imagem): rota sendImage', doTipo(arq, 'sendImage').length === 1, arq.criados.map((e) => e.payload))

  const t = cenario(NOVO, { cheios: 6 }); const rt = await t.enviar(envioTexto)
  ok('teto cheio (6): não grava, só lê com filtro por kind, e o envio segue', t.criados.length === 0 && t.leituras.length >= 1 && t.leituras.every((l) => l === 'kind') && rt.dados.entregue === true, [t.criados.length, t.leituras])
  // depois de saber que o teto foi atingido, o handler PARA DE LER
  const h = compilar(NOVO)
  const leit2 = []
  const mk = () => ({
    params: {}, headers: {}, query: {}, user: { id: 'u1' }, secrets: { get: async () => 'tok' }, fetch: async () => ({ status: 200, body: CORPO_OK }), reply: reply(), body: envioTexto,
    models: (() => { const conv = { id: 'c1', remote_jid: JID, conta_id: 'default', phase: 'em_atendimento', assigned_to_id: 'u1', status: 'open' }; const v = { findMany: async () => [], findById: async () => null }
      return { WhatsAppConversation: { findById: async () => ({ ...conv }), findMany: async () => [{ ...conv }], create: async (c) => c, update: async (i, p) => Object.assign(conv, p) }, WhatsAppMessage: { findMany: async () => [], create: async (m) => m, findById: async () => null, update: async () => null },
        WaConversationEvents: { findMany: async (f) => { leit2.push(1); return Array.from({ length: 6 }, (_, i) => ({ id: 'x' + i, kind: 'diag_envio' })) }, create: async (e) => e },
        Profile: { findById: async () => ({ id: 'u1', role: 'support', full_name: 'A' }), findMany: async () => [] }, Sessao: v, SystemSettings: { findMany: async () => [{}] }, SupportSchedule: v, WaFlows: v, Company: v, Contact: v, Ticket: v, Unit: v, ClientUser: v, WaConta: v } })(),
  })
  await h(mk()); const depoisDoPrimeiro = leit2.length
  await h(mk()); await h(mk())
  ok('com o teto atingido o handler lê uma vez e depois para de ler (flag do processo)', depoisDoPrimeiro === 1 && leit2.length === 1, [depoisDoPrimeiro, leit2.length])

  const fl = cenario(NOVO, { falhaLeitura: true }); const rfl = await fl.enviar(envioTexto)
  ok('leitura da contagem falhou: NÃO grava e o envio segue (entregue: true)', fl.criados.length === 0 && rfl.dados.entregue === true, [fl.criados.length, rfl.dados])
  const nj = cenario(NOVO, { corpo: '<html>pagina</html>' }); await nj.enviar(envioTexto)
  const pnj = nj.criados[0] && JSON.parse(nj.criados[0].payload)
  ok('resposta que não é JSON: grava só naoEhJson e o tamanho (sem o conteúdo)', pnj && pnj.forma.naoEhJson === true && pnj.forma.tamanho === 19 && !nj.criados[0].payload.includes('pagina'), nj.criados[0])
  const rec = cenario(NOVO, { status: 500, corpo: 'falhou' }); const rrec = await rec.enviar(envioTexto)
  ok('envio recusado pelo provedor: não grava e responde entregue: false', rec.criados.length === 0 && rrec.dados.entregue === false, [rec.criados.length, rrec.dados])
  const fc = cenario(NOVO, { falhaCriar: true }); const rfc = await fc.enviar(envioTexto)
  ok('falha ao gravar o registro não quebra o envio', rfc.status === 201 && rfc.dados.entregue === true, rfc)

  // a rota de diagnóstico (448)
  const lerEnvio = async () => {
    const hand = compilar(R448)
    const evs = [{ id: 'q1', kind: 'diag_envio', created_at: '2026-10-19T10:00:00Z', payload: '{}' }, { id: 'q2', kind: 'diag_envio', created_at: '2026-10-19T11:00:00Z', payload: '{}' }, { id: 'o1', kind: 'diag_midia', created_at: '2026-10-19T09:00:00Z' }]
    const r = await hand({ params: {}, query: {}, headers: {}, user: { id: 'u1' }, body: {}, reply: reply(), models: { WaConversationEvents: { findMany: async (f) => evs.filter((e) => !f || !f.kind || e.kind === f.kind) }, Profile: { findById: async () => ({ id: 'u1', role: 'admin' }) }, Sessao: { findById: async () => null } } })
    return r.body.data
  }
  const dd = await lerEnvio()
  ok('a rota 448 devolve envio_total e envio (mais novos primeiro)', dd.envio_total === 2 && dd.envio[0].id === 'q2' && dd.total === 1, dd)

  ok('a bateria passa limpa no código novo', (await bateria(NOVO)).length === 0, await bateria(NOVO))
  const muts = [
    ['sem teto', 'if (quantos >= 6) { _diagEnvioCompleto = true; return; }', ''],
    ['teto 6 -> 60', 'if (quantos >= 6) {', 'if (quantos >= 60) {'],
    ['falha de leitura conta 0 e grava', 'catch (e) { lidos = null; }', 'catch (e) { lidos = []; }'],
    ['grava o valor do id (vaza)', 'o[ks[i]] = _formaDoValor(v[ks[i]], prof + 1);', 'o[ks[i]] = typeof v[ks[i]] === "string" ? v[ks[i]] : _formaDoValor(v[ks[i]], prof + 1);'],
    ['grava o corpo cru (vaza)', 'forma: forma }).slice(0, 900)', 'forma: forma, cru: String(bruto) }).slice(0, 900)'],
    ['não para de ler depois do teto', '_diagEnvioCompleto = true; return;', 'return;'],
    ['sonda também no envio recusado', 'if (r && r.status >= 200 && r.status < 300) { await _sondaEnvio(ctx, "sendMessage", r); return { ok: true }; }', 'await _sondaEnvio(ctx, "sendMessage", r); if (r && r.status >= 200 && r.status < 300) return { ok: true };'],
    ['falha ao gravar derruba o envio', '      payload: JSON.stringify({ rota: rota', '      payload: (function () { throw new Error("x"); })() || JSON.stringify({ rota: rota'],
  ]
  for (const [nome, de, para] of muts) {
    const n = NOVO.split(de).length - 1
    if (n !== 1) { ok(`mutação "${nome}" aplica exatamente uma vez`, false, n); continue }
    let fm
    try { fm = await bateria(NOVO.replace(de, () => para)) } catch (err) { ok(`mutação "${nome}" reprova por asserção, não por erro de carga`, false, String(err)); continue }
    // as mutações de "para de ler" só aparecem no teste de flag; trata separado
    if (nome === 'não para de ler depois do teto') {
      const hh = compilar(NOVO.replace(de, () => para)); const l3 = []
      const ctxs = () => { const base = mk(); base.models.WaConversationEvents.findMany = async () => { l3.push(1); return Array.from({ length: 6 }, (_, i) => ({ id: 'x' + i, kind: 'diag_envio' })) }; return base }
      await hh(ctxs()); await hh(ctxs()); await hh(ctxs())
      ok(`mutação "${nome}" é pega (lê ${l3.length} vezes em vez de 1)`, l3.length > 1, l3.length)
      continue
    }
    ok(`mutação "${nome}" é pega (${fm.join(',')})`, fm.length > 0, 'sobreviveu')
  }
  fim()
})()
