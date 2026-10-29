// A entrada do WhatsApp (485) acha a conversa do contato mesmo acima de 500 conversas.
//
// A rota escolhe a conversa aberta do contato, e a fechada que a regra de 7 dias reabre, de uma
// leitura de conversas. Essa leitura era uma chamada só, e a camada devolve no máximo 500 por
// chamada, da mais nova para a mais velha: passando de 500 conversas no total, a conversa do
// contato ficava FORA da janela. A mensagem do cliente criava uma conversa duplicada, sem chamado
// e sem histórico, e a reabertura de 7 dias também deixava de achar a fechada.
//
// O QUE SE GARANTE (handler EXECUTADO, carregado do literal gerado, com a camada emulada por
// _camada.js — a mesma que o teste de premissas confere contra Postgres real):
//   - 520 conversas no total, a do contato na posição 510 da ordem de leitura: a mensagem cai NELA
//     e nenhuma conversa nova é criada;
//   - a mesma conversa FECHADA há 1 dia, na mesma posição, é REABERTA, e também sem criar outra;
//   - varredura incompleta NÃO derruba o webhook: página que falha e teto de páginas seguem com o
//     que foi lido, a mensagem é gravada de todo jeito, e a falha vira evento `diag_pagina_conversas`
//     com a MESMA trava das outras sondas da rota (no máximo 6; contagem que falha não grava).
// MUTAÇÕES: aplicadas uma vez cada, reprovadas por asserção.
//
// Roda com: node entrada-pagina.test.js
const fs = require('fs')
const vm = require('vm')
const { reply, ok, fim, ARQ } = require('./_carregar.js')
const { camadaFindMany } = require('./_camada.js')

const MARCA = '485 whatsapp POST /whatsapp/inbound'
const SEGREDO = 'segredo-da-rota'
const FONE = '5519999990001@s.whatsapp.net'
const DIA = 24 * 60 * 60 * 1000

function fonteDaRota() {
  const s = fs.readFileSync(ARQ, 'utf8')
  const at = s.indexOf(MARCA)
  if (at < 0) throw new Error('rota ausente: ' + MARCA)
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

/**
 * `ruido` conversas MAIS NOVAS empurram a do contato para fora das 500 primeiras
 * da ordem de leitura (a camada entrega da mais nova para a mais velha).
 *
 * As conversas entram em ORDEM DE CRIAÇÃO, que é o que `camadaFindMany` espera.
 */
function mundo({ ruido = 519, alvo = {}, falhaNaPagina, eventos = [], rodizio = false, minhas = 0, semAlvo = false } = {}) {
  const convs = semAlvo ? [] : [
    Object.assign(
      {
        id: 'alvo',
        status: 'open',
        phase: 'novo',
        remote_jid: FONE,
        remote_lid: null,
        ticket_id: 'tck_1',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      alvo,
    ),
  ]
  // Conversas JÁ ABERTAS do atendente, as mais antigas de todas: é a conta do
  // rodízio (`max_concurrent`) que precisa enxergá-las.
  for (let i = 0; i < minhas; i++) {
    convs.push({
      id: 'minha_' + i,
      status: 'open',
      phase: 'em_atendimento',
      assigned_to_id: 'u1',
      remote_jid: '5541900' + String(i).padStart(6, '0') + '@s.whatsapp.net',
      remote_lid: null,
      created_at: new Date(Date.parse('2026-01-01T00:00:00Z') + i * 1000).toISOString(),
      updated_at: new Date(Date.parse('2026-01-01T00:00:00Z') + i * 1000).toISOString(),
    })
  }
  for (let i = 0; i < ruido; i++) {
    convs.push({
      id: 'ruido_' + i,
      status: 'open',
      phase: 'novo',
      remote_jid: '5531900' + String(i).padStart(6, '0') + '@s.whatsapp.net',
      remote_lid: null,
      created_at: new Date(Date.parse('2026-02-01T00:00:00Z') + i * 1000).toISOString(),
      updated_at: new Date(Date.parse('2026-02-01T00:00:00Z') + i * 1000).toISOString(),
    })
  }
  const msgs = []
  const w = { convs, msgs, criadas: [], leituras: [], eventos: eventos.slice() }
  const vazio = { findMany: async () => [], findById: async () => null }
  w.models = {
    WhatsAppConversation: {
      findById: async (id) => {
        const c = convs.find((x) => x.id === id)
        return c ? { ...c } : null
      },
      findMany: async (a) => {
        w.leituras.push(JSON.parse(JSON.stringify(a || {})))
        const pagina = Math.floor((Number((a || {}).offset) || 0) / 500)
        if (falhaNaPagina !== undefined && pagina === falhaNaPagina) throw new Error('falha de leitura')
        return camadaFindMany(convs, a)
      },
      create: async (c) => {
        w.criadas.push(c)
        convs.push({ ...c })
        return c
      },
      update: async (id, p) => {
        const c = convs.find((x) => x.id === id)
        if (c) Object.assign(c, p)
        return { ...c }
      },
    },
    WhatsAppMessage: {
      findMany: async (a) => camadaFindMany(msgs, a),
      findById: async (id) => msgs.find((m) => m.id === id) || null,
      create: async (m) => { msgs.push({ ...m }); return m },
      update: async (id, p) => { Object.assign(msgs.find((m) => m.id === id) || {}, p); return {} },
    },
    WaConversationEvents: {
      findMany: async (a) => camadaFindMany(w.eventos, a),
      findById: async () => null,
      create: async (e) => { w.eventos.push({ ...e }); return e },
      update: async () => ({}),
    },
    Profile: {
      findById: async () => ({ id: 'u9', role: 'support' }),
      findMany: async () => (rodizio ? [{ id: 'u1', role: 'support', active: true }] : []),
    },
    WaAgentProfiles: {
      findMany: async () => (rodizio ? [{ profile_id: 'u1', online: true, max_concurrent: 5 }] : []),
      findById: async () => null,
    },
    Sessao: { findById: async () => null },
    SystemSettings: {
      findMany: async () => [{ id: 's1', waMenuEnabled: false, waAutoAssignEnabled: rodizio }],
      update: async () => ({}),
    },
    PushInscricao: vazio,
    PushNaFila: { create: async (x) => x },
    SupportSchedule: vazio,
    WaFlows: vazio,
    Company: vazio,
    CompanyContact: vazio,
    Contact: vazio,
    Ticket: vazio,
    Unit: vazio,
    ClientUser: vazio,
    WaConta: vazio,
    WaTags: vazio,
    WaConversationTags: vazio,
    WaInternalNotes: vazio,
  }
  w.ctx = (mid) => ({
    params: {},
    headers: {},
    query: { token: SEGREDO },
    body: { phone: FONE, message: 'oi, sou eu', name: 'Cliente', message_id: mid || 'WA_1' },
    models: w.models,
    secrets: { get: async (n) => (n === 'avisa_webhook_secret' ? SEGREDO : 'tok') },
    fetch: async () => ({ status: 200, body: '{}' }),
    notify: async () => ({}),
    reply: reply(),
  })
  return w
}

const folga = () => new Promise((r) => setTimeout(r, 25))
const daAlvo = (w) => w.msgs.filter((m) => String(m.conversation_id || m.conversationId) === 'alvo').length
const diag = (w) => w.eventos.filter((e) => e.kind === 'diag_pagina_conversas').length

async function bateria(h) {
  const f = []

  // ── TRAVA DE MASSA: a janela de uma leitura só NÃO contém a conversa do contato.
  // Sem isto, "a mensagem caiu na conversa certa" não provaria nada: poderia estar
  // caindo certo porque o cenário é fácil.
  {
    const w = mundo()
    const janela = camadaFindMany(w.convs, {})
    if (janela.length !== 500) f.push('massa:janela=' + janela.length)
    if (janela.some((c) => c.id === 'alvo')) f.push('massa:alvo-dentro-da-primeira-janela')
  }

  // ── Conversa ABERTA fora da primeira página recebe a mensagem ─────────────
  {
    const w = mundo()
    await h(w.ctx('WA_ABERTA'))
    await folga()
    if (w.criadas.length) f.push('aberta:criou ' + w.criadas.length + ' conversa(s)')
    if (daAlvo(w) !== 1) f.push('aberta:mensagens-na-alvo=' + daAlvo(w))
    if (diag(w)) f.push('aberta:diagnostico-sem-falha=' + diag(w))
  }

  // ── Conversa FECHADA há 1 dia, na mesma posição, é reaberta ───────────────
  {
    const ontem = new Date(Date.now() - DIA).toISOString()
    const w = mundo({ alvo: { status: 'closed', phase: 'resolvido', resolved_at: ontem, updated_at: ontem } })
    await h(w.ctx('WA_FECHADA'))
    await folga()
    if (w.criadas.length) f.push('fechada:criou ' + w.criadas.length + ' conversa(s)')
    const alvo = w.convs.find((c) => c.id === 'alvo')
    if (String(alvo.status) !== 'open') f.push('fechada:nao-reabriu:' + alvo.status)
    if (daAlvo(w) !== 1) f.push('fechada:mensagens-na-alvo=' + daAlvo(w))
    if (String(alvo.ticket_id) !== 'tck_1') f.push('fechada:perdeu-o-chamado')
  }

  // ── Página que falha: a mensagem é gravada de todo jeito, e fica registrada ─
  {
    const w = mundo({ falhaNaPagina: 1 })
    const r = await h(w.ctx('WA_FALHA'))
    await folga()
    if ((r && r.status ? r.status : 200) >= 500) f.push('falha:status=' + r.status)
    if (w.msgs.length !== 1) f.push('falha:mensagens=' + w.msgs.length)
    if (diag(w) !== 1) f.push('falha:diagnostico=' + diag(w))
  }

  // ── Teto de páginas: também segue em frente, também registra ──────────────
  {
    const w = mundo({ ruido: 9999 })
    const r = await h(w.ctx('WA_TETO'))
    await folga()
    if ((r && r.status ? r.status : 200) >= 500) f.push('teto:status=' + r.status)
    if (w.msgs.length !== 1) f.push('teto:mensagens=' + w.msgs.length)
    if (diag(w) !== 1) f.push('teto:diagnostico=' + diag(w))
  }

  // ── A sonda não grava sem limite: com 6 já registrados, não escreve o 7º ──
  {
    const cheios = []
    for (let i = 0; i < 6; i++) {
      cheios.push({ id: 'dpc_' + i, conversation_id: 'diagnostico', kind: 'diag_pagina_conversas', created_at: '2026-10-01T00:00:00Z' })
    }
    const w = mundo({ falhaNaPagina: 1, eventos: cheios })
    await h(w.ctx('WA_SONDA_CHEIA'))
    await folga()
    if (diag(w) !== 6) f.push('sonda-cheia:diagnostico=' + diag(w))
    if (w.msgs.length !== 1) f.push('sonda-cheia:mensagens=' + w.msgs.length)
  }

  // ── A PRIMEIRA página não tolera falha no caminho da mensagem ────────────
  // Seguir com lista vazia faria toda mensagem que chegasse durante a
  // instabilidade do banco não achar conversa aberta nenhuma e abrir outra:
  // duplicata em massa, que é o que esta leitura existe para evitar.
  {
    const w = mundo({ falhaNaPagina: 0 })
    let subiu = false
    try {
      await h(w.ctx('WA_P0'))
    } catch (e) {
      subiu = true
    }
    await folga()
    if (!subiu) f.push('primeira-pagina:nao-subiu')
    if (w.criadas.length) f.push('primeira-pagina:criou ' + w.criadas.length + ' conversa(s)')
    if (w.msgs.length) f.push('primeira-pagina:gravou-mensagem')
  }

  // ── O rodízio conta as abertas do atendente além da primeira página ──────
  // Sem isso ele entrega conversa a quem já está no teto, porque as abertas
  // mais antigas que a 500ª desaparecem da conta.
  {
    const w = mundo({ rodizio: true, semAlvo: true, minhas: 5, ruido: 519 })
    await h(w.ctx('WA_RODIZIO'))
    await folga()
    if (w.criadas.length !== 1) f.push('rodizio:criou ' + w.criadas.length + ' conversa(s)')
    else {
      const nova = w.convs.find((c) => c.id === w.criadas[0].id)
      if (nova && nova.assigned_to_id) f.push('rodizio:entregou-a-quem-esta-no-teto:' + nova.assigned_to_id)
    }
  }

  // ── A leitura pediu `limit`/`offset`, e não `take`/`skip` ─────────────────
  {
    const w = mundo()
    await h(w.ctx('WA_FILTRO'))
    await folga()
    const conv = w.leituras.filter((a) => a.limit !== undefined)
    if (!conv.length) f.push('pedido:nenhuma-leitura-com-limit')
    else {
      if (conv[0].limit !== 500 || conv[0].offset !== 0) f.push('pedido:primeira=' + JSON.stringify(conv[0]))
      if (conv.length < 2 || conv[1].offset !== 500) f.push('pedido:segunda=' + JSON.stringify(conv[1] || null))
      if (w.leituras.some((a) => a.take !== undefined || a.skip !== undefined)) f.push('pedido:usou-take-skip')
    }
  }
  return f
}

const MUTACOES = [
  // Uma leitura só: volta o defeito inteiro.
  ['lê só a primeira página', [['    if (_pgConv.length < _PAG_CONV) break;', '    break;']]],
  // A 1ª página passa a ser tolerada: durante instabilidade do banco, cada
  // mensagem abre uma conversa nova.
  ['falha da 1ª página segue com vazio',
    [['      if (_pk === 0 && !_toleraPrimeira) throw _pe;\n', '']]],
  // O rodízio volta a contar só as 500 conversas mais novas.
  ['rodízio lê só a primeira página',
    [['(await _todasAsConversas(ctx, Conv, true))', '(await Conv.findMany({ limit: 500, offset: 0 }))']]],
  // O caminho da mensagem passa a tolerar a 1ª página pelo argumento.
  ['caminho da mensagem tolera a 1ª página',
    [['var all = await _todasAsConversas(ctx, Conv, false);', 'var all = await _todasAsConversas(ctx, Conv, true);']]],
  // O ajudante volta para DENTRO do handler: o rodízio deixa de enxergá-lo, o
  // `catch` engole o ReferenceError e a conta de abertas dá zero.
  ['ajudante fora do alcance do rodízio',
    [['async function _todasAsConversas(ctx, _Cv, _toleraPrimeira) {', 'async function _naoChamadaAqui(ctx, _Cv, _toleraPrimeira) {'],
     ['  var all = await _todasAsConversas(ctx, Conv, false);', '  var all = await _naoChamadaAqui(ctx, Conv, false);']]],
  // `offset` sem multiplicar pela página: as janelas se sobrepõem e o fim da
  // tabela nunca é alcançado.
  ['offset sem multiplicar pela página',
    [['offset: _pk * _PAG_CONV }', 'offset: _pk }']]],
  // Mensagem de cliente perdida é pior que varredura curta.
  ['falha de página derruba o webhook',
    [['      _pgFalhou = { pagina: _pk, erro: String((_pe && _pe.message) || _pe) };\n      break;',
      '      throw _pe;']]],
  ['falha de página não registra nada',
    [['  if (_pgFalhou) await _diagPaginaConversas(ctx, _pgFalhou, _acc.length);', '']]],
  ['teto de páginas em silêncio',
    [['    if (_pk === _MAX_PAG_CONV - 1) _pgFalhou = { pagina: _pk, erro: "teto de paginas" };\n', '']]],
  // Sonda sem trava vira carga justamente quando o banco está pior.
  ['sonda grava sem limite', [['    if (_qtdP >= 6) return;\n', '']]],
]

// ─── O arquivo inteiro: a edição por script não pode ter mexido no resto ───
//
// Âncora errada já colocou rota DENTRO do cabeçalho do arquivo uma vez, e nada
// disso aparece olhando só o handler editado: o número de rotas tem de ser o
// mesmo, e TODOS os literais do arquivo ainda têm de compilar.
const ROTAS_ESPERADAS = 509

function todosOsLiterais() {
  const s = fs.readFileSync(ARQ, 'utf8')
  const re = /compileController\(\s*"((?:[^"\\]|\\.)*)"\s*\)/g
  const out = []
  let m
  while ((m = re.exec(s))) out.push(JSON.parse('"' + m[1] + '"'))
  return out
}

function bateriaArquivo() {
  const f = []
  const s = fs.readFileSync(ARQ, 'utf8')
  const rotas = (s.match(/^\s{4}path: "/gm) || []).length
  if (rotas !== ROTAS_ESPERADAS) f.push('rotas=' + rotas)
  const lits = todosOsLiterais()
  if (lits.length < 400) f.push('literais=' + lits.length)
  const quebrados = []
  for (let i = 0; i < lits.length; i++) {
    try {
      new vm.Script(lits[i])
    } catch (e) {
      quebrados.push(i + ':' + String((e && e.message) || e).slice(0, 60))
    }
  }
  if (quebrados.length) f.push('nao-compilam=' + quebrados.slice(0, 3).join('|'))
  return f
}

;(async () => {
  const fa = bateriaArquivo()
  ok(`o arquivo de rotas segue com ${ROTAS_ESPERADAS} rotas e todos os handlers compilam`, fa.length === 0, fa)
  const base = fonteDaRota()
  const f = await bateria(compilar(base))
  ok('acha a conversa do contato acima de 500, reabre a fechada e não derruba o webhook', f.length === 0, f)
  for (const [nome, pares] of MUTACOES) {
    let mut = base
    let aplicou = true
    for (const [de, para] of pares) {
      if (mut.split(de).length - 1 !== 1) { aplicou = false; break }
      mut = mut.replace(de, () => para)
    }
    if (!aplicou || mut === base) {
      ok(`mutação "${nome}" aplica cada âncora exatamente uma vez`, false, 'âncora')
      continue
    }
    let fm
    try {
      fm = await bateria(compilar(mut))
    } catch (e) {
      fm = ['explodiu: ' + String((e && e.message) || e)]
    }
    ok(`mutação "${nome}" é pega (${fm.slice(0, 1).join('')})`, fm.length > 0, 'sobreviveu')
  }
  fim()
})()
