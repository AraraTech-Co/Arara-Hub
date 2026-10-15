// GET /whatsapp/:id/messages (rota 434) — abrir conversa NÃO espera a Avisa.
//
// O relato do Thiago: trocar de conversa demorava 8-9 s em "Carregando
// mensagens...". A causa estava aqui: a rota marcava as mensagens como lidas
// no WhatsApp antes de responder, com até 5 chamadas SEQUENCIAIS ao
// `markreadMessage`. O tempo limite do fetch da plataforma é 8 s
// (`SANDBOX_FETCH_TIMEOUT_MS`), e era isso que a tela mostrava.
//
// COMO ESTE TESTE PROVA, e por que ele não pode travar: o `ctx.fetch` falso
// NUNCA resolve até o teste soltar. Se a rota esperasse por ele, a promessa do
// handler nunca resolveria — então a espera é feita numa corrida contra um
// timer, e "TRAVOU" é um resultado que o teste SABE ler. Com o `await` de
// volta no handler, é exatamente o que aparece.
//
// E o contador continua zerando: tirar a espera não pode tirar o que apaga o
// distintivo de não lidas.
//
// Roda com: node abrir-conversa-nao-espera-avisa.test.js
const { carregarHandler, reply, ok, fim } = require('./_carregar.js')

const mensagens = carregarHandler('434 whatsapp GET /whatsapp/:id/messages')

const CONV = 'c1'
const EU = 'u1'
const AGORA = Date.now()
const iso = (ms) => new Date(ms).toISOString()

/** Uma conversa com 2 mensagens do cliente por ler, com id de verdade. */
function cenario() {
  const conv = {
    id: CONV,
    remote_jid: '5519999990001@s.whatsapp.net',
    conta_id: 'default',
    unread_count: 2,
    created_at: iso(AGORA - 7200000),
  }
  const msgs = [
    { id: 'm1', conversation_id: CONV, message_id: 'WA_1', from_me: false, body: 'bom dia', sender_jid: '5519999990001@s.whatsapp.net', timestamp: iso(AGORA - 600000) },
    { id: 'm2', conversation_id: CONV, message_id: 'WA_2', from_me: false, body: 'tem alguém?', sender_jid: '5519999990001@s.whatsapp.net', timestamp: iso(AGORA - 300000) },
  ]
  const estado = { conv, msgs, patches: [], fetches: [], eventos: [] }

  // O fetch que trava: registra a chamada e fica pendurado até `soltar()`.
  let soltar
  const pendurado = new Promise((r) => { soltar = r })
  const modelo = (lista) => ({
    findById: async (id) => lista.find((x) => x.id === id) || null,
    findMany: async () => lista,
    create: async (r) => { lista.push(r); return r },
    update: async (id, p) => { estado.patches.push({ id, ...p }); const x = lista.find((y) => y.id === id); Object.assign(x || {}, p); return x },
    delete: async () => {},
  })

  return {
    estado,
    soltar: () => soltar({ status: 200, body: '{}' }),
    ctx: {
      params: { id: CONV },
      query: {},
      headers: {},
      user: { id: EU },
      secrets: { get: async () => 'tok' },
      fetch: async (url, o) => {
        estado.fetches.push({ url, body: o && o.body })
        return pendurado
      },
      models: {
        Sessao: { findById: async () => null },
        Profile: { findById: async () => ({ id: EU, role: 'support' }), findMany: async () => [] },
        WhatsAppConversation: modelo([conv]),
        WhatsAppMessage: Object.assign(modelo(estado.msgs), {
          findMany: async (f) => (f && f.conversation_id
            ? estado.msgs.filter((x) => x.conversation_id === f.conversation_id)
            : estado.msgs),
        }),
        WaConversationEvents: modelo(estado.eventos),
      },
      reply: reply(),
    },
  }
}

/** Espera a rota, mas com um teto: handler que não resolve devolve 'TRAVOU'. */
function comTeto(promessa, ms) {
  let t
  const limite = new Promise((r) => { t = setTimeout(() => r('TRAVOU'), ms) })
  return Promise.race([promessa, limite]).finally(() => clearTimeout(t))
}

;(async () => {
  const c = cenario()
  const r = await comTeto(mensagens(c.ctx), 400)

  ok('a rota responde SEM esperar a Avisa', r !== 'TRAVOU',
    r === 'TRAVOU' ? 'o handler ficou preso na chamada ao markreadMessage' : 'respondeu')
  ok('  e responde 200', r !== 'TRAVOU' && r.status === 200, r !== 'TRAVOU' ? r.status : r)
  ok('  com as duas mensagens', r !== 'TRAVOU' && ((r.body && r.body.data) || []).length === 2,
    r !== 'TRAVOU' ? ((r.body && r.body.data) || []).length : r)
  ok('  e dizendo quantas havia por ler, para desenhar o divisor',
    r !== 'TRAVOU' && r.body && r.body.nao_lidas === 2, r !== 'TRAVOU' ? r.body && r.body.nao_lidas : r)

  // O que NÃO pode ter saído junto com a espera.
  ok('o contador de não lidas foi zerado no banco', c.estado.conv.unread_count === 0, c.estado.conv.unread_count)
  ok('  por um patch explícito', c.estado.patches.some((p) => p.unread_count === 0), c.estado.patches)

  // E a marcação acontece mesmo — só não bloqueia.
  ok('a marcação na Avisa FOI disparada', c.estado.fetches.length >= 1, c.estado.fetches.length)
  ok('  para o markreadMessage',
    c.estado.fetches.every((f) => String(f.url).includes('markreadMessage')),
    c.estado.fetches.map((f) => f.url))

  // Solta o fetch pendurado e deixa a tarefa de fundo terminar, para o
  // processo do teste não morrer com rejeição sem dono.
  c.soltar()
  await new Promise((r) => setImmediate(r))
  ok('nada estourou depois da resposta', true, 'ok')

  fim()
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(1) })
