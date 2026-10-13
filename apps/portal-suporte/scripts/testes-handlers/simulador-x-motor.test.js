// O simulador precisa dizer a VERDADE sobre o robô.
//
// O caminhamento do simulador (rota 490k) é cópia do motor do inbound, porque
// cada handler do routes.generated.ts é uma string isolada e não há módulo para
// compartilhar. Cópia sem guarda vira uma segunda verdade — foi o que
// aconteceu com `graphToFlow`/`WA_MENU_FLOW`, o defeito 6 do diagnóstico.
//
// Este arquivo é a guarda: roda o MOTOR REAL e o SIMULADOR sobre os mesmos
// grafos e as mesmas mensagens, e falha se as respostas divergirem.
// Roda com: node simulador-x-motor.test.js
const { carregarHandler, carregarContexto, reply, ok, fim } = require('./_carregar.js')

const ctxMotor = carregarContexto('485 whatsapp POST /whatsapp/inbound')
const _triagem = ctxMotor._triagem
const simular = carregarHandler('490k whatsapp POST /whatsapp/flows/:id/simular')

const HORARIO = {
  fuso: 'America/Sao_Paulo',
  atendimento: { 1: [['09:00', '18:00']], 2: [['09:00', '18:00']], 3: [['09:00', '18:00']], 4: [['09:00', '18:00']], 5: [['09:00', '18:00']] },
  plantao: {},
  excecoes: {},
}

// ── os grafos que os dois têm de percorrer igual ───────────────────────────
const MENU_SIMPLES = {
  root: 'inicio',
  nodes: [
    { id: 'inicio', type: 'menu', data: { text: 'Olá! Como podemos ajudar?', options: [{ id: 'sup', label: 'Suporte técnico' }, { id: 'fin', label: 'Financeiro' }] } },
    { id: 'sup', type: 'handoff', data: { text: 'Passando para o suporte.' } },
    { id: 'fin', type: 'content', data: { text: 'O financeiro atende por e-mail: financeiro@arara-tech.com' } },
  ],
  edges: [
    { source: 'inicio', target: 'sup', sourceHandle: 'opt:sup' },
    { source: 'inicio', target: 'fin', sourceHandle: 'opt:fin' },
  ],
}

const COM_HORARIO = {
  root: 'abre',
  nodes: [
    { id: 'abre', type: 'condition', data: { check: 'businessHours' } },
    { id: 'dentro', type: 'menu', data: { text: 'Estamos abertos. Como ajudar?', options: [{ id: 'a', label: 'Falar com alguém' }] } },
    { id: 'fora', type: 'content', data: { text: 'Oi {{nome}}, estamos fechados agora.' } },
    { id: 'pessoa', type: 'handoff', data: { text: 'Chamando alguém.' } },
  ],
  edges: [
    { source: 'abre', target: 'dentro', sourceHandle: 'true' },
    { source: 'abre', target: 'fora', sourceHandle: 'false' },
    { source: 'dentro', target: 'pessoa', sourceHandle: 'opt:a' },
  ],
}

const SEM_DESTINO = {
  root: 'inicio',
  nodes: [{ id: 'inicio', type: 'menu', data: { text: 'Escolha:', options: [{ id: 'x', label: 'Opção sem destino' }] } }],
  edges: [],
}

// Pergunta com validação (entrega 6b): o simulador tem uma cópia dos
// validadores, então é aqui que a divergência apareceria.
const PERGUNTA = {
  root: 'p',
  nodes: [
    { id: 'p', type: 'question', data: { text: 'Qual o seu e-mail?', validacao: 'email', tentativas: 2, erro: 'Esse e-mail não parece certo.' } },
    { id: 'ok', type: 'content', data: { text: 'Obrigado!' } },
    { id: 'desistiu', type: 'content', data: { text: 'Seguimos sem isso.' } },
  ],
  edges: [
    { source: 'p', target: 'ok', sourceHandle: 'next' },
    { source: 'p', target: 'desistiu', sourceHandle: 'fail' },
  ],
}

const CASOS = [
  ['menu: escolha por número', MENU_SIMPLES, ['oi', '1'], '2026-10-12T13:00:00Z'],
  ['menu: escolha por texto', MENU_SIMPLES, ['oi', 'financeiro'], '2026-10-12T13:00:00Z'],
  ['menu: escolha pelo id da opção', MENU_SIMPLES, ['oi', 'fin'], '2026-10-12T13:00:00Z'],
  ['menu: não entendeu', MENU_SIMPLES, ['oi', 'asdfgh'], '2026-10-12T13:00:00Z'],
  ['menu: texto parcial casa', MENU_SIMPLES, ['oi', 'suporte'], '2026-10-12T13:00:00Z'],
  ['horário: dentro', COM_HORARIO, ['oi'], '2026-10-12T13:00:00Z'],
  ['horário: fora', COM_HORARIO, ['oi'], '2026-10-12T23:00:00Z'],
  ['horário: dentro e segue até a pessoa', COM_HORARIO, ['oi', '1'], '2026-10-12T13:00:00Z'],
  ['opção sem destino vai para uma pessoa', SEM_DESTINO, ['oi', '1'], '2026-10-12T13:00:00Z'],
  ['pergunta: e-mail válido', PERGUNTA, ['oi', 'leonardo@arara-tech.com'], '2026-10-12T13:00:00Z'],
  ['pergunta: e-mail inválido insiste', PERGUNTA, ['oi', 'nada'], '2026-10-12T13:00:00Z'],
  ['pergunta: duas tentativas erradas desistem', PERGUNTA, ['oi', 'nada', 'nada2'], '2026-10-12T13:00:00Z'],
  ['pergunta: erra e depois acerta', PERGUNTA, ['oi', 'nada', 'leonardo@arara-tech.com'], '2026-10-12T13:00:00Z'],
]

/** O que o MOTOR REAL diz, com o envio interceptado. */
async function peloMotor(grafo, mensagens, agoraISO) {
  const ditas = []
  const conversa = { id: 'c1', remote_jid: '5519999990000@s.whatsapp.net', status: 'open', phase: 'novo', contact_name: 'Cliente' }
  const realNow = ctxMotor.Date.now
  const t = new Date(agoraISO).getTime()
  ctxMotor.Date.now = () => t
  const ctx = {
    models: {
      WhatsAppConversation: {
        findById: async () => conversa,
        update: async (id, p) => Object.assign(conversa, p),
        findMany: async () => [conversa],
      },
      WhatsAppMessage: { findMany: async () => [], create: async () => ({}) },
      SystemSettings: { findMany: async () => [{ waMenuEnabled: true, waHorario: JSON.stringify(HORARIO) }] },
      WaFlows: { findMany: async () => [{ id: 'f1', enabled: true, priority: 0, published: grafo }] },
      WaConversationEvents: { findMany: async () => [], create: async () => ({}) },
      SupportSchedule: { findMany: async () => [] },
      Profile: { findMany: async () => [], findById: async () => null },
    },
    secrets: { get: async () => 'token-de-teste' },
    fetch: async (url, o) => { ditas.push(JSON.parse(o.body).message); return { status: 200, body: '{}' } },
  }
  try {
    for (const m of mensagens) await _triagem(ctx, conversa, m)
  } finally { ctxMotor.Date.now = realNow }
  return ditas
}

/** O que o SIMULADOR diz. */
async function peloSimulador(grafo, mensagens, agoraISO) {
  const r = await simular({
    params: { id: 'f1' },
    query: {},
    body: { graph: grafo, mensagens, agora: agoraISO, horario: HORARIO, estado: { nome: 'Cliente' } },
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
  const d = (r.body && r.body.data) || {}
  return { ditas: (d.passos || []).filter((p) => p.de === 'robo').map((p) => p.texto), corpo: d, status: r.status }
}

;(async () => {
  for (const [nome, grafo, mensagens, agoraISO] of CASOS) {
    const doMotor = await peloMotor(grafo, mensagens, agoraISO)
    const doSim = await peloSimulador(grafo, mensagens, agoraISO)
    // A comparação é do TEXTO que sai, que é o que o cliente veria.
    const iguais = JSON.stringify(doMotor) === JSON.stringify(doSim.ditas)
    ok(`${nome}: simulador = motor`, iguais, { motor: doMotor, simulador: doSim.ditas })
  }

  // ── o simulador não toca em nada ──────────────────────────────────────────
  let r = await peloSimulador(MENU_SIMPLES, ['oi'], '2026-10-12T13:00:00Z')
  ok('declara que nada foi enviado', r.corpo.nada_foi_enviado === true, r.corpo)
  ok('declara que nada foi gravado', r.corpo.nada_foi_gravado === true, r.corpo)

  // ── o que o simulador mostra e o motor não pode mostrar ──────────────────
  r = await peloSimulador(COM_HORARIO, ['oi'], '2026-10-12T23:00:00Z')
  ok('mostra o resultado da condição como passo',
    r.corpo.passos.some((p) => p.de === 'sistema' && p.texto.includes('condição')), r.corpo.passos)

  r = await peloSimulador(SEM_DESTINO, ['oi', '1'], '2026-10-12T13:00:00Z')
  ok('diz quando a opção não tem destino ligado',
    String(r.corpo.desfecho).includes('não tem destino'), r.corpo.desfecho)

  const CONDICAO_SEM_SAIDA = {
    root: 'c',
    nodes: [{ id: 'c', type: 'condition', data: { check: 'businessHours' } }],
    edges: [],
  }
  r = await peloSimulador(CONDICAO_SEM_SAIDA, ['oi'], '2026-10-12T13:00:00Z')
  ok('diz quando a condição não tem saída ligada',
    String(r.corpo.desfecho).includes('não tem saída'), r.corpo.desfecho)

  const DELAY = {
    root: 'd',
    nodes: [
      { id: 'd', type: 'delay', data: { seconds: 30 } },
      { id: 'm', type: 'content', data: { text: 'depois do atraso' } },
    ],
    edges: [{ source: 'd', target: 'm', sourceHandle: 'next' }],
  }
  // Desde a entrega 6 o motor ESPERA de verdade, com teto de 3s por card e 6s
  // somados por mensagem (o handler é o webhook da Avisa; segurar demais
  // arrisca reentrega). O simulador não espera — diria a mesma coisa três
  // segundos depois —, mas tem de dizer quanto esperaria e o que o teto corta.
  r = await peloSimulador(DELAY, ['oi'], '2026-10-12T13:00:00Z')
  ok('diz quanto o atraso espera e o que o teto corta',
    r.corpo.passos.some((p) => p.texto.includes('espera 3s') && p.texto.includes('pediu 30s')),
    r.corpo.passos)

  const LACO = {
    root: 'a',
    nodes: [
      { id: 'a', type: 'content', data: { text: 'a' } },
      { id: 'b', type: 'content', data: { text: 'b' } },
    ],
    edges: [
      { source: 'a', target: 'b', sourceHandle: 'next' },
      { source: 'b', target: 'a', sourceHandle: 'next' },
    ],
  }
  r = await peloSimulador(LACO, ['oi'], '2026-10-12T13:00:00Z')
  ok('detecta laço no desenho', String(r.corpo.desfecho).includes('laço'), r.corpo.desfecho)

  // ── guardas ──────────────────────────────────────────────────────────────
  const semSessao = await simular({
    params: {}, query: {}, body: { graph: MENU_SIMPLES }, headers: {},
    user: {},
    models: { Profile: { findById: async () => null }, Sessao: { findById: async () => null } },
    reply: reply(),
  })
  ok('sem sessão: 401', semSessao.status === 401, semSessao)

  const cliente = await simular({
    params: {}, query: {}, body: { graph: MENU_SIMPLES }, headers: {},
    user: { id: 'u9' },
    models: { Profile: { findById: async () => ({ id: 'u9', role: 'user' }) }, Sessao: { findById: async () => null } },
    reply: reply(),
  })
  ok('cliente (user): 403', cliente.status === 403, cliente)

  const semGrafo = await simular({
    params: {}, query: {}, body: {}, headers: {},
    user: { id: 'u1' },
    models: {
      Profile: { findById: async () => ({ id: 'u1', role: 'support' }) },
      Sessao: { findById: async () => null },
      WaFlows: { findById: async () => null },
      SystemSettings: { findMany: async () => [] },
    },
    reply: reply(),
  })
  ok('sem grafo: 400 com instrução', semGrafo.status === 400 && String(semGrafo.body.error).includes('graph'), semGrafo.body)

  fim()
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(1) })
