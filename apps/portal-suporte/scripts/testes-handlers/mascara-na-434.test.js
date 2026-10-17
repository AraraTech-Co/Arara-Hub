// A conversa aberta (434) deixa de trazer o anexo do banco.
//
// A rota lê as mensagens da conversa a cada poucos segundos, por atendente, e
// cada mensagem com anexo carrega o arquivo em base64 (megabytes). A rota só
// pergunta "tem anexo?" — `media_ref: m.media_data ? m.id : null`, em
// serializeMsg, por verdade/falsidade. As três leituras de mensagens da rota
// agora pedem `mascararCampos: ["media_data"]`: a camada devolve "1" onde o valor
// é verdadeiro e deixa como está o que é falso (a correção da máscara, #77).
//
// O que este teste prova:
//   - a resposta da rota é IDÊNTICA, byte a byte, com e sem o mascaramento
//     (código de antes reinserido como referência), inclusive nos valores que
//     decidem a existência do anexo: `""`, `0`, `false` (sem clipe) e as strings
//     "0" e "false" (com clipe, porque são verdadeiras em JS);
//   - TODAS as leituras de mensagens da rota pedem o mascaramento: a leitura por
//     conversa, as duas metades por `from_me` (conversa acima de 500) e a
//     reserva sem filtro;
//   - o conteúdo do anexo continua saindo INTEIRO pela rota de mídia (490d),
//     que lê por id, e ela não usa o mascaramento;
//   - o mascaramento só existe na 434.
//
// O mascaramento aqui é EMULADO com a mesma regra que o teste da camada provou
// contra Postgres de verdade (mascarar-campos.test.mjs, #77). Este arquivo prova
// que a ROTA lida bem com ele, não que a camada o implementa.
//
// Roda com: node mascara-na-434.test.js
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

// ── a rota nova e a de ANTES (o mesmo código sem o pedido de mascaramento) ───
const cod = codigoDe('434 whatsapp GET /whatsapp/:id/messages')
const PEDIDOS = [
  ['{ conversation_id: id, mascararCampos: _MASCARAR_MIDIA }', '{ conversation_id: id }'],
  ['{ conversation_id: id, limit: _TAM_PAGINA, offset: _pg * _TAM_PAGINA, mascararCampos: _MASCARAR_MIDIA }', '{ conversation_id: id, limit: _TAM_PAGINA, offset: _pg * _TAM_PAGINA }'],
  ['findMany({ mascararCampos: _MASCARAR_MIDIA })', 'findMany({})'],
]
// A AUSÊNCIA de um pedido vira asserção (abaixo), e não exceção ao carregar:
// uma exceção derrubaria o arquivo antes de qualquer afirmação rodar e esconderia
// quais delas acusariam o defeito.
const pedidosAusentes = []
let codAntigo = cod
for (const [novo, antigo] of PEDIDOS) {
  if (!codAntigo.includes(novo)) { pedidosAusentes.push(novo); continue }
  codAntigo = codAntigo.replace(novo, () => antigo)
}
const NOVO = compilar(cod)
const ANTIGO = compilar(codAntigo)

// ── massa ───────────────────────────────────────────────────────────────────
const GRANDE = 'data:image/jpeg;base64,' + 'A'.repeat(50_000)
const iso = (i) => new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString()
const msg = (i, extra) => ({
  id: 'm' + i, conversation_id: 'c1', from_me: i % 2 === 0,
  message_id: 'WAID' + i, sender_jid: i % 2 ? '5519999990001@s.whatsapp.net' : '', sender_name: i % 2 ? 'Cliente' : 'Atendente',
  body: 'mensagem ' + i, timestamp: iso(i), ...extra,
})
// Cada forma de valor de media_data que decide se a bolha mostra o clipe.
const FORMAS = [
  ['anexo de imagem', { media_data: GRANDE, media_type: 'image' }, true],
  ['anexo de documento', { media_data: GRANDE, media_type: 'document', media_name: 'a.pdf' }, true],
  ['anexo de áudio', { media_data: GRANDE, media_type: 'audio' }, true],
  ['texto simples (sem a chave)', {}, false],
  ['media_data nulo', { media_data: null }, false],
  ['media_data string vazia', { media_data: '' }, false],
  ['media_data zero', { media_data: 0 }, false],
  ['media_data false', { media_data: false }, false],
  ['media_data a string "0" (verdadeira em JS)', { media_data: '0' }, true],
  ['media_data a string "false" (verdadeira em JS)', { media_data: 'false' }, true],
]
const conversaMista = () => FORMAS.map(([, extra], i) => msg(i + 1, extra))

// A regra de mascaramento da camada (#77), emulada: verdadeiro em JS -> "1";
// falso ou chave ausente -> fica como está.
const mascara = (linha, campos) => {
  const c = { ...linha }
  for (const k of campos) if (k in c && c[k]) c[k] = '1'
  return c
}

function mundo({ mensagens, filtroFunciona = true }) {
  const w = { chamadas: [], fetchs: [], bytes: 0 }
  // `unread_count > 0` é o que dispara a marcação de leitura no WhatsApp, que é
  // um dos consumidores das mensagens mascaradas (lê message_id, from_me,
  // sender_jid e conversation_id). Com 0 esse ramo nem executaria e a igualdade
  // das chamadas à Avisa seria vazia.
  const conversa = { id: 'c1', remote_jid: '5519999990001@s.whatsapp.net', created_at: iso(0), unread_count: 3 }
  const modelo = (l) => ({ findById: async (id) => l.find((x) => x.id === id) || null, findMany: async () => l, create: async (r) => r, update: async () => ({}), delete: async () => {} })
  w.ctx = () => ({
    params: { id: 'c1' }, query: {}, body: {}, headers: {},
    user: { id: 'u1' },
    secrets: { get: async () => 'tok' },
    fetch: async (url, init) => { w.fetchs.push({ url, body: init && init.body }); return { status: 200, body: '{}' } },
    models: {
      Sessao: { findById: async () => null },
      Profile: { findById: async () => ({ id: 'u1', role: 'support' }), findMany: async () => [] },
      WhatsAppConversation: { ...modelo([conversa]), findById: async () => ({ ...conversa }) },
      SystemSettings: { findMany: async () => [] },
      CompanyContact: { findMany: async () => [] },
      WaConversationEvents: modelo([]),
      WhatsAppMessage: {
        findById: async (id) => mensagens.find((x) => x.id === id) || null,
        findMany: async (arg) => {
          const filtro = arg || {}
          w.chamadas.push(JSON.parse(JSON.stringify(filtro)))
          if ('conversation_id' in filtro && !filtroFunciona) return []
          const devolvidas = camadaFindMany(mensagens, filtro)
          w.bytes += JSON.stringify(devolvidas).length
          return devolvidas
        },
      },
    },
    reply: reply(),
  })
  return w
}
const folga = () => new Promise((r) => setTimeout(r, 25))
const mascarada = (a) => Array.isArray(a.mascararCampos) && a.mascararCampos.length === 1 && a.mascararCampos[0] === 'media_data'

;(async () => {
  ok('a 434 contém os três pedidos de mascaramento (primeira página, páginas seguintes e reserva)',
    pedidosAusentes.length === 0, pedidosAusentes)

  // ═══ 1. resposta IDÊNTICA, e cada forma decide o clipe como antes ═══
  {
    const a = mundo({ mensagens: conversaMista() }), b = mundo({ mensagens: conversaMista() })
    const rn = await NOVO(a.ctx())
    const ra = await ANTIGO(b.ctx())
    await folga()
    ok('a resposta da 434 é IDÊNTICA, byte a byte, com e sem o mascaramento',
      JSON.stringify(rn) === JSON.stringify(ra) && rn.status === 200 && rn.body.data.length === FORMAS.length,
      { rn: rn.body && rn.body.data && rn.body.data.length, igual: JSON.stringify(rn) === JSON.stringify(ra) })
    for (let i = 0; i < FORMAS.length; i++) {
      const [rotulo, , temClipe] = FORMAS[i]
      const linha = rn.body.data.find((x) => x.id === 'm' + (i + 1))
      ok(`media_ref de "${rotulo}": ${temClipe ? 'tem clipe' : 'sem clipe'}`,
        linha && (temClipe ? linha.media_ref === 'm' + (i + 1) : linha.media_ref === null), linha && linha.media_ref)
    }
    ok('a marcação de leitura no WhatsApp ACONTECE (o ramo é exercitado)', a.fetchs.length > 0 && /WAID/.test(JSON.stringify(a.fetchs)),
      { a: a.fetchs.length })
    ok('  e as chamadas à Avisa são as mesmas, com os mesmos ids de mensagem',
      JSON.stringify(a.fetchs) === JSON.stringify(b.fetchs), { a: a.fetchs, b: b.fetchs })
    ok('nenhum conteúdo de anexo aparece na resposta', !JSON.stringify(rn).includes('AAAAAAAAAA'), 'base64 vazou')
    ok('a leitura por conversa PEDE o mascaramento (controle: a de antes não pede)',
      a.chamadas.length >= 1 && a.chamadas.every((c) => mascarada(c)) && b.chamadas.every((c) => !('mascararCampos' in c)),
      { novo: a.chamadas, antigo: b.chamadas })
  }

  // ═══ 2. conversa acima de 500: as duas metades por from_me também pedem ═══
  {
    const muitas = Array.from({ length: 700 }, (_, i) => msg(i + 1, i % 3 === 0 ? { media_data: 'data:image/png;base64,' + 'B'.repeat(200), media_type: 'image' } : {}))
    const a = mundo({ mensagens: muitas }), b = mundo({ mensagens: muitas })
    const rn = await NOVO(a.ctx())
    const ra = await ANTIGO(b.ctx())
    await folga()
    ok('conversa de 700: resposta IDÊNTICA e inteira', JSON.stringify(rn) === JSON.stringify(ra) && rn.body.data.length === 700, rn.body.data.length)
    ok('  passou pelas duas páginas (2 leituras: a primeira e a de offset 500)',
      a.chamadas.length === 2 && a.chamadas.filter((c) => c.offset === 500).length === 1, a.chamadas)
    ok('  e AMBAS pedem o mascaramento', a.chamadas.every((c) => mascarada(c)), a.chamadas)
  }

  // ═══ 3. reserva sem filtro: também pede ═══
  {
    const a = mundo({ mensagens: conversaMista(), filtroFunciona: false }), b = mundo({ mensagens: conversaMista(), filtroFunciona: false })
    const rn = await NOVO(a.ctx())
    const ra = await ANTIGO(b.ctx())
    await folga()
    ok('filtro por conversa não aceito: cai na reserva e a resposta é IDÊNTICA',
      JSON.stringify(rn) === JSON.stringify(ra) && rn.body.data.length === FORMAS.length && rn.body.historico.via === 'varredura', rn.body && rn.body.historico)
    const reserva = a.chamadas.filter((c) => !('conversation_id' in c))
    ok('  a leitura de reserva (sem filtro) PEDE o mascaramento', reserva.length === 1 && mascarada(reserva[0]), a.chamadas)
  }

  // ═══ 4. o conteúdo do anexo continua saindo INTEIRO pela rota de mídia ═══
  {
    const h490d = compilar(codigoDe('490d whatsapp GET /whatsapp/midia/:id'))
    const mensagens = [msg(1, { media_data: GRANDE, media_type: 'image' })]
    const w = mundo({ mensagens })
    const c = w.ctx(); c.params = { id: 'm1' }
    const r = await h490d(c)
    ok('a rota de mídia (490d) devolve o anexo INTEIRO', r && r.status === 200 && r.body.data.data_uri === GRANDE, r && r.body && r.body.data && String(r.body.data.data_uri).slice(0, 40))
    ok('  sem passar pelo mascaramento (lê por id)', w.chamadas.length === 0, w.chamadas)
  }

  // ═══ 5. o mascaramento só existe na 434 ═══
  {
    const s = fs.readFileSync(ARQ, 'utf8')
    const de = JSON.stringify(s) // só para contar no texto escapado
    const rotas = []
    const rr = /(\d+[a-z]?) (\w+) (GET|POST|PATCH|PUT|DELETE) (\/[^\s"\\]*)[\s\S]{0,400}?compileController\(\s*"((?:[^"\\]|\\.)*)"\s*\)/g
    let m
    while ((m = rr.exec(s))) {
      const c = JSON.parse('"' + m[5] + '"')
      if (/mascararCampos/.test(c)) rotas.push(`${m[1]} ${m[3]} ${m[4]}`)
    }
    // EXATAMENTE estas três: a 434 (que só pergunta se há anexo), a 432 (que nem
    // expõe o anexo) e a 485, só na leitura de reserva da REAÇÃO. As rotas que leem
    // o CONTEÚDO usam `findById` e a opção não as alcança; este teste reprova se
    // qualquer outra passar a usá-la.
    ok('só a 434, a 432 e a 485 usam mascararCampos (as rotas que leem o CONTEÚDO nunca)',
      rotas.length === 3 && ['432 ', '434 ', '485 '].every((p) => rotas.some((r) => r.startsWith(p))), rotas)
    // Na 485 a máscara só é segura enquanto a gravação for campo a campo: o objeto
    // lido nunca volta ao banco (o "1" da máscara seria persistido e o anexo morreria).
    const c485 = (() => {
      const re2 = /485 \w+ POST \/whatsapp\/inbound[\s\S]{0,400}?compileController\(\s*"((?:[^"\\]|\\.)*)"\s*\)/
      return JSON.parse('"' + re2.exec(s)[1] + '"')
    })()
    ok('485: a máscara aparece uma vez, na reserva da reação',
      (c485.match(/mascararCampos/g) || []).length === 1 && c485.split('findMany({ mascararCampos: ["media_data"] })').length - 1 === 1, (c485.match(/mascararCampos/g) || []).length)
    ok('485: a reação grava SÓ `reacoes` (o objeto lido não volta ao banco)',
      c485.split('update(_alvo.id, { reacoes: _reacs })').length - 1 === 1 && !/update\(_alvo\.id, (?!\{ reacoes)/.test(c485), 'gravação mudou')
  }

  fim()
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(1) })
