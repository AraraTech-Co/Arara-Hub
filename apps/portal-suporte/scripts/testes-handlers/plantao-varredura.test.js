// Varredura da fila pelo relógio interno — rota POST /whatsapp/plantao/varrer.
//
// NADA sai para a Avisa: `ctx.fetch` é interceptado.
// Roda com: node plantao-varredura.test.js
const { carregarHandlerEContexto, carregarContexto, reply, ok, fim } = require('./_carregar.js')

// O handler lê o token de `globalThis`. Em produção isso é o global do Node (os
// handlers rodam com `new Function`); aqui é o contexto isolado do `vm`, então
// o token tem de ser instalado NELE.
const { handler: varrer, contexto: ctxVm } = carregarHandlerEContexto('490m whatsapp POST /whatsapp/plantao/varrer')
const _triagem = carregarContexto('485 whatsapp POST /whatsapp/inbound')._triagem

const TOKEN = 'a'.repeat(64)
const PERFIS = [
  { id: 'ana', full_name: 'Ana', phone: '5519999990001', role: 'support' },
  { id: 'bruno', full_name: 'Bruno', phone: null, role: 'support' },
]
const HORARIO = {
  fuso: 'America/Sao_Paulo',
  plantao: {
    1: [['18:00', '22:00']], 2: [['18:00', '22:00']], 3: [['18:00', '22:00']],
    4: [['18:00', '22:00']], 5: [['18:00', '22:00']],
    6: [['08:00', '22:00']], 0: [['08:00', '22:00']],
  },
}
const ESCALA = [{ id: 'p1', kind: 'plantao', date: '2026-10-12', agent_ids: ['ana'], backup_ids: [] }]

// segunda 20h em São Paulo = dentro da janela
const DENTRO = new Date('2026-10-12T23:00:00Z').getTime()
const FORA = new Date('2026-10-12T18:00:00Z').getTime()

function cenario({ conversas = [], escalas = ESCALA } = {}) {
  const estado = { conversas: conversas.map((c) => ({ ...c })), eventos: [], enviadas: [] }
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
      SupportSchedule: { findMany: async () => escalas },
      Profile: { findMany: async () => PERFIS, findById: async (id) => PERFIS.find((p) => p.id === id) || null },
      WaConversationEvents: { findMany: async () => estado.eventos, create: async (e) => { estado.eventos.push(e); return e } },
      // O motor só chega na varredura depois de resolver o fluxo: sem fluxo
      // publicado ele retorna antes, e o teste compararia com o vazio.
      WaFlows: {
        findMany: async () => [{
          id: 'f1', enabled: true, priority: 0,
          published: {
            root: 'at',
            nodes: [{ id: 'at', type: 'handoff', data: { text: 'Já avisamos a equipe.' } }],
            edges: [],
          },
        }],
      },
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

function comRelogio(t, fn) {
  const real = Date.now
  Date.now = () => t
  return Promise.resolve(fn()).finally(() => { Date.now = real })
}

const esperando = (id, desde, extra = {}) => Object.assign({
  id, remote_jid: '5519' + id + '@s.whatsapp.net', status: 'open', phase: 'novo',
  contact_name: 'Cliente ' + id, aguardando_desde: desde,
}, extra)

;(async () => {
  // ══ a guarda ══════════════════════════════════════════════════════════
  // O token do processo vive em globalThis; aqui o teste o instala igual ao
  // agendador faria.
  Object.defineProperty(ctxVm, '__araraAgendadorToken', {
    value: TOKEN, enumerable: false, writable: false, configurable: true,
  })

  let c = cenario({ conversas: [esperando('c1', '2026-10-12T22:00:00Z')] })
  let r = await comRelogio(DENTRO, () => varrer(ctxDe(c)))
  ok('sem a prova de origem: 401', r.status === 401, r)
  ok('  e sem corpo (não ensina nada a quem chamou)', r.body === undefined || r.body === null, r.body)
  ok('  e nada foi enviado', c.estado.enviadas.length === 0, c.estado.enviadas)

  c = cenario({ conversas: [esperando('c1', '2026-10-12T22:00:00Z')] })
  r = await comRelogio(DENTRO, () => varrer(ctxDe(c, { agendadorInterno: 'b'.repeat(64) })))
  ok('token errado do mesmo tamanho: 401', r.status === 401, r)

  c = cenario({ conversas: [esperando('c1', '2026-10-12T22:00:00Z')] })
  r = await comRelogio(DENTRO, () => varrer(ctxDe(c, { agendadorInterno: 'a'.repeat(10) })))
  ok('token de tamanho diferente: 401 (e não estoura)', r.status === 401, r)

  // O CASO QUE PROVA O DESENHO: header com o token REAL não vale. A prova é um
  // campo que o caminho HTTP não monta; header é justamente o que quem chama
  // de fora controla.
  c = cenario({ conversas: [esperando('c1', '2026-10-12T22:00:00Z')] })
  r = await comRelogio(DENTRO, () => varrer(ctxDe(c, { headers: { 'x-agendador-interno': TOKEN } })))
  ok('HEADER com o token real é recusado', r.status === 401, r)
  ok('  e nada foi enviado', c.estado.enviadas.length === 0, c.estado.enviadas)

  // ══ com a prova, varre ════════════════════════════════════════════════
  c = cenario({ conversas: [esperando('c1', '2026-10-12T22:00:00Z')] })
  r = await comRelogio(DENTRO, () => varrer(ctxDe(c, { agendadorInterno: TOKEN })))
  ok('com a prova de origem, varre e avisa', r.body?.data?.avisou === true, r.body)
  ok('  mandou para o plantonista', c.estado.enviadas[0]?.number?.startsWith('5519999990001'), c.estado.enviadas[0])
  ok('  e registrou o evento com origem agendador',
    c.estado.eventos.some((e) => e.kind === 'aviso_plantao' && String(e.payload).includes('"origem":"agendador"')),
    c.estado.eventos)
  ok('  carimbando a conversa', !!c.estado.conversas[0].aviso_plantao_em, c.estado.conversas[0])

  // ══ fora da janela ════════════════════════════════════════════════════
  c = cenario({ conversas: [esperando('c1', '2026-10-12T22:00:00Z')] })
  r = await comRelogio(FORA, () => varrer(ctxDe(c, { agendadorInterno: TOKEN })))
  ok('fora da janela não avisa ninguém', r.body?.data?.avisou !== true, r.body)
  ok('  e nada é enviado', c.estado.enviadas.length === 0, c.estado.enviadas)

  // ══ O PONTO PEDIDO: não re-avisa o que o inbound acabou de avisar ═════
  c = cenario({
    conversas: [esperando('c1', '2026-10-12T22:00:00Z', {
      aviso_plantao_em: new Date(DENTRO - 5 * 60000).toISOString(),
    })],
  })
  r = await comRelogio(DENTRO, () => varrer(ctxDe(c, { agendadorInterno: TOKEN })))
  ok('conversa avisada há 5 min pelo inbound NÃO é re-avisada',
    r.body?.data?.avisou !== true && c.estado.enviadas.length === 0, { r: r.body, enviadas: c.estado.enviadas })

  c = cenario({
    conversas: [esperando('c1', '2026-10-12T22:00:00Z', {
      aviso_plantao_em: new Date(DENTRO - 40 * 60000).toISOString(),
    })],
  })
  r = await comRelogio(DENTRO, () => varrer(ctxDe(c, { agendadorInterno: TOKEN })))
  ok('passados 30 min, o tick avisa de novo', r.body?.data?.avisou === true, r.body)

  // ══ os dois caminhos concordam ═══════════════════════════════════════
  // A lógica está duplicada (handlers são strings isoladas). Este caso roda o
  // INBOUND e a ROTA sobre o mesmo estado e compara o que sai.
  const estadoComum = () => [
    esperando('c1', '2026-10-12T21:00:00Z'),
    esperando('c2', '2026-10-12T21:30:00Z'),
    esperando('c3', '2026-10-12T22:00:00Z'),
  ]

  const viaRota = cenario({ conversas: estadoComum() })
  await comRelogio(DENTRO, () => varrer(ctxDe(viaRota, { agendadorInterno: TOKEN })))

  const viaInbound = cenario({ conversas: estadoComum() })
  // A conversa que "escreve" é a mais antiga: ela já está na fila, então o
  // motor cai no ramo que dispara a varredura.
  const convAtual = viaInbound.estado.conversas[0]
  await comRelogio(DENTRO, async () => {
    const ctx = {
      models: viaInbound.models,
      secrets: { get: async () => 'token-avisa' },
      fetch: viaInbound.fetch,
    }
    // chama a varredura interna do motor pelo caminho dele
    await _triagem(ctx, convAtual, 'oi')
  })

  // O inbound pode falar com o CLIENTE além de avisar o plantonista; a
  // comparação é só sobre os avisos de plantão.
  const soAvisos = (lista) => lista.filter((e) => String(e.message).startsWith('Plantão Arara Tech'))
  const textoRota = soAvisos(viaRota.estado.enviadas).map((e) => e.message).join('')
  const textoInbound = soAvisos(viaInbound.estado.enviadas).map((e) => e.message).join('')
  ok('os dois caminhos avisam sobre as mesmas 3 conversas',
    textoRota.includes('3 conversas') && textoInbound.includes('3 conversas'),
    { rota: textoRota.slice(0, 60), inbound: textoInbound.slice(0, 60) })
  ok('  e listam a mais antiga primeiro nos dois',
    textoRota.indexOf('Cliente c1') < textoRota.indexOf('Cliente c2')
      && textoInbound.indexOf('Cliente c1') < textoInbound.indexOf('Cliente c2'),
    { rota: textoRota, inbound: textoInbound })

  // ══ fila vazia e sem plantonista ═════════════════════════════════════
  c = cenario({ conversas: [] })
  r = await comRelogio(DENTRO, () => varrer(ctxDe(c, { agendadorInterno: TOKEN })))
  ok('fila vazia: não avisa e diz o motivo',
    r.body?.data?.avisou === false && String(r.body?.data?.motivo).includes('ninguém novo'), r.body)

  c = cenario({
    conversas: [esperando('c1', '2026-10-12T22:00:00Z')],
    escalas: [{ id: 'p1', kind: 'plantao', date: '2026-10-12', agent_ids: ['bruno'] }],
  })
  r = await comRelogio(DENTRO, () => varrer(ctxDe(c, { agendadorInterno: TOKEN })))
  ok('plantonista sem telefone: não envia e diz o motivo',
    c.estado.enviadas.length === 0 && String(r.body?.data?.motivo).includes('telefone'), r.body)

  // conversa COM dono não entra na fila
  c = cenario({ conversas: [esperando('c1', '2026-10-12T22:00:00Z', { assigned_to_id: 'ana' })] })
  r = await comRelogio(DENTRO, () => varrer(ctxDe(c, { agendadorInterno: TOKEN })))
  ok('conversa com atendente não entra na varredura', r.body?.data?.avisou !== true, r.body)

  fim()
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(1) })
