// Ao abrir a conversa (434), o portal avisa o WhatsApp que as mensagens do
// cliente foram lidas (`markreadMessage`), no máximo as 30 mais recentes.
//
// O QUE SE GARANTE: as 30 que o WhatsApp recebe são as 30 MAIS RECENTES
// recebidas, qualquer que seja a ordem em que a plataforma entrega a lista
// (mais novas primeiro; ou união de páginas). Mensagens nossas, ids `local_`/`in_`
// e ids ausentes não entram; no máximo 5 remetentes, ids agrupados por remetente.
//
// O CONTROLE: o bloco de ANTES (contar a partir do fim da lista, sem ordenar) é
// reconstituído e rodado sobre a mesma massa, para mostrar que o cenário
// REPRODUZ o defeito (marca as mais antigas).
// As MUTAÇÕES provam que cada asserção morre por asserção, e cada mutação
// se aplica exatamente uma vez.
//
// Roda com: node marcar-lida-as-mais-novas.test.js
const fs = require('fs')
const vm = require('vm')
const { reply, ok, fim, ARQ } = require('./_carregar.js')
const { camadaFindMany } = require('./_camada.js')

const MARCA = '434 whatsapp GET /whatsapp/:id/messages'
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
const ordenacao = /    var _instante = function[\s\S]*?\.map\(function \(e\) \{ return e\.mm; \}\);\n/
const CABECA = '    var recebidas = [];\n    for (var i = porCarimbo.length - 1; i >= 0 && recebidas.length < 30; i--) {\n      var x = porCarimbo[i];\n'
// ANTES: sem ordenar, do fim da lista como veio
const ANTIGO = NOVO.replace(ordenacao, '').replace(CABECA, '    var recebidas = [];\n    for (var i = todas.length - 1; i >= 0 && recebidas.length < 30; i--) {\n      var x = todas[i];\n')

const ts = (n) => new Date(Date.UTC(2026, 0, 1, 0, 0, n)).toISOString()
const JID = '5519999990001@s.whatsapp.net'
const conv = { id: 'c1', remote_jid: JID, created_at: ts(0), unread_count: 5 }

async function rodar(codigo, linhasEmCriacao, { token = 'tok', convX = conv } = {}) {
  const enviados = []
  const devolvidos = []
  const h = compilar(codigo)
  const r = await h({ params: { id: 'c1' }, query: {}, body: {}, headers: {}, user: { id: 'u1' },
    secrets: { get: async () => token },
    fetch: async (url, init) => { enviados.push({ url, ...JSON.parse(init.body) }); return { status: 200, body: '{}' } },
    models: {
      WhatsAppMessage: { findMany: async (a) => { const r = camadaFindMany(linhasEmCriacao, a); devolvidos.push({ ref: r, antes: r.map((x) => x.id) }); return r } },
      WhatsAppConversation: { findById: async () => ({ ...convX }), findMany: async () => [convX], update: async () => ({}) },
      Profile: { findMany: async () => [], findById: async () => ({ id: 'u1', role: 'admin' }) }, Sessao: { findById: async () => null },
      SystemSettings: { findMany: async () => [] }, CompanyContact: { findMany: async () => [] },
      WaConversationEvents: { findMany: async () => [], create: async () => ({}) },
    },
    reply: reply() })
  await new Promise((res) => setTimeout(res, 40))
  return { r, enviados, ids: enviados.flatMap((e) => e.id), devolvidos }
}
const num = (ids) => ids.map((x) => Number(String(x).replace('WAID', '')))
const intervalo = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i)
const msg = (i, extra) => ({ id: 'm' + i, conversation_id: 'c1', from_me: false, message_id: 'WAID' + i, sender_jid: JID, body: 'x', timestamp: ts(i), ...extra })

;(async () => {
  ok('as âncoras do controle existem exatamente uma vez', ordenacao.test(NOVO) && NOVO.includes(CABECA) && ANTIGO !== NOVO && !ANTIGO.includes('porCarimbo'), 'âncora')

  // 1) 80 recebidas: as 30 mais novas (50..79)
  const oitenta = Array.from({ length: 80 }, (_, i) => msg(i))
  const novo = await rodar(NOVO, oitenta)
  ok('a rota responde 200', novo.r.status === 200, novo.r.status)
  ok('TRAVA: o caminho aconteceu (houve chamada ao markreadMessage com 30 ids)', novo.enviados.length === 1 && novo.ids.length === 30 && novo.enviados[0].url.endsWith('/actions/markreadMessage'), novo.enviados.length)
  ok('marca as 30 MAIS NOVAS (WAID50..79)', JSON.stringify(num(novo.ids).sort((a, b) => a - b)) === JSON.stringify(intervalo(50, 79)), num(novo.ids))
  const antigo = await rodar(ANTIGO, oitenta)
  ok('CONTROLE: o bloco de antes marca as 30 mais ANTIGAS (WAID0..29) na mesma massa', JSON.stringify(num(antigo.ids).sort((a, b) => a - b)) === JSON.stringify(intervalo(0, 29)), num(antigo.ids))

  // 1b) a ordenação é de uma CÓPIA: nem a resposta da 434 nem a lista lida mudam de ordem
  ok('TRAVA: a rota leu mensagens (há lista capturada com 80 linhas)', novo.devolvidos.length >= 1 && novo.devolvidos[0].antes.length === 80, novo.devolvidos.length)
  ok('a lista que a rota leu continua na ordem original depois da marcação', novo.devolvidos.every((d) => JSON.stringify(d.ref.map((x) => x.id)) === JSON.stringify(d.antes)), 'lista reordenada')
  ok('a resposta da 434 é IDÊNTICA com e sem o bloco novo', JSON.stringify(novo.r.body) === JSON.stringify(antigo.r.body) && novo.r.body.data.length === 80, 'divergiu')

  // 2) a ordem da lista não importa: a plataforma entrega newest-first, mas a mesma massa embaralhada dá o mesmo
  const embaralhada = oitenta.filter((_, i) => i % 2 === 0).concat(oitenta.filter((_, i) => i % 2 === 1))
  const emb = await rodar(NOVO, embaralhada)
  ok('mesma resposta com a massa criada em outra ordem', JSON.stringify(num(emb.ids).sort((a, b) => a - b)) === JSON.stringify(intervalo(50, 79)), num(emb.ids))

  // 3) pulos: from_me, local_, in_, sem message_id; entre as recebidas válidas contam só as 30 mais novas
  const mistas = []
  for (let i = 0; i < 40; i++) mistas.push(msg(i))
  mistas.push(msg(40, { from_me: true }), msg(41, { message_id: 'local_41' }), msg(42, { message_id: 'in_42' }), msg(43, { message_id: '' }))
  const mi = await rodar(NOVO, mistas)
  ok('pula nossas, local_, in_ e sem id: as 30 válidas mais novas são WAID10..39', JSON.stringify(num(mi.ids).sort((a, b) => a - b)) === JSON.stringify(intervalo(10, 39)), mi.ids)
  ok('nenhum id inválido foi enviado', mi.ids.every((x) => /^WAID\d+$/.test(x)) && !mi.ids.includes('WAID40'), mi.ids)

  // 4) sem carimbo `timestamp`: usa created_at
  // criada em ordem DESCENDENTE de data: só o created_at diz quem é mais novo (a ordem da lista não ajuda)
  const semTs = Array.from({ length: 40 }, (_, i) => ({ ...msg(39 - i), timestamp: undefined, created_at: ts(39 - i) }))
  const sc = await rodar(NOVO, semTs)
  ok('sem `timestamp`, ordena por created_at: WAID10..39', JSON.stringify(num(sc.ids).sort((a, b) => a - b)) === JSON.stringify(intervalo(10, 39)), num(sc.ids))

  // 4b) carimbos de formatos DIFERENTES na mesma conversa: ISO, época em ms, época em s (número e texto)
  const formato = [
    (i) => ts(i), (i) => Date.UTC(2026, 0, 1, 0, 0, i), (i) => String(Date.UTC(2026, 0, 1, 0, 0, i) / 1000), (i) => Date.UTC(2026, 0, 1, 0, 0, i) / 1000,
  ]
  const soIso = Array.from({ length: 40 }, (_, i) => msg(i))
  const misto = Array.from({ length: 40 }, (_, i) => msg(i, { timestamp: formato[i % 4](i) }))
  const si = await rodar(NOVO, soIso)
  ok('massa só com ISO: WAID10..39', JSON.stringify(num(si.ids).sort((a, b) => a - b)) === JSON.stringify(intervalo(10, 39)), num(si.ids))
  const mx = await rodar(NOVO, misto)
  ok('TRAVA: a chamada aconteceu com 30 ids na massa mista', mx.ids.length === 30, mx.ids.length)
  ok('massa MISTA (ISO, época ms, época s): WAID10..39', JSON.stringify(num(mx.ids).sort((a, b) => a - b)) === JSON.stringify(intervalo(10, 39)), num(mx.ids))
  const comTexto = await rodar(NOVO.replace(/    var porCarimbo = todas\.map[\s\S]*?\.map\(function \(e\) \{ return e\.mm; \}\);\n/, "    var porCarimbo = todas.slice().sort(function (a, b) { return String(a.timestamp || a.created_at || '').localeCompare(String(b.timestamp || b.created_at || '')); });\n"), misto)
  ok('CONTROLE: comparar por texto cru erra a massa mista', JSON.stringify(num(comTexto.ids).sort((a, b) => a - b)) !== JSON.stringify(intervalo(10, 39)), num(comTexto.ids))

  // 4c) mensagem sem NENHUM carimbo: não derruba a rota e não passa à frente de quem tem data
  const semCarimbo = soIso.concat([100, 101, 102].map((i) => msg(i, { timestamp: undefined, created_at: undefined })))
  const sn = await rodar(NOVO, semCarimbo)
  ok('sem carimbo: rota 200 e chamada aconteceu', sn.r.status === 200 && sn.ids.length === 30, [sn.r.status, sn.ids.length])
  ok('sem carimbo: nenhuma sem data entra à frente das 30 datadas (WAID10..39)', JSON.stringify(num(sn.ids).sort((a, b) => a - b)) === JSON.stringify(intervalo(10, 39)), num(sn.ids))
  const soSem = await rodar(NOVO, [0, 1, 2].map((i) => msg(i, { timestamp: undefined })))
  ok('só mensagens sem carimbo: não derruba, marca as 3', soSem.r.status === 200 && soSem.ids.length === 3, [soSem.r.status, soSem.ids.length])

  // 5) remetentes: grupo com 7 participantes -> no máximo 5 chamadas, cada uma com os ids do remetente
  const grupo = Array.from({ length: 28 }, (_, i) => msg(i, { sender_jid: '55199999000' + (i % 7) + '@s.whatsapp.net' }))
  const g = await rodar(NOVO, grupo, { convX: { ...conv, remote_jid: '120363000@g.us' } })
  ok('grupo: no máximo 5 remetentes', g.enviados.length === 5, g.enviados.length)
  ok('cada chamada leva só ids do seu remetente', g.enviados.every((e) => e.id.every((x) => (Number(x.slice(4)) % 7) === Number(e.sender.slice(11, 12)))), g.enviados)

  // 6) sem token / sem recebidas: não chama
  const st = await rodar(NOVO, oitenta, { token: '' })
  ok('sem token, não chama o WhatsApp', st.enviados.length === 0, st.enviados.length)
  const so = await rodar(NOVO, oitenta.map((m) => ({ ...m, from_me: true })))
  ok('só mensagens nossas: não chama', so.enviados.length === 0, so.enviados.length)

  // ── mutações: cada uma se aplica uma vez e morre por asserção ──
  const muts = [
    ['sem ordenar (usa a lista como veio)', '      .sort(function (a, b) { return a.t < b.t ? -1 : a.t > b.t ? 1 : b.pos - a.pos; })\n', '', null],
    ['ordem invertida (marca as mais antigas)', 'a.t < b.t ? -1 : a.t > b.t ? 1 :', 'a.t < b.t ? 1 : a.t > b.t ? -1 :', null],
    ['sem fallback a created_at', 'mm.timestamp || mm.created_at || mm.createdAt', 'mm.timestamp || mm.createdAt', null],
    ['volta à comparação de TEXTO', 'return a.t < b.t ? -1 : a.t > b.t ? 1 : b.pos - a.pos;', "return String(a.mm.timestamp || a.mm.created_at || '').localeCompare(String(b.mm.timestamp || b.mm.created_at || ''));", null],
    ['época em segundos sem escalar', 'return n < 1e11 ? n * 1000 : n;', 'return n;', null],
    ['ordena o ORIGINAL em vez da cópia', '    var porCarimbo = todas.map(', '    todas.sort(function (a, b) { return _instante(a) - _instante(b) });\n    var porCarimbo = todas.map(', null],
    ['sem carimbo vale +Infinity (passa à frente)', 'if (v == null || v === "") return -Infinity;', 'if (v == null || v === "") return Infinity;', null],
    ['teto 30 -> 60', 'recebidas.length < 30; i--) {\n      var x = porCarimbo[i];', 'recebidas.length < 60; i--) {\n      var x = porCarimbo[i];', null],
    ['aceita mensagem nossa', '=== true) continue;\n      var mid', '=== 12345) continue;\n      var mid', null],
    ['aceita local_', 'mid.indexOf("local_") === 0 ||', 'false ||', null],
    ['5 remetentes -> 9', '.slice(0, 5)', '.slice(0, 9)', null],
  ]
  async function bateria(codigo) {
    const falhas = []
    const o = await rodar(codigo, oitenta); if (!o.devolvidos.every((d) => JSON.stringify(d.ref.map((x) => x.id)) === JSON.stringify(d.antes))) falhas.push('original')
    const a = await rodar(codigo, oitenta); if (JSON.stringify(num(a.ids).sort((x, y) => x - y)) !== JSON.stringify(intervalo(50, 79))) falhas.push('oitenta')
    const b = await rodar(codigo, mistas); if (JSON.stringify(num(b.ids).sort((x, y) => x - y)) !== JSON.stringify(intervalo(10, 39))) falhas.push('mistas')
    const m1 = await rodar(codigo, misto); if (JSON.stringify(num(m1.ids).sort((x, y) => x - y)) !== JSON.stringify(intervalo(10, 39))) falhas.push('misto')
    const m2 = await rodar(codigo, semCarimbo); if (JSON.stringify(num(m2.ids).sort((x, y) => x - y)) !== JSON.stringify(intervalo(10, 39))) falhas.push('semCarimbo')
    const c = await rodar(codigo, semTs); if (JSON.stringify(num(c.ids).sort((x, y) => x - y)) !== JSON.stringify(intervalo(10, 39))) falhas.push('semTs')
    const d = await rodar(codigo, grupo, { convX: { ...conv, remote_jid: '120363000@g.us' } }); if (d.enviados.length !== 5) falhas.push('grupo')
    return falhas
  }
  ok('a bateria passa limpa no código novo', (await bateria(NOVO)).length === 0, await bateria(NOVO))
  for (const [nome, de, para] of muts) {
    const n = NOVO.split(de).length - 1
    if (n !== 1) { ok('mutação "' + nome + '" aplica exatamente uma vez', false, n); continue }
    let f
    try { f = await bateria(NOVO.replace(de, () => para)) } catch (e) { ok('mutação "' + nome + '" falha por asserção, não por erro de carga', false, String(e)); continue }
    ok('mutação "' + nome + '" é pega (' + f.join(',') + ')', f.length > 0, 'sobreviveu')
  }
  fim()
})()
