// A conversa aberta (434) lê por PÁGINAS, e não por metades de `from_me`.
//
// O QUE VINHA ANTES: quando a primeira leitura vinha cheia (500), a rota lia mais
// duas vezes, uma por `from_me`, cada metade com o seu próprio teto de 500. Uma
// conversa DESBALANCEADA — muita mensagem de um lado, pouca do outro — perdia
// mensagem ABAIXO de mil e a resposta dizia `truncado: false`. Os testes não
// viam, porque toda a massa alternava quem falava.
//
// O QUE VEM AGORA: a segunda página (`offset: 500`), pela ordem da plataforma
// (mais recentes primeiro), só se a primeira vier cheia. O teto de páginas é 2:
// o MESMO teto de 1000 mensagens de antes, para não aumentar o payload do poll.
//
// ESTE PR NÃO FAZ conversa acima de 1000 voltar inteira. Ele conserta a perda
// SILENCIOSA abaixo do teto e faz o aviso dizer a verdade.
//
// O CONTROLE: o bloco de ANTES é reconstituído e rodado sobre a mesma massa, para
// mostrar que o cenário REPRODUZ o defeito. Sem ele, "o novo devolve tudo" não
// provaria nada.
//
// A camada é emulada (_camada.js), com a semântica que o teste de premissas
// confere contra Postgres real. O arquivo irmão `rota-434-paginas-real.test.mjs`
// (em packages/api) roda a rota sobre a camada de verdade.
//
// Roda com: node conversa-por-paginas.test.js
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
  return c.module.exports.handler
}

// ── o bloco de ANTES (metades por from_me), reconstituído como controle ──────
const BLOCO_ANTIGO = `  var all = [];
  var _via = "filtro";
  var _ultimaPaginaCheia = false;
  try { all = (await m.Msg.findMany({ conversation_id: id, mascararCampos: _MASCARAR_MIDIA })) || []; } catch (e) { all = []; }
  if (all.length >= 500) {
    var _unidas = {};
    for (var _u = 0; _u < all.length; _u++) _unidas[String(all[_u].id)] = all[_u];
    var _lados = [true, false];
    for (var _l = 0; _l < _lados.length; _l++) {
      try {
        var _parte = (await m.Msg.findMany({ conversation_id: id, from_me: _lados[_l], mascararCampos: _MASCARAR_MIDIA })) || [];
        for (var _p = 0; _p < _parte.length; _p++) _unidas[String(_parte[_p].id)] = _parte[_p];
      } catch (e) {}
    }
    var _juntas = [];
    for (var _k in _unidas) _juntas.push(_unidas[_k]);
    if (_juntas.length > all.length) { all = _juntas; _via = "filtro+lados"; }
  }
`
// No controle, o \`truncado\` de antes: só varredura no teto ou 1000+ pelas metades.
const TRUNCADO_ANTIGO = `truncado: (_via === "varredura" && _lidas >= 500) || (_via === "filtro+lados" && _lidas >= 1000),`

const cod = codigoDe('434 whatsapp GET /whatsapp/:id/messages')
const INI = '  // Quantas páginas de 500 a rota lê por conversa'
const FIM = '  if (!all.length) {\n    // O campo pode ter outro nome no banco'
const a = cod.indexOf(INI), b = cod.indexOf(FIM)
const blocoNovoOk = a >= 0 && b > a
let codAntigo = null
let truncadoAntigoSubstituido = false
if (blocoNovoOk) {
  codAntigo = cod.slice(0, a) + BLOCO_ANTIGO + cod.slice(b)
  const t = codAntigo.match(/truncado: \(_via === "varredura" && _lidas >= 500\) \|\| _ultimaPaginaCheia,/)
  if (t) codAntigo = codAntigo.replace(t[0], () => TRUNCADO_ANTIGO)
  truncadoAntigoSubstituido = !!t
}
const NOVO = compilar(cod)
const ANTIGO = codAntigo ? compilar(codAntigo) : null

// ── massa: conversa com `nCliente` do cliente e `nNos` nossas, espalhadas ───
function conversa(nCliente, nNos) {
  const total = nCliente + nNos
  const nossas = new Set()
  const passo = total / Math.max(1, nNos)
  for (let k = 0; k < nNos; k++) nossas.add(Math.min(total - 1, Math.floor(k * passo)))
  return Array.from({ length: total }, (_, i) => ({
    id: 'm' + i, conversation_id: 'c1', from_me: nossas.has(i), body: 'mensagem ' + i,
    timestamp: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
  }))
}
const proporcao = (msgs) => {
  const nos = msgs.filter((m) => m.from_me).length
  return { nos, cliente: msgs.length - nos }
}

function mundo(todas, { falhaNaPagina = null, insereAposPrimeira = null } = {}) {
  const w = { leituras: [] }
  const conv = { id: 'c1', remote_jid: '5519999990000@s.whatsapp.net', created_at: '2026-01-01T00:00:00Z' }
  let chamada = 0
  w.ctx = () => ({
    params: { id: 'c1' }, query: {}, body: {}, headers: {}, user: { id: 'u1' },
    models: {
      WhatsAppMessage: {
        findMany: async (arg) => {
          chamada++
          const filtro = arg || {}
          if (falhaNaPagina && filtro.offset === falhaNaPagina) throw new Error('falha de leitura')
          const r = camadaFindMany(todas, filtro)
          w.leituras.push({ filtro: JSON.parse(JSON.stringify(filtro)), devolveu: r.length })
          // inserção de mensagem nova ENTRE as duas leituras (desloca os offsets)
          if (insereAposPrimeira && chamada === 1) todas.push(insereAposPrimeira)
          return r
        },
      },
      WhatsAppConversation: { findById: async () => ({ ...conv }), findMany: async () => [conv] },
      Profile: { findMany: async () => [], findById: async () => ({ id: 'u1', role: 'admin' }) },
      Sessao: { findById: async () => null },
      WaConversationEvents: { findMany: async () => [], create: async () => ({}) },
    },
    reply: reply(),
  })
  return w
}
const dados = (r) => (r.body && r.body.data) || []
const hist = (r) => (r.body && r.body.historico) || {}
const ids = (r) => dados(r).map((m) => m.id)

;(async () => {
  ok('o bloco novo (páginas) foi localizado no handler, e o de antes pôde ser reconstituído',
    blocoNovoOk && !!ANTIGO, { INI: a, FIM: b })
  ok('o controle usa o `truncado` de ANTES (a substituição aconteceu)', truncadoAntigoSubstituido && codAntigo.includes(TRUNCADO_ANTIGO), truncadoAntigoSubstituido)
  ok('o teto de páginas é uma constante nomeada, hoje 2 (o mesmo teto de 1000 de antes)',
    /var _TETO_PAGINAS = 2;/.test(cod) && /var _TAM_PAGINA = 500;/.test(cod), 'constantes ausentes ou alteradas')

  // ═══ 1. O CENTRAL: conversas DESBALANCEADAS, o que vinha antes × o que vem agora ═══
  for (const [nC, nN] of [[700, 100], [900, 50]]) {
    const total = nC + nN
    const msgs = conversa(nC, nN)
    const { nos, cliente } = proporcao(msgs)
    const wa = mundo(msgs.slice()), wn = mundo(msgs.slice())
    const ra = await ANTIGO(wa.ctx())
    const rn = await NOVO(wn.ctx())
    ok(`massa ${nC}/${nN}: é de fato DESBALANCEADA e cabe nas duas páginas (${cliente} do cliente, ${nos} nossas, ${total} no total)`,
      nos > 0 && cliente / nos >= 3 && total > 500 && total <= 1000, { nos, cliente, total })
    ok(`CONTROLE ${nC}/${nN} — o código de ANTES perdia mensagem e dizia que estava completo`,
      ids(ra).length < total && hist(ra).truncado === false, { devolveu: ids(ra).length, de: total, truncado: hist(ra).truncado })
    ok(`${nC}/${nN} — AGORA vem INTEIRA (${total} de ${total})`, ids(rn).length === total && new Set(ids(rn)).size === total, ids(rn).length)
    ok(`${nC}/${nN} — e sem acusar truncamento, porque coube`, hist(rn).truncado === false, hist(rn))
    const esperados = new Set(msgs.map((m) => m.id))
    ok(`${nC}/${nN} — são exatamente as mensagens da conversa (nenhuma faltando, nenhuma a mais)`,
      ids(rn).every((i) => esperados.has(i)) && ids(rn).length === esperados.size, 'conjunto diferente')
  }

  // ═══ 2. acima do teto: as 1000 MAIS RECENTES, contíguas, e DIZ que faltou ═══
  {
    const msgs = conversa(1500, 100)       // 1600
    const wa = mundo(msgs.slice()), wn = mundo(msgs.slice())
    const ra = await ANTIGO(wa.ctx())
    const rn = await NOVO(wn.ctx())
    ok('CONTROLE 1500/100 — o código de ANTES devolvia só ~600 e dizia que estava completo',
      ids(ra).length < 700 && hist(ra).truncado === false, { devolveu: ids(ra).length, truncado: hist(ra).truncado })
    ok('1500/100 — AGORA devolve 1000 (o teto de antes)', ids(rn).length === 1000, ids(rn).length)
    const esperadas = msgs.slice(-1000).map((m) => m.id)
    ok('  são as 1000 MAIS RECENTES, contíguas (sem buracos por quem falou)', JSON.stringify(ids(rn)) === JSON.stringify(esperadas),
      { primeiro: ids(rn)[0], ultimo: ids(rn)[ids(rn).length - 1] })
    ok('  e ACUSA que truncou', hist(rn).truncado === true, hist(rn))
  }

  // ═══ 3. o GATILHO: página seguinte só se a primeira vier cheia ═══
  for (const [n, leituras, truncado] of [[12, 1, false], [300, 1, false], [499, 1, false], [500, 2, false], [501, 2, false]]) {
    const w = mundo(conversa(n - Math.floor(n / 4), Math.floor(n / 4)))
    const r = await NOVO(w.ctx())
    const comConversa = w.leituras.filter((l) => l.filtro.conversation_id === 'c1')
    ok(`conversa de ${n}: ${leituras} leitura(s) por conversa, truncado=${truncado}`,
      comConversa.length === leituras && ids(r).length === n && hist(r).truncado === truncado,
      { leituras: comConversa.length, devolveu: ids(r).length, truncado: hist(r).truncado })
  }

  // ═══ 4. o TETO: nunca uma terceira leitura ═══
  {
    const w = mundo(conversa(4000, 1000))  // 5000
    const r = await NOVO(w.ctx())
    const lidas = w.leituras.filter((l) => l.filtro.conversation_id === 'c1')
    ok('conversa de 5000: exatamente 2 leituras (o teto), nenhuma de offset 1000', lidas.length === 2 && !lidas.some((l) => l.filtro.offset >= 1000), lidas.map((l) => l.filtro.offset))
    ok('  devolve 1000 e ACUSA que truncou', ids(r).length === 1000 && hist(r).truncado === true, { n: ids(r).length, t: hist(r).truncado })
  }

  // ═══ 5. uma página que FALHA não vira "completo" ═══
  {
    const w = mundo(conversa(700, 100), { falhaNaPagina: 500 })
    const r = await NOVO(w.ctx())
    ok('a segunda página falha: devolve a primeira (500) e ACUSA que é parcial', r.status === 200 && ids(r).length === 500 && hist(r).truncado === true,
      { n: ids(r).length, t: hist(r).truncado })
  }

  // ═══ 6. inserção ENTRE as duas leituras: duplicata absorvida, nada perdido ═══
  {
    const base = conversa(600, 100)        // 700
    const nova = { id: 'nova', conversation_id: 'c1', from_me: false, body: 'chegou no meio', timestamp: new Date(Date.UTC(2026, 0, 2)).toISOString() }
    const w = mundo(base.slice(), { insereAposPrimeira: nova })
    const r = await NOVO(w.ctx())
    const i = ids(r)
    ok('mensagem nova chegando entre as páginas: nenhuma duplicata', i.length === new Set(i).size, i.length - new Set(i).size)
    ok('  e nenhuma das 700 originais se perde', base.every((m) => i.includes(m.id)), base.filter((m) => !i.includes(m.id)).length)
  }

  // ═══ 7. TRAVA DE MASSA: o que a camada devolveu (não só o resultado) ═══
  // "Idêntico" e "inteiro" só significam algo se a massa EXERCITOU os ramos: uma
  // primeira página CHEIA, uma segunda parcial, conversa desbalanceada, e uma
  // conversa que bate no teto com a última página cheia.
  {
    const w1 = mundo(conversa(700, 100))
    await NOVO(w1.ctx())
    const p1 = w1.leituras.filter((l) => l.filtro.conversation_id === 'c1').map((l) => l.devolveu)
    ok('TRAVA DE MASSA — 700/100: a primeira página veio CHEIA (500) e a segunda PARCIAL (300)', JSON.stringify(p1) === JSON.stringify([500, 300]), p1)
    const w2 = mundo(conversa(1500, 100))
    await NOVO(w2.ctx())
    const p2 = w2.leituras.filter((l) => l.filtro.conversation_id === 'c1').map((l) => l.devolveu)
    ok('TRAVA DE MASSA — 1500/100: as DUAS páginas vieram cheias (o teto foi atingido de verdade)', JSON.stringify(p2) === JSON.stringify([500, 500]), p2)
    const desb = proporcao(conversa(900, 50))
    ok('TRAVA DE MASSA — existe conversa desbalanceada de pelo menos 10:1 na massa', desb.nos > 0 && desb.cliente / desb.nos >= 10, desb)
  }

  fim()
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(1) })
