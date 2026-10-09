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

function mundo({ criadaEm, mensagens = [], filtroFunciona = true }) {
  return {
    conv: { id: 'c1', created_at: criadaEm, unread_count: 0 },
    mensagens,
    eventos: [],
    chamadas: [],
    filtroFunciona,
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
      WhatsAppMessage: Object.assign(modelo(w.mensagens), {
        // Registra como a rota pediu as mensagens, e simula o teto de 500 da
        // plataforma quando o pedido vem sem filtro.
        findMany: async (filtro) => {
          w.chamadas.push(filtro && filtro.conversation_id ? 'filtro' : 'varredura')
          if (filtro && filtro.conversation_id) {
            if (!w.filtroFunciona) return []
            return w.mensagens.filter((m) => m.conversation_id === filtro.conversation_id)
          }
          return w.mensagens.slice(-500)
        },
      }),
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

  // ── O teto de 500 do findMany (causa raiz do "Sem mensagem") ──

  // Conversa antiga com muita mensagem nova no banco: antes a varredura
  // trazia só as 500 últimas do portal INTEIRO e a conversa parecia vazia.
  const muitas = []
  for (let i = 0; i < 900; i++) {
    muitas.push({ id: 'outra' + i, conversation_id: 'c-outra', timestamp: iso(AGORA - (900 - i) * 1000), body: 'x', direction: 'inbound' })
  }
  muitas.push(msg('minha1', iso(AGORA - 40 * HORA)))
  muitas.push(msg('minha2', iso(AGORA - 39 * HORA)))
  w = mundo({ criadaEm: iso(AGORA - 41 * HORA), mensagens: muitas })
  r = await handler(ctxDe(w))
  ok('conversa antiga aparece mesmo com 900 mensagens de outras na frente',
    r.body.data.length === 2, { qtd: r.body.data.length, via: hist(r).via })
  ok('  pediu ao banco com filtro, não varreu tudo',
    w.chamadas[0] === 'filtro' && !w.chamadas.includes('varredura'), w.chamadas)
  ok('  e não acusa truncamento', hist(r).truncado === false, hist(r))

  // Se o banco não aceitar o filtro, a varredura ainda responde.
  w = mundo({ criadaEm: iso(AGORA - 3 * HORA), mensagens: [msg('m1', iso(AGORA - HORA))], filtroFunciona: false })
  r = await handler(ctxDe(w))
  ok('filtro não aceito: cai na varredura e ainda devolve a mensagem',
    r.body.data.length === 1 && hist(r).via === 'varredura', { r: r.body.data.length, h: hist(r) })

  // Varredura que bate no teto é sinalizada.
  const cheio = []
  for (let i = 0; i < 500; i++) cheio.push({ id: 'z' + i, conversation_id: 'c-outra', timestamp: iso(AGORA - i * 1000), body: 'x', direction: 'inbound' })
  w = mundo({ criadaEm: iso(AGORA - 3 * HORA), mensagens: cheio, filtroFunciona: false })
  r = await handler(ctxDe(w))
  ok('varredura no teto de 500 é marcada como truncada', hist(r).truncado === true, hist(r))
  ok('  e nenhuma mensagem de outra conversa vaza', r.body.data.length === 0, r.body.data.length)

  fim()
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(1) })
