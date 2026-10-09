// Chamados e o teto de 500: medido em produção em 09/10/2026, a tabela tem 784
// chamados e o portal via 500 — incluindo 14 novos e 4 em atendimento
// invisíveis. Roda com: node chamados-teto.test.js
const { carregarHandler, reply, ok, fim } = require('./_carregar.js')

const TETO = 500

// Duas tabelas, porque o teto age em dois lugares diferentes:
//
//  - `tabela()` reproduz produção em 09/10/2026: 784 chamados, 404 fechados.
//    A tabela estourou as 500, mas NENHUMA partição por status estourou — é o
//    caso em que a correção resolve tudo.
//  - `tabela({ fechadosAlemDoTeto: true })` força a própria partição
//    `fechado` a passar de 500. Aí nem a partição alcança todos, e o teste
//    registra o que continua garantido: os chamados ABERTOS aparecem.
//
// Nos dois casos os chamados que importam nascem DEPOIS do teto na ordem do
// banco, que é exatamente o que os fazia desaparecer.
function tabela({ fechadosAlemDoTeto = false } = {}) {
  const t = []
  const fechados = fechadosAlemDoTeto ? 600 : 404
  for (let i = 0; i < fechados; i++) {
    t.push({ id: 'f' + i, status: 'fechado', quadro: null, ticket_number: 'TCK' + (1000 + i), updated_at: '2026-01-01T00:00:00Z' })
  }
  // Enche até passar das 500 com status variados, como em produção.
  for (let i = 0; i < 240; i++) {
    t.push({ id: 'r' + i, status: 'resolvido', quadro: null, ticket_number: 'TCKR' + i })
  }
  // Estes nascem DEPOIS do teto: é exatamente o que desaparecia.
  for (let i = 0; i < 14; i++) t.push({ id: 'novo' + i, status: 'novos_chamados', quadro: null, ticket_number: 'TCK9' + i })
  for (let i = 0; i < 4; i++) t.push({ id: 'atend' + i, status: 'em_atendimento', quadro: null, ticket_number: 'TCKA' + i })
  t.push({ id: 'dev1', status: 'em_desenvolvimento', quadro: 'dev', ticket_number: 'DEV1' })
  // Um status que a lista do código NÃO conhece, colocado DENTRO do alcance da
  // varredura: é assim que um status criado no futuro chega. A varredura o
  // denuncia e ele ganha a sua própria consulta.
  t.splice(100, 0, { id: 'exotico', status: 'status_que_ninguem_previu', quadro: null, ticket_number: 'TCKX' })
  // E um segundo, fora do alcance da varredura: esse NÃO é alcançável, e o
  // último bloco do arquivo registra isso como limite conhecido.
  t.push({ id: 'exotico_fora', status: 'outro_status_imprevisto', quadro: null, ticket_number: 'TCKY' })
  return t
}

function models(tudo, { filtroFunciona = true, consultas = [] } = {}) {
  const Ticket = {
    findMany: async (arg) => {
      const chaves = Object.keys(arg || {})
      consultas.push(arg || {})
      if (!chaves.length) return tudo.slice(0, TETO)
      if (!filtroFunciona) return []
      return tudo.filter((t) => chaves.every((k) => String(t[k] ?? '') === String(arg[k]))).slice(0, TETO)
    },
    findById: async (id) => tudo.find((t) => t.id === id) || null,
  }
  const vazio = { findMany: async () => [], findById: async () => null }
  return {
    Ticket,
    Sessao: { findById: async () => null },
    Profile: { findById: async () => ({ id: 'u1', role: 'admin' }), findMany: async () => [] },
    TicketCoAssignee: vazio, TicketMessage: vazio, Unit: vazio,
    TicketTrack: vazio, Company: vazio,
  }
}

function ctxDe(tudo, { query = {}, opts = {} } = {}) {
  return { params: {}, query, body: {}, headers: {}, user: { id: 'u1' }, models: models(tudo, opts), reply: reply() }
}

const corpo = (r) => (r.body && (r.body.data !== undefined ? r.body.data : r.body)) || []

;(async () => {
  const tudo = tabela()

  // ── a lista ───────────────────────────────────────────────────────────────
  const lista = carregarHandler('362 tickets GET /tickets')
  let r = await lista(ctxDe(tudo))
  let ids = corpo(r).map((t) => t.id)
  ok('lista: os 14 novos aparecem', ids.filter((i) => i.startsWith('novo')).length === 14,
    ids.filter((i) => i.startsWith('novo')).length)
  ok('lista: os 4 em atendimento aparecem', ids.filter((i) => i.startsWith('atend')).length === 4,
    ids.filter((i) => i.startsWith('atend')).length)
  ok('lista: status desconhecido é descoberto pela varredura', ids.includes('exotico'),
    ids.includes('exotico'))
  ok('lista: card do quadro dev continua fora do suporte', !ids.includes('dev1'), ids.includes('dev1'))
  ok('lista: sem duplicata', ids.length === new Set(ids).size, ids.length - new Set(ids).size)

  // filtro inútil não pode esvaziar a lista
  r = await lista(ctxDe(tudo, { opts: { filtroFunciona: false } }))
  ok('lista: filtro rejeitado cai na varredura', corpo(r).length === TETO, corpo(r).length)

  // com filtro na query, UMA consulta — não 19
  const consultas = []
  r = await lista(ctxDe(tudo, { query: { status: 'novos_chamados' }, opts: { consultas } }))
  ok('lista: query com filtro faz uma consulta só', consultas.length === 1, consultas)
  // O que motivou a terceira passada: partir por status em toda leitura
  // trocaria 1 consulta por até 20, e a lista responde em ~550ms hoje. A
  // varredura já diz se precisou — devolve exatamente 500 quando truncou.
  const cabe = []
  const pequena = tudo.slice(0, 120)
  await lista(ctxDe(pequena, { opts: { consultas: cabe } }))
  ok('lista: tabela que cabe no teto faz UMA consulta', cabe.length === 1, cabe.length)
  const estourou = []
  await lista(ctxDe(tudo, { opts: { consultas: estourou } }))
  ok('lista: tabela estourada parte por status', estourou.length > 1, estourou.length)
  ok('lista: e devolve os 14', corpo(r).length === 14, corpo(r).length)

  // ── o quadro ──────────────────────────────────────────────────────────────
  const kanban = carregarHandler('378 tickets GET /tickets/kanban')
  r = await kanban(ctxDe(tudo))
  const flat = []
  const d = r.body && r.body.data
  if (Array.isArray(d)) flat.push(...d)
  else if (d) Object.values(d).forEach((v) => Array.isArray(v) && flat.push(...v))
  const kids = flat.map((t) => t.id)
  ok('quadro: os 14 novos aparecem', kids.filter((i) => i.startsWith('novo')).length === 14,
    kids.filter((i) => i.startsWith('novo')).length)
  ok('quadro: os 4 em atendimento aparecem', kids.filter((i) => i.startsWith('atend')).length === 4,
    kids.filter((i) => i.startsWith('atend')).length)
  ok('quadro: teto dos fechados continua valendo (<= 50)',
    kids.filter((i) => i.startsWith('f')).length <= 50,
    kids.filter((i) => i.startsWith('f')).length)

  // ── painel e export ───────────────────────────────────────────────────────
  // 404 fechados + 240 resolvidos + 14 novos + 4 em atendimento + 1 exótico
  // descoberto = 663 no quadro suporte. A varredura sozinha mostrava 500. O
  // segundo exótico, fora do alcance da varredura, não entra — ver o bloco do
  // limite conhecido no fim.
  const ESPERADO = 663
  for (const [nome, marca] of [
    ['dashboard', '376 tickets GET /tickets/dashboard'],
    ['export', '377 tickets GET /tickets/export'],
    ['my-stats', '379 tickets GET /tickets/my-stats'],
  ]) {
    const h = carregarHandler(marca)
    const rr = await h(ctxDe(tudo))
    const n = corpo(rr).length
    ok(`${nome}: conta os ${ESPERADO} do suporte, não 500`, n === ESPERADO, n)
  }

  // ── a consulta do cliente ─────────────────────────────────────────────────
  const pub = carregarHandler('381 tickets GET /tickets/public')
  // chamado que está FORA das 500 da varredura: antes dava 404 para o cliente
  const fora = tudo.find((t) => t.id === 'novo7')
  r = await pub(ctxDe(tudo, { query: { id: fora.ticket_number } }))
  ok('cliente: acha pelo número mesmo fora das 500', r.status !== 404, { status: r.status, body: r.body })
  r = await pub(ctxDe(tudo, { query: { id: 'novo7' } }))
  ok('cliente: acha pelo id mesmo fora das 500', r.status !== 404, { status: r.status })
  r = await pub(ctxDe(tudo, { query: { id: 'TCK-QUE-NAO-EXISTE' } }))
  ok('cliente: chamado inexistente continua 404', r.status === 404, r.status)
  r = await pub(ctxDe(tudo, { query: {} }))
  ok('cliente: sem id continua 400', r.status === 400, r.status)

  // ── o limite que sobra, registrado de propósito ───────────────────────────
  // Quando a PRÓPRIA partição passa de 500 (os fechados, um dia), nem a
  // consulta filtrada alcança todos, e a varredura complementar também não —
  // ela trunca igual. O que a correção garante nesse cenário é o que importa
  // operacionalmente: chamado ABERTO não desaparece. Este caso existe para
  // que a limitação seja uma decisão registrada, não uma surpresa.
  const estourada = tabela({ fechadosAlemDoTeto: true })
  const r2 = await lista(ctxDe(estourada))
  const ids2 = corpo(r2).map((t) => t.id)
  ok('partição estourada: os 14 novos ainda aparecem',
    ids2.filter((i) => i.startsWith('novo')).length === 14,
    ids2.filter((i) => i.startsWith('novo')).length)
  ok('partição estourada: os 4 em atendimento ainda aparecem',
    ids2.filter((i) => i.startsWith('atend')).length === 4,
    ids2.filter((i) => i.startsWith('atend')).length)
  ok('partição estourada: fechados ficam truncados em 500 (limite conhecido)',
    ids2.filter((i) => i.startsWith('f')).length === 500,
    ids2.filter((i) => i.startsWith('f')).length)
  // O outro limite: status imprevisto que nem a varredura alcança. Fica
  // invisível, e isso é escolha registrada — resolver exigiria descobrir os
  // status pelo banco, e a plataforma não oferece isso.
  ok('limite conhecido: status imprevisto além da varredura fica de fora',
    !ids.includes('exotico_fora'), ids.includes('exotico_fora'))

  fim()
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(1) })
