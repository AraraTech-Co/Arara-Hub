// GET /tickets/public (rota 381) — rota interna, exige sessão de atendente.
//
// O caminho do cliente para acompanhar o próprio chamado é POST
// /tickets/acompanhar, que pede número + código, limita tentativa e expira.
// Este teste também confere que aquela rota continua intacta: é ela que a
// tela /acompanhar usa, e mexer na 381 não pode mudar nada lá.
//
// Roda com: node tickets-public-guarda.test.js
const { carregarHandler, reply, ok, fim } = require('./_carregar.js')

const publico = carregarHandler('381 tickets GET /tickets/public')
const acompanhar = carregarHandler('412 tickets POST /tickets/acompanhar')

const ATENDENTE = { id: 'u-ana', full_name: 'Ana', role: 'support' }
const CLIENTE = { id: 'u-cli', full_name: 'Cliente', role: 'user' }

const DO_SITE = {
  id: 't1', ticket_number: 'TCK000100', title: 'Impressora não imprime',
  status: 'novos_chamados', priority: 'p2', is_public: true,
  contact_email: 'cliente@empresa.com', company_name: 'Empresa X',
  acomp_codigo: 'ABC123', acomp_expira_em: '2027-01-01T00:00:00Z',
  created_at: '2026-10-01T10:00:00Z',
}
const INTERNO = {
  id: 't2', ticket_number: 'TCK000101', title: 'Chamado interno',
  status: 'triagem', is_public: false, created_at: '2026-10-02T10:00:00Z',
}

function cenario({ tickets = [DO_SITE, INTERNO], perfil = ATENDENTE } = {}) {
  const estado = { tickets: tickets.map((t) => ({ ...t })), varreu: false, atualizados: [] }
  return {
    estado,
    models: {
      Ticket: {
        findById: async (id) => estado.tickets.find((t) => t.id === id) || null,
        findMany: async (arg) => {
          const chaves = Object.keys(arg || {})
          // Varredura é defeito: 800+ chamados e teto de 500.
          if (!chaves.length) { estado.varreu = true; return [] }
          return estado.tickets.filter((t) => chaves.every((k) => String(t[k] ?? '') === String(arg[k])))
        },
        update: async (id, p) => { estado.atualizados.push({ id, p }); const t = estado.tickets.find((x) => x.id === id); if (t) Object.assign(t, p) },
      },
      TicketMessage: {
        findMany: async () => [
          { id: 'm1', ticket_id: 't1', message: 'Olá', is_internal: false, created_at: '2026-10-01T11:00:00Z', user_id: 'u-ana' },
          { id: 'm2', ticket_id: 't1', message: 'nota interna', is_internal: true, created_at: '2026-10-01T12:00:00Z' },
        ],
      },
      Profile: { findById: async (id) => (perfil && id === perfil.id ? perfil : null) },
      TicketEvent: { findMany: async () => [] },
      ActivityLog: { findMany: async () => [] },
      Sessao: { findById: async () => null },
    },
  }
}

const ctxDe = (c, extra = {}) => Object.assign({
  params: {}, query: {}, body: {}, headers: {},
  models: c.models,
  reply: reply(),
}, extra)

;(async () => {
  // ══ a guarda ══════════════════════════════════════════════════════════
  let c = cenario()
  let r = await publico(ctxDe(c, { query: { id: 'TCK000100' } }))
  ok('sem sessão: 401', r.status === 401, r)
  ok('  e não devolve o chamado', !r.body?.ticket_number && !r.body?.messages, r.body)
  ok('  sem dizer se o chamado existe',
    !JSON.stringify(r.body || {}).includes('TCK000100'), r.body)

  // A MESMA resposta para um número que não existe: nada de oráculo.
  c = cenario()
  const inexistente = await publico(ctxDe(c, { query: { id: 'TCK999999' } }))
  ok('  e a resposta é igual para número que não existe',
    inexistente.status === r.status && JSON.stringify(inexistente.body) === JSON.stringify(r.body),
    { existe: r.body, naoExiste: inexistente.body })

  c = cenario({ perfil: CLIENTE })
  r = await publico(ctxDe(c, { query: { id: 'TCK000100' }, user: { id: CLIENTE.id } }))
  ok('nível user: 403', r.status === 403, r)
  ok('  e nada do chamado na resposta',
    !JSON.stringify(r.body || {}).includes('cliente@empresa.com'), r.body)

  // ══ com sessão de atendente ═══════════════════════════════════════════
  c = cenario()
  r = await publico(ctxDe(c, { query: { id: 'TCK000100' }, user: { id: ATENDENTE.id } }))
  ok('atendente: 200 com o chamado', r.status === 200 && r.body?.ticket_number === 'TCK000100', r.body?.ticket_number)
  ok('  com as mensagens não internas', (r.body?.messages || []).length === 1, r.body?.messages)
  ok('  e sem a nota interna',
    !JSON.stringify(r.body?.messages || []).includes('nota interna'), r.body?.messages)

  // por id também, não só por número
  c = cenario()
  r = await publico(ctxDe(c, { query: { id: 't1' }, user: { id: ATENDENTE.id } }))
  ok('acha por id interno também', r.body?.ticket_number === 'TCK000100', r.body?.ticket_number)

  c = cenario()
  r = await publico(ctxDe(c, { query: { id: 'TCK999999' }, user: { id: ATENDENTE.id } }))
  ok('número que não existe, com sessão: 404', r.status === 404, r.status)

  // ══ sem id: a lista que a tela espera ════════════════════════════════
  c = cenario()
  r = await publico(ctxDe(c, { query: {}, user: { id: ATENDENTE.id } }))
  ok('sem id: devolve lista (era 400, e a tela ficava vazia)',
    Array.isArray(r.body?.data), r.body)
  ok('  só os chamados do site', (r.body?.data || []).length === 1
    && r.body.data[0].ticket_number === 'TCK000100', (r.body?.data || []).map((t) => t.ticket_number))
  ok('  e NUNCA varre a tabela', c.estado.varreu === false, { varreu: c.estado.varreu })

  // Ordem: dois públicos, para a asserção ter o que comparar. (A primeira
  // versão deste caso era `true || ...`, que passa sempre — o mesmo teste
  // decorativo que eu já tinha escrito uma vez hoje.)
  c = cenario({ tickets: [
    { ...DO_SITE, id: 't1', ticket_number: 'TCK000100', created_at: '2026-10-01T10:00:00Z' },
    { ...DO_SITE, id: 't3', ticket_number: 'TCK000200', created_at: '2026-10-05T10:00:00Z' },
    INTERNO,
  ] })
  r = await publico(ctxDe(c, { query: {}, user: { id: ATENDENTE.id } }))
  ok('  mais novo primeiro',
    (r.body?.data || []).map((t) => t.ticket_number).join(',') === 'TCK000200,TCK000100',
    (r.body?.data || []).map((t) => t.ticket_number))

  c = cenario()
  r = await publico(ctxDe(c, { query: {} }))
  ok('a lista também exige sessão', r.status === 401, r.status)

  // ══ /acompanhar INALTERADA ═══════════════════════════════════════════
  // É a rota que a tela /acompanhar usa. O que ela devolve é o contrato da
  // tela, então comparo campo a campo.
  c = cenario()
  r = await acompanhar(ctxDe(c, { body: { numero: 'TCK000100', codigo: 'ABC123' } }))
  ok('/acompanhar com código certo: 200', r.status === 200 && r.body?.success === true, r.status)
  const d = r.body?.data || {}
  ok('  devolve os campos que a tela usa',
    ['numero', 'titulo', 'etapa', 'aberto_em', 'resolvido_em', 'prazo_atendimento', 'encerrado', 'linha_do_tempo']
      .every((k) => k in d), Object.keys(d))
  ok('  e NADA além deles', Object.keys(d).length === 8, Object.keys(d))
  ok('  sem o e-mail do contato', !JSON.stringify(d).includes('cliente@empresa.com'), Object.keys(d))

  c = cenario()
  r = await acompanhar(ctxDe(c, { body: { numero: 'TCK000100', codigo: 'ERRADO' } }))
  ok('/acompanhar com código errado: recusa', r.status === 400, r.status)
  ok('  e conta a tentativa no chamado',
    c.estado.atualizados.some((u) => u.p.acomp_tentativas === 1), c.estado.atualizados)

  c = cenario()
  r = await acompanhar(ctxDe(c, { body: { numero: 'TCK000100' } }))
  ok('/acompanhar sem código: recusa', r.status === 400, r.status)

  fim()
})()
