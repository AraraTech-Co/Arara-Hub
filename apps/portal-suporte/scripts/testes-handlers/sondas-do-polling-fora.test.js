// Duas sondas de diagnóstico saem de rotas que o portal consulta o tempo todo.
//
//   diag_historico   → 434 GET /whatsapp/:id/messages   (polling da conversa aberta)
//   diag_grupo_nome  → 432 GET /whatsapp                (lista de conversas)
//
// O que elas faziam: antes de decidir se ainda podiam gravar, liam a tabela de
// eventos SEM FILTRO (a camada devolve as 500 mais recentes) e contavam em
// memória. A leitura acontecia a cada chamada; só a gravação tinha teto.
//
// Agora a 434 e a lista não consultam a tabela de eventos. O que este teste
// prova, e o que NÃO prova:
//
//   PROVA  - as duas rotas fazem ZERO leituras e ZERO gravações em eventos;
//   PROVA  - a resposta é IDÊNTICA com e sem a sonda (a remoção não muda o que o
//            operador vê, inclusive a lacuna de histórico);
//   PROVA  - as sondas que ficam (diag_eco, diag_midia, diag_shape e a do nome de
//            grupo na entrada) continuam onde estavam;
//   PROVA  - o que já foi capturado segue legível pela 446;
//   NÃO PROVA nada sobre tempo: aqui a camada é emulada e não há banco. Quanto a
//            leitura custava no Postgres é outra medição, que não está neste
//            arquivo.
//
// Roda com: node sondas-do-polling-fora.test.js
const fs = require('fs')
const vm = require('vm')
const { carregarHandler, reply, ok, fim, ARQ } = require('./_carregar.js')

// ── carregar o código do handler como texto, para montar a variante de controle ──
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
    console, Date, JSON, String, Number, Object, Array, Math, Promise, parseInt,
    parseFloat, isNaN, isFinite, RegExp, Buffer, Error, TypeError,
    encodeURIComponent, decodeURIComponent, Intl, URL, URLSearchParams,
    setTimeout, clearTimeout, setInterval, clearInterval,
    module: { exports: {} },
  }
  c.exports = c.module.exports
  c.globalThis = c
  vm.createContext(c)
  vm.runInContext(codigo, c)
  return c
}

// Os blocos que saíram, reconstituídos com o mesmo comportamento (uma leitura
// sem filtro, uma contagem em memória, uma gravação) para servir de CONTROLE:
// sem eles o teste não teria como mostrar que enxerga a diferença.
const BLOCO_434 = `
  try {
    if (_hist.lacuna) {
      var _EvH = ctx.models.WaConversationEvents;
      if (_EvH) {
        var _jaH = ((await _EvH.findMany({})) || []).filter(function (e) { return e.kind === "diag_historico"; });
        var _repetida = _jaH.some(function (e) { return String(e.conversation_id) === String(id); });
        if (!_repetida && _jaH.length < 30) {
          await _EvH.create({ id: "dhis_x", conversation_id: String(id), kind: "diag_historico", payload: "{}", created_at: new Date().toISOString() });
        }
      }
    }
  } catch (e) {}
`
const BLOCO_432 = `
  try {
    var Ev = ctx.models.WaConversationEvents;
    if (Ev) {
      var quantos = ((await Ev.findMany({})) || []).filter(function (e) { return e.kind === "diag_grupo_nome"; }).length;
      if (quantos < 6) {
        await Ev.create({ id: "dgn_x", conversation_id: "diagnostico", kind: "diag_grupo_nome", payload: "{}", created_at: new Date().toISOString() });
      }
    }
  } catch (e) {}
`
const ANCORA_434 = '  // Abrir a conversa é o ato de LER: zera o não lido.'
const ANCORA_432 = '  return null;\n}\n// Roda SEM ser aguardada pela lista'

const cod434 = codigoDe('434 whatsapp GET /whatsapp/:id/messages')
const cod432 = codigoDe('432 whatsapp GET /whatsapp')
if (!cod434.includes(ANCORA_434)) throw new Error('âncora da 434 ausente')
if (!cod432.includes(ANCORA_432)) throw new Error('âncora da 432 ausente')

const H434_NOVO = compilar(cod434).module.exports.handler
const H434_CONTROLE = compilar(cod434.replace(ANCORA_434, () => BLOCO_434 + ANCORA_434)).module.exports.handler
const CTX432_NOVO = compilar(cod432)
const CTX432_CONTROLE = compilar(cod432.replace(ANCORA_432, () => BLOCO_432 + ANCORA_432))

// ── modelo de eventos que conta o que é feito com ele ───────────────────────
function eventos(iniciais = []) {
  const lista = [...iniciais]
  return {
    lista,
    leituras: 0,
    criadas: 0,
    findMany: async (f) => {
      eventos._ultimo.leituras++
      const campos = Object.keys(f || {})
      return lista.filter((e) => campos.every((k) => e[k] === f[k])).slice(0, 500)
    },
    create: async (e) => { eventos._ultimo.criadas++; lista.push(e); return e },
    delete: async () => ({ ok: true }),
  }
}
eventos._ultimo = null
function novoEv(iniciais) { const e = eventos(iniciais); eventos._ultimo = e; return e }

const HORA = 3600000
const iso = (ms) => new Date(ms).toISOString()
const AGORA = Date.now()

// ── 434: conversa com lacuna de histórico ───────────────────────────────────
function mundo434(ev) {
  const conv = { id: 'c1', created_at: iso(AGORA - 26 * HORA), unread_count: 0 }
  const mensagens = [{ id: 'm1', conversation_id: 'c1', timestamp: iso(AGORA - 3 * HORA), body: 'x', direction: 'inbound' }]
  const modelo = (l) => ({
    findById: async (id) => l.find((x) => x.id === id) || null,
    findMany: async (f) => (f && f.conversation_id ? l.filter((m) => m.conversation_id === f.conversation_id) : l),
    create: async (r) => { l.push(r); return r },
    update: async (id, p) => { const x = l.find((y) => y.id === id); Object.assign(x || {}, p); return x },
    delete: async () => {},
  })
  return {
    params: { id: 'c1' }, query: {}, headers: {}, user: { id: 'u1' },
    secrets: { get: async () => '' }, fetch: async () => ({ status: 200, body: '' }),
    models: {
      Sessao: { findById: async () => null },
      Profile: { findById: async () => ({ id: 'u1', role: 'support' }) },
      WhatsAppConversation: modelo([conv]),
      WhatsAppMessage: modelo(mensagens),
      WaConversationEvents: ev,
    },
    reply: reply(),
  }
}
const cheioDeOutros = () => Array.from({ length: 600 }, (_, i) => ({ id: 'o' + i, kind: 'webhook', conversation_id: 'x', created_at: iso(AGORA - i) }))

;(async () => {
  // 1. A 434 não consulta nem grava na tabela de eventos, com lacuna.
  {
    const ev = novoEv(cheioDeOutros())
    const r = await H434_NOVO(mundo434(ev))
    ok('434: responde 200 com a conversa em lacuna', r.status === 200 && r.body.historico && r.body.historico.lacuna === true, r)
    ok('434: zero leituras na tabela de eventos', ev.leituras === 0, ev.leituras)
    ok('434: zero gravações na tabela de eventos', ev.criadas === 0, ev.criadas)
    // Polling: chamadas seguidas continuam sem tocar na tabela.
    for (let i = 0; i < 5; i++) await H434_NOVO(mundo434(ev))
    ok('434: seis chamadas seguidas, ainda zero leituras', ev.leituras === 0, ev.leituras)
  }

  // 2. CONTROLE: com o bloco de volta, o teste enxerga a leitura.
  {
    const ev = novoEv(cheioDeOutros())
    await H434_CONTROLE(mundo434(ev))
    ok('controle 434: com o bloco antigo a leitura aparece (o teste enxerga a diferença)', ev.leituras >= 1, ev.leituras)
  }

  // 3. A resposta é IDÊNTICA com e sem a sonda.
  {
    const a = await H434_NOVO(mundo434(novoEv(cheioDeOutros())))
    const b = await H434_CONTROLE(mundo434(novoEv(cheioDeOutros())))
    ok('434: a resposta é idêntica com e sem a sonda (inclui a lacuna)', JSON.stringify(a) === JSON.stringify(b), { a, b })
    ok('434: e a resposta é real (200 com a mensagem)', a.status === 200 && a.body.data.length === 1, a)
  }

  // 4. A lista: o nome do grupo não consulta nem grava eventos.
  {
    const montar = (ev) => ({
      params: {}, query: {}, headers: {}, user: { id: 'u1' },
      secrets: { get: async () => 'tok' },
      fetch: async () => ({ status: 200, body: '{}' }),
      models: { WaConversationEvents: ev, WaConta: { findMany: async () => [], findById: async () => null }, Sessao: { findById: async () => null } },
      reply: reply(),
    })
    const evN = novoEv(cheioDeOutros())
    const nome = await CTX432_NOVO._nomeDoGrupoAvisa(montar(evN), '120363000000000001@g.us', 'default')
    ok('432: sem nome na Avisa devolve null, como sempre', nome === null, nome)
    ok('432: zero leituras na tabela de eventos', evN.leituras === 0, evN.leituras)
    ok('432: zero gravações na tabela de eventos', evN.criadas === 0, evN.criadas)

    const evC = novoEv(cheioDeOutros())
    const nomeC = await CTX432_CONTROLE._nomeDoGrupoAvisa(montar(evC), '120363000000000001@g.us', 'default')
    ok('controle 432: com o bloco antigo a leitura aparece (o teste enxerga a diferença)', evC.leituras >= 1, evC.leituras)
    ok('432: o resultado é o mesmo com e sem a sonda', nome === nomeC, { nome, nomeC })
  }

  // 5. As sondas que FICAM continuam onde estavam.
  {
    const dentro = (cod, k) => (cod.match(new RegExp(k, 'g')) || []).length
    const c485 = codigoDe('485 whatsapp POST /whatsapp/inbound')
    const c448 = codigoDe('448 whatsapp GET /whatsapp/diagnostico/midia')
    ok('485 mantém diag_eco', dentro(c485, 'diag_eco') === 3, dentro(c485, 'diag_eco'))
    ok('485 mantém diag_midia', dentro(c485, 'diag_midia') === 4, dentro(c485, 'diag_midia'))
    ok('485 mantém diag_shape', dentro(c485, 'diag_shape') === 1, dentro(c485, 'diag_shape'))
    ok('485 mantém a sonda do nome de grupo (a da entrada)', dentro(c485, 'diag_grupo_nome') === 4, dentro(c485, 'diag_grupo_nome'))
    ok('448 mantém a leitura de diag_eco e diag_midia', dentro(c448, 'diag_eco') === 3 && dentro(c448, 'diag_midia') === 1, [dentro(c448, 'diag_eco'), dentro(c448, 'diag_midia')])
    ok('as duas sondas removidas não existem mais em nenhuma rota',
      !cod434.includes('diag_historico') && !cod432.includes('diag_grupo_nome'), 0)
  }

  // 6. O que já foi capturado continua legível pela 446.
  {
    const h446 = carregarHandler('446 whatsapp GET /whatsapp/diagnostico/chegadas')
    const ev = novoEv([
      { id: 'a', kind: 'diag_historico', conversation_id: 'c1', created_at: iso(AGORA - 3000) },
      { id: 'b', kind: 'diag_historico', conversation_id: 'c2', created_at: iso(AGORA - 2000) },
      { id: 'c', kind: 'diag_grupo_nome', conversation_id: 'diagnostico', created_at: iso(AGORA - 1000) },
      { id: 'd', kind: 'diag_eco', conversation_id: 'c3', created_at: iso(AGORA) },
      { id: 'e', kind: 'webhook', conversation_id: 'c4', created_at: iso(AGORA) },
    ])
    const r = await h446({
      params: {}, query: {}, headers: {}, user: { id: 'u1' },
      secrets: { get: async () => '' }, fetch: async () => ({ status: 200, body: '' }),
      models: { WaConversationEvents: ev, Sessao: { findById: async () => null }, Profile: { findById: async () => ({ id: 'u1', role: 'admin' }) } },
      reply: reply(),
    })
    const d = r && r.body && r.body.data
    ok('446 responde 200', r && r.status === 200, r)
    ok('446 lista os registros de diag_historico já capturados', d && d.por_tipo && d.por_tipo.diag_historico === 2, d && d.por_tipo)
    ok('446 lista os de diag_grupo_nome já capturados', d && d.por_tipo && d.por_tipo.diag_grupo_nome === 1, d && d.por_tipo)
    ok('446 não mistura evento que não é de diagnóstico', d && d.total === 4, d && d.total)
  }
  fim()
})().catch((e) => { console.error(e); process.exit(1) })
