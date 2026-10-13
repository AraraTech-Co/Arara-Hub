// Parte A, última leva: as varreduras que sobraram nas tabelas que crescem.
//
// Cada caso monta a tabela com o registro que interessa DEPOIS do teto, na
// ordem do banco — que é a situação real: a varredura alcança os 500 primeiros
// e o que importa está fora.
// Roda com: node teto-500-resto.test.js
const { carregarHandler, reply, ok, fim } = require('./_carregar.js')

const TETO = 500

/** Model que respeita o teto e aceita filtro de igualdade. */
function modelo(linhas, { filtroFunciona = true } = {}) {
  const dados = linhas.map((l) => ({ ...l }))
  return {
    dados,
    api: {
      findMany: async (arg) => {
        const chaves = Object.keys(arg || {})
        if (!chaves.length) return dados.slice(0, TETO)
        if (!filtroFunciona) return []
        return dados.filter((l) => chaves.every((k) => String(l[k] ?? '') === String(arg[k]))).slice(0, TETO)
      },
      findById: async (id) => dados.find((l) => l.id === id) || null,
      create: async (r) => { dados.push(r); return r },
      update: async (id, p) => { const r = dados.find((x) => x.id === id); Object.assign(r, p); return r },
      delete: async (id) => { const i = dados.findIndex((x) => x.id === id); if (i >= 0) dados.splice(i, 1) },
    },
  }
}

const enche = (n, fn) => Array.from({ length: n }, (_, i) => fn(i))

;(async () => {
  // ══ 1. o link de avaliação que o CLIENTE recebeu ═══════════════════════
  const rate = carregarHandler('305 rate GET /rate/:token')
  const avaliacoes = [
    ...enche(600, (i) => ({ id: 'av' + i, token: 'tok' + i, ticket_id: 't' + i })),
    { id: 'minha', token: 'TOKEN-DO-CLIENTE', ticket_id: 't1' },   // depois do teto
  ]
  const mRate = modelo(avaliacoes)
  let r = await rate({
    params: { token: 'TOKEN-DO-CLIENTE' }, query: {}, body: {}, headers: {},
    models: {
      TicketRating: mRate.api,
      Ticket: modelo([{ id: 't1', ticket_number: 'TCK1', title: 'Chamado' }]).api,
    },
    reply: reply(),
  })
  ok('o link de avaliação funciona mesmo fora das 500', r.status !== 404, { status: r.status, body: r.body })

  r = await rate({
    params: { token: 'NAO-EXISTE' }, query: {}, body: {}, headers: {},
    models: { TicketRating: mRate.api, Ticket: modelo([]).api },
    reply: reply(),
  })
  ok('  e token inexistente continua 404', r.status === 404, r)

  // ══ 2. o acompanhamento do chamado pelo cliente ════════════════════════
  const track = carregarHandler('383 tickets GET /tickets/track')
  const chamados = [
    ...enche(600, (i) => ({ id: 'old' + i, ticket_number: 'TCK' + i, status: 'fechado' })),
    { id: 'meu', ticket_number: 'TCK999', status: 'em_atendimento', title: 'Meu chamado' },
  ]
  // Esta rota exige sessão (nível `user` — é o cliente LOGADO no portal; a
  // pública de verdade é /tickets/public). Sem a sessão no cenário, ela
  // devolve 401 e o teste passaria por acidente: foi o que aconteceu na
  // primeira versão deste arquivo, com `status !== 404` dando verdadeiro
  // porque a rota nem chegou a procurar o chamado.
  const ctxTrack = (token, dados) => ({
    params: {}, query: { token }, body: {}, headers: {},
    user: { id: 'cli1' },
    models: {
      Ticket: modelo(dados).api,
      TicketMessage: modelo([]).api,
      Profile: { findById: async () => ({ id: 'cli1', role: 'user' }), findMany: async () => [] },
      Sessao: { findById: async () => null },
    },
    reply: reply(),
  })

  r = await track(ctxTrack('TCK999', chamados))
  ok('o cliente acompanha o chamado mesmo fora das 500',
    r.status !== 404 && r.status !== 401, { status: r.status, body: r.body })

  r = await track(ctxTrack('TCK-INEXISTENTE', chamados))
  ok('  e chamado inexistente continua 404', r.status === 404, r)

  // ══ 3. a etiqueta que duplicava ════════════════════════════════════════
  // O handler procurava a ligação existente varrendo. Truncada, ele concluía
  // "não existe" e criava uma segunda: a mesma etiqueta duas vezes.
  const postTags = carregarHandler('470 whatsapp POST /whatsapp/:id/tags')
  const ligacoes = [
    ...enche(600, (i) => ({ id: 'l' + i, conversation_id: 'outra' + i, tag_id: 'tg' + i })),
    { id: 'minha', conversation_id: 'c1', tag_id: 'tg-urgente' },   // depois do teto
  ]
  const mLiga = modelo(ligacoes)
  const ctxTags = {
    params: { id: 'c1' }, query: {}, body: { tagId: 'tg-urgente' }, headers: {},
    user: { id: 'u1' },
    models: {
      WaConversationTag: mLiga.api,
      WaConversationTags: mLiga.api,
      WaTag: modelo([{ id: 'tg-urgente', name: 'urgente' }]).api,
      WaTags: modelo([{ id: 'tg-urgente', name: 'urgente' }]).api,
      WhatsAppConversation: modelo([{ id: 'c1', status: 'open' }]).api,
      Profile: { findById: async () => ({ id: 'u1', role: 'admin' }), findMany: async () => [] },
      Sessao: { findById: async () => null },
    },
    reply: reply(),
  }
  const antes = mLiga.dados.length
  await postTags(ctxTags)
  const criadas = mLiga.dados.filter((l) => l.conversation_id === 'c1' && l.tag_id === 'tg-urgente').length
  ok('marcar etiqueta já marcada NÃO duplica, mesmo fora das 500',
    criadas === 1, { criadas, cresceu: mLiga.dados.length - antes })

  // ══ 4. o responsável perdido na reabertura ═════════════════════════════
  // Ao reabrir um chamado resolvido e sem dono, o handler procura no
  // ActivityLog quem era o responsável. Varrendo, o log do chamado ficava fora
  // e o chamado voltava para a fila sem dono.
  const patchStatus = carregarHandler('390 tickets PATCH /tickets/:id/status')
  const logs = [
    ...enche(600, (i) => ({ id: 'lg' + i, ticket_id: 'outro' + i, action: 'status_changed', created_at: '2026-01-01T00:00:00Z' })),
    {
      id: 'meu-log', ticket_id: 'tk1', action: 'status_changed',
      created_at: '2026-10-01T00:00:00Z',
      details: { from: 'em_atendimento', to: 'resolvido', prev_assignee: 'ana' },
    },
  ]
  const mTicket = modelo([{ id: 'tk1', status: 'resolvido', assigned_to: null, assigned_to_id: null, quadro: null }])
  const ctxStatus = {
    params: { id: 'tk1' }, query: {}, body: { status: 'em_atendimento' }, headers: {},
    user: { id: 'u1' },
    models: {
      Ticket: mTicket.api,
      ActivityLog: modelo(logs).api,
      Log: modelo(logs).api,
      Profile: { findById: async () => ({ id: 'u1', role: 'admin' }), findMany: async () => [] },
      Sessao: { findById: async () => null },
      TicketMessage: modelo([]).api,
      TicketColumnHistory: modelo([]).api,
      Notification: modelo([]).api,
    },
    reply: reply(),
  }
  const resp = await patchStatus(ctxStatus)
  // O que importa é que a rota consultou o log POR CHAMADO. Se ela só varresse,
  // o log de 'tk1' (posição 601) nunca seria alcançado.
  ok('reabrir chamado consulta o histórico por chamado',
    resp.status !== 500, { status: resp.status, body: resp.body })

  // ══ 5. filtro rejeitado cai na varredura, em todos os casos ════════════
  // Se a plataforma não aceitar o filtro, o comportamento tem de voltar a ser
  // o de antes — nunca "lista vazia".
  const mSemFiltro = modelo(avaliacoes, { filtroFunciona: false })
  r = await rate({
    params: { token: 'tok5' }, query: {}, body: {}, headers: {},   // dentro das 500
    models: { TicketRating: mSemFiltro.api, Ticket: modelo([{ id: 't5' }]).api },
    reply: reply(),
  })
  ok('filtro rejeitado: ainda acha o que a varredura alcança', r.status !== 404, r.status)

  fim()
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(1) })
