// PR A — o prazo mora no card Atendente: "Avisar o plantão" na hora ou após N
// minutos sem ninguém assumir.
//
// O que cada bloco prova:
//  - N=0 (ou ausente): comportamento de sempre, avisa na hora;
//  - N>0: o inbound NÃO avisa, grava o prazo, e quem avisa é o relógio;
//  - alguém assumiu antes do prazo: nada sai, nunca;
//  - conversa da madrugada: o prazo conta da ABERTURA da janela, não de
//    `aguardando_desde` — senão o prazo vence enquanto ninguém está de plantão;
//  - os dois caminhos (inbound e rota 490m) aplicam o MESMO prazo. Essa é a
//    duplicação que mais me preocupa: são strings compiladas separadas.
//
// NADA sai para a Avisa: `ctx.fetch` é interceptado.
// Roda com: node plantao-prazo-card.test.js
const { carregarHandlerEContexto, carregarContexto, reply, ok, fim } = require('./_carregar.js')

const { carregarHandler } = require('./_carregar.js')
const { handler: varrer, contexto: ctxVm } = carregarHandlerEContexto('490m whatsapp POST /whatsapp/plantao/varrer')
const simular = carregarHandler('490k whatsapp POST /whatsapp/flows/:id/simular')
const _triagem = carregarContexto('485 whatsapp POST /whatsapp/inbound')._triagem

const TOKEN = 'a'.repeat(64)
const PERFIS = [{ id: 'ana', full_name: 'Ana', phone: '5519999990001', role: 'support' }]
const HORARIO = {
  fuso: 'America/Sao_Paulo',
  // Plantão 18:00–22:00 nos dias de semana.
  plantao: { 1: [['18:00', '22:00']], 2: [['18:00', '22:00']], 3: [['18:00', '22:00']],
             4: [['18:00', '22:00']], 5: [['18:00', '22:00']], 6: [], 0: [] },
  atendimento: { 1: [['08:00', '18:00']], 2: [['08:00', '18:00']], 3: [['08:00', '18:00']],
                 4: [['08:00', '18:00']], 5: [['08:00', '18:00']], 6: [], 0: [] },
}
const ESCALA = [{ id: 'p1', kind: 'plantao', date: '2026-10-12', agent_ids: ['ana'], backup_ids: [] }]

// Segunda 12/10/2026 em São Paulo (UTC-3):
const H = (hhmm) => new Date(`2026-10-12T${hhmm}:00-03:00`).getTime()
const ABERTURA = H('18:00')

function cenario({ conversas = [], fluxo } = {}) {
  const estado = { conversas: conversas.map((c) => ({ ...c })), eventos: [], enviadas: [] }
  const publicado = fluxo || {
    root: 'at',
    nodes: [{ id: 'at', type: 'handoff', data: { text: 'Já avisamos a equipe.' } }],
    edges: [],
  }
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
      },
      WhatsAppMessage: { findMany: async () => [], create: async () => ({}) },
      SystemSettings: { findMany: async () => [{ waMenuEnabled: true, waHorario: JSON.stringify(HORARIO) }] },
      SupportSchedule: { findMany: async () => ESCALA },
      Profile: { findMany: async () => PERFIS, findById: async (id) => PERFIS.find((p) => p.id === id) || null },
      WaConversationEvents: { findMany: async () => estado.eventos, create: async (e) => { estado.eventos.push(e); return e } },
      WaFlows: { findMany: async () => [{ id: 'f1', enabled: true, priority: 0, published: publicado }] },
      Sessao: { findById: async () => null },
    },
    fetch: async (url, o) => { estado.enviadas.push(JSON.parse(o.body)); return { status: 200, body: '{}' } },
  }
}

const ctxDe = (c, extra = {}) => Object.assign({
  params: {}, query: {}, body: {}, headers: {},
  user: { type: 'agendador' },
  models: c.models,
  secrets: { get: async () => 'token-avisa' },
  fetch: c.fetch,
  reply: reply(),
}, extra)

const ctxInbound = (c) => ({
  models: c.models,
  secrets: { get: async () => 'token-avisa' },
  fetch: c.fetch,
})

function comRelogio(t, fn) {
  const real = Date.now
  Date.now = () => t
  return Promise.resolve(fn()).finally(() => { Date.now = real })
}

const naFila = (id, desde, extra = {}) => Object.assign({
  id, remote_jid: '5519' + id + '@s.whatsapp.net', status: 'open', phase: 'novo',
  contact_name: 'Cliente ' + id, aguardando_desde: desde,
}, extra)

const avisos = (c) => c.estado.enviadas.filter((e) => String(e.message).startsWith('Plantão Arara Tech'))
const comToken = (c, extra = {}) => ctxDe(c, Object.assign({ agendadorInterno: TOKEN }, extra))

;(async () => {
  Object.defineProperty(ctxVm, '__araraAgendadorToken', {
    value: TOKEN, enumerable: false, writable: false, configurable: true,
  })

  // ══ card sem prazo: avisa na hora (o que o portal sempre fez) ═══════════
  let c = cenario({ conversas: [] })
  c.estado.conversas.push(naFila('c1', null, { aguardando_desde: null }))
  await comRelogio(H('19:00'), () => _triagem(ctxInbound(c), c.estado.conversas[0], 'oi'))
  ok('card sem o campo: o inbound avisa na hora', avisos(c).length === 1, avisos(c))
  ok('  e grava prazo 0 na conversa', c.estado.conversas[0].aviso_plantao_apos_min === 0,
    c.estado.conversas[0].aviso_plantao_apos_min)

  c = cenario({
    conversas: [naFila('c1', null, { aguardando_desde: null })],
    fluxo: { root: 'at', nodes: [{ id: 'at', type: 'handoff', data: { text: 'ok', avisarApos: 0 } }], edges: [] },
  })
  await comRelogio(H('19:00'), () => _triagem(ctxInbound(c), c.estado.conversas[0], 'oi'))
  ok('card com "na hora" explícito: igual', avisos(c).length === 1, avisos(c))

  // ══ card com prazo: o inbound NÃO avisa ════════════════════════════════
  const COM_PRAZO = {
    root: 'at',
    nodes: [{ id: 'at', type: 'handoff', data: { text: 'Já avisamos a equipe.', avisarApos: 10 } }],
    edges: [],
  }
  c = cenario({ conversas: [naFila('c1', null, { aguardando_desde: null })], fluxo: COM_PRAZO })
  await comRelogio(H('19:00'), () => _triagem(ctxInbound(c), c.estado.conversas[0], 'oi'))
  ok('card com prazo: o inbound não avisa na hora', avisos(c).length === 0, avisos(c))
  ok('  mas o cliente recebe a mensagem do card na hora',
    c.estado.enviadas.some((e) => String(e.message).includes('Já avisamos a equipe')), c.estado.enviadas)
  ok('  e o prazo fica gravado na conversa', c.estado.conversas[0].aviso_plantao_apos_min === 10,
    c.estado.conversas[0].aviso_plantao_apos_min)
  ok('  com a espera carimbada', !!c.estado.conversas[0].aguardando_desde, c.estado.conversas[0])

  // ══ o relógio respeita o prazo ═════════════════════════════════════════
  const emEspera = (min, desde, extra = {}) =>
    naFila('c1', desde, Object.assign({ aviso_plantao_apos_min: min }, extra))

  c = cenario({ conversas: [emEspera(10, '2026-10-12T22:00:00Z')] })   // 19:00 local
  let r = await comRelogio(H('19:05'), () => varrer(comToken(c)))
  ok('5 min depois, com prazo de 10: não avisa', avisos(c).length === 0, avisos(c))
  ok('  e o motivo diz que é o prazo, não fila vazia',
    String(r.body?.data?.motivo || '').includes('prazo'), r.body?.data)

  c = cenario({ conversas: [emEspera(10, '2026-10-12T22:00:00Z')] })
  await comRelogio(H('19:10'), () => varrer(comToken(c)))
  ok('aos 10 min exatos: avisa', avisos(c).length === 1, avisos(c))

  c = cenario({ conversas: [emEspera(10, '2026-10-12T22:00:00Z')] })
  await comRelogio(H('19:40'), () => varrer(comToken(c)))
  ok('bem depois do prazo: avisa', avisos(c).length === 1, avisos(c))

  // ══ alguém assumiu antes: nada sai, nunca ══════════════════════════════
  c = cenario({ conversas: [emEspera(10, '2026-10-12T22:00:00Z', { assigned_to_id: 'ana', first_response_at: '2026-10-12T22:30:00Z' })] })
  await comRelogio(H('19:40'), () => varrer(comToken(c)))
  ok('assumida e respondida antes do prazo: nada é enviado', avisos(c).length === 0, avisos(c))

  // ══ a madrugada: o prazo conta da ABERTURA ═════════════════════════════
  // Esperando desde 02:00; a janela abre às 18:00. Com prazo de 10 min, o
  // aviso sai às 18:10 — não às 18:00, e não "já vencido desde as 02:10".
  c = cenario({ conversas: [emEspera(10, '2026-10-12T05:00:00Z')] })   // 02:00 local
  await comRelogio(H('18:01'), () => varrer(comToken(c)))
  ok('da madrugada, 1 min após abrir: não avisa', avisos(c).length === 0, avisos(c))

  c = cenario({ conversas: [emEspera(10, '2026-10-12T05:00:00Z')] })
  await comRelogio(H('18:10'), () => varrer(comToken(c)))
  ok('  10 min após abrir: avisa', avisos(c).length === 1, avisos(c))

  // Sem prazo, a madrugada é avisada na abertura — o diferido de hoje.
  c = cenario({ conversas: [naFila('c1', '2026-10-12T05:00:00Z')] })
  await comRelogio(H('18:01'), () => varrer(comToken(c)))
  ok('  sem prazo, a abertura avisa (o diferido continua)', avisos(c).length === 1, avisos(c))

  // ══ o ritmo (5 min entre lembretes) continua acima do prazo ═══════════
  c = cenario({ conversas: [emEspera(10, '2026-10-12T22:00:00Z', { aviso_plantao_em: '2026-10-12T22:28:00Z', aviso_plantao_n: 1, aviso_plantao_janela: String(new Date('2026-10-12T21:00:00Z').getTime()) })] })
  await comRelogio(H('19:30'), () => varrer(comToken(c)))
  ok('prazo vencido mas avisado há 2 min: não repete', avisos(c).length === 0, avisos(c))

  // ══ prazo fora de faixa não quebra o motor ═════════════════════════════
  // O editor valida 1–240, mas o fluxo pode vir de importação de JSON.
  c = cenario({
    conversas: [naFila('c1', null, { aguardando_desde: null })],
    fluxo: { root: 'at', nodes: [{ id: 'at', type: 'handoff', data: { text: 'ok', avisarApos: 9999 } }], edges: [] },
  })
  await comRelogio(H('19:00'), () => _triagem(ctxInbound(c), c.estado.conversas[0], 'oi'))
  ok('prazo absurdo é cortado em 240', c.estado.conversas[0].aviso_plantao_apos_min === 240,
    c.estado.conversas[0].aviso_plantao_apos_min)

  c = cenario({
    conversas: [naFila('c1', null, { aguardando_desde: null })],
    fluxo: { root: 'at', nodes: [{ id: 'at', type: 'handoff', data: { text: 'ok', avisarApos: 'dez' } }], edges: [] },
  })
  await comRelogio(H('19:00'), () => _triagem(ctxInbound(c), c.estado.conversas[0], 'oi'))
  ok('prazo que não é número vira 0 (avisa na hora)',
    c.estado.conversas[0].aviso_plantao_apos_min === 0 && avisos(c).length === 1,
    { prazo: c.estado.conversas[0].aviso_plantao_apos_min, avisos: avisos(c).length })

  // ══ os dois caminhos concordam sobre o prazo ═══════════════════════════
  // A função do prazo é copiada entre os blocos 485 e 490m (strings compiladas
  // separadas, sem módulo comum). Este bloco é o que pega a divergência.
  // Os dois últimos casos são os da MADRUGADA, e são o motivo deste bloco
  // existir: foi exatamente aí que os caminhos divergiram na primeira versão —
  // a rota tirava a abertura da janela de um campo que o `_relogio` dela não
  // devolve, e o prazo passava a contar das 02:00.
  const CASOS = [
    { quando: '19:05', desde: '2026-10-12T22:00:00Z', esperado: false, nota: 'dentro do prazo' },
    { quando: '19:10', desde: '2026-10-12T22:00:00Z', esperado: true, nota: 'prazo vencido' },
    { quando: '18:01', desde: '2026-10-12T05:00:00Z', esperado: false, nota: 'madrugada, 1 min após abrir' },
    { quando: '18:10', desde: '2026-10-12T05:00:00Z', esperado: true, nota: 'madrugada, 10 min após abrir' },
  ]
  for (const { quando, desde, esperado, nota } of CASOS) {
    const porRota = cenario({ conversas: [emEspera(10, desde)] })
    await comRelogio(H(quando), () => varrer(comToken(porRota)))

    const porInbound = cenario({ conversas: [emEspera(10, desde)] })
    await comRelogio(H(quando), () => _triagem(ctxInbound(porInbound), porInbound.estado.conversas[0], 'oi'))

    const a = avisos(porRota).length > 0
    const b = avisos(porInbound).length > 0
    ok(`${nota}: os dois caminhos decidem igual (${esperado ? 'avisa' : 'não avisa'})`,
      a === esperado && b === esperado, { rota: a, inbound: b })
  }

  // ══ o simulador DIZ, não finge ═════════════════════════════════════════
  // O editor mentir sobre o teto do card Atraso foi o defeito que eu mesmo
  // descrevi errado no PR #22. Aqui o simulador diz o prazo e avisa que nada
  // é enviado.
  async function simuladoCom(avisarApos) {
    const grafo = {
      root: 'at',
      nodes: [{ id: 'at', type: 'handoff', data: { label: 'Atendente', text: 'Chamando alguém.', avisarApos } }],
      edges: [],
    }
    const r = await simular({
      params: { id: 'f1' }, query: {},
      body: { graph: grafo, mensagens: ['oi'], horario: HORARIO, estado: { nome: 'Cliente' } },
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

  let sim = await simuladoCom(25)
  ok('simulador com prazo: diz o prazo no desfecho',
    String(sim.desfecho || '').includes('após 25 min'), sim.desfecho)
  ok('  e avisa que nada é enviado',
    JSON.stringify(sim.passos || []).includes('nada é enviado'), sim.passos)

  sim = await simuladoCom(0)
  ok('simulador sem prazo: diz "na hora"',
    String(sim.desfecho || '').includes('na hora'), sim.desfecho)

  fim()
})()
