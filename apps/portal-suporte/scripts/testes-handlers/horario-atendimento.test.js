// Horário de atendimento — Entrega 2 do Fluxo v2.
//
// Horário é onde erro passa calado: ninguém percebe que "fechado" respondeu
// errado às 23h de um sábado. Por isso os casos de borda estão todos aqui.
// Roda com: node horario-atendimento.test.js
const { carregarHandler, carregarContexto, reply, ok, fim } = require('./_carregar.js')

const ctxMotor = carregarContexto('485 whatsapp POST /whatsapp/inbound')
const _triagem = ctxMotor._triagem

// Horário de verdade da Arara: almoço no meio, plantão à noite, fim de semana
// só com plantão.
const HORARIO = {
  fuso: 'America/Sao_Paulo',
  atendimento: {
    1: [['09:00', '12:00'], ['13:00', '18:00']],
    2: [['09:00', '12:00'], ['13:00', '18:00']],
    3: [['09:00', '12:00'], ['13:00', '18:00']],
    4: [['09:00', '12:00'], ['13:00', '18:00']],
    5: [['09:00', '12:00'], ['13:00', '18:00']],
  },
  plantao: {
    1: [['18:00', '22:00']], 2: [['18:00', '22:00']], 3: [['18:00', '22:00']],
    4: [['18:00', '22:00']], 5: [['18:00', '22:00']],
    6: [['08:00', '22:00']], 0: [['08:00', '22:00']],
  },
  excecoes: { '2026-12-25': [] },
}

const GRAFO = {
  root: 'abre',
  nodes: [
    { id: 'abre', type: 'condition', data: { check: 'businessHours' } },
    { id: 'dentro', type: 'menu', data: { text: 'Estamos abertos. Como ajudar?', options: [{ id: 'a', label: 'A' }] } },
    { id: 'fora', type: 'content', data: { text: 'Oi {{nome}}, estamos fora do horário. Voltamos {{proxima_abertura}}.', umaVezPorJanela: true } },
  ],
  edges: [
    { source: 'abre', target: 'dentro', sourceHandle: 'true' },
    { source: 'abre', target: 'fora', sourceHandle: 'false' },
  ],
}

function cenario({ grafo = GRAFO, conv = {}, horario = HORARIO, agoraISO }) {
  const enviadas = []
  const conversa = Object.assign(
    { id: 'c1', remote_jid: '5519999990000@s.whatsapp.net', status: 'open', contact_name: 'Ana', phase: 'novo' },
    conv,
  )
  // Relógio controlado: o motor lê Date.now(), então o teste o fixa.
  const realNow = Date.now
  if (agoraISO) {
    const t = new Date(agoraISO).getTime()
    ctxMotor.Date.now = () => t
  }
  const ctx = {
    models: {
      WhatsAppConversation: {
        findById: async () => conversa,
        update: async (id, patch) => Object.assign(conversa, patch),
        findMany: async () => [conversa],
      },
      WhatsAppMessage: { findMany: async () => [], create: async () => ({}) },
      SystemSettings: { findMany: async () => [{ waMenuEnabled: true, waHorario: JSON.stringify(horario) }] },
      WaFlows: { findMany: async () => [{ id: 'f1', enabled: true, priority: 0, published: grafo }] },
      WaConversationEvents: { create: async () => ({}) },
      Profile: { findMany: async () => [], findById: async () => null },
    },
    secrets: { get: async () => 'token-de-teste' },
    fetch: async (url, o) => { enviadas.push(JSON.parse(o.body).message); return { status: 200, body: '{}' } },
  }
  return { ctx, conversa, enviadas, restaurar: () => { ctxMotor.Date.now = realNow } }
}

async function roda(opts, texto = 'oi') {
  const c = cenario(opts)
  try { await _triagem(c.ctx, c.conversa, texto) } finally { c.restaurar() }
  return c
}

const abriu = (e) => e.join(' ').includes('Estamos abertos')
const fechou = (e) => e.join(' ').includes('fora do horário')

;(async () => {
  // ── dentro e fora, hora por hora (horário de São Paulo = UTC-3) ───────────
  const casos = [
    ['segunda 10:00', '2026-10-12T13:00:00Z', 'aberto'],
    ['segunda 12:30 (almoço)', '2026-10-12T15:30:00Z', 'fechado'],
    ['segunda 13:00 (volta do almoço)', '2026-10-12T16:00:00Z', 'aberto'],
    ['segunda 08:59', '2026-10-12T11:59:00Z', 'fechado'],
    ['segunda 09:00 (abre)', '2026-10-12T12:00:00Z', 'aberto'],
    ['segunda 17:59', '2026-10-12T20:59:00Z', 'aberto'],
    ['segunda 18:00 (fecha)', '2026-10-12T21:00:00Z', 'fechado'],
    ['sábado 10:00', '2026-10-17T13:00:00Z', 'fechado'],
    ['domingo 15:00', '2026-10-18T18:00:00Z', 'fechado'],
    ['natal, quinta 10:00 (exceção)', '2026-12-25T13:00:00Z', 'fechado'],
  ]
  for (const [nome, iso, esperado] of casos) {
    const c = await roda({ agoraISO: iso })
    const deu = abriu(c.enviadas) ? 'aberto' : (fechou(c.enviadas) ? 'fechado' : 'nada')
    ok(`${nome} -> ${esperado}`, deu === esperado, { deu, enviadas: c.enviadas })
  }

  // O fuso é o da empresa, não o do servidor: 00:30 UTC de terça ainda é
  // segunda 21:30 em São Paulo — fechado, e no dia anterior.
  let c = await roda({ agoraISO: '2026-10-13T00:30:00Z' })
  ok('meia-noite UTC ainda é o dia anterior em São Paulo', fechou(c.enviadas), c.enviadas)

  // ── as variáveis do texto ─────────────────────────────────────────────────
  c = await roda({ agoraISO: '2026-10-12T21:30:00Z' })   // segunda 18:30
  const msg = c.enviadas.join(' ')
  ok('variável {{nome}} vira o nome do contato', msg.includes('Oi Ana'), msg)
  ok('{{proxima_abertura}} aponta amanhã às 09:00', msg.includes('amanhã às 09:00'), msg)

  // Sexta à noite: a próxima abertura é SEGUNDA, não "amanhã".
  c = await roda({ agoraISO: '2026-10-16T21:30:00Z' })
  ok('sexta à noite aponta segunda', c.enviadas.join(' ').includes('segunda às 09:00'), c.enviadas)

  // Antes do almoço de segunda: a próxima abertura é hoje às 13:00.
  c = await roda({ agoraISO: '2026-10-12T15:30:00Z' })
  ok('no almoço aponta hoje às 13:00', c.enviadas.join(' ').includes('hoje às 13:00'), c.enviadas)

  // Contato sem nome não vira "Oi undefined" nem "Oi {{nome}}".
  c = await roda({ agoraISO: '2026-10-12T21:30:00Z', conv: { contact_name: null } })
  ok('sem nome não vaza a variável',
    !c.enviadas.join(' ').includes('{{') && !c.enviadas.join(' ').includes('undefined'), c.enviadas)

  // ── anti-repetição: uma vez por janela fechada ────────────────────────────
  // Cliente manda três mensagens às 23h: recebe UM aviso.
  let cen = cenario({ agoraISO: '2026-10-12T23:00:00Z' })
  try {
    for (const t of ['oi', 'tem alguém?', 'por favor']) await _triagem(cen.ctx, cen.conversa, t)
  } finally { cen.restaurar() }
  ok('três mensagens na mesma noite = um aviso',
    cen.enviadas.filter((t) => String(t).includes('fora do horário')).length === 1, cen.enviadas)

  // Na noite SEGUINTE, depois de a empresa ter aberto no meio, avisa de novo.
  c = await roda({
    agoraISO: '2026-10-13T23:00:00Z',               // terça 20:00
    conv: { ausencia_avisada_em: '2026-10-12T23:00:00Z' },  // avisado segunda 20:00
  })
  ok('nova janela fechada avisa de novo', fechou(c.enviadas), c.enviadas)

  // Mesma janela, mensagem 10 min depois: continua calado.
  c = await roda({
    agoraISO: '2026-10-12T23:10:00Z',
    conv: { ausencia_avisada_em: '2026-10-12T23:00:00Z' },
  })
  ok('mesma janela segue calado', c.enviadas.length === 0, c.enviadas)

  // ── o nó condição respeita o `check` (defeito 3) ──────────────────────────
  const GRAFO_TICKET = {
    root: 'tem',
    nodes: [
      { id: 'tem', type: 'condition', data: { check: 'hasTicket' } },
      { id: 'sim', type: 'content', data: { text: 'Já existe um chamado para você.' } },
      { id: 'nao', type: 'content', data: { text: 'Vamos abrir um chamado.' } },
    ],
    edges: [
      { source: 'tem', target: 'sim', sourceHandle: 'true' },
      { source: 'tem', target: 'nao', sourceHandle: 'false' },
    ],
  }
  // Fora do horário DE PROPÓSITO: antes, a condição testava horário mesmo
  // quando o check era outro, então este caso ia para o ramo errado.
  c = await roda({ grafo: GRAFO_TICKET, agoraISO: '2026-10-12T23:00:00Z', conv: { ticket_id: 'tck1' } })
  ok('check hasTicket com chamado -> ramo sim',
    c.enviadas.join(' ').includes('Já existe um chamado'), c.enviadas)
  c = await roda({ grafo: GRAFO_TICKET, agoraISO: '2026-10-12T13:00:00Z', conv: { ticket_id: null } })
  ok('check hasTicket sem chamado -> ramo não',
    c.enviadas.join(' ').includes('Vamos abrir um chamado'), c.enviadas)

  // Condição sem `check` continua sendo horário: fluxos já desenhados não
  // podem mudar de sentido com esta entrega.
  const SEM_CHECK = JSON.parse(JSON.stringify(GRAFO))
  delete SEM_CHECK.nodes[0].data.check
  c = await roda({ grafo: SEM_CHECK, agoraISO: '2026-10-12T13:00:00Z' })
  ok('condição sem check segue testando horário', abriu(c.enviadas), c.enviadas)

  // ── configuração ausente: o padrão vale, nada estoura ─────────────────────
  c = await roda({ horario: null, agoraISO: '2026-10-12T13:00:00Z' })
  ok('sem configuração usa o padrão (seg 10h aberto)', abriu(c.enviadas), c.enviadas)
  c = await roda({ horario: null, agoraISO: '2026-10-18T18:00:00Z' })
  ok('sem configuração, domingo fechado', fechou(c.enviadas), c.enviadas)

  // Faixa inválida gravada por fora não "abre o dia inteiro": ignora a faixa.
  c = await roda({
    horario: { fuso: 'America/Sao_Paulo', atendimento: { 1: [['18:00', '09:00']] }, plantao: {}, excecoes: {} },
    agoraISO: '2026-10-12T13:00:00Z',
  })
  ok('faixa invertida não abre nada', fechou(c.enviadas), c.enviadas)

  // ── a rota de configuração ────────────────────────────────────────────────
  const put = carregarHandler('325 settings PUT /settings/business-hours')
  const get = carregarHandler('324 settings GET /settings/business-hours')
  function ctxCfg(body, linha) {
    const guardado = { atual: linha || null }
    return {
      params: {}, query: {}, body, headers: {},
      user: { id: 'u1' },
      models: {
        SystemSettings: {
          findMany: async () => (guardado.atual ? [guardado.atual] : []),
          update: async (id, p) => { Object.assign(guardado.atual, p); return guardado.atual },
          create: async (r) => { guardado.atual = Object.assign({ id: 's1' }, r); return guardado.atual },
        },
        Sessao: { findById: async () => null },
        Profile: { findById: async () => ({ id: 'u1', role: 'admin' }) },
      },
      reply: reply(),
      guardado,
    }
  }

  // O defeito que ninguém viu: salvar respondia 400 "Missing id" sempre.
  let cc = ctxCfg({ fuso: 'America/Sao_Paulo', atendimento: { 1: [['09:00', '18:00']] } }, { id: 's1' })
  let r = await put(cc)
  ok('salvar horário funciona (era 400 "Missing id" sempre)', r.status !== 400, { status: r.status, body: r.body })
  ok('  e grava na linha única', !!cc.guardado.atual.waHorario, cc.guardado.atual)

  // Faixa que cruza a meia-noite é recusada COM explicação, não aceita e
  // silenciosamente ignorada.
  r = await put(ctxCfg({ atendimento: { 1: [['22:00', '06:00']] } }, { id: 's1' }))
  ok('faixa que cruza meia-noite é recusada', r.status === 400, r)
  ok('  e a recusa diz como resolver',
    String(r.body.error).includes('divida em duas'), r.body)

  // Sobreposição é erro de digitação.
  r = await put(ctxCfg({ atendimento: { 1: [['09:00', '13:00'], ['12:00', '18:00']] } }, { id: 's1' }))
  ok('faixas sobrepostas são recusadas', r.status === 400, r)

  // Hora e dia inválidos.
  for (const [nome, body] of [
    ['hora sem sentido', { atendimento: { 1: [['25:00', '26:00']] } }],
    ['dia fora de 0..6', { atendimento: { 9: [['09:00', '18:00']] } }],
    ['fuso inexistente', { fuso: 'Marte/Olympus' }],
  ]) {
    r = await put(ctxCfg(body, { id: 's1' }))
    ok(`${nome} é recusado`, r.status === 400, r)
  }

  // Exceção por data entra (é como feriado se configura).
  r = await put(ctxCfg({ excecoes: { '2026-12-25': [] } }, { id: 's1' }))
  ok('exceção por data é aceita', r.status !== 400, r)

  // Mescla parcial: salvar horário não pode apagar o resto da configuração.
  cc = ctxCfg({ atendimento: { 1: [['09:00', '18:00']] } }, { id: 's1', waMenuEnabled: true, companyName: 'Arara' })
  await put(cc)
  ok('salvar horário não apaga o resto da configuração',
    cc.guardado.atual.waMenuEnabled === true && cc.guardado.atual.companyName === 'Arara', cc.guardado.atual)

  // O formato antigo da tela de SLA continua entrando, convertido.
  cc = ctxCfg({ timezone: 'America/Sao_Paulo', startHour: 8, endHour: 17, workDays: [1, 2, 3] }, { id: 's1' })
  r = await put(cc)
  const gravado = JSON.parse(cc.guardado.atual.waHorario)
  ok('formato antigo (startHour/endHour/workDays) é convertido em faixas',
    JSON.stringify(gravado.atendimento['1']) === JSON.stringify([['08:00', '17:00']]), gravado.atendimento)
  ok('  e só nos dias escolhidos', !gravado.atendimento['5'], gravado.atendimento)

  // O GET devolve UM objeto, não o envelope com todas as linhas.
  r = await get(ctxCfg({}, { id: 's1', waHorario: JSON.stringify(HORARIO) }))
  ok('GET devolve um objeto de configuração', !!r.body.atendimento && !Array.isArray(r.body.data), Object.keys(r.body))
  ok('  com os campos antigos derivados, para a tela atual',
    r.body.startHour === 9 && r.body.endHour === 18 && r.body.workDays.length === 5,
    { startHour: r.body.startHour, endHour: r.body.endHour, workDays: r.body.workDays })

  // Horário tem porta própria: a rota genérica recusa a chave.
  const adminPut = carregarHandler('113 admin_settings PUT /admin/settings')
  r = await adminPut(ctxCfg({ waHorario: '{}' }, { id: 's1' }))
  ok('PUT /admin/settings recusa waHorario e aponta a rota certa',
    r.status === 400 && String(r.body.error).includes('business-hours'), r.body)

  fim()
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(1) })
