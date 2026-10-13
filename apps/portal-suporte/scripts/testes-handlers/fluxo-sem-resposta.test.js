// PR B — "Se o cliente não responder em ___ minutos" nos cards Menu e Pergunta,
// com a saída "sem resposta".
//
// O que importa aqui, e por quê:
//  - quem dispara é o relógio, pelo MODO INTERNO do webhook (bloco 485). O
//    motor do fluxo vive nele; copiar o motor para outra rota seriam 100 mil
//    caracteres duplicados, tudo o que fala com CLIENTE;
//  - sem a prova de origem, um corpo com `__tarefa` tem de ser tratado como
//    webhook comum — nada no comportamento pode revelar que o modo existe;
//  - uma vez por parada, e o cliente escrevendo RENOVA o prazo.
//
// Estas mensagens vão para CLIENTE, por iniciativa do relógio, sem ninguém ter
// escrito. É a primeira vez que o portal faz isso. `ctx.fetch` é interceptado:
// nada sai.
//
// Roda com: node fluxo-sem-resposta.test.js
const { carregarHandler, carregarHandlerEContexto, carregarContexto, reply, ok, fim } = require('./_carregar.js')

const { handler: inbound, contexto: ctxVm } = carregarHandlerEContexto('485 whatsapp POST /whatsapp/inbound')
const simular = carregarHandler('490k whatsapp POST /whatsapp/flows/:id/simular')
const _triagem = carregarContexto('485 whatsapp POST /whatsapp/inbound')._triagem

const TOKEN = 'c'.repeat(64)

// Menu com prazo de 30 min e a saída "sem resposta" ligada a uma mensagem.
const FLUXO = {
  root: 'm1',
  nodes: [
    { id: 'm1', type: 'menu', data: { text: 'Como ajudar?', options: [{ id: 'a', label: 'Suporte' }], semRespostaMin: 30 } },
    { id: 'lembrete', type: 'content', data: { text: 'Ainda está aí? Se precisar, responda a qualquer momento.' } },
    { id: 'atend', type: 'handoff', data: { text: 'Chamando alguém.' } },
  ],
  edges: [
    { source: 'm1', target: 'atend', sourceHandle: 'opt:a' },
    { source: 'm1', target: 'lembrete', sourceHandle: 'timeout' },
  ],
}

// O mesmo fluxo sem a saída ligada: prazo que não leva a nada.
const SEM_SAIDA = {
  root: 'm1',
  nodes: [FLUXO.nodes[0], FLUXO.nodes[2]],
  edges: [{ source: 'm1', target: 'atend', sourceHandle: 'opt:a' }],
}

const T0 = new Date('2026-10-14T13:00:00Z').getTime()   // 10:00 em São Paulo
const minutos = (n) => T0 + n * 60000

function cenario({ conversas = [], fluxo = FLUXO, iaLigada = false } = {}) {
  const estado = { conversas: conversas.map((c) => ({ ...c })), enviadas: [], eventos: [] }
  return {
    estado,
    models: {
      WhatsAppConversation: {
        findById: async (id) => estado.conversas.find((c) => c.id === id) || null,
        findMany: async (arg) => {
          const chaves = Object.keys(arg || {})
          if (!chaves.length) return estado.conversas
          return estado.conversas.filter((c) => chaves.every((k) => String(c[k] ?? '') === String(arg[k])))
        },
        update: async (id, p) => { const c = estado.conversas.find((x) => x.id === id); if (c) Object.assign(c, p) },
        create: async (c) => { estado.conversas.push(c); return c },
      },
      WhatsAppMessage: { findMany: async () => [], create: async () => ({}) },
      SystemSettings: {
        findMany: async () => [Object.assign(
          { waMenuEnabled: true },
          iaLigada ? { waIaEnabled: true, wa_ia: JSON.stringify({ prompt: 'seja breve', modelo: 'claude-opus-4-8' }) } : {},
        )],
      },
      SupportSchedule: { findMany: async () => [] },
      Profile: { findMany: async () => [], findById: async () => null },
      WaConversationEvents: { findMany: async () => estado.eventos, create: async (e) => { estado.eventos.push(e); return e } },
      WaFlows: { findMany: async () => [{ id: 'f1', enabled: true, priority: 0, published: fluxo }] },
      Sessao: { findById: async () => null },
    },
    fetch: async (url, o) => { estado.enviadas.push(JSON.parse(o.body)); return { status: 200, body: '{}' } },
  }
}

const ctxDe = (c, extra = {}) => Object.assign({
  params: {}, query: {}, body: {}, headers: {},
  models: c.models,
  secrets: { get: async () => 'token-avisa' },
  fetch: c.fetch,
  reply: reply(),
}, extra)

function comRelogio(t, fn) {
  const real = Date.now
  Date.now = () => t
  return Promise.resolve(fn()).finally(() => { Date.now = real })
}

const parada = (id, desde, extra = {}) => Object.assign({
  id, remote_jid: '5519' + id + '@s.whatsapp.net', status: 'open', phase: 'triagem',
  contact_name: 'Cliente ' + id, menu_node: 'm1', fluxo_esperando_desde: desde,
}, extra)

const textos = (c) => c.estado.enviadas.map((e) => e.message)
const DESDE = new Date(T0).toISOString()

;(async () => {
  Object.defineProperty(ctxVm, '__araraAgendadorToken', {
    value: TOKEN, enumerable: false, writable: false, configurable: true,
  })
  const interno = (c, extra = {}) =>
    ctxDe(c, Object.assign({ body: { __tarefa: 'sem-resposta' }, agendadorInterno: TOKEN }, extra))

  // ══ a guarda do modo interno ═══════════════════════════════════════════
  // Sem a prova, `__tarefa` é webhook comum: falta `phone`, e a resposta é a
  // de qualquer webhook inválido. O modo não se revela.
  let c = cenario({ conversas: [parada('c1', DESDE)] })
  let r = await comRelogio(minutos(60), () => inbound(ctxDe(c, { body: { __tarefa: 'sem-resposta' } })))
  ok('sem prova de origem: tratado como webhook comum', r.status === 400, r)
  ok('  e a resposta é a de webhook sem telefone',
    String(r.body?.error || '').includes('phone'), r.body)
  ok('  nada foi enviado', c.estado.enviadas.length === 0, textos(c))
  ok('  e a conversa não foi tocada',
    c.estado.conversas[0].fluxo_esperando_desde === DESDE, c.estado.conversas[0])

  // Um webhook de verdade sem `__tarefa` responde igual — a prova de que o
  // 400 acima não é um sinal exclusivo do modo interno.
  const limpo = cenario({ conversas: [] })
  const rLimpo = await comRelogio(minutos(60), () => inbound(ctxDe(limpo, { body: {} })))
  ok('  webhook vazio responde o MESMO que o corpo com __tarefa',
    rLimpo.status === r.status && String(rLimpo.body?.error) === String(r.body?.error),
    { comTarefa: r.body, semTarefa: rLimpo.body })

  c = cenario({ conversas: [parada('c1', DESDE)] })
  r = await comRelogio(minutos(60), () => inbound(interno(c, { agendadorInterno: 'd'.repeat(64) })))
  ok('token errado do mesmo tamanho: webhook comum', r.status === 400, r)
  ok('  e nada foi enviado', c.estado.enviadas.length === 0, textos(c))

  c = cenario({ conversas: [parada('c1', DESDE)] })
  r = await comRelogio(minutos(60), () => inbound(ctxDe(c, {
    body: { __tarefa: 'sem-resposta' },
    headers: { 'x-agendador-interno': TOKEN },
  })))
  ok('HEADER com o token real não serve', r.status === 400, r)
  ok('  e nada foi enviado', c.estado.enviadas.length === 0, textos(c))

  // ══ dentro do prazo: nada acontece ═════════════════════════════════════
  c = cenario({ conversas: [parada('c1', DESDE)] })
  r = await comRelogio(minutos(29), () => inbound(interno(c)))
  ok('29 min com prazo de 30: não segue', r.body?.data?.seguidas === 0, r.body?.data)
  ok('  e nada foi enviado', c.estado.enviadas.length === 0, textos(c))
  ok('  a espera continua carimbada', c.estado.conversas[0].fluxo_esperando_desde === DESDE,
    c.estado.conversas[0].fluxo_esperando_desde)

  // ══ prazo vencido: segue pela saída, UMA vez ═══════════════════════════
  c = cenario({ conversas: [parada('c1', DESDE)] })
  r = await comRelogio(minutos(30), () => inbound(interno(c)))
  ok('aos 30 min exatos: segue', r.body?.data?.seguidas === 1, r.body?.data)
  ok('  e manda a mensagem do card ligado à saída',
    textos(c).some((t) => t.includes('Ainda está aí?')), textos(c))
  ok('  limpa a espera', !c.estado.conversas[0].fluxo_esperando_desde, c.estado.conversas[0])
  ok('  e sai do card (menu_node limpo)', !c.estado.conversas[0].menu_node, c.estado.conversas[0])
  ok('  o resultado diz de onde para onde foi',
    r.body?.data?.detalhe?.[0]?.de === 'm1' && r.body?.data?.detalhe?.[0]?.para === 'lembrete',
    r.body?.data?.detalhe)

  // O MESMO tick de novo, um minuto depois: não repete.
  const antes = c.estado.enviadas.length
  r = await comRelogio(minutos(31), () => inbound(interno(c)))
  ok('o tick seguinte não repete a mesma parada',
    r.body?.data?.seguidas === 0 && c.estado.enviadas.length === antes, {
      seguidas: r.body?.data?.seguidas, enviadas: c.estado.enviadas.length,
    })

  // ══ alguém assumiu: o robô cala a boca ════════════════════════════════
  c = cenario({ conversas: [parada('c1', DESDE, { assigned_to_id: 'ana' })] })
  r = await comRelogio(minutos(60), () => inbound(interno(c)))
  ok('conversa com atendente não é seguida', r.body?.data?.seguidas === 0, r.body?.data)
  ok('  e nada foi enviado', c.estado.enviadas.length === 0, textos(c))

  // ══ saída desligada: nada, e sem erro ═════════════════════════════════
  c = cenario({ conversas: [parada('c1', DESDE)], fluxo: SEM_SAIDA })
  r = await comRelogio(minutos(60), () => inbound(interno(c)))
  ok('prazo vencido com a saída desligada: não faz nada', r.body?.data?.seguidas === 0, r.body?.data)
  ok('  sem erro', r.body?.data?.erros === 0 && r.status === 200, { status: r.status, data: r.body?.data })
  ok('  e nada foi enviado', c.estado.enviadas.length === 0, textos(c))
  ok('  a espera NÃO é limpa (o desenho pode ser completado depois)',
    c.estado.conversas[0].fluxo_esperando_desde === DESDE, c.estado.conversas[0])

  // ══ republicado sem o prazo: para de esperar ══════════════════════════
  const SEM_PRAZO = JSON.parse(JSON.stringify(FLUXO))
  delete SEM_PRAZO.nodes[0].data.semRespostaMin
  c = cenario({ conversas: [parada('c1', DESDE)], fluxo: SEM_PRAZO })
  r = await comRelogio(minutos(600), () => inbound(interno(c)))
  ok('fluxo republicado sem o prazo: não segue', r.body?.data?.seguidas === 0, r.body?.data)
  ok('  e nada foi enviado', c.estado.enviadas.length === 0, textos(c))

  // ══ o card sumiu do fluxo publicado ═══════════════════════════════════
  c = cenario({ conversas: [parada('c1', DESDE, { menu_node: 'card-que-nao-existe' })] })
  r = await comRelogio(minutos(600), () => inbound(interno(c)))
  ok('card inexistente não estoura', r.status === 200 && r.body?.data?.seguidas === 0,
    { status: r.status, data: r.body?.data })
  ok('  e não conta como erro', r.body?.data?.erros === 0, r.body?.data)

  // ══ o cliente escreveu: RENOVA o prazo ════════════════════════════════
  // Renovar, e não limpar: resposta inválida faz o motor repetir o menu sem
  // regravar o estado, e limpar ali tiraria o prazo para sempre.
  c = cenario({ conversas: [parada('c1', DESDE)] })
  await comRelogio(minutos(20), () => _triagem(
    { models: c.models, secrets: { get: async () => 't' }, fetch: c.fetch },
    c.estado.conversas[0], 'nao entendi nada',
  ))
  const renovado = c.estado.conversas[0].fluxo_esperando_desde
  ok('o cliente escreveu: o carimbo é renovado',
    renovado === new Date(minutos(20)).toISOString(), renovado)
  ok('  e ele continua parado no card', c.estado.conversas[0].menu_node === 'm1',
    c.estado.conversas[0].menu_node)
  // 25 min depois da renovação (45 do início) ainda está dentro do prazo.
  r = await comRelogio(minutos(45), () => inbound(interno(c)))
  ok('  então 45 min do início ainda não vencem (prazo conta da renovação)',
    r.body?.data?.seguidas === 0, r.body?.data)
  r = await comRelogio(minutos(50), () => inbound(interno(c)))
  ok('  e 30 min depois da renovação, vence', r.body?.data?.seguidas === 1, r.body?.data)

  // ══ o cliente responde certo: segue o fluxo, sem timeout ══════════════
  c = cenario({ conversas: [parada('c1', DESDE)] })
  await comRelogio(minutos(5), () => _triagem(
    { models: c.models, secrets: { get: async () => 't' }, fetch: c.fetch },
    c.estado.conversas[0], '1',
  ))
  ok('resposta válida leva ao card ligado à opção',
    textos(c).some((t) => t.includes('Chamando alguém')), textos(c))
  r = await comRelogio(minutos(600), () => inbound(interno(c)))
  ok('  e a conversa não é mais candidata ao timeout', r.body?.data?.seguidas === 0, r.body?.data)

  // ══ a parada é gravada com o carimbo ao entrar no card ════════════════
  c = cenario({ conversas: [{
    id: 'novo', remote_jid: '5519novo@s.whatsapp.net', status: 'open', phase: 'novo',
    contact_name: 'Novo', menu_node: null,
  }] })
  await comRelogio(minutos(0), () => _triagem(
    { models: c.models, secrets: { get: async () => 't' }, fetch: c.fetch },
    c.estado.conversas[0], 'oi',
  ))
  ok('parar no menu grava o carimbo da espera',
    c.estado.conversas[0].fluxo_esperando_desde === DESDE, c.estado.conversas[0])
  ok('  junto do card onde parou', c.estado.conversas[0].menu_node === 'm1',
    c.estado.conversas[0].menu_node)

  // Card sem prazo não deixa carimbo para o relógio achar.
  c = cenario({
    conversas: [{ id: 'n2', remote_jid: '5519n2@s.whatsapp.net', status: 'open', phase: 'novo', menu_node: null }],
    fluxo: SEM_PRAZO,
  })
  await comRelogio(minutos(0), () => _triagem(
    { models: c.models, secrets: { get: async () => 't' }, fetch: c.fetch },
    c.estado.conversas[0], 'oi',
  ))
  ok('card sem prazo não grava carimbo', !c.estado.conversas[0].fluxo_esperando_desde,
    c.estado.conversas[0].fluxo_esperando_desde)

  // ══ o simulador: o botão "Não respondeu" ══════════════════════════════
  async function sim(mensagens, grafo = FLUXO) {
    const r = await simular({
      params: { id: 'f1' }, query: {},
      body: { graph: grafo, mensagens, estado: { nome: 'Cliente' } },
      headers: {},
      user: { id: 'u1' },
      models: {
        Profile: { findById: async () => ({ id: 'u1', role: 'support' }) },
        Sessao: { findById: async () => null },
        WaFlows: { findById: async () => ({ id: 'f1', draft: grafo }) },
        SystemSettings: { findMany: async () => [] },
      },
      reply: reply(),
    })
    return r.body?.data || {}
  }

  let s = await sim(['oi', { semResposta: true }])
  ok('simulador: "não respondeu" segue a saída',
    String(s.desfecho || '').includes('seguiria para'), s.desfecho)
  ok('  dizendo o prazo', String(s.desfecho || '').includes('30 min'), s.desfecho)
  ok('  e mostrando a mensagem que o cliente receberia',
    JSON.stringify(s.passos || []).includes('Ainda está aí?'), s.passos)

  s = await sim(['oi', { semResposta: true }], SEM_SAIDA)
  ok('simulador: saída desligada é dita, não escondida',
    String(s.desfecho || '').includes('não está ligada'), s.desfecho)

  const SP2 = JSON.parse(JSON.stringify(FLUXO))
  delete SP2.nodes[0].data.semRespostaMin
  s = await sim(['oi', { semResposta: true }], SP2)
  ok('simulador: card sem prazo diz que esperaria para sempre',
    String(s.desfecho || '').includes('para sempre'), s.desfecho)

  s = await sim([{ semResposta: true }])
  ok('simulador: silêncio antes de qualquer fala não estoura',
    JSON.stringify(s.passos || []).includes('não está parada'), s.passos)

  // ══ com a IA LIGADA, o desvio ainda é o primeiro ══════════════════════
  // Este caso existe por causa de um defeito meu: o desvio tinha ficado
  // DEPOIS do bloco da IA. Com IA ligada, ela responderia ao silêncio do
  // cliente — e o fluxo nunca seguiria a saída "sem resposta". O teste
  // anterior não pegava, porque o cenário tinha a IA desligada.
  c = cenario({ conversas: [parada('c1', DESDE)], iaLigada: true })
  const ctxIa = interno(c)
  // Se a IA for alcançada, ela pede a chave e chama o provedor pelo fetch.
  let pediuChaveIa = false
  ctxIa.secrets = { get: async (k) => { if (k === 'ia_api_key') { pediuChaveIa = true; return 'chave-ia' } return 'token-avisa' } }
  r = await comRelogio(minutos(60), () => inbound(ctxIa))
  ok('com IA ligada, o fluxo ainda segue a saída "sem resposta"',
    r.body?.data?.seguidas === 1, r.body?.data)
  ok('  e a IA nem é consultada (não houve mensagem para responder)',
    pediuChaveIa === false, { pediuChaveIa })
  ok('  a mensagem enviada é a do card, não da IA',
    textos(c).length === 1 && textos(c)[0].includes('Ainda está aí?'), textos(c))

  fim()
})()
