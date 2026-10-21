// SONDA PROVISÓRIA de tempos por etapa no DETALHE da conversa (rota 433, `GET /whatsapp/:id`),
// a chamada que alimenta o painel lateral da inbox. REMOVER depois.
//
// Grava os tempos acumulados (ms) por etapa só das chamadas lentas (2 s), no máximo 8 registros
// `diag_tempo_detalhe`, só números: conversa, barra, últimas mensagens, cada busca por id
// (`f_prof`, `f_dept`, `f_emp`, `f_ctt`, `f_tkt`, `f_enc`), etiquetas, serialização, leitura
// inteira de `ClientUser` (`cu_todos`, `n_cu`) e de `CompanyContact` (`ct_todos`, `n_ct`).
//
// O QUE SE GARANTE:
//   - chamada RÁPIDA: nenhum registro e nenhuma leitura da tabela de eventos;
//   - chamada LENTA: UM registro `diag_tempo_detalhe`, só números, sem texto/nome/telefone/id;
//   - teto de 8: com 8 registros não grava e o handler PARA de ler;
//   - leitura da contagem falhando: não grava e a resposta segue 200;
//   - a resposta é IDÊNTICA com e sem a sonda, e a sonda não atrasa a resposta;
//   - a rota de diagnóstico (448) devolve também `diag_tempo_detalhe`.
// MUTAÇÕES: aplicadas uma vez cada, reprovadas por asserção.
//
// Roda com: node sonda-de-tempos-detalhe.test.js
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
const R433 = codigoDe('433 whatsapp GET /whatsapp/:id')
const R448 = codigoDe('448 whatsapp GET /whatsapp/diagnostico/midia')
function compilar(codigo, relogio) {
  class DataFalsa extends Date { static now() { return relogio.t } }
  const c = {
    console, Date: DataFalsa, JSON, String, Number, Object, Array, Math, Promise, parseInt, parseFloat, isNaN, isFinite,
    RegExp, Buffer, Error, TypeError, encodeURIComponent, decodeURIComponent, Intl, URL, URLSearchParams,
    setTimeout, clearTimeout, module: { exports: {} },
  }
  c.exports = c.module.exports; c.globalThis = c
  vm.createContext(c); vm.runInContext(codigo, c)
  return c.module.exports.handler
}

const BASE = Date.UTC(2026, 0, 1)
const CONV = { id: 'c1', remote_jid: '5511999990001@s.whatsapp.net', conta_id: 'default', status: 'open', phase: 'em_atendimento', assigned_to_id: 'u1', company_id: 'e1', department_id: 'd1', contact_name: 'Fulano SECRETO', updated_at: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z' }

async function rodar(cod, { passoMs = 1, cheios = 0, falhaLeitura = false, atrasoEventosMs = 0, handlerPronto, relogio } = {}) {
  const rel = relogio || { t: BASE }
  const avanca = () => { rel.t += passoMs }
  const criados = [], lidosEventos = []
  let criadosNoRetorno = null
  const vazio = { findMany: async () => { avanca(); return [] }, findById: async () => { avanca(); return null } }
  const models = {
    WhatsAppConversation: { findById: async () => { avanca(); return { ...CONV } }, findMany: async () => [{ ...CONV }] },
    WhatsAppMessage: { findMany: async () => { avanca(); return [{ id: 'm1', conversation_id: 'c1', from_me: false, body: 'texto SECRETO', timestamp: '2026-01-01T00:00:00Z' }] }, findById: async () => null },
    Profile: { findById: async (id) => { avanca(); return id === 'u1' ? { id: 'u1', role: 'support', full_name: 'Ana' } : null }, findMany: async () => [] },
    ClientUser: { findMany: async () => { avanca(); return [{ id: 'cu1', name: 'Outro', whatsapp: '11888880000', active: true }] }, findById: async () => { avanca(); return null } },
    CompanyContact: { findMany: async () => { avanca(); return [{ id: 'ct1', name: 'Fulano', whatsapp: '11999990001', active: true }] } },
    Company: { findById: async () => { avanca(); return { id: 'e1', name: 'Empresa SECRETA' } } },
    Unit: vazio, Sessao: vazio, SystemSettings: { findMany: async () => [{}] },
    WaDepartments: { findById: async () => { avanca(); return { id: 'd1', name: 'Suporte' } } },
    Ticket: vazio, WaCloseReasons: vazio, WaConversationTags: vazio, WaTags: vazio,
    WaConversationEvents: {
      findMany: async (f) => {
        lidosEventos.push(f)
        if (falhaLeitura) throw new Error('boom')
        return Array.from({ length: cheios }, (_, i) => ({ id: 'e' + i, kind: 'diag_tempo_detalhe' }))
      },
      create: async (e) => {
        if (atrasoEventosMs) await new Promise((r) => setTimeout(r, atrasoEventosMs))
        criados.push(e)
      },
    },
  }
  const h = handlerPronto || compilar(cod, rel)
  const r = await h({ params: { id: 'c1' }, query: {}, body: {}, headers: {}, user: { id: 'u1' }, models, reply: reply() })
  criadosNoRetorno = criados.length
  await new Promise((r2) => setTimeout(r2, atrasoEventosMs ? atrasoEventosMs + 20 : 5))
  return { status: r.status, corpo: JSON.stringify(r.body), criados, lidosEventos, criadosNoRetorno, handler: h, relogio: rel }
}
const SEM_SONDA = (cod) => {
  const de = '  _sondaTempos(ctx, "detalhe", _tp, 2000).catch(function () {});\n'
  if (cod.split(de).length - 1 !== 1) throw new Error('âncora da sonda')
  return cod.replace(de, '')
}

async function bateria(cod = R433) {
  const falhas = []
  const t = (nome, cond, det) => { if (!cond) falhas.push(nome + (det !== undefined ? ' ' + JSON.stringify(det).slice(0, 220) : '')) }
  const r1 = await rodar(cod, { passoMs: 1 })
  t('chamada RÁPIDA não grava nem lê eventos', r1.status === 200 && r1.criados.length === 0 && r1.lidosEventos.length === 0, [r1.status, r1.criados.length, r1.lidosEventos.length])
  const r2 = await rodar(cod, { passoMs: 400 })
  const rec = r2.criados[0] && JSON.parse(r2.criados[0].payload)
  t('chamada LENTA grava UM registro diag_tempo_detalhe com os marcos', r2.criados.length === 1 && r2.criados[0].kind === 'diag_tempo_detalhe' && rec && rec.total >= 2000 && ['conv', 'barra', 'ult', 'ids', 'etiq', 'serial', 'cu_todos', 'ct_todos', 'ident', 'fk'].every((k) => typeof rec[k] === 'number'), rec)
  t('  com a contagem das duas leituras inteiras e das buscas por id', rec && rec.n_cu === 1 && rec.n_ct === 1 && rec.n_ids >= 1 && typeof rec.f_prof === 'number' && typeof rec.f_emp === 'number', rec)
  t('  os marcos são acumulados e crescentes', rec && rec.conv <= rec.barra && rec.barra <= rec.deps && rec.deps <= rec.serial && rec.serial <= rec.ident && rec.ident <= rec.total, rec)
  t('  só números (nenhum texto, nome, telefone ou id)', rec && Object.values(rec).every((v) => typeof v === 'number') && !/SECRET|Fulano|5511999990001|c1|u1/.test(r2.criados[0].payload), r2.criados[0] && r2.criados[0].payload)
  const r3 = await rodar(cod, { passoMs: 400, cheios: 8 })
  t('com 8 registros não grava', r3.criados.length === 0, r3.criados.length)
  const dois = await rodar(cod, { passoMs: 400, cheios: 8 })
  const seg = await rodar(cod, { passoMs: 400, cheios: 8, handlerPronto: dois.handler, relogio: dois.relogio })
  t('depois de saber do teto, o handler PARA de ler eventos', dois.lidosEventos.length === 1 && seg.lidosEventos.length === 0, [dois.lidosEventos.length, seg.lidosEventos.length])
  const espera = await rodar(cod, { passoMs: 400, atrasoEventosMs: 30 })
  t('a sonda NÃO atrasa a resposta', espera.criadosNoRetorno === 0 && espera.criados.length === 1, [espera.criadosNoRetorno, espera.criados.length])
  const r4 = await rodar(cod, { passoMs: 400, falhaLeitura: true })
  t('leitura da contagem falhou: não grava e a resposta segue 200', r4.criados.length === 0 && r4.status === 200, [r4.criados.length, r4.status])
  const sem = await rodar(SEM_SONDA(cod), { passoMs: 400 })
  t('a resposta é IDÊNTICA com e sem a sonda', sem.corpo === r2.corpo && sem.corpo.length > 100, 'divergiu')
  return falhas
}

;(async () => {
  const f0 = await bateria()
  ok('a bateria passa limpa', f0.length === 0, f0)
  const h448 = compilar(R448, { t: BASE })
  const evs = [{ id: 'a', kind: 'diag_tempo_lista', created_at: '2026-10-20T10:00:00Z', payload: '{}' }, { id: 'b', kind: 'diag_tempo_detalhe', created_at: '2026-10-20T12:00:00Z', payload: '{}' }]
  const r448 = await h448({ params: {}, query: {}, headers: {}, body: {}, user: { id: 'u1' }, reply: reply(), models: { WaConversationEvents: { findMany: async (f) => evs.filter((e) => !f || !f.kind || e.kind === f.kind) }, Profile: { findById: async () => ({ id: 'u1', role: 'admin' }) }, Sessao: { findById: async () => null } } })
  ok('a rota 448 devolve `tempos` também do detalhe (mais novo primeiro)', r448.body.data.tempos.length === 2 && r448.body.data.tempos[0].id === 'b', r448.body.data.tempos)
  const muts = [
    ['sem limite de lentidão (grava sempre)', '!(tp.total >= limiteMs)', 'false'],
    ['sem teto de 8', '>= 8) { _diagTempoCompleto = true; return; }', '>= 8000) { _diagTempoCompleto = true; return; }'],
    ['não para de ler no teto', '_diagTempoCompleto = true; return;', 'return;'],
    ['falha de leitura conta 0', 'catch (e) { lidos = null; }', 'catch (e) { lidos = []; }'],
    ['grava dado (nome do contato)', '_tp.total = Date.now() - _t0;', '_tp.total = Date.now() - _t0; _tp.quem = conv.contact_name;'],
    ['espera a sonda (await)', '_sondaTempos(ctx, "detalhe", _tp, 2000).catch(function () {});', 'await _sondaTempos(ctx, "detalhe", _tp, 2000);'],
    ['sem a marca das leituras inteiras', 'if (tp) { tp.cu_todos = Date.now() - tp.t0; tp.n_cu = (users || []).length; }', ''],
    ['sem a marca por busca por id', 'if (tp) { tp["f_" + nome] = Date.now() - _ini; tp.n_ids = (tp.n_ids || 0) + 1; }', ''],
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
