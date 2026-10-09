// O portal para de chamar lacuna de "conversa vazia" — TCK000638, item 1.
// Relato de 05/10: no portal só a mensagem das 11:12; no WhatsApp Web, o
// histórico inteiro. Roda com: node historico-conversa.test.js
const { carregarHandler, reply, ok, fim } = require('./_carregar.js')
const handler = carregarHandler('whatsapp GET /whatsapp/:id/messages')

const HORA = 3600000
const iso = (ms) => new Date(ms).toISOString()
// Relógio real: quando a conversa está vazia, o servidor compara a criação
// com AGORA — é assim que uma conversa que existe há horas sem nenhuma
// mensagem vira suspeita. Datas fixas no teste mentiriam sobre isso.
const AGORA = Date.now()

function mundo({ criadaEm, mensagens = [] }) {
  return {
    conv: { id: 'c1', created_at: criadaEm, unread_count: 0 },
    mensagens,
    eventos: [],
  }
}

function ctxDe(w, { quem = 'u1' } = {}) {
  const modelo = (lista) => ({
    findById: async (id) => lista.find((x) => x.id === id) || null,
    findMany: async () => lista,
    create: async (r) => { lista.push(r); return r },
    update: async (id, p) => { const x = lista.find((y) => y.id === id); Object.assign(x || {}, p); return x },
    delete: async () => {},
  })
  return {
    params: { id: 'c1' },
    query: {},
    headers: {},
    user: quem ? { id: quem } : {},
    secrets: { get: async () => '' },
    fetch: async () => ({ status: 200, body: '' }),
    models: {
      Sessao: { findById: async () => null },
      Profile: { findById: async () => ({ id: 'u1', role: 'support' }) },
      WhatsAppConversation: modelo([w.conv]),
      WhatsAppMessage: modelo(w.mensagens),
      WaConversationEvents: modelo(w.eventos),
    },
    reply: reply(),
  }
}

const msg = (id, quando) => ({ id, conversation_id: 'c1', timestamp: quando, body: 'x', direction: 'inbound' })
const hist = (r) => r.body.historico
const diags = (w) => w.eventos.filter((e) => e.kind === 'diag_historico')

;(async () => {
  // O caso do relato: conversa de ontem, primeira mensagem guardada só hoje.
  let w = mundo({
    criadaEm: iso(AGORA - 26 * HORA),
    mensagens: [msg('m1', iso(AGORA - 3 * HORA))],
  })
  let r = await handler(ctxDe(w))
  ok('responde as mensagens que tem', r.status === 200 && r.body.data.length === 1, r.status)
  ok('acusa lacuna: a conversa é bem anterior à primeira mensagem', hist(r).lacuna === true, hist(r))
  ok('diz desde quando tem histórico', hist(r).desde === iso(AGORA - 3 * HORA), hist(r))
  ok('diz desde quando a conversa existe', hist(r).conversa_desde === iso(AGORA - 26 * HORA), hist(r))
  ok('registra o diagnóstico técnico da lacuna', diags(w).length === 1, w.eventos)
  ok('  sem texto de mensagem no registro',
    !JSON.stringify(diags(w)[0]).includes('"x"'), diags(w)[0])

  // Reabrir a mesma conversa não enche a tabela de eventos.
  await handler(ctxDe(w))
  ok('abrir de novo não duplica o diagnóstico', diags(w).length === 1, w.eventos.length)

  // Conversa normal: nasce da primeira mensagem, sem lacuna.
  w = mundo({
    criadaEm: iso(AGORA - 3 * HORA),
    mensagens: [msg('m1', iso(AGORA - 3 * HORA + 2000)), msg('m2', iso(AGORA - HORA))],
  })
  r = await handler(ctxDe(w))
  ok('conversa normal não acusa lacuna', hist(r).lacuna === false, hist(r))
  ok('  e não gera diagnóstico', diags(w).length === 0, w.eventos)
  ok('  com o total certo', hist(r).total === 2, hist(r))

  // Conversa realmente vazia e recém-criada: nada a declarar.
  w = mundo({ criadaEm: iso(AGORA - 60000), mensagens: [] })
  r = await handler(ctxDe(w))
  ok('conversa nova e vazia: sem lacuna, total 0', hist(r).total === 0 && hist(r).lacuna === false, hist(r))

  // Conversa antiga e vazia: isso NÃO é "conversa vazia", é histórico que não chegou.
  w = mundo({ criadaEm: iso(AGORA - 48 * HORA), mensagens: [] })
  r = await handler(ctxDe(w))
  ok('conversa antiga e sem nenhuma mensagem: acusa lacuna', hist(r).lacuna === true, hist(r))
  ok('  e `desde` fica nulo, porque não há o que mostrar', hist(r).desde === null, hist(r))

  // O que já existia continua funcionando.
  w = mundo({ criadaEm: iso(AGORA - 3 * HORA), mensagens: [msg('m1', iso(AGORA - HORA))] })
  w.conv.unread_count = 4
  r = await handler(ctxDe(w))
  ok('abrir a conversa continua zerando o não lido', w.conv.unread_count === 0, w.conv)
  ok('  e devolvendo quantas estavam por ler', r.body.nao_lidas === 4, r.body.nao_lidas)

  fim()
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(1) })
