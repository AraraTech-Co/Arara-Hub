// Aviso ao plantonista — Entrega 3c do Fluxo v2.
//
// NADA sai para a Avisa: `ctx.fetch` é interceptado e toda mensagem fica numa
// lista. O teste de envio REAL depende de número da equipe e de OK do
// Leonardo, como a ordem manda — este arquivo prova a lógica, não a entrega.
// Roda com: node plantao-aviso.test.js
const { carregarContexto, ok, fim } = require('./_carregar.js')

const ctxMotor = carregarContexto('485 whatsapp POST /whatsapp/inbound')
const _triagem = ctxMotor._triagem

const HORARIO = {
  fuso: 'America/Sao_Paulo',
  atendimento: { 1: [['09:00', '18:00']], 2: [['09:00', '18:00']], 3: [['09:00', '18:00']], 4: [['09:00', '18:00']], 5: [['09:00', '18:00']] },
  plantao: {
    1: [['18:00', '22:00']], 2: [['18:00', '22:00']], 3: [['18:00', '22:00']],
    4: [['18:00', '22:00']], 5: [['18:00', '22:00']],
    6: [['08:00', '22:00']], 0: [['08:00', '22:00']],
  },
  excecoes: {},
}

// Fluxo que manda direto para uma pessoa — é o caminho do aviso.
const GRAFO = {
  root: 'at',
  nodes: [{ id: 'at', type: 'handoff', data: { text: '', area: 'suporte' } }],
  edges: [],
}

const PERFIS = [
  { id: 'ana', full_name: 'Ana', phone: '19999990001', role: 'support' },      // 11 dígitos, ganha 55
  { id: 'bruno', full_name: 'Bruno', phone: null, role: 'support' },           // sem telefone
  { id: 'carla', full_name: 'Carla', phone: '5519999990003', role: 'support' },
]

function cenario({
  agoraISO, escalas = [], conv = {}, outras = [], perfis = PERFIS, cfg = {},
} = {}) {
  const enviadas = []     // {numero, texto}
  const eventos = []
  const conversa = Object.assign(
    { id: 'c1', remote_jid: '5519988887777@s.whatsapp.net', status: 'open', phase: 'novo', contact_name: 'Cliente Teste' },
    conv,
  )
  const todas = [conversa, ...outras]
  const realNow = ctxMotor.Date.now
  if (agoraISO) { const t = new Date(agoraISO).getTime(); ctxMotor.Date.now = () => t }
  const ctx = {
    models: {
      WhatsAppConversation: {
        findById: async (id) => todas.find((c) => c.id === id) || null,
        update: async (id, patch) => { const c = todas.find((x) => x.id === id); if (c) Object.assign(c, patch) },
        findMany: async (arg) => {
          const chaves = Object.keys(arg || {})
          if (!chaves.length) return todas
          return todas.filter((c) => chaves.every((k) => String(c[k] ?? '') === String(arg[k])))
        },
      },
      WhatsAppMessage: { findMany: async () => [], create: async () => ({}) },
      SystemSettings: { findMany: async () => [Object.assign({ waMenuEnabled: true, waHorario: JSON.stringify(HORARIO) }, cfg)] },
      WaFlows: { findMany: async () => [{ id: 'f1', enabled: true, priority: 0, published: GRAFO }] },
      WaConversationEvents: { create: async (e) => { eventos.push(e); return e } },
      SupportSchedule: { findMany: async () => escalas },
      Profile: {
        findMany: async () => perfis,
        findById: async (id) => perfis.find((p) => p.id === id) || null,
      },
    },
    secrets: { get: async () => 'token-de-teste' },
    fetch: async (url, o) => {
      const b = JSON.parse(o.body)
      enviadas.push({ numero: b.number, texto: b.message })
      // A Avisa aceita só o número com 13 dígitos neste cenário, para o teste
      // exercitar a variante do nono dígito.
      return { status: String(b.number).length === 13 ? 200 : 400, body: '{}' }
    },
    reply: { status() { return this }, send(v) { return v } },
  }
  return { ctx, conversa, todas, enviadas, eventos, restaurar: () => { ctxMotor.Date.now = realNow } }
}

async function roda(opts, texto = 'preciso de ajuda') {
  const c = cenario(opts)
  try { await _triagem(c.ctx, c.conversa, texto) } finally { c.restaurar() }
  return c
}

const PLANTAO_HOJE = (data, ids) => ({ id: 'p1', kind: 'plantao', date: data, agent_ids: ids })
// avisos ao plantonista vs mensagens ao cliente: o cliente é o 5519988887777
const avisos = (c) => c.enviadas.filter((e) => !String(e.numero).startsWith('5519988887777'))
const aoCliente = (c) => c.enviadas.filter((e) => String(e.numero).startsWith('5519988887777'))

;(async () => {
  // ── dentro da janela: avisa ───────────────────────────────────────────────
  // Segunda 20:00 em São Paulo (= 23:00 UTC), Ana de plantão.
  let c = await roda({ agoraISO: '2026-10-12T23:00:00Z', escalas: [PLANTAO_HOJE('2026-10-12', ['ana'])] })
  ok('dentro da janela, o plantonista é avisado', avisos(c).length >= 1, avisos(c))
  ok('  a mensagem diz quem aguarda', avisos(c)[0].texto.includes('Cliente Teste'), avisos(c)[0])
  ok('  e leva o link da conversa', avisos(c)[0].texto.includes('/inbox?c=c1'), avisos(c)[0])
  ok('  o evento aviso_plantao é registrado',
    c.eventos.some((e) => e.kind === 'aviso_plantao'), c.eventos.map((e) => e.kind))
  ok('  o evento diz que a Avisa não confirma entrega',
    c.eventos.some((e) => String(e.payload).includes('não confirma entrega')), c.eventos)

  // O número de 11 dígitos ganha o 55 e, se o provedor recusar, tenta SEM o
  // nono dígito — padrão copiado do envio de senha, porque conta registrada
  // antes da mudança existe no WhatsApp sem o 9 e de fora não há como saber.
  //
  // Aqui o provedor recusa a forma de 13 dígitos e aceita a de 12, que é
  // justamente o caso em que a variante importa.
  const variante = cenario({ agoraISO: '2026-10-12T23:00:00Z', escalas: [PLANTAO_HOJE('2026-10-12', ['ana'])] })
  variante.ctx.fetch = async (url, o) => {
    const b = JSON.parse(o.body)
    variante.enviadas.push({ numero: b.number, texto: b.message })
    return { status: String(b.number).length === 12 ? 200 : 400, body: '{}' }
  }
  try { await _triagem(variante.ctx, variante.conversa, 'oi') } finally { variante.restaurar() }
  const numeros = avisos(variante).map((e) => e.numero)
  ok('tenta a variante do nono dígito quando o provedor recusa',
    numeros.some((n) => n.length === 13) && numeros.some((n) => n.length === 12), numeros)
  ok('  e para na primeira aceita (não manda a mesma mensagem duas vezes)',
    numeros.length === 2, numeros)

  // ── fora da janela: ninguém é acordado ───────────────────────────────────
  // Segunda 23:30 = fora de 18–22.
  c = await roda({ agoraISO: '2026-10-13T02:30:00Z', escalas: [PLANTAO_HOJE('2026-10-12', ['ana'])] })
  ok('fora da janela, ninguém é avisado', avisos(c).length === 0, avisos(c))
  ok('  mas a conversa fica na fila com carimbo', !!c.conversa.aguardando_desde, c.conversa)

  // Segunda 15:00 = horário comercial: o rodízio normal atende, sem plantão.
  c = await roda({ agoraISO: '2026-10-12T18:00:00Z', escalas: [PLANTAO_HOJE('2026-10-12', ['ana'])] })
  ok('em horário comercial não aciona plantão', avisos(c).length === 0, avisos(c))

  // ── anti-spam de 30 min ──────────────────────────────────────────────────
  const agora = '2026-10-12T23:00:00Z'
  c = await roda({
    agoraISO: agora,
    escalas: [PLANTAO_HOJE('2026-10-12', ['ana'])],
    conv: { aviso_plantao_em: '2026-10-12T22:58:00Z', aviso_plantao_n: 1, aviso_plantao_janela: String(new Date('2026-10-12T21:00:00Z').getTime()) },   // 2 min atrás
  })
  ok('avisado há 2 min não avisa de novo (o lembrete é de 5 em 5 min)', avisos(c).length === 0, avisos(c))

  c = await roda({
    agoraISO: agora,
    escalas: [PLANTAO_HOJE('2026-10-12', ['ana'])],
    conv: { aviso_plantao_em: '2026-10-12T22:00:00Z' },   // 1 h atrás
  })
  ok('passados 30 min, avisa de novo', avisos(c).length >= 1, avisos(c))

  // ── sem telefone é pulado, e a ordem é respeitada ────────────────────────
  c = await roda({
    agoraISO: agora,
    escalas: [PLANTAO_HOJE('2026-10-12', ['bruno', 'carla'])],
  })
  ok('plantonista sem telefone é pulado', avisos(c).length >= 1, avisos(c))
  ok('  e quem recebe é o próximo da ordem',
    avisos(c)[0].numero.startsWith('5519999990003'), avisos(c)[0].numero)

  c = await roda({ agoraISO: agora, escalas: [PLANTAO_HOJE('2026-10-12', ['bruno'])] })
  ok('ninguém com telefone: não envia nada', avisos(c).length === 0, avisos(c))

  // Dia sem plantão: ninguém.
  c = await roda({ agoraISO: agora, escalas: [PLANTAO_HOJE('2026-10-11', ['ana'])] })
  ok('plantão de outro dia não é acionado', avisos(c).length === 0, avisos(c))

  // War room não é plantão.
  c = await roda({
    agoraISO: agora,
    escalas: [{ id: 'w', date: '2026-10-12', type: 'warroom', agent_ids: ['ana'] }],
  })
  ok('war room não vira plantão', avisos(c).length === 0, avisos(c))

  // Escala semanal antiga ainda serve, na ordem n1 -> backup.
  c = await roda({
    agoraISO: agora,
    escalas: [{ id: 's', week_start: '2026-10-12', week_end: '2026-10-18', n1_assigned: 'bruno', backup_assigned: 'carla' }],
  })
  ok('escala semanal antiga aciona o plantão', avisos(c).length >= 1, avisos(c))
  ok('  pulando o n1 sem telefone', avisos(c)[0].numero.startsWith('5519999990003'), avisos(c)[0].numero)

  // ── aviso diferido: a varredura ──────────────────────────────────────────
  // Três conversas esperando desde a noite anterior; a janela abre e a
  // primeira mensagem recolhe todas num aviso só.
  const esperando = [
    { id: 'c2', remote_jid: '5511111111111@s.whatsapp.net', status: 'open', phase: 'novo', contact_name: 'Cliente Dois', aguardando_desde: '2026-10-11T02:10:00Z' },
    { id: 'c3', remote_jid: '5522222222222@s.whatsapp.net', status: 'open', phase: 'novo', contact_name: 'Cliente Três', aguardando_desde: '2026-10-11T03:20:00Z' },
    { id: 'c4', remote_jid: '5533333333333@s.whatsapp.net', status: 'open', phase: 'novo', contact_name: 'Cliente Quatro', aguardando_desde: '2026-10-11T04:30:00Z' },
  ]
  c = await roda({ agoraISO: agora, escalas: [PLANTAO_HOJE('2026-10-12', ['ana'])], outras: esperando })
  ok('a varredura recolhe a fila num aviso só', avisos(c).filter((e) => e.numero.length === 13).length === 1,
    avisos(c).map((e) => e.texto))
  const texto = avisos(c)[0].texto
  ok('  a mensagem diz quantas conversas', texto.includes('4 conversas'), texto)
  ok('  e lista a mais antiga primeiro', texto.indexOf('Cliente Dois') < texto.indexOf('Cliente Três'), texto)
  ok('  todas as conversas da fila ficam carimbadas',
    c.todas.filter((x) => x.aviso_plantao_em).length === 4,
    c.todas.map((x) => [x.id, !!x.aviso_plantao_em]))

  // Conversa COM dono não entra na fila varrida.
  c = await roda({
    agoraISO: agora,
    escalas: [PLANTAO_HOJE('2026-10-12', ['ana'])],
    outras: [{ id: 'c9', remote_jid: '5544444444444@s.whatsapp.net', status: 'open', phase: 'em_atendimento', assigned_to_id: 'carla', first_response_at: '2026-10-12T22:00:00Z', aguardando_desde: '2026-10-11T02:00:00Z' }],
  })
  ok('conversa atribuída que já respondeu não entra na varredura', !avisos(c)[0].texto.includes('2 conversas'), avisos(c)[0].texto)

  // Conversa avisada há pouco não volta na varredura.
  c = await roda({
    agoraISO: agora,
    escalas: [PLANTAO_HOJE('2026-10-12', ['ana'])],
    outras: [{ id: 'c8', remote_jid: '5555555555555@s.whatsapp.net', status: 'open', phase: 'novo', aguardando_desde: '2026-10-11T02:00:00Z', aviso_plantao_em: '2026-10-12T22:58:00Z', aviso_plantao_n: 1, aviso_plantao_janela: String(new Date('2026-10-12T21:00:00Z').getTime()) }],
  })
  ok('conversa avisada há 2 min não volta na varredura',
    !avisos(c)[0].texto.includes('2 conversas'), avisos(c)[0].texto)

  // ── o texto ao cliente ───────────────────────────────────────────────────
  c = await roda({ agoraISO: agora, escalas: [PLANTAO_HOJE('2026-10-12', ['ana'])] })
  ok('o cliente ouve que a equipe foi avisada',
    aoCliente(c).some((e) => e.texto.includes('Nossa equipe já foi avisada')), aoCliente(c))
  ok('  e não "vou chamar um analista"',
    !aoCliente(c).some((e) => e.texto.includes('Vou chamar um analista')), aoCliente(c))

  // Configuração sobrepõe o default.
  c = await roda({
    agoraISO: agora,
    escalas: [PLANTAO_HOJE('2026-10-12', ['ana'])],
    cfg: { waTextoHandoff: 'Já chamamos o time, aguarde um instante.' },
  })
  ok('o texto ao cliente é configurável',
    aoCliente(c).some((e) => e.texto.includes('Já chamamos o time')), aoCliente(c))

  // O texto do nó handoff vence a configuração: quem desenha o fluxo manda.
  const GRAFO_COM_TEXTO = JSON.parse(JSON.stringify(GRAFO))
  GRAFO_COM_TEXTO.nodes[0].data.text = 'Texto do card, escrito no editor.'
  const cen = cenario({ agoraISO: agora, escalas: [PLANTAO_HOJE('2026-10-12', ['ana'])], cfg: { waTextoHandoff: 'da configuração' } })
  cen.ctx.models.WaFlows.findMany = async () => [{ id: 'f1', enabled: true, priority: 0, published: GRAFO_COM_TEXTO }]
  try { await _triagem(cen.ctx, cen.conversa, 'oi') } finally { cen.restaurar() }
  ok('o texto do card vence a configuração',
    aoCliente(cen).some((e) => e.texto.includes('Texto do card')), aoCliente(cen))

  // ── sem token não finge ──────────────────────────────────────────────────
  const semToken = cenario({ agoraISO: agora, escalas: [PLANTAO_HOJE('2026-10-12', ['ana'])] })
  semToken.ctx.secrets.get = async () => null
  try { await _triagem(semToken.ctx, semToken.conversa, 'oi') } finally { semToken.restaurar() }
  ok('sem token, nada é enviado', semToken.enviadas.length === 0, semToken.enviadas)

  fim()
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(1) })
