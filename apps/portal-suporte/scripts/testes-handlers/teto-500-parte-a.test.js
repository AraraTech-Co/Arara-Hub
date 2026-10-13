// Parte A — as varreduras que o teto de 500 estraga em silêncio.
// Roda com: node teto-500-parte-a.test.js
const { carregarHandler, carregarContexto, reply, ok, fim } = require('./_carregar.js')

const TETO = 500

;(async () => {
  // ── o teto de respostas da IA ────────────────────────────────────────────
  // O caso que mais importa: o teto conta quantas vezes a IA já respondeu
  // NESTA conversa. Varrendo a tabela inteira, com a tabela cheia os eventos
  // da conversa caem fora da janela, o contador volta zero e o teto deixa de
  // existir — a IA passa a responder sem limite.
  const ctxMotor = carregarContexto('485 whatsapp POST /whatsapp/inbound')
  const _triagem = ctxMotor._triagem

  // 600 eventos de OUTRAS conversas na frente, e os desta no fim: é a ordem do
  // banco que decide quem a varredura alcança, e ela não alcança o fim.
  function eventos({ respostasDesta }) {
    const t = []
    for (let i = 0; i < 600; i++) {
      t.push({ id: 'e' + i, conversation_id: 'outra' + i, kind: 'ia_resposta' })
    }
    for (let i = 0; i < respostasDesta; i++) {
      t.push({ id: 'minha' + i, conversation_id: 'c1', kind: 'ia_resposta' })
    }
    return t
  }

  function cenarioIa({ respostasDesta }) {
    const todos = eventos({ respostasDesta })
    const conversa = { id: 'c1', remote_jid: '5519999990000@s.whatsapp.net', status: 'open', phase: 'novo' }
    const chamadas = []
    return {
      conversa,
      chamadas,
      ctx: {
        models: {
          WhatsAppConversation: { findById: async () => conversa, update: async () => {}, findMany: async () => [conversa] },
          WhatsAppMessage: { findMany: async () => [], create: async () => ({}) },
          // IA ligada, sem chave: o motor conta as respostas e para antes de
          // chamar a IA — é a contagem que este teste observa.
          SystemSettings: { findMany: async () => [{ waIaEnabled: true, waMenuEnabled: true }] },
          WaFlows: { findMany: async () => [] },
          WaConversationEvents: {
            findMany: async (arg) => {
              const chaves = Object.keys(arg || {})
              chamadas.push(arg || {})
              if (!chaves.length) return todos.slice(0, TETO)
              return todos.filter((e) => chaves.every((k) => String(e[k] ?? '') === String(arg[k])))
            },
            create: async () => ({}),
          },
          Profile: { findMany: async () => [], findById: async () => null },
          SupportSchedule: { findMany: async () => [] },
        },
        secrets: { get: async () => null },
        fetch: async () => ({ status: 200, body: '{}' }),
      },
    }
  }

  let c = cenarioIa({ respostasDesta: 9 })
  await _triagem(c.ctx, c.conversa, 'oi')
  ok('o teto da IA consulta por conversa, não varre a tabela',
    c.chamadas.some((a) => 'conversation_id' in a), c.chamadas)

  // As duas sondas de diagnóstico (nome de grupo e mídia) têm o mesmo defeito
  // com outra consequência: com a tabela cheia o contador zera e a sonda volta
  // a gravar para sempre numa tabela de produção. Foram corrigidas pelo mesmo
  // mecanismo, mas NÃO têm caso dedicado aqui — exercitá-las exige um inbound
  // com mídia e com grupo sem nome. Fica dito em vez de fingido: eu havia
  // escrito um `ok(..., true, ...)` para elas, que é um teste que não testa.

  // ── o contador de mensagens do kanban ────────────────────────────────────
  const kanban = carregarHandler('378 tickets GET /tickets/kanban')

  function cenarioKanban({ comContador }) {
    // 600 mensagens: a varredura alcança 500, e as do chamado alvo estão no
    // fim — então contar varrendo diz "intocado" para um chamado movimentado.
    const msgs = []
    for (let i = 0; i < 600; i++) msgs.push({ id: 'm' + i, ticket_id: 'outro' + i })
    for (let i = 0; i < 7; i++) msgs.push({ id: 'meu' + i, ticket_id: 't1' })
    const ticket = {
      id: 't1', status: 'novos_chamados', quadro: null, ticket_number: 'TCK1',
      attachment_count: 0,
    }
    if (comContador) ticket.message_count = 7
    const vazio = { findMany: async () => [], findById: async () => null }
    return {
      params: {}, query: {}, body: {}, headers: {},
      user: { id: 'u1' },
      models: {
        Ticket: {
          findMany: async (arg) => (Object.keys(arg || {}).length
            ? [ticket].filter((t) => Object.keys(arg).every((k) => String(t[k] ?? '') === String(arg[k])))
            : [ticket]),
          findById: async () => ticket,
        },
        TicketMessage: { findMany: async () => msgs.slice(0, TETO) },
        Profile: { findById: async () => ({ id: 'u1', role: 'admin' }), findMany: async () => [] },
        Sessao: { findById: async () => null },
        TicketCoAssignee: vazio, Unit: vazio, TicketTrack: vazio, Company: vazio,
      },
      reply: reply(),
    }
  }

  const achaCard = (r) => {
    const d = r.body && r.body.data
    const todos = []
    if (Array.isArray(d)) todos.push(...d)
    else if (d) Object.values(d).forEach((v) => Array.isArray(v) && todos.push(...v))
    return todos.find((t) => t.id === 't1')
  }

  let card = achaCard(await kanban(cenarioKanban({ comContador: true })))
  ok('com o contador materializado, o card mostra as 7 mensagens',
    card && card.message_count === 7, card)
  ok('  e não marca truncado', card && card.message_count_truncado === undefined, card)

  card = achaCard(await kanban(cenarioKanban({ comContador: false })))
  ok('sem o contador, cai na varredura (contagem antiga, incompleta)',
    card && card.message_count === 0, card)
  ok('  mas AVISA que o número veio truncado',
    card && card.message_count_truncado === true, card)

  fim()
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(1) })
