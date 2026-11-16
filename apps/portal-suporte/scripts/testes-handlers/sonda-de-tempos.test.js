// SONDA PROVISÓRIA de tempos por etapa na lista (432) e na conversa aberta (434).
//
// Mostra ONDE o tempo vai quando a rota é lenta, sem precisar do banco de produção: grava os
// tempos acumulados (ms) por etapa, só das chamadas lentas (432: 3 s; 434: 2 s), no máximo 8
// registros por rota. REMOVER depois.
//
// O QUE SE GARANTE:
//   - chamada RÁPIDA: nenhum registro e nenhuma leitura da tabela de eventos (custo zero);
//   - chamada LENTA: um registro `diag_tempo_<rota>` com os tempos por etapa e contagens, e só
//     números (nenhum texto, nome, telefone, id nem conteúdo de mensagem);
//   - teto de 8: com 8 registros não grava e, depois de saber disso, o handler PARA de ler;
//   - leitura da contagem falhando: não grava, e a resposta da rota segue igual;
//   - a resposta da rota é IDÊNTICA com e sem a sonda;
//   - a rota de diagnóstico (448) devolve `tempos`.
// MUTAÇÕES: cada uma aplicada uma vez e reprovada por asserção.
//
// Roda com: node sonda-de-tempos.test.js
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
const R432 = codigoDe('432 whatsapp GET /whatsapp')
const R434 = codigoDe('434 whatsapp GET /whatsapp/:id/messages')
const R448 = codigoDe('448 whatsapp GET /whatsapp/diagnostico/midia')
function compilar(codigo, relogio) {
  // `Date.now()` do handler vem de um relógio que os modelos avançam: rápido ou lento sem esperar.
  class DataFalsa extends Date { static now() { return relogio.t } }
  const c = {
    console, Date: DataFalsa, JSON, String, Number, Object, Array, Math, Promise, parseInt, parseFloat, isNaN, isFinite,
    RegExp, Buffer, Error, TypeError, setTimeout, clearTimeout, module: { exports: {} },
  }
  c.exports = c.module.exports; c.globalThis = c
  vm.createContext(c); vm.runInContext(codigo, c)
  return c.module.exports.handler
}

const BASE = Date.UTC(2026, 0, 1)
const ts = (n) => new Date(BASE + n * 60000).toISOString()
const MSGS = Array.from({ length: 40 }, (_, i) => ({ id: 'm' + i, conversation_id: 'c1', from_me: i % 2 === 0, body: 'texto SECRETO ' + i, sender_jid: '5511999990001@s.whatsapp.net', sender_name: 'Fulano Cliente', timestamp: ts(i) }))
const CONV = { id: 'c1', remote_jid: '5511999990001@s.whatsapp.net', conta_id: 'default', status: 'open', phase: 'em_atendimento', updated_at: ts(50), created_at: ts(0), unread_count: 0, contact_name: 'Fulano Cliente' }

async function rodar(codigo, rota, { passoMs = 1, cheios = 0, falhaLeitura = false, handlerPronto = null, relogio = { t: BASE }, atrasoEventosMs = 0 } = {}) {
  const lidosEventos = []
  const criados = []
  const eventos = Array.from({ length: cheios }, (_, i) => ({ id: 'e' + i, kind: 'diag_tempo_' + rota, payload: '{}' }))
  const tica = () => { relogio.t += passoMs }
  const vazio = { findMany: async () => { tica(); return [] }, findById: async () => { tica(); return null } }
  const models = {
    Sessao: { findById: async () => null },
    Profile: { findById: async () => ({ id: 'u1', role: 'admin' }), findMany: async () => { tica(); return [] } },
    WhatsAppConversation: { findById: async () => { tica(); return { ...CONV } }, findMany: async () => { tica(); return [{ ...CONV }] }, update: async () => ({}) },
    WhatsAppMessage: { findMany: async (f) => { tica(); return camadaFindMany(MSGS, f) }, findById: async () => null },
    WaConversationEvents: {
      findMany: async (f) => { lidosEventos.push(Object.keys(f || {}).join('+') || 'TUDO'); if (atrasoEventosMs) await new Promise((res) => setTimeout(res, atrasoEventosMs)); if (falhaLeitura) throw new Error('banco'); return eventos.filter((e) => !f || !f.kind || e.kind === f.kind) },
      create: async (e) => { criados.push(e); eventos.push(e); return e },
    },
    SystemSettings: vazio, CompanyContact: vazio, WaDepartment: vazio, Company: vazio, Ticket: vazio, WaCloseReason: vazio, WaTag: vazio, WaConversationTag: vazio,
  }
  const handler = handlerPronto || compilar(codigo, relogio)
  const r = await handler({ params: { id: 'c1' }, query: {}, body: {}, headers: {}, user: { id: 'u1' }, secrets: { get: async () => '' }, fetch: async () => ({ status: 200, body: '{}' }), models, reply: reply() })
  const criadosNoRetorno = criados.length
  await new Promise((res) => setTimeout(res, 20 + atrasoEventosMs * 2))   // a sonda não é esperada pela resposta
  return { status: r.status, corpo: JSON.stringify(r.body), criados, criadosNoRetorno, lidosEventos, handler, relogio }
}
const ROTAS = [['lista', R432], ['conversa', R434]]
const SEM_SONDA = (cod, rota) => cod.replace(new RegExp('\\n  _sondaTempos\\(ctx, "' + rota + '", _tp, \\d+\\)\\.catch\\(function \\(\\) \\{\\}\\);'), '')

async function bateria(mut) {
  const f = []
  for (const [rota, cod0] of ROTAS) {
    const cod = (mut && mut[rota]) || cod0
    const r1 = await rodar(cod, rota, { passoMs: 1 })
    if (r1.criados.length || r1.lidosEventos.length) f.push(rota + ':rapida-custo-zero')
    const r2 = await rodar(cod, rota, { passoMs: 2500 })
    const rec = r2.criados[0] && JSON.parse(r2.criados[0].payload)
    if (r2.criados.length !== 1 || r2.criados[0].kind !== 'diag_tempo_' + rota || !rec || !(rec.total >= 2000)) f.push(rota + ':lenta-grava-um')
    if (rec && !Object.values(rec).every((v) => typeof v === 'number')) f.push(rota + ':so-numeros')
    if (/SECRETO|Fulano|5511999990001|c1|m1/.test(r2.criados.map((c) => c.payload).join(''))) f.push(rota + ':vaza')
    const r3 = await rodar(cod, rota, { passoMs: 2500, cheios: 8 })
    if (r3.criados.length) f.push(rota + ':teto-8')
    const dois = await rodar(cod, rota, { passoMs: 2500, cheios: 8 })
    const seg = await rodar(cod, rota, { passoMs: 2500, cheios: 8, handlerPronto: dois.handler, relogio: dois.relogio })
    if (dois.lidosEventos.length !== 1 || seg.lidosEventos.length) f.push(rota + ':para-de-ler-no-teto')
    const espera = await rodar(cod, rota, { passoMs: 2500, atrasoEventosMs: 30 })
    if (espera.criadosNoRetorno !== 0 || espera.criados.length !== 1) f.push(rota + ':nao-atrasa-a-resposta')
    const r4 = await rodar(cod, rota, { passoMs: 2500, falhaLeitura: true })
    if (r4.criados.length || r4.status !== 200) f.push(rota + ':falha-de-leitura')
    const sem = await rodar(SEM_SONDA(cod0, rota), rota, { passoMs: 2500 })
    if (sem.corpo !== r2.corpo) f.push(rota + ':resposta-igual')
  }
  return f
}

;(async () => {
  for (const [rota, cod] of ROTAS) {
    const r1 = await rodar(cod, rota, { passoMs: 1 })
    ok(`${rota}: chamada RÁPIDA não grava nem lê a tabela de eventos`, r1.status === 200 && r1.criados.length === 0 && r1.lidosEventos.length === 0, [r1.status, r1.criados.length, r1.lidosEventos])
    const r2 = await rodar(cod, rota, { passoMs: 2500 })
    const rec = r2.criados[0] && JSON.parse(r2.criados[0].payload)
    ok(`${rota}: TRAVA + chamada LENTA grava UM registro \`diag_tempo_${rota}\` com os tempos acumulados`, r2.criados.length === 1 && r2.criados[0].kind === 'diag_tempo_' + rota && rec.total >= 2000 && rec.total >= (rec.leitura || rec.deps || 0), r2.criados.map((c) => c.payload))
    ok(`${rota}: o registro tem só números (${Object.keys(rec).join(', ')})`, Object.values(rec).every((v) => typeof v === 'number'), rec)
    ok(`${rota}: nenhum texto, nome, telefone ou id de mensagem no registro`, !/SECRETO|Fulano|5511999990001|c1|m1/.test(r2.criados[0].payload), r2.criados[0].payload)
    const r3 = await rodar(cod, rota, { passoMs: 2500, cheios: 8 })
    ok(`${rota}: com 8 registros não grava`, r3.criados.length === 0, r3.criados.length)
    const dois = await rodar(cod, rota, { passoMs: 2500, cheios: 8 })
    const seg = await rodar(cod, rota, { passoMs: 2500, cheios: 8, handlerPronto: dois.handler, relogio: dois.relogio })
    ok(`${rota}: depois de saber que o teto foi atingido, o handler PARA de ler eventos (1ª chamada lê, a 2ª não, com o mesmo relógio lento)`, dois.lidosEventos.length === 1 && seg.lidosEventos.length === 0, [dois.lidosEventos, seg.lidosEventos])
    const espera = await rodar(cod, rota, { passoMs: 2500, atrasoEventosMs: 30 })
    ok(`${rota}: a sonda NÃO atrasa a resposta (ao retornar nada foi gravado ainda; depois, um registro)`, espera.criadosNoRetorno === 0 && espera.criados.length === 1, [espera.criadosNoRetorno, espera.criados.length])
    const r4 = await rodar(cod, rota, { passoMs: 2500, falhaLeitura: true })
    ok(`${rota}: leitura da contagem falhou: não grava e a resposta segue 200`, r4.criados.length === 0 && r4.status === 200, [r4.criados.length, r4.status])
    const sem = await rodar(SEM_SONDA(cod, rota), rota, { passoMs: 2500 })
    ok(`${rota}: a resposta é IDÊNTICA com e sem a sonda`, sem.corpo === r2.corpo && sem.corpo.length > 100, 'divergiu')
  }
  // a rota de diagnóstico
  const evs = [{ id: 'a', kind: 'diag_tempo_lista', created_at: '2026-10-20T10:00:00Z', payload: '{"total":1}' }, { id: 'b', kind: 'diag_tempo_conversa', created_at: '2026-10-20T11:00:00Z', payload: '{"total":2}' }, { id: 'c', kind: 'diag_midia', created_at: '2026-10-20T09:00:00Z' }]
  const h448 = compilar(R448, { t: BASE })
  const r448 = await h448({ params: {}, query: {}, headers: {}, body: {}, user: { id: 'u1' }, reply: reply(), models: { WaConversationEvents: { findMany: async (f) => evs.filter((e) => !f || !f.kind || e.kind === f.kind) }, Profile: { findById: async () => ({ id: 'u1', role: 'admin' }) }, Sessao: { findById: async () => null } } })
  ok('a rota 448 devolve `tempos` (os dois tipos, mais novos primeiro)', r448.body.data.tempos.length === 2 && r448.body.data.tempos[0].id === 'b', r448.body.data.tempos)

  ok('a bateria passa limpa', (await bateria()).length === 0, await bateria())
  const muts = [
    ['lista sem limite de lentidão (grava sempre)', R432, 'lista', '!(tp.total >= limiteMs)', 'false'],
    ['lista sem teto de 8', R432, 'lista', '>= 8) { _diagTempoCompleto = true; return; }', '>= 8000) { _diagTempoCompleto = true; return; }'],
    ['lista falha de leitura conta 0', R432, 'lista', 'catch (e) { lidos = null; }', 'catch (e) { lidos = []; }'],
    ['lista grava dado (id da primeira conversa)', R432, 'lista', '_tp.total = Date.now() - _t0; _tp.linhas = rows.length;', '_tp.total = Date.now() - _t0; _tp.linhas = rows.length; _tp.quem = rows[0] && rows[0].id;'],
    ['lista não para de ler no teto', R432, 'lista', '_diagTempoCompleto = true; return;', 'return;'],
    ['conversa sem limite de lentidão', R434, 'conversa', '!(tp.total >= limiteMs)', 'false'],
    ['conversa sem teto de 8', R434, 'conversa', '>= 8) { _diagTempoCompleto = true; return; }', '>= 8000) { _diagTempoCompleto = true; return; }'],
    ['conversa grava o corpo da mensagem', R434, 'conversa', '_tp.total = Date.now() - _t0; _tp.linhas = rows.length;', '_tp.total = Date.now() - _t0; _tp.linhas = rows.length; _tp.texto = rows[0] && rows[0].body;'],
    ['conversa espera a sonda (await)', R434, 'conversa', '_sondaTempos(ctx, "conversa", _tp, 2000).catch(function () {});', 'await _sondaTempos(ctx, "conversa", _tp, 2000);'],
  ]
  for (const [nome, base, rota, de, para] of muts) {
    const n = base.split(de).length - 1
    if (n !== 1) { ok(`mutação "${nome}" aplica exatamente uma vez`, false, n); continue }
    const alvo = { [rota]: base.replace(de, () => para) }
    let fm
    try { fm = await bateria(alvo) } catch (e) { ok(`mutação "${nome}" reprova por asserção, não por erro de carga`, false, String(e)); continue }
    ok(`mutação "${nome}" é pega (${fm.slice(0, 3).join(',')})`, fm.length > 0, 'sobreviveu')
  }
  fim()
})()
