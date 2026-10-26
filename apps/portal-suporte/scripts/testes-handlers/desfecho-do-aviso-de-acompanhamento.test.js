// O histórico do chamado diz a verdade sobre o aviso de acompanhamento.
//
// Os dois caminhos gravavam vocabulários diferentes e a tela só lia um: o atalho "Criar ticket" grava
// `aceito_pelo_provedor`/`recusado`/`grupo` e aparecia como "Sem desfecho registrado"; a criação manual e o
// reenvio gravavam `enviado` MESMO quando o provedor recusava, e a tela dizia "Aceito pelo provedor (HTTP 422)".
//
// O QUE SE GARANTE:
//   - O HELPER da tela (`lib/tickets/desfecho-do-aviso.ts`, executado): cada etapa tem texto próprio;
//     "Sem desfecho registrado" só para etapa ausente/desconhecida; `enviado` legado é lido pelo status
//     (>= 300 = recusado); o texto nunca afirma entrega;
//   - O SERVIDOR, criação manual (`_avisarAberturaSite`) e reenvio: provedor 200 → `aceito_pelo_provedor`,
//     422 → `recusado`; 422 na 1ª grafia do número e 200 na 2ª → `aceito_pelo_provedor`;
//   - AS TELAS usam o helper (uma tradução só), sem comparar a etapa antiga.
// "Aceito" não é "entregue": o 200 do provedor não prova recebimento.
//
// Roda com: node desfecho-do-aviso-de-acompanhamento.test.js   (Node 22.18+/24+ carrega .ts sem build)
const fs = require('fs')
const vm = require('vm')
const path = require('path')
const { reply, ok, fim, ARQ } = require('./_carregar.js')

const APP = path.resolve(__dirname, '../../app')
const semComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const HELPER_SRC = fs.readFileSync(path.join(APP, 'lib/tickets/desfecho-do-aviso.ts'), 'utf8')
const TIMELINE = semComentarios(fs.readFileSync(path.join(APP, '_components/tickets/ticket-timeline.tsx'), 'utf8'))
const DETALHES = semComentarios(fs.readFileSync(path.join(APP, '_components/tickets/admin-ticket-details.tsx'), 'utf8'))

function carregar(codigo, nome) {
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'desf-'))
  const f = path.join(dir, nome + '.ts')
  fs.writeFileSync(f, codigo)
  const m = require(f)
  delete require.cache[f]
  return m
}

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
  return c
}
const SITE = codigoDe('source: "cms3uj45k00rho64is7cflt8s"')
const REENVIO = codigoDe('source: "manual-reenvio-acompanhamento"')

// ── helper ──
function bateriaHelper(m) {
  const f = []
  const t = m.textoDoDesfecho
  const has = (txt, re) => re.test(txt)
  if (!has(t({ etapa: 'aceito_pelo_provedor', status: 200 }), /^Aceito pelo provedor \(HTTP 200\)$/)) f.push('aceito')
  if (!has(t({ etapa: 'recusado', status: 422 }), /^Recusado pelo provedor \(HTTP 422\)$/)) f.push('recusado')
  if (!has(t({ etapa: 'grupo' }), /^Não enviado: conversa de grupo$/)) f.push('grupo')
  if (!has(t({ etapa: 'sem_numero' }), /^Não enviado: chamado sem número/)) f.push('sem_numero')
  if (!has(t({ etapa: 'sem_token' }), /whatsapp_token/)) f.push('sem_token')
  if (!has(t({ etapa: 'falhou', erro: 'timeout' }), /^Falhou: timeout$/)) f.push('falhou')
  // etapa legada: o status decide
  if (!has(t({ etapa: 'enviado', status: 200 }), /^Aceito pelo provedor \(HTTP 200\)$/)) f.push('legado-200')
  if (!has(t({ etapa: 'enviado', status: 422 }), /^Recusado pelo provedor \(HTTP 422\)$/)) f.push('legado-422')
  if (!has(t({ etapa: 'enviado', status: 300 }), /^Recusado/)) f.push('legado-300')
  // legado sem status utilizável: nem aceito nem recusado
  for (const [nome, d] of [['nulo', { etapa: 'enviado', status: null }], ['ausente', { etapa: 'enviado' }], ['vazio', { etapa: 'enviado', status: '' }], ['texto', { etapa: 'enviado', status: 'abc' }]]) {
    const x = t(d)
    if (/^Aceito|^Recusado|Sem desfecho registrado/.test(x) || !/sem resposta do provedor/.test(x)) f.push('legado-status-' + nome)
  }
  if (!has(t({ etapa: 'enviado', status: '200' }), /^Aceito pelo provedor \(HTTP 200\)$/)) f.push('legado-status-texto-numerico')
  // só 200–299 é aceito; 0, 1xx e negativo não são sucesso nem recusa
  for (const st of [0, 100, 101, 199, -1]) {
    const x = t({ etapa: 'enviado', status: st })
    if (/^Aceito|^Recusado/.test(x) || !/sem resposta do provedor/.test(x)) f.push('legado-status-' + st)
  }
  for (const st of [200, 204, 299]) if (!has(t({ etapa: 'enviado', status: st }), /^Aceito pelo provedor/)) f.push('legado-aceito-' + st)
  for (const st of [300, 301, 400, 422, 500, 599]) if (!has(t({ etapa: 'enviado', status: st }), /^Recusado pelo provedor/)) f.push('legado-recusado-' + st)
  // "Sem desfecho" só para o que não se sabe ler
  for (const [nome, d] of [['nulo', null], ['vazio', {}], ['inicio', { etapa: 'inicio' }], ['estranho', { etapa: 'xyz' }]]) {
    if (t(d) !== 'Sem desfecho registrado') f.push('sem-desfecho-' + nome)
  }
  for (const e of ['aceito_pelo_provedor', 'recusado', 'grupo', 'sem_numero', 'sem_token', 'falhou', 'enviado']) {
    if (t({ etapa: e, status: 200, erro: 'x' }) === 'Sem desfecho registrado') f.push('cai-em-sem-desfecho-' + e)
  }
  // destino aparece quando existe; nunca se afirma entrega
  if (t({ etapa: 'aceito_pelo_provedor', status: 200 }, '5519…46') !== 'Aceito pelo provedor (HTTP 200) · 5519…46') f.push('destino')
  for (const e of ['aceito_pelo_provedor', 'enviado']) if (/entreg|recebid/i.test(t({ etapa: e, status: 200 }))) f.push('afirma-entrega')
  return f
}

// ── servidor ──
function mundoFetch(statuses) {
  const chamadas = []
  let i = 0
  return {
    chamadas,
    fetch: async (url, init) => {
      const st = statuses[Math.min(i++, statuses.length - 1)]
      chamadas.push({ url, corpo: JSON.parse(init.body) })
      return st === null ? null : { status: st, body: '{}' }
    },
  }
}
async function rodarSite(statuses) {
  const c = compilar(SITE)
  const w = mundoFetch(statuses)
  const fn = vm.runInContext('_avisarAberturaSite', c)
  const d = await fn(
    { fetch: w.fetch, secrets: { get: async () => 'tok' } },
    { ticket_number: 'TCK000900', acomp_codigo: 'ABC234', acomp_whatsapp: '5519993999446' },
  )
  return { d, w }
}
async function rodarReenvio(statuses) {
  const c = compilar(REENVIO)
  const w = mundoFetch(statuses)
  const logs = []
  const r = await c.module.exports.handler({
    params: { id: 't1' }, headers: {}, query: {}, user: { id: 'u1' }, secrets: { get: async () => 'tok' }, fetch: w.fetch, reply: reply(), body: {},
    models: {
      Profile: { findById: async () => ({ id: 'u1', role: 'support' }) },
      Ticket: { findById: async () => ({ id: 't1', ticket_number: 'TCK000900', acomp_codigo: 'ABC234', acomp_whatsapp: '5519993999446' }) },
      ActivityLog: { create: async (l) => { logs.push(l); return l } },
    },
  })
  return { r, logs, d: r.body && r.body.data && r.body.data.desfecho }
}
async function bateriaServidor(rodar, nome) {
  const f = []
  const a = await rodar([200])
  const da = a.d
  if (!da || da.etapa !== 'aceito_pelo_provedor' || da.status !== 200) f.push(nome + '-200')
  const b = await rodar([422])
  if (!b.d || b.d.etapa !== 'recusado' || b.d.status !== 422) f.push(nome + '-422')
  if (nome !== 'reenvio-log') {
    // provedor que nem respondeu (fetch devolve nada): não é recusa
    const sem = await rodar([null])
    if (!sem.d || sem.d.etapa !== 'falhou' || /recusado|aceito/.test(String(sem.d.etapa))) f.push(nome + '-sem-resposta')
  }
  for (const st of [0, 100]) {
    // status que não é sucesso nem recusa: não pode virar "aceito"
    const x = await rodar([st])
    if (!x.d || x.d.etapa !== 'falhou' || !/resposta inesperada/.test(String(x.d.erro || ''))) f.push(nome + '-status-' + st)
  }
  const c = await rodar([422, 200])
  if (!c.d || c.d.etapa !== 'aceito_pelo_provedor' || c.d.status !== 200 || c.d.tentativas.length !== 2) f.push(nome + '-2a-grafia')
  if (nome === 'reenvio') {
    const l = b.logs.find((x) => x.action === 'acompanhamento_aviso')
    if (!l || l.details.desfecho.etapa !== 'recusado') f.push('reenvio-log-recusado')
  }
  return f
}

;(async () => {
  const hf = bateriaHelper(carregar(HELPER_SRC, 'helper'))
  ok('o helper dá texto próprio a cada etapa, lê o legado pelo status e nunca afirma entrega', hf.length === 0, hf)
  const sf = await bateriaServidor(rodarSite, 'manual')
  ok('criação manual: 200 → aceito_pelo_provedor, 422 → recusado, 2ª grafia aceita → aceito', sf.length === 0, sf)
  const rf = await bateriaServidor(rodarReenvio, 'reenvio')
  ok('reenvio: 200 → aceito_pelo_provedor, 422 → recusado, e o log do chamado grava o mesmo', rf.length === 0, rf)

  const telas = (tl, dt) => {
    const f = []
    if (!/textoDoDesfecho\(d\.desfecho as DesfechoDoAviso/.test(tl)) f.push('timeline-sem-helper')
    if (/Sem desfecho registrado|Aceito pelo provedor/.test(tl)) f.push('timeline-traduz-sozinha')
    if (!/setReenvio\(textoDoDesfecho\(j\?\.data\?\.desfecho\)\)/.test(dt)) f.push('reenvio-sem-helper')
    if (/'enviado'|Aceito pelo provedor|Sem desfecho registrado/.test(dt)) f.push('reenvio-traduz-sozinho')
    return f
  }
  ok('as duas telas usam o helper, sem tradução própria', telas(TIMELINE, DETALHES).length === 0, telas(TIMELINE, DETALHES))

  const mutsHelper = [
    ['recusado lido como aceito', "if (etapa === 'recusado') return `Recusado pelo provedor (HTTP ${http})${fim}`", ''],
    ['legado 422 lido como aceito', 'st != null && st >= 300) return', 'false) return'],
    ['legado: tudo abaixo de 300 é aceito (inclui 0 e 1xx)', 'st != null && st >= 200 && st < 300', 'st != null && st < 300'],
    ['legado: 1xx é aceito', 'st >= 200 && st < 300', 'st >= 100 && st < 300'],
    ['legado: 300 não é recusado', 'st != null && st >= 300', 'st != null && st > 300'],
    ['legado sem status lido como aceito', "return `Registrado como enviado, sem resposta do provedor no registro${fim}`", "return `Aceito pelo provedor (HTTP ${http})${fim}`"],
    ['legado sem status lido como recusado', "return `Registrado como enviado, sem resposta do provedor no registro${fim}`", "return `Recusado pelo provedor (HTTP ${http})${fim}`"],
    ['grupo cai em sem desfecho', "if (etapa === 'grupo') return `Não enviado: conversa de grupo${fim}`", ''],
    ['aceito cai em sem desfecho', "if (etapa === 'aceito_pelo_provedor') return `Aceito pelo provedor (HTTP ${http})${fim}`", ''],
    ['afirma entrega', "`Aceito pelo provedor (HTTP ${http})${fim}`\n  if (etapa === 'enviado')", "`Entregue ao cliente (HTTP ${http})${fim}`\n  if (etapa === 'enviado')"],
    ['sem destino', 'const fim = destino ?', 'const fim = false ?'],
  ]
  for (const [nome, de, para] of mutsHelper) {
    if (HELPER_SRC.split(de).length - 1 !== 1) { ok(`mutação "${nome}" aplica exatamente uma vez`, false, 'âncora'); continue }
    let fm
    try { fm = bateriaHelper(carregar(HELPER_SRC.replace(de, () => para), 'mut')) } catch (e) { fm = ['erro: ' + e.message] }
    ok(`mutação "${nome}" é pega (${fm.slice(0, 1).join('')})`, fm.length > 0, 'sobreviveu')
  }
  const mutsServidor = [
    ['manual: volta a gravar enviado sempre', 'site', 'if (_st !== null && _st >= 200 && _st < 300) desfecho.etapa = "aceito_pelo_provedor";', 'desfecho.etapa = "enviado"; if (false) 1;'],
    ['manual: tudo vira recusado', 'site', 'if (_st !== null && _st >= 200 && _st < 300) desfecho.etapa = "aceito_pelo_provedor";', 'if (false) desfecho.etapa = "aceito_pelo_provedor";'],
    ['manual: limite errado (>= 200)', 'site', '_st >= 200 && _st < 300', '_st >= 200 && _st < 200'],
    ['manual: 0 e 1xx viram aceito', 'site', '_st >= 200 && _st < 300', '_st < 300'],
    ['reenvio: 0 e 1xx viram aceito', 'reenvio', '_st >= 200 && _st < 300', '_st < 300'],
    ['manual: 0 e 1xx viram recusado', 'site', 'else if (_st !== null && _st >= 300)', 'else if (_st !== null && _st >= 0)'],
    ['manual: sem resposta vira recusado', 'site', 'else if (_st !== null && _st >= 300) desfecho.etapa = "recusado";', 'else if (true) desfecho.etapa = "recusado";'],
    ['reenvio: sem resposta vira recusado', 'reenvio', 'else if (_st !== null && _st >= 300) desfecho.etapa = "recusado";', 'else if (true) desfecho.etapa = "recusado";'],
    ['reenvio: volta a gravar enviado sempre', 'reenvio', 'if (_st !== null && _st >= 200 && _st < 300) desfecho.etapa = "aceito_pelo_provedor";', 'desfecho.etapa = "enviado"; if (false) 1;'],
    ['reenvio: tudo vira aceito', 'reenvio', 'else if (_st !== null && _st >= 300) desfecho.etapa = "recusado";', 'else if (_st !== null && _st >= 300) desfecho.etapa = "aceito_pelo_provedor";'],
  ]
  for (const [nome, qual, de, para] of mutsServidor) {
    const base = qual === 'site' ? SITE : REENVIO
    if (base.split(de).length - 1 !== 1) { ok(`mutação "${nome}" aplica exatamente uma vez`, false, base.split(de).length - 1); continue }
    const orig = qual === 'site' ? ['site', rodarSite, 'manual'] : ['reenvio', rodarReenvio, 'reenvio']
    // roda a bateria com o código mutado trocando a fonte
    const mut = base.replace(de, () => para)
    const rodar = async (st) => {
      const c = compilar(mut); const w = mundoFetch(st)
      if (qual === 'site') {
        const d = await vm.runInContext('_avisarAberturaSite', c)({ fetch: w.fetch, secrets: { get: async () => 'tok' } }, { ticket_number: 'T', acomp_codigo: 'A', acomp_whatsapp: '5519993999446' })
        return { d, logs: [], w }
      }
      const logs = []
      const r = await c.module.exports.handler({
        params: { id: 't1' }, headers: {}, query: {}, user: { id: 'u1' }, secrets: { get: async () => 'tok' }, fetch: w.fetch, reply: reply(), body: {},
        models: { Profile: { findById: async () => ({ id: 'u1', role: 'support' }) }, Ticket: { findById: async () => ({ id: 't1', ticket_number: 'T', acomp_codigo: 'A', acomp_whatsapp: '5519993999446' }) }, ActivityLog: { create: async (l) => { logs.push(l); return l } } },
      })
      return { r, logs, d: r.body && r.body.data && r.body.data.desfecho }
    }
    let fm
    try { fm = await bateriaServidor(rodar, orig[2]) } catch (e) { ok(`mutação "${nome}" reprova por asserção, não por erro`, false, String(e)); continue }
    ok(`mutação "${nome}" é pega (${fm.slice(0, 1).join('')})`, fm.length > 0, 'sobreviveu')
  }
  const mutsTelas = [
    ['timeline traduz sozinha', TIMELINE.replace('return textoDoDesfecho(d.desfecho as DesfechoDoAviso, typeof d.destino === \'string\' ? d.destino : null)', "return 'Sem desfecho registrado'"), DETALHES],
    ['reenvio traduz sozinho', TIMELINE, DETALHES.replace('setReenvio(textoDoDesfecho(j?.data?.desfecho))', "setReenvio(j?.data?.desfecho?.etapa === 'enviado' ? 'Aceito pelo provedor' : 'Sem desfecho registrado')")],
  ]
  for (const [nome, tl, dt] of mutsTelas) {
    if (tl === TIMELINE && dt === DETALHES) { ok(`mutação "${nome}" aplicou`, false, 'não mudou'); continue }
    const fm = telas(tl, dt)
    ok(`mutação "${nome}" é pega (${fm.slice(0, 1).join('')})`, fm.length > 0, 'sobreviveu')
  }
  fim()
})()
