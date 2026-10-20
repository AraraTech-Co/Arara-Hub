// SONDA PROVISÓRIA: o aviso ao plantonista já disparou alguma vez em produção?
// A rota 448 (`/whatsapp/diagnostico/midia`) passa a devolver `avisos_plantao`: só contagens
// dos eventos `aviso_plantao` (enviado ou não, código HTTP, por dia, primeiro/último, maior
// número de conversas num aviso). REMOVER depois.
//
// O QUE SE GARANTE: contagens corretas; nenhum texto, id, telefone nem destinatário na resposta;
// leitura falhando devolve `leitura: "falhou"` sem derrubar a rota; teto de 500 sinalizado.
// MUTAÇÕES: cada uma aplicada uma vez e reprovada por asserção.
//
// Roda com: node sonda-avisos-plantao.test.js
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
const R448 = codigoDe('448 whatsapp GET /whatsapp/diagnostico/midia')

const evs = [
  { id: 'e4', kind: 'aviso_plantao', created_at: '2026-10-19T09:01:00.000Z', payload: 'isto não é json' },
  { id: 'e3', kind: 'aviso_plantao', created_at: '2026-10-19T09:00:00.000Z', payload: JSON.stringify({ para: null, enviado: false, http: null, conversas: 2 }) },
  { id: 'e1', kind: 'aviso_plantao', created_at: '2026-10-18T10:00:00.000Z', payload: JSON.stringify({ para: 'u-SECRETO', enviado: true, http: 200, conversas: 1, recibo: 'x' }) },
  { id: 'e2', kind: 'aviso_plantao', created_at: '2026-10-18T10:05:00.000Z', payload: JSON.stringify({ para: 'u-SECRETO', enviado: true, http: 200, conversas: 4 }) },
  { id: 'x1', kind: 'diag_tempo_lista', created_at: '2026-10-19T09:02:00.000Z', payload: '{}' },
]
async function rodar(cod, opc) {
  const h = compilar(cod)
  const r = await h({
    params: {}, query: {}, headers: {}, body: {}, user: { id: 'u1' }, reply: reply(),
    models: { Profile: { findById: async () => ({ id: 'u1', role: 'admin' }) }, Sessao: { findById: async () => null }, WaConversationEvents: { findMany: async (f) => {
      if (opc && opc.falha && f && f.kind === 'aviso_plantao') throw new Error('boom')
      const todos = (opc && opc.muitos && f && f.kind === 'aviso_plantao' ? Array.from({ length: 500 }, (_, i) => ({ id: 'z' + i, kind: 'aviso_plantao', created_at: '2026-10-20T00:00:00Z', payload: '{"enviado":true,"http":200,"conversas":1}' })) : evs)
      return f && f.kind === 'aviso_plantao' ? todos : todos.filter((e) => !f || !f.kind || e.kind === f.kind)
    } } },
  })
  return r
}
async function bateria(cod) {
  const falhas = []
  const t = (nome, cond, det) => { if (!cond) falhas.push(nome + (det !== undefined ? ' ' + JSON.stringify(det) : '')) }
  const r = await rodar(cod); const a = r.body.data.avisos_plantao
  t('total conta os 4 eventos de aviso (e só eles)', a.total === 4, a)
  t('enviado=2 e nao_enviado=2 (o payload ilegível conta como não enviado)', a.enviado === 2 && a.nao_enviado === 2, a)
  t('http por código (200 duas vezes; sem duas vezes)', a.http['200'] === 2 && a.http.sem === 2, a.http)
  t('por dia', a.por_dia['2026-10-18'] === 2 && a.por_dia['2026-10-19'] === 2, a.por_dia)
  t('primeiro e último', a.primeiro === '2026-10-18T10:00:00.000Z' && a.ultimo === '2026-10-19T09:01:00.000Z', [a.primeiro, a.ultimo])
  t('maior número de conversas num aviso', a.max_conversas === 4, a.max_conversas)
  t('nenhum destinatário, id ou texto na resposta', !/SECRETO|u-|e1|isto/.test(JSON.stringify(a)), a)
  t('sem truncar com poucos eventos', a.truncado === false && a.leitura === 'ok', a)
  const f = (await rodar(cod, { falha: true })); t('leitura falhando: rota segue 200 com leitura "falhou"', f.status === 200 && f.body.data.avisos_plantao.leitura === 'falhou', f.body.data.avisos_plantao)
  const m = (await rodar(cod, { muitos: true })).body.data.avisos_plantao; t('500 eventos sinaliza truncado', m.truncado === true && m.total === 500, m)
  return falhas
}
;(async () => {
  const f0 = await bateria(R448)
  ok('a bateria passa limpa', f0.length === 0, f0)
  const muts = [
    ['conta evento de outro tipo', 'filter(function (x) { return x.kind === "aviso_plantao"; })', 'filter(function (x) { return true; })'],
    ['não-enviado vira enviado', 'if (_p.enviado) _avp.enviado++; else _avp.nao_enviado++;', '_avp.enviado++;'],
    ['grava o destinatário', 'var _h = String(_p.http', '_avp.para = _p.para; var _h = String(_p.http'],
    ['sem sinal de truncamento', '_avp.truncado = _av.length >= 500;', ''],
    ['falha de leitura derruba a rota', '} catch (e) { _avp.leitura = "falhou"; }', '} catch (e) { throw e; }'],
    ['por dia usa o horário errado', 'slice(0, 10); if (_d)', 'slice(5, 15); if (_d)'],
  ]
  for (const [nome, de, para] of muts) {
    const n = R448.split(de).length - 1
    if (n !== 1) { ok(`mutação "${nome}" aplica exatamente uma vez`, false, n); continue }
    let fm
    try { fm = await bateria(R448.replace(de, () => para)) } catch (e) { fm = ['erro: ' + e.message] }
    ok(`mutação "${nome}" é pega (${fm.slice(0, 2).join(' | ').slice(0, 80)})`, fm.length > 0, 'sobreviveu')
  }
  fim()
})()
