// Motor do fluxo do WhatsApp — Entrega 1 do Fluxo v2.
//
// Prova os três defeitos do diagnóstico de 09/10 sem mandar uma única mensagem
// real: `ctx.fetch` é interceptado, então nada sai para a Avisa.
// Roda com: node fluxo-motor.test.js
const { carregarContexto, ok, fim } = require('./_carregar.js')

const _triagem = carregarContexto('485 whatsapp POST /whatsapp/inbound')._triagem

const GRAFO_MENU = {
  root: 'inicio',
  nodes: [
    { id: 'inicio', type: 'menu', data: { text: 'Olá! Como podemos ajudar?', options: [{ id: 'at', label: 'Falar com um atendente' }] } },
    { id: 'at', type: 'handoff', data: { text: 'Já estou chamando um atendente.', area: 'suporte' } },
  ],
  edges: [{ source: 'inicio', target: 'at', sourceHandle: 'opt:at' }],
}
const grafoCom = (texto) => ({
  root: 'inicio',
  nodes: [{ id: 'inicio', type: 'menu', data: { text: texto, options: [{ id: 'a', label: 'A' }] } }],
  edges: [],
})

function cenario({ fluxos, conv, cfg = { waMenuEnabled: true } }) {
  const enviadas = []
  const gravado = []
  const conversa = Object.assign({ id: 'c1', remote_jid: '5519999990000@s.whatsapp.net', status: 'open' }, conv)
  const ctx = {
    models: {
      WhatsAppConversation: {
        findById: async () => conversa,
        update: async (id, patch) => { gravado.push(patch); Object.assign(conversa, patch) },
        findMany: async () => [conversa],
      },
      WhatsAppMessage: { findMany: async () => [], create: async () => ({}) },
      SystemSettings: { findMany: async () => [cfg] },
      WaFlows: { findMany: async () => fluxos },
      WaConversationEvents: { create: async () => ({}) },
      Profile: { findMany: async () => [], findById: async () => null },
    },
    secrets: { get: async () => 'token-de-teste' },
    // Nada sai para a internet: o envio é interceptado aqui.
    fetch: async (url, opcoes) => {
      enviadas.push(JSON.parse(opcoes.body).message)
      return { status: 200, body: '{"ok":true}' }
    },
  }
  return { ctx, conversa, enviadas, gravado }
}

const mandouMenu = (enviadas) => enviadas.some((t) => String(t).includes('Como podemos ajudar'))

;(async () => {
  // ── defeito 1: seleção do fluxo ───────────────────────────────────────────
  // Fluxo DESATIVADO não atende, mesmo sendo o único publicado.
  let c = cenario({ fluxos: [{ id: 'f1', enabled: false, priority: 0, published: GRAFO_MENU }] })
  await _triagem(c.ctx, c.conversa, 'oi')
  ok('fluxo desativado não atende', c.enviadas.length === 0, c.enviadas)

  // Rascunho NUNCA atende cliente: antes, fluxo sem publicação rodava o draft.
  c = cenario({ fluxos: [{ id: 'f1', enabled: true, priority: 0, published: null, draft: GRAFO_MENU }] })
  await _triagem(c.ctx, c.conversa, 'oi')
  ok('rascunho sem publicação não atende', c.enviadas.length === 0, c.enviadas)

  // Entre dois no ar, vale a MENOR prioridade — a regra que a tela anuncia.
  c = cenario({
    fluxos: [
      { id: 'fb', enabled: true, priority: 5, published: grafoCom('sou o de prioridade 5') },
      { id: 'fa', enabled: true, priority: 1, published: grafoCom('sou o de prioridade 1') },
    ],
  })
  await _triagem(c.ctx, c.conversa, 'oi')
  ok('menor prioridade ganha', c.enviadas.join(' ').includes('prioridade 1'), c.enviadas)

  // Empate de prioridade: o mais antigo, sempre o mesmo — não a ordem do banco.
  const empate = [
    { id: 'zz', enabled: true, priority: 0, created_at: '2026-02-01T00:00:00Z', published: grafoCom('sou o novo') },
    { id: 'aa', enabled: true, priority: 0, created_at: '2026-01-01T00:00:00Z', published: grafoCom('sou o antigo') },
  ]
  for (const ordem of [empate, empate.slice().reverse()]) {
    c = cenario({ fluxos: ordem })
    await _triagem(c.ctx, c.conversa, 'oi')
    ok('  empate resolve no mais antigo, em qualquer ordem do banco',
      c.enviadas.join(' ').includes('sou o antigo'), c.enviadas)
  }

  // Desativado + publicado perde para habilitado de prioridade pior.
  c = cenario({
    fluxos: [
      { id: 'f1', enabled: false, priority: 0, published: grafoCom('desativado') },
      { id: 'f2', enabled: true, priority: 9, published: grafoCom('no ar') },
    ],
  })
  await _triagem(c.ctx, c.conversa, 'oi')
  ok('desativado não ganha de habilitado', c.enviadas.join(' ').includes('no ar'), c.enviadas)

  // ── defeito 2: o loop de menu ─────────────────────────────────────────────
  const noAr = [{ id: 'f1', enabled: true, priority: 0, published: GRAFO_MENU }]

  // Conversa nova recebe o menu — o caminho que deve continuar funcionando.
  c = cenario({ fluxos: noAr, conv: { phase: 'novo' } })
  await _triagem(c.ctx, c.conversa, 'oi')
  ok('conversa nova recebe o menu', mandouMenu(c.enviadas), c.enviadas)

  // Quem já está na fila esperando atendente NÃO recebe o menu de novo.
  c = cenario({
    fluxos: noAr,
    conv: { phase: 'novo', menu_node: null, aguardando_desde: '2026-10-13T10:00:00.000Z' },
  })
  await _triagem(c.ctx, c.conversa, 'alguém aí?')
  ok('quem espera na fila não recebe menu de novo', !mandouMenu(c.enviadas), c.enviadas)

  // E a espera NÃO é reescrita: a fila se ordena por ela, então insistir não
  // pode mandar o cliente para o fim da fila.
  ok('  aguardando_desde preservado',
    c.conversa.aguardando_desde === '2026-10-13T10:00:00.000Z', c.conversa.aguardando_desde)

  // Conversa em loop hoje (sem o carimbo, mas o bot já falou): também para, e
  // ganha o carimbo retroativo.
  c = cenario({
    fluxos: noAr,
    conv: { phase: 'novo', menu_node: null, last_outbound_at: '2026-10-12T09:00:00.000Z' },
  })
  await _triagem(c.ctx, c.conversa, 'e aí?')
  ok('conversa já em loop para de receber menu', !mandouMenu(c.enviadas), c.enviadas)
  ok('  e ganha o carimbo da espera', !!c.conversa.aguardando_desde, c.conversa.aguardando_desde)

  // Quem está NO MEIO do menu continua navegando — a correção não pode
  // congelar a conversa que está escolhendo opção.
  c = cenario({ fluxos: noAr, conv: { phase: 'triagem', menu_node: 'inicio' } })
  await _triagem(c.ctx, c.conversa, 'falar com um atendente')
  ok('quem está no menu continua navegando',
    c.enviadas.join(' ').includes('chamando um atendente'), c.enviadas)

  // ── pausa do robô ─────────────────────────────────────────────────────────
  const daquiA = (min) => new Date(Date.now() + min * 60000).toISOString()
  c = cenario({ fluxos: noAr, conv: { phase: 'novo', robo_pausado_ate: daquiA(30) } })
  await _triagem(c.ctx, c.conversa, 'oi')
  ok('robô pausado não responde', c.enviadas.length === 0, c.enviadas)

  c = cenario({ fluxos: noAr, conv: { phase: 'novo', robo_pausado_ate: daquiA(-30) } })
  await _triagem(c.ctx, c.conversa, 'oi')
  ok('pausa expirada volta a atender', mandouMenu(c.enviadas), c.enviadas)

  // Conversa com dono continua sendo caso de silêncio, como já era.
  c = cenario({ fluxos: noAr, conv: { phase: 'em_atendimento', assigned_to_id: 'u1' } })
  await _triagem(c.ctx, c.conversa, 'oi')
  ok('conversa com atendente segue em silêncio', c.enviadas.length === 0, c.enviadas)

  fim()
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(1) })
