// A lista de conversas (432) deixa de trazer o anexo do banco.
//
// A lista é consultada o tempo todo, por atendente. Ela lê mensagens em DOIS
// pontos — `lastMessagesByConv` (a leitura sem filtro, até 500 mensagens) e o
// bloco das prévias (`_faltam`, uma leitura por conversa, até 40) — e cada
// mensagem com anexo carrega o arquivo em base64. Mas NENHUM consumidor dessas
// mensagens lê o conteúdo: o `serializeMsg` da lista nem inclui `media_ref`, e o
// resto lê timestamp, sender_jid, from_me, sender_name. As duas leituras agora
// pedem `mascararCampos: ["media_data"]`.
//
// ESTE ARQUIVO PRENDE A PREMISSA, não só o resultado: se alguém acrescentar
// `media_ref` (ou qualquer uso de `media_data`) à lista, o caso estrutural
// reprova — é o aviso de que a máscara precisa sair.
//
// TRAVA CONTRA "DOIS NADAS": comparar a resposta com e sem o mascaramento só
// significa algo se as mensagens lidas TÊM anexo. Os casos abaixo afirmam isso
// olhando a MASSA (linhas com anexo devolvidas por cada leitura), não só o
// resultado.
//
// O mascaramento é EMULADO com a regra que o teste da camada provou contra
// Postgres (mascarar-campos.test.mjs). O arquivo irmão
// `rota-432-mascara-real.test.mjs` (em packages/api) roda a rota sobre a camada
// real.
//
// Roda com: node mascara-na-432.test.js
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

// ── a rota nova e a de ANTES ────────────────────────────────────────────────
const cod = codigoDe('432 whatsapp GET /whatsapp')
const PEDIDOS = [
  ['findMany({ mascararCampos: _MASCARAR_MIDIA })', 'findMany({})'],
  ['findMany({ conversation_id: _faltam[_q], mascararCampos: _MASCARAR_MIDIA })', 'findMany({ conversation_id: _faltam[_q] })'],
]
const pedidosAusentes = []
let codAntigo = cod
for (const [novo, antigo] of PEDIDOS) {
  if (!codAntigo.includes(novo)) { pedidosAusentes.push(novo); continue }
  codAntigo = codAntigo.replace(novo, () => antigo)
}
const NOVO = compilar(cod)
const ANTIGO = compilar(codAntigo)

// ── massa ───────────────────────────────────────────────────────────────────
const AGORA = Date.now()
const iso = (horasAtras) => new Date(AGORA - horasAtras * 3600_000).toISOString()
const GRANDE = (kb) => 'data:image/jpeg;base64,' + 'A'.repeat(kb * 1024)

function massa() {
  const conversas = [
    { id: 'a1', status: 'open', remote_jid: '5519111@s.whatsapp.net', contact_name: 'Um', updated_at: iso(0.2), created_at: iso(5) },
    { id: 'a2', status: 'open', remote_jid: '5519222@s.whatsapp.net', contact_name: 'Dois', updated_at: iso(0.3), created_at: iso(5) },
    // 'a3' é aberta e suas mensagens ficam FORA da janela das 500 mais recentes:
    // a prévia vem do bloco `_faltam` (leitura por conversa).
    { id: 'a3', status: 'open', remote_jid: '5519333@s.whatsapp.net', contact_name: 'Tres', updated_at: iso(100), created_at: iso(150) },
    { id: 'f1', status: 'closed', remote_jid: '5519444@s.whatsapp.net', contact_name: 'Fechada', updated_at: iso(10), created_at: iso(20) },
  ]
  const mensagens = []
  // as de 'a3', antigas, com anexo e com valores falsos misturados
  mensagens.push({ id: 'm_a3_1', conversation_id: 'a3', from_me: false, sender_name: 'Tres', sender_jid: '5519333@s.whatsapp.net', body: 'fotinho', timestamp: iso(120), media_data: GRANDE(200), media_type: 'image' })
  mensagens.push({ id: 'm_a3_2', conversation_id: 'a3', from_me: false, sender_name: 'Tres', sender_jid: '5519333@s.whatsapp.net', body: 'preciso de ajuda', timestamp: iso(110), media_data: GRANDE(300), media_type: 'document' })
  // 520 de ruído, mais novas: empurram as de 'a3' para fora das 500 mais recentes
  for (let i = 0; i < 520; i++) {
    mensagens.push({ id: 'r' + i, conversation_id: 'ruido', from_me: i % 2 === 0, sender_name: 'Ruido', sender_jid: '5519999@s.whatsapp.net', body: 'r' + i, timestamp: iso(2 - i / 1000), media_data: i % 4 === 0 ? 'data:image/png;base64,' + 'B'.repeat(4000) : undefined })
  }
  // as últimas de 'a1' e 'a2', as mais novas de todas
  mensagens.push({ id: 'm_a1', conversation_id: 'a1', from_me: false, sender_name: 'Um', sender_jid: '5519111@s.whatsapp.net', body: 'oi, sou o um', timestamp: iso(0.05), media_data: GRANDE(250), media_type: 'image' })
  mensagens.push({ id: 'm_a2', conversation_id: 'a2', from_me: true, sender_name: 'Atendente', sender_jid: '', body: 'respondido', timestamp: iso(0.04), media_data: '', media_type: null })
  return { conversas, mensagens }
}

// A regra de mascaramento da camada, emulada: verdadeiro em JS -> "1".
const mascara = (linha, campos) => {
  const c = { ...linha }
  for (const k of campos) if (k in c && c[k]) c[k] = '1'
  return c
}

function mundo({ conversas, mensagens }) {
  const w = { chamadas: [], lidas: [] } // lidas: o que cada leitura de mensagens DEVOLVEU
  const Conv = {
    findMany: async (arg) => {
      const chaves = Object.keys(arg || {})
      if (!chaves.length) return conversas.slice(0, 500)
      return conversas.filter((c) => chaves.every((k) => String(c[k] ?? '') === String(arg[k]))).slice(0, 500)
    },
    update: async () => {},
  }
  const Msg = {
    findMany: async (arg) => {
      const filtro = arg || {}
      w.chamadas.push(JSON.parse(JSON.stringify(filtro)))
      const campos = Array.isArray(filtro.mascararCampos) ? filtro.mascararCampos : []
      const chaves = Object.keys(filtro).filter((k) => k !== 'mascararCampos')
      const originais = mensagens
        .filter((m) => chaves.every((k) => String(m[k] ?? '') === String(filtro[k])))
        .slice().sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp))) // as mais novas primeiro
        .slice(0, 500)
      const devolvidas = originais.map((m) => mascara(m, campos))
      w.lidas.push({
        tipo: chaves.length ? 'por-conversa' : 'sem-filtro',
        filtro,
        originaisComAnexo: originais.filter((m) => m.media_data).length,   // o que o BANCO tinha
        devolvidasComAnexoIntacto: devolvidas.filter((m, i) => m.media_data && m.media_data === originais[i].media_data && m.media_data !== '1').length,
        bytes: JSON.stringify(devolvidas).length,
        bytesDeAnexo: originais.reduce((t, m) => t + (m.media_data ? String(m.media_data).length : 0), 0), // o que o banco tinha de anexo
      })
      return devolvidas
    },
  }
  const vazio = { findMany: async () => [], findById: async () => null }
  w.ctx = () => ({
    params: {}, query: {}, body: {}, headers: {}, user: { id: 'u1' },
    models: {
      Sessao: { findById: async () => null },
      Profile: { findById: async () => ({ id: 'u1', role: 'admin' }), findMany: async () => [] },
      WhatsAppConversation: Conv, WhatsAppMessage: Msg,
      SystemSettings: vazio, WaDepartment: vazio, Company: vazio, CompanyContact: vazio,
      Ticket: vazio, WaCloseReason: vazio, WaTag: vazio, WaConversationTag: vazio, WaConversationEvents: vazio,
    },
    reply: reply(),
  })
  return w
}

;(async () => {
  ok('a 432 contém os dois pedidos de mascaramento (leitura sem filtro e prévia por conversa)',
    pedidosAusentes.length === 0, pedidosAusentes)

  const a = mundo(massa()), b = mundo(massa())
  const rn = await NOVO(a.ctx())
  const ra = await ANTIGO(b.ctx())

  // ═══ TRAVA: o caminho ACONTECEU e as mensagens lidas TÊM anexo ═══
  const semFiltroAntigo = b.lidas.filter((l) => l.tipo === 'sem-filtro')
  const porConversaAntigo = b.lidas.filter((l) => l.tipo === 'por-conversa')
  ok('TRAVA — a leitura sem filtro aconteceu', semFiltroAntigo.length === 1, b.lidas.map((l) => l.tipo))
  ok('TRAVA — a leitura sem filtro TROUXE anexos (a massa tem o que mascarar)', semFiltroAntigo[0] && semFiltroAntigo[0].originaisComAnexo >= 100 && semFiltroAntigo[0].devolvidasComAnexoIntacto >= 100,
    semFiltroAntigo[0])
  ok('TRAVA — o bloco das prévias aconteceu (leitura por conversa para a aberta fora da janela)',
    porConversaAntigo.length >= 1 && porConversaAntigo.some((l) => l.filtro.conversation_id === 'a3'), b.lidas.map((l) => l.filtro))
  ok('TRAVA — a leitura por conversa TROUXE anexo', porConversaAntigo.some((l) => l.filtro.conversation_id === 'a3' && l.originaisComAnexo >= 2 && l.devolvidasComAnexoIntacto >= 2),
    porConversaAntigo)
  ok('TRAVA — a resposta é real: 200, 4 conversas, e a prévia de a3 veio da leitura por conversa',
    ra.status === 200 && ra.body.data.length === 4 && ra.body.data.find((c) => c.id === 'a3').last_message
      && /preciso de ajuda/.test(ra.body.data.find((c) => c.id === 'a3').last_message.body), ra.body && ra.body.data && ra.body.data.length)

  // ═══ a resposta é IDÊNTICA ═══
  ok('a resposta da 432 é IDÊNTICA, byte a byte, com e sem o mascaramento',
    JSON.stringify(rn) === JSON.stringify(ra), { n: rn.body && rn.body.data && rn.body.data.length })
  const prev = (r, id) => JSON.stringify(r.body.data.find((c) => c.id === id).last_message)
  ok('  as prévias de a1, a2 e a3 são as mesmas', ['a1', 'a2', 'a3'].every((id) => prev(rn, id) === prev(ra, id)), [prev(rn, 'a1'), prev(ra, 'a1')])
  ok('  nenhum conteúdo de anexo aparece na resposta', !JSON.stringify(rn).includes('AAAAAAAAAA') && !JSON.stringify(rn).includes('BBBBBBBBBB'), 'base64 vazou')

  // ═══ o código novo PEDE o mascaramento e o anexo NÃO vem do banco ═══
  const semFiltroNovo = a.lidas.filter((l) => l.tipo === 'sem-filtro')
  const porConversaNovo = a.lidas.filter((l) => l.tipo === 'por-conversa')
  const mascarada = (l) => Array.isArray(l.filtro.mascararCampos) && l.filtro.mascararCampos.length === 1 && l.filtro.mascararCampos[0] === 'media_data'
  ok('as DUAS leituras de mensagens da 432 pedem o mascaramento (a de antes não pede)',
    a.lidas.length >= 2 && a.lidas.every(mascarada) && b.lidas.every((l) => !('mascararCampos' in l.filtro)), a.lidas.map((l) => l.filtro))
  ok('o anexo NÃO vem do banco no código novo (nenhuma linha com conteúdo intacto)',
    a.lidas.every((l) => l.devolvidasComAnexoIntacto === 0), a.lidas.map((l) => l.devolvidasComAnexoIntacto))
  // O critério vem da MASSA, não de um número escolhido: o que deixa de sair do
  // banco tem de ser (quase) todo o anexo que o banco tinha na janela. O resto
  // (id, corpo, remetente…) continua saindo, por isso a redução não é de 100%.
  const economizado = semFiltroAntigo[0].bytes - semFiltroNovo[0].bytes
  ok('  e o que sai do banco encolhe pelo tamanho do anexo que ele tinha (o pedido chega à camada)',
    semFiltroNovo[0] && semFiltroAntigo[0].bytesDeAnexo > 0
      && economizado >= 0.9 * semFiltroAntigo[0].bytesDeAnexo
      && porConversaNovo.some((l) => l.filtro.conversation_id === 'a3'),
    { economizado, anexoQueOBancoTinha: semFiltroAntigo[0].bytesDeAnexo, novo: semFiltroNovo[0].bytes, antigo: semFiltroAntigo[0].bytes })

  // ═══ A PREMISSA, estrutural: a lista NUNCA usa o conteúdo do anexo ═══
  // Se alguém acrescentar `media_ref` (ou ler `media_data`) à lista, isto reprova
  // — o aviso de que a máscara precisa sair desta rota.
  {
    const semComentarios = cod.split('\n')
      .filter((l) => !/^\s*\/\//.test(l))
      .filter((l) => !/var _MASCARAR_MIDIA = \["media_data"\];/.test(l))
      .join('\n')
    const usos = semComentarios.match(/media_data|mediaData|media_ref|mediaRef/g) || []
    ok('PREMISSA — a 432 não lê media_data/media_ref em lugar nenhum (fora do pedido de mascaramento)',
      usos.length === 0, usos)
  }

  fim()
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(1) })
