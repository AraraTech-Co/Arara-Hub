// Lista de conversas: o teto de 500 não pode esconder conversa aberta, e a
// tela não pode dizer "Sem mensagens" sobre conversa que tem mensagens.
// Roda com: node lista-conversas.test.js
const { carregarHandler, reply, ok, fim } = require('./_carregar.js')

const handler = carregarHandler('432 whatsapp GET /whatsapp')

// A borda da janela é relativa ao relógio: datas fixas envelhecem e um dia
// passam a mascarar o caso (foi o que aconteceu no teste de histórico).
const AGORA = Date.now()
const iso = (horasAtras) => new Date(AGORA - horasAtras * 3600_000).toISOString()

function ctxDe({ conversas, mensagens, filtroStatusFunciona = true, varredura = null, consultas = [] }) {
  const TETO = 500
  const Conv = {
    findMany: async (arg) => {
      const chaves = Object.keys(arg || {})
      consultas.push(arg || {})
      if (chaves.length === 0) {
        // A varredura é truncada pelo teto, como em produção.
        return (varredura || conversas).slice(0, TETO)
      }
      if (!filtroStatusFunciona) return []
      return conversas.filter((c) => c.status === arg.status).slice(0, TETO)
    },
    update: async () => {},
  }
  const Msg = {
    findMany: async (arg) => {
      const chaves = Object.keys(arg || {})
      if (chaves.length === 0) return mensagens.slice(0, TETO)
      consultas.push(arg)
      return mensagens.filter((x) => x.conversation_id === arg.conversation_id)
    },
  }
  const vazio = { findMany: async () => [], findById: async () => null }
  return {
    params: {}, query: {}, body: {}, headers: {},
    user: { id: 'u1' },
    models: {
      Sessao: { findById: async () => null },
      Profile: { findById: async () => ({ id: 'u1', role: 'admin' }), findMany: async () => [] },
      WhatsAppConversation: Conv,
      WhatsAppMessage: Msg,
      SystemSettings: vazio,
      WaDepartment: vazio, Company: vazio, CompanyContact: vazio,
      Ticket: vazio, WaCloseReason: vazio, WaTag: vazio,
      WaConversationTag: vazio, WaConversationEvents: vazio,
    },
    reply: reply(),
  }
}

;(async () => {
  // ── 1. conversa aberta não pode cair fora do teto ─────────────────────────
  // 600 conversas, teto 500: a varredura devolve as 500 PRIMEIRAS da ordem do
  // banco, e a aberta está na posição 550. Sem o filtro por status ela
  // desaparece do painel — é o que acontece hoje a 38 conversas de distância.
  const muitas = []
  for (let i = 0; i < 600; i++) {
    muitas.push({
      id: 'c' + i,
      status: i === 550 ? 'open' : 'closed',
      remote_jid: '55199999' + i + '@s.whatsapp.net',
      contact_name: 'Cliente ' + i,
      updated_at: iso(1),
      created_at: iso(48),
    })
  }
  let r = await handler(ctxDe({ conversas: muitas, mensagens: [] }))
  let ids = (r.body.data || []).map((c) => c.id)
  ok('aberta além do teto aparece na lista', ids.includes('c550'), {
    total: ids.length, achou: ids.includes('c550'),
  })

  // A correção não pode custar nada enquanto a tabela couber: partir por status
  // em toda leitura trocaria 1 consulta por várias, sem necessidade.
  const cabe = []
  await handler(ctxDe({ conversas: muitas.slice(0, 120), mensagens: [], consultas: cabe }))
  ok('tabela que cabe no teto: UMA consulta de conversas',
    cabe.filter((a) => !Object.keys(a).length || 'status' in a).length === 1,
    cabe.filter((a) => !Object.keys(a).length || 'status' in a).length)

  // ── 2. filtro por status quebrado não pode esvaziar a lista ───────────────
  r = await handler(ctxDe({ conversas: muitas, mensagens: [], filtroStatusFunciona: false }))
  ok('filtro inútil cai na varredura, não em lista vazia',
    (r.body.data || []).length === 500, (r.body.data || []).length)

  // ── 3. fechada antiga sem prévia: "indisponível", não "sem mensagens" ─────
  const conversas = [
    { id: 'antiga', status: 'closed', remote_jid: '5519111@s.whatsapp.net', contact_name: 'Antiga', updated_at: iso(200), created_at: iso(300) },
    { id: 'nova', status: 'open', remote_jid: '5519222@s.whatsapp.net', contact_name: 'Nova', updated_at: iso(0.1), created_at: iso(0.2) },
    { id: 'aberta_fora', status: 'open', remote_jid: '5519333@s.whatsapp.net', contact_name: 'Fora da janela', updated_at: iso(100), created_at: iso(150) },
  ]
  // A janela de leitura só alcança as últimas 2h: a mensagem da 'aberta_fora'
  // existe, mas a varredura não a vê.
  const mensagens = [
    { id: 'm_janela', conversation_id: 'outra', body: 'dentro da janela', timestamp: iso(1) },
  ]
  const soltas = [
    { id: 'm_fora', conversation_id: 'aberta_fora', body: 'oi, preciso de ajuda', timestamp: iso(120) },
  ]
  const consultas = []
  r = await handler(ctxDe({
    conversas,
    mensagens: mensagens.concat(soltas).filter((x) => x.id === 'm_janela'),
    consultas,
  }))
  // a busca filtrada precisa achar a mensagem solta
  const ctx2 = ctxDe({ conversas, mensagens, consultas })
  ctx2.models.WhatsAppMessage.findMany = async (arg) => {
    if (!Object.keys(arg || {}).length) return mensagens
    return soltas.filter((x) => x.conversation_id === arg.conversation_id)
  }
  r = await handler(ctx2)
  const porId = {}
  for (const c of r.body.data || []) porId[c.id] = c

  ok('fechada antiga: prévia indisponível', porId.antiga && porId.antiga.previa_indisponivel === true, porId.antiga)
  ok('  e não finge ter mensagem', porId.antiga && !porId.antiga.last_message, porId.antiga)
  ok('conversa nova e vazia: não marca indisponível',
    porId.nova && porId.nova.previa_indisponivel === false, porId.nova)

  // ── 4. aberta fora da janela ganha prévia por busca filtrada ──────────────
  ok('aberta fora da janela recupera a prévia',
    porId.aberta_fora && porId.aberta_fora.last_message
      && String(porId.aberta_fora.last_message.body).includes('preciso de ajuda'),
    porId.aberta_fora && porId.aberta_fora.last_message)

  // ── 5. a correção não vira centenas de consultas ──────────────────────────
  // 300 abertas sem prévia: o teto de 40 segura a conta.
  const abertas = []
  for (let i = 0; i < 300; i++) {
    abertas.push({ id: 'a' + i, status: 'open', remote_jid: '5519' + i + '@s.whatsapp.net', contact_name: 'A' + i, updated_at: iso(50), created_at: iso(60) })
  }
  const porConversa = []
  const ctx5 = ctxDe({ conversas: abertas, mensagens: [] })
  ctx5.models.WhatsAppMessage.findMany = async (arg) => {
    if (Object.keys(arg || {}).length) { porConversa.push(arg); return [] }
    return []
  }
  await handler(ctx5)
  ok('busca por conversa tem teto (<= 40)', porConversa.length <= 40, porConversa.length)

  fim()
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(1) })
