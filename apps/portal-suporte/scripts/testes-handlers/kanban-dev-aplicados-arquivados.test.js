// Kanban Dev: card em "Aplicado no cliente" há mais de uma semana sai do quadro
// (GET /tickets/kanban?quadro=dev). `?arquivados=1` devolve todos.
//
// O QUE SE GARANTE (handler EXPORTADO, relógio fixo):
//   - aplicado há 8 dias sai; há 6 dias fica; sem data legível fica;
//   - a data que conta é `resolved_at` (entrada na coluna); sem ela, `updated_at`;
//   - `aplicados_ocultos` diz quantos saíram, e `?arquivados=1` devolve todos com 0;
//   - os outros status do Dev (descartado antigo inclusive) ficam;
//   - o quadro de Suporte não muda, e continua achando o card Dev aplicado antigo
//     para mostrar quem assumiu o chamado em Pendência DEV.
// MUTAÇÕES: aplicadas uma vez cada, reprovadas por asserção.
//
// Roda com: node kanban-dev-aplicados-arquivados.test.js
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
const KANBAN = codigoDe('GET /tickets/kanban (')

const AGORA = Date.UTC(2026, 10, 25, 15, 0, 0)
const DIA = 24 * 60 * 60 * 1000
const ha = (dias) => new Date(AGORA - dias * DIA).toISOString()

function compilar(codigo) {
  class DataFixa extends Date {
    constructor(...a) { if (a.length) super(...a); else super(AGORA) }
    static now() { return AGORA }
  }
  const c = {
    console, Date: DataFixa, JSON, String, Number, Object, Array, Math, Promise, parseInt, parseFloat, isNaN, isFinite,
    RegExp, Buffer, Error, TypeError, encodeURIComponent, decodeURIComponent, Intl, URL, URLSearchParams,
    setTimeout, clearTimeout, setInterval, clearInterval, module: { exports: {} },
  }
  c.exports = c.module.exports; c.globalThis = c
  vm.createContext(c); vm.runInContext(codigo, c)
  return c.module.exports.handler
}

function tabela() {
  return [
    { id: 'ap8', quadro: 'dev', status: 'aplicado_no_cliente', resolved_at: ha(8), updated_at: ha(1), ticket_number: 'DEV-1' },
    { id: 'ap6', quadro: 'dev', status: 'aplicado_no_cliente', resolved_at: ha(6), updated_at: ha(6), ticket_number: 'DEV-2' },
    // Sem resolved_at: conta a última mudança.
    { id: 'apUpd10', quadro: 'dev', status: 'aplicado_no_cliente', updated_at: ha(10), ticket_number: 'DEV-3' },
    { id: 'apUpd2', quadro: 'dev', status: 'aplicado_no_cliente', updated_at: ha(2), ticket_number: 'DEV-4' },
    // resolved_at manda mesmo com updated_at recente (um comentário depois não "desarquiva").
    { id: 'ap30com', quadro: 'dev', status: 'aplicado_no_cliente', resolved_at: ha(30), updated_at: ha(0), ticket_number: 'DEV-5' },
    // Sem data nenhuma: fica.
    { id: 'apSemData', quadro: 'dev', status: 'aplicado_no_cliente', ticket_number: 'DEV-6' },
    { id: 'desc40', quadro: 'dev', status: 'descartado', updated_at: ha(40), ticket_number: 'DEV-7' },
    { id: 'emdev', quadro: 'dev', status: 'em_desenvolvimento', updated_at: ha(50), ticket_number: 'DEV-8', origem_ticket_id: 'sup1', assigned_to: 'u2' },
    // Card Dev aplicado há 20 dias nascido de um chamado de suporte.
    { id: 'apOrigem', quadro: 'dev', status: 'aplicado_no_cliente', resolved_at: ha(20), updated_at: ha(20), ticket_number: 'DEV-9', origem_ticket_id: 'sup2', assigned_to: 'u2' },
    { id: 'sup1', quadro: null, status: 'pendencia_dev', updated_at: ha(3), ticket_number: 'TCK-1' },
    { id: 'sup2', quadro: null, status: 'em_atendimento', updated_at: ha(3), ticket_number: 'TCK-2' },
    { id: 'supFech', quadro: null, status: 'fechado', updated_at: ha(90), ticket_number: 'TCK-3' },
    // Chamado do Suporte com o mesmo status, antigo: a regra é só do quadro Dev.
    { id: 'supAplic', quadro: null, status: 'aplicado_no_cliente', resolved_at: ha(60), updated_at: ha(60), ticket_number: 'TCK-4' },
  ]
}

function ctxDe(query) {
  const tudo = tabela()
  const vazio = { findMany: async () => [], findById: async () => null }
  const models = {
    Ticket: {
      findMany: async (arg) => {
        const ks = Object.keys(arg || {}).filter((k) => k !== 'limit' && k !== 'offset')
        return tudo.filter((t) => ks.every((k) => String(t[k] ?? '') === String(arg[k])))
      },
      findById: async (id) => tudo.find((t) => t.id === id) || null,
    },
    Sessao: { findById: async () => null },
    Profile: {
      findById: async (id) => ({ id, role: 'admin', full_name: id === 'u2' ? 'Dev Fulano' : 'Admin' }),
      findMany: async () => [{ id: 'u1', role: 'admin', full_name: 'Admin' }, { id: 'u2', role: 'developer', full_name: 'Dev Fulano' }],
    },
    TicketCoAssignee: vazio, TicketMessage: vazio, Unit: vazio, SLATracking: vazio, Company: vazio,
  }
  return { params: {}, query, body: {}, headers: {}, user: { id: 'u1' }, models, reply: reply() }
}

async function rodar(codigo, query) {
  const r = await compilar(codigo)(ctxDe(query))
  const b = r.body || {}
  // Quadro Dev: `tickets`. Os outros: `data`, por coluna.
  const lista = b.tickets || Object.values(b.data || {}).flat()
  return { status: r.status, ids: lista.map((t) => t.id).sort(), ocultos: b.aplicados_ocultos, chaves: Object.keys(b).sort().join(), b }
}

const DEV_VISIVEIS = ['ap6', 'apSemData', 'apUpd2', 'desc40', 'emdev'].sort()
const DEV_TODOS = ['ap30com', 'ap6', 'ap8', 'apOrigem', 'apSemData', 'apUpd10', 'apUpd2', 'desc40', 'emdev'].sort()

async function bateria(codigo) {
  const f = []
  const d = await rodar(codigo, { quadro: 'dev' })
  if (d.status !== 200) f.push('dev:status=' + d.status)
  if (d.ids.join() !== DEV_VISIVEIS.join()) f.push('dev:ids=' + d.ids.join('|'))
  if (d.ocultos !== 4) f.push('dev:ocultos=' + d.ocultos)
  const a = await rodar(codigo, { quadro: 'dev', arquivados: '1' })
  if (a.ids.join() !== DEV_TODOS.join()) f.push('arquivados:ids=' + a.ids.join('|'))
  if (a.ocultos !== 0) f.push('arquivados:ocultos=' + a.ocultos)
  const s = await rodar(codigo, {})
  if (s.ids.join() !== ['sup1', 'sup2', 'supAplic', 'supFech'].join()) f.push('suporte:ids=' + s.ids.join('|'))
  if (s.ocultos !== 0) f.push('suporte:ocultos=' + s.ocultos)
  // A lista vai uma vez só: Dev em `tickets`, Suporte em `data` por coluna; `columns` não vai.
  if (d.chaves !== 'aplicados_ocultos,count,fechados_ocultos,tickets') f.push('dev:chaves=' + d.chaves)
  if (s.chaves !== 'aplicados_ocultos,count,data,fechados_ocultos') f.push('suporte:chaves=' + s.chaves)
  if (d.b.count !== d.ids.length || s.b.count !== s.ids.length) f.push('count')
  if (s.b.data && (s.b.data.pendencia_dev || []).map((t) => t.id).join() !== 'sup1') f.push('suporte:coluna-pendencia_dev')
  return { f, d, a, s }
}

;(async () => {
  const { f, d, a, s } = await bateria(KANBAN)
  ok('TRAVA: o quadro Dev responde 200 com cards', d.status === 200 && d.ids.length > 0, d.status)
  ok('aplicado há 8 dias (resolved_at) sai; há 6 dias fica', !d.ids.includes('ap8') && d.ids.includes('ap6'), d.ids)
  ok('sem resolved_at conta updated_at: 10 dias sai, 2 dias fica', !d.ids.includes('apUpd10') && d.ids.includes('apUpd2'), d.ids)
  ok('resolved_at antigo manda mesmo com updated_at de hoje', !d.ids.includes('ap30com'), d.ids)
  ok('aplicado sem data legível fica', d.ids.includes('apSemData'), d.ids)
  ok('descartado antigo e em desenvolvimento antigo ficam', d.ids.includes('desc40') && d.ids.includes('emdev'), d.ids)
  ok('aplicados_ocultos = 4', d.ocultos === 4, d.ocultos)
  ok('?arquivados=1 devolve todos os 9 cards Dev e ocultos 0', a.ids.join() === DEV_TODOS.join() && a.ocultos === 0, [a.ids, a.ocultos])
  ok('quadro de Suporte: os mesmos 4 chamados (inclusive um aplicado antigo) e ocultos 0', s.ids.join() === 'sup1,sup2,supAplic,supFech' && s.ocultos === 0, [s.ids, s.ocultos])
  ok('quadro Dev manda a lista uma vez, em `tickets`', d.chaves === 'aplicados_ocultos,count,fechados_ocultos,tickets', d.chaves)
  ok('quadro de Suporte manda a lista uma vez, em `data` por coluna', s.chaves === 'aplicados_ocultos,count,data,fechados_ocultos' && (s.b.data.pendencia_dev || []).map((t) => t.id).join() === 'sup1', s.chaves)
  ok('a bateria passa limpa', f.length === 0, f)

  const MUTACOES = [
    ['vale também para o quadro de Suporte', 'if (_quadro === "dev" && String((ctx.query && ctx.query.arquivados) || "") !== "1") {', 'if (String((ctx.query && ctx.query.arquivados) || "") !== "1") {'],
    ['?arquivados=1 ignorado', 'if (_quadro === "dev" && String((ctx.query && ctx.query.arquivados) || "") !== "1") {', 'if (_quadro === "dev") {'],
    ['uma semana vira um dia', 'var _UMA_SEMANA_MS = 7 * 24 * 60 * 60 * 1000;', 'var _UMA_SEMANA_MS = 1 * 24 * 60 * 60 * 1000;'],
    ['updated_at antes de resolved_at', 'new Date(t.resolved_at || t.resolvedAt || t.updated_at || t.updatedAt || "")', 'new Date(t.updated_at || t.updatedAt || t.resolved_at || t.resolvedAt || "")'],
    ['sem data some', 'if (!isFinite(_quando) || _quando >= _corteAplicados) return true;', 'if (_quando >= _corteAplicados) return true;'],
    ['esconde qualquer status antigo', 'if (String(t.status) !== "aplicado_no_cliente") return true;', 'if (false) return true;'],
    ['não conta os ocultos', '      _aplicadosOcultos++;\n', ''],
    ['resposta sem aplicados_ocultos', 'aplicados_ocultos: _aplicadosOcultos };', '};'],
    ['Suporte volta a receber `tickets`', '  else _resposta.data = columns;\n', '  else { _resposta.data = columns; _resposta.tickets = lista; }\n'],
    ['volta o `columns`', '  return ctx.reply.send(_resposta);', '  _resposta.columns = columns;\n  return ctx.reply.send(_resposta);'],
    ['Dev recebe `data` em vez de `tickets`', '  if (_quadro === "dev") _resposta.tickets = lista;', '  if (_quadro === "dev") _resposta.data = columns;'],
    ['count errado', 'var _resposta = { count: lista.length,', 'var _resposta = { count: rows.length + 1,'],
  ]
  for (const [nome, de, para] of MUTACOES) {
    const n = KANBAN.split(de).length - 1
    if (n !== 1) { ok(`mutação "${nome}" aplica exatamente uma vez`, false, n); continue }
    let fm
    try { fm = (await bateria(KANBAN.replace(de, () => para))).f } catch (e) { fm = ['explodiu: ' + String(e && e.message)] }
    ok(`mutação "${nome}" é pega (${fm.slice(0, 1).join('')})`, fm.length > 0, 'sobreviveu')
  }
  fim()
})().catch((e) => { console.error(e); process.exit(1) })
