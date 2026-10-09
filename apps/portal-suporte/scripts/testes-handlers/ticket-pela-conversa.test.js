// Ticket criado pela conversa do WhatsApp registra o mesmo histórico da rota
// normal — TCK000638, relato de 06/10 (TCK000713 nasceu com "Nenhum evento
// registrado", embora o aviso tenha sido enviado).
// Roda com: node ticket-pela-conversa.test.js
const { carregarHandler, reply, ok, fim } = require('./_carregar.js')
const handler = carregarHandler('whatsapp POST /whatsapp/:id/ticket')

function mundo({ statusEnvio = 200, semToken = false, semNumero = false } = {}) {
  return {
    conv: {
      id: 'c1',
      remote_jid: semNumero ? 'abc@lid' : '5519999998888@s.whatsapp.net',
      contact_name: 'Contato de Teste',
      ticket_id: null,
    },
    mensagens: [{ id: 'm1', conversation_id: 'c1', direction: 'inbound', created_at: '2026-10-06T13:00:00Z' }],
    logs: [],
    eventosConversa: [],
    tickets: [],
    envios: [],
    statusEnvio,
    semToken,
  }
}

function ctxDe(w) {
  const modelo = (lista) => ({
    findById: async (id) => lista.find((x) => x.id === id) || null,
    findMany: async () => lista,
    create: async (r) => { lista.push(r); return r },
    update: async (id, p) => { const x = lista.find((y) => y.id === id); Object.assign(x || {}, p); return x },
  })
  return {
    params: { id: 'c1' },
    query: {},
    headers: {},
    user: { id: 'u1' },
    body: { title: 'Erro no PDV', description: 'Terminal sem conexão' },
    secrets: { get: async () => (w.semToken ? '' : 'token-de-teste') },
    fetch: async (url, opcoes) => {
      w.envios.push({ url, corpo: opcoes && opcoes.body })
      return { status: w.statusEnvio, body: '' }
    },
    models: {
      Sessao: { findById: async () => null },
      Profile: { findById: async () => ({ id: 'u1', role: 'support' }) },
      WhatsAppConversation: modelo([w.conv]),
      WhatsAppMessage: modelo(w.mensagens),
      WaConversationEvents: modelo(w.eventosConversa),
      Ticket: modelo(w.tickets),
      TicketSequence: modelo([]),
      ActivityLog: modelo(w.logs),
      Attachment: modelo([]),
      Company: modelo([]),
    },
    reply: reply(),
  }
}

const acoes = (w) => w.logs.map((l) => l.action)

;(async () => {
  // Caminho feliz: os dois eventos que a rota normal grava aparecem aqui também.
  let w = mundo()
  let r = await handler(ctxDe(w))
  ok('cria o chamado', r.status === 201, r)
  ok('grava "ticket_created" no histórico do CHAMADO', acoes(w).includes('ticket_created'), acoes(w))
  ok('grava o aviso de acompanhamento no histórico do CHAMADO', acoes(w).includes('acompanhamento_aviso'), acoes(w))
  ok('o evento de criação aponta para o chamado certo',
    (w.logs.find((l) => l.action === 'ticket_created') || {}).ticket_id === w.tickets[0].id, w.logs[0])
  ok('o evento registra que veio do WhatsApp',
    ((w.logs.find((l) => l.action === 'ticket_created') || {}).details || {}).origem === 'whatsapp', w.logs[0])
  ok('o histórico da CONVERSA continua sendo gravado',
    w.eventosConversa.some((e) => e.kind === 'acompanhamento_aviso'), w.eventosConversa)
  ok('provedor aceitando: etapa é "aceito_pelo_provedor", não "entregue"',
    ((w.logs.find((l) => l.action === 'acompanhamento_aviso') || {}).details || {}).desfecho.etapa
      === 'aceito_pelo_provedor',
    w.logs.find((l) => l.action === 'acompanhamento_aviso'))
  ok('nenhum evento é duplicado',
    acoes(w).filter((a) => a === 'ticket_created').length === 1
    && acoes(w).filter((a) => a === 'acompanhamento_aviso').length === 1, acoes(w))

  // O que motivou a correção: recusa do provedor não pode virar sucesso.
  w = mundo({ statusEnvio: 400 })
  await handler(ctxDe(w))
  let aviso = w.logs.find((l) => l.action === 'acompanhamento_aviso')
  const desfecho = (aviso && aviso.details && aviso.details.desfecho) || {}
  ok('provedor recusando (400): o evento existe e guarda o status real',
    !!aviso && desfecho.status === 400, desfecho)
  ok('  e a etapa diz "recusado", nunca "enviado"',
    desfecho.etapa === 'recusado', desfecho)

  // Sem token e sem número: o chamado nasce igual, com a etapa registrada.
  w = mundo({ semToken: true })
  r = await handler(ctxDe(w))
  aviso = w.logs.find((l) => l.action === 'acompanhamento_aviso')
  ok('sem token: chamado criado e etapa "sem_token" registrada',
    r.status === 201 && aviso && aviso.details.desfecho.etapa === 'sem_token', aviso)
  ok('  e nada foi enviado ao provedor', w.envios.length === 0, w.envios)

  w = mundo({ semNumero: true })
  r = await handler(ctxDe(w))
  aviso = w.logs.find((l) => l.action === 'acompanhamento_aviso')
  ok('sem número utilizável: chamado criado e etapa "sem_numero" registrada',
    r.status === 201 && aviso && aviso.details.desfecho.etapa === 'sem_numero', aviso)

  // A guarda da rota continua valendo.
  w = mundo()
  let ctx = ctxDe(w)
  ctx.body = { title: '', description: '' }
  r = await handler(ctx)
  ok('sem título e descrição: 400 e nenhum chamado criado', r.status === 400 && w.tickets.length === 0, r)

  w = mundo()
  w.conv.ticket_id = 'tck-existente'
  r = await handler(ctxDe(w))
  ok('conversa que já tem chamado: 409 e nenhum evento gravado',
    r.status === 409 && w.logs.length === 0, { r, logs: w.logs })

  // ── Entrega 4 (TCK000675 3.2 e 2.5) ──

  // Início do atendimento: a primeira mensagem do cliente, não o cadastro.
  w = mundo()
  await handler(ctxDe(w))
  ok('início do atendimento = primeira mensagem recebida (3.2)',
    w.tickets[0].occurred_at === '2026-10-06T13:00:00Z', w.tickets[0].occurred_at)

  // Conversa reaberta: o início conta a partir da última reabertura, não do
  // atendimento anterior.
  w = mundo()
  w.mensagens = [
    { id: 'velha', conversation_id: 'c1', direction: 'inbound', created_at: '2026-10-01T09:00:00Z' },
    { id: 'nova', conversation_id: 'c1', direction: 'inbound', created_at: '2026-10-06T15:00:00Z' },
  ]
  w.eventosConversa.push({ id: 'e1', conversation_id: 'c1', type: 'reopened', created_at: '2026-10-06T14:59:00Z' })
  await handler(ctxDe(w))
  ok('conversa reaberta: início é a primeira mensagem DEPOIS da reabertura',
    w.tickets[0].occurred_at === '2026-10-06T15:00:00Z', w.tickets[0].occurred_at)

  // Reabertura de OUTRA conversa não interfere.
  w = mundo()
  w.eventosConversa.push({ id: 'e2', conversation_id: 'outra', type: 'reopened', created_at: '2026-10-09T00:00:00Z' })
  await handler(ctxDe(w))
  ok('reabertura de outra conversa não mexe neste início',
    w.tickets[0].occurred_at === '2026-10-06T13:00:00Z', w.tickets[0].occurred_at)

  // Grupo: o código de acompanhamento é pessoal e NÃO pode ir para o grupo.
  w = mundo()
  w.conv.remote_jid = '120363012345678901@g.us'
  w.conv.contact_name = 'Suporte Loja Centro'
  w.mensagens[0].sender_name = 'Maria'
  r = await handler(ctxDe(w))
  aviso = w.logs.find((l) => l.action === 'acompanhamento_aviso')
  ok('grupo: o chamado é criado', r.status === 201, r)
  ok('grupo: NADA é enviado ao provedor — o código não vai para o grupo', w.envios.length === 0, w.envios)
  ok('grupo: a etapa registra o motivo', aviso && aviso.details.desfecho.etapa === 'grupo', aviso)
  ok('grupo: o solicitante é o grupo, com quem iniciou como complemento (2.5)',
    w.tickets[0].requester === 'Suporte Loja Centro — Maria', w.tickets[0].requester)

  // Conversa individual: o solicitante continua sendo o contato, sem sufixo.
  w = mundo()
  w.mensagens[0].sender_name = 'Outro Nome'
  await handler(ctxDe(w))
  ok('conversa individual: solicitante continua sendo o contato',
    w.tickets[0].requester === 'Contato de Teste', w.tickets[0].requester)

  fim()
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(1) })
