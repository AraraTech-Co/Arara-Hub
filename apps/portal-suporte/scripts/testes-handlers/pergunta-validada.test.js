// Pergunta com validação — Entrega 6b do Fluxo v2.
// Roda com: node pergunta-validada.test.js
const { carregarContexto, ok, fim } = require('./_carregar.js')

const ctxMotor = carregarContexto('485 whatsapp POST /whatsapp/inbound')
const _triagem = ctxMotor._triagem

const grafo = (dados, comFail = true) => ({
  root: 'p',
  nodes: [
    { id: 'p', type: 'question', data: Object.assign({ text: 'Qual o seu CNPJ?' }, dados) },
    { id: 'ok', type: 'content', data: { text: 'Obrigado!' } },
    { id: 'desistiu', type: 'content', data: { text: 'Sem problema, seguimos sem isso.' } },
  ],
  edges: [
    { source: 'p', target: 'ok', sourceHandle: 'next' },
    ...(comFail ? [{ source: 'p', target: 'desistiu', sourceHandle: 'fail' }] : []),
  ],
})

function cenario({ g, conv = {} }) {
  const enviadas = []
  const conversa = Object.assign(
    { id: 'c1', remote_jid: '5519999990000@s.whatsapp.net', status: 'open', phase: 'novo', contact_name: 'Ana' },
    conv,
  )
  const ctx = {
    models: {
      WhatsAppConversation: {
        findById: async () => conversa,
        update: async (id, p) => Object.assign(conversa, p),
        findMany: async () => [conversa],
      },
      WhatsAppMessage: { findMany: async () => [], create: async () => ({}) },
      SystemSettings: { findMany: async () => [{ waMenuEnabled: true }] },
      WaFlows: { findMany: async () => [{ id: 'f1', enabled: true, priority: 0, published: g }] },
      WaConversationEvents: { findMany: async () => [], create: async () => ({}) },
      SupportSchedule: { findMany: async () => [] },
      Profile: { findMany: async () => [], findById: async () => null },
      WaTag: { findMany: async () => [], create: async (t) => t },
      WaConversationTag: { findMany: async () => [], create: async (l) => l, delete: async () => {} },
    },
    secrets: { get: async () => 'token' },
    fetch: async (url, o) => { enviadas.push(JSON.parse(o.body).message); return { status: 200, body: '{}' } },
  }
  return { ctx, conversa, enviadas }
}

/** Conversa de verdade: várias mensagens seguidas, com o estado persistindo. */
async function conversar(g, mensagens, conv = {}) {
  const c = cenario({ g, conv })
  for (const m of mensagens) await _triagem(c.ctx, c.conversa, m)
  return c
}

const falou = (c, t) => c.enviadas.join(' | ').includes(t)

;(async () => {
  // ── a pergunta é feita e o fluxo PARA ────────────────────────────────────
  let c = await conversar(grafo({ validacao: 'cnpj' }), ['oi'])
  ok('faz a pergunta', falou(c, 'Qual o seu CNPJ?'), c.enviadas)
  ok('  e para no card da pergunta', c.conversa.menu_node === 'p', c.conversa)
  ok('  sem adiantar o fluxo', !falou(c, 'Obrigado'), c.enviadas)

  // ── resposta válida segue ────────────────────────────────────────────────
  // CNPJ válido de verdade (dígitos conferidos).
  c = await conversar(grafo({ validacao: 'cnpj', guardarEm: 'documento' }), ['oi', '11.222.333/0001-81'])
  ok('CNPJ válido é aceito', falou(c, 'Obrigado'), c.enviadas)
  ok('  e fica guardado SEM pontuação', c.conversa.documento === '11222333000181', c.conversa.documento)
  ok('  e a conversa sai do card', c.conversa.menu_node === null, c.conversa.menu_node)

  // ── resposta inválida insiste, e depois desiste ──────────────────────────
  c = await conversar(grafo({ validacao: 'cnpj', tentativas: 2, erro: 'Esse CNPJ não parece certo.' }), ['oi', '123'])
  ok('CNPJ errado é recusado com a mensagem do card', falou(c, 'Esse CNPJ não parece certo'), c.enviadas)
  ok('  e continua esperando', c.conversa.menu_node === 'p', c.conversa.menu_node)
  ok('  contando a tentativa', c.conversa.pergunta_tentativas === 1, c.conversa.pergunta_tentativas)

  c = await conversar(grafo({ validacao: 'cnpj', tentativas: 2 }), ['oi', '123', '456'])
  ok('esgotadas as tentativas, segue pela saída de desistência',
    falou(c, 'seguimos sem isso'), c.enviadas)
  ok('  e zera o estado', c.conversa.menu_node === null && c.conversa.pergunta_tentativas === 0, c.conversa)

  // Sem a saída de desistência ligada, vai para uma pessoa — e não fica preso.
  c = await conversar(grafo({ validacao: 'cnpj', tentativas: 1 }, false), ['oi', 'xxx'])
  ok('sem saída de desistência, vai para uma pessoa',
    falou(c, 'equipe já foi avisada'), c.enviadas)

  // Uma tentativa só é respeitada.
  c = await conversar(grafo({ validacao: 'numero', tentativas: 1 }), ['oi', 'abc'])
  ok('tentativas: 1 desiste no primeiro erro', falou(c, 'seguimos sem isso'), c.enviadas)

  // ── cada validação ──────────────────────────────────────────────────────
  const CASOS = [
    ['numero', '12345', true, '12345'],
    ['numero', 'abc', false, null],
    ['numero', 'TCK 000587', true, '000587'],
    ['email', 'leonardo@arara-tech.com', true, 'leonardo@arara-tech.com'],
    ['email', 'LEONARDO@ARARA-TECH.COM', true, 'leonardo@arara-tech.com'],
    ['email', 'leonardo@arara', false, null],
    ['email', 'sem arroba', false, null],
    ['telefone', '(19) 99999-0000', true, '5519999990000'],
    ['telefone', '5519999990000', true, '5519999990000'],
    ['telefone', '123', false, null],
    ['cnpj', '11.222.333/0001-81', true, '11222333000181'],
    ['cnpj', '11222333000182', false, null],   // dígito verificador errado
    ['cnpj', '11111111111111', false, null],   // 14 dígitos, mas inválido
    ['qualquer', 'qualquer coisa', true, 'qualquer coisa'],
    ['qualquer', '   ', false, null],
  ]
  for (const [regra, resposta, deveriaPassar, limpo] of CASOS) {
    const cc = await conversar(
      grafo({ validacao: regra, tentativas: 3, guardarEm: 'resposta_1' }),
      ['oi', resposta],
    )
    const passou = falou(cc, 'Obrigado')
    ok(`${regra}: "${resposta}" ${deveriaPassar ? 'passa' : 'é recusado'}`,
      passou === deveriaPassar, { passou, enviadas: cc.enviadas })
    if (deveriaPassar) {
      ok(`  e guarda "${limpo}"`, cc.conversa.resposta_1 === limpo, cc.conversa.resposta_1)
    }
  }

  // ── o campo de destino é lista branca ───────────────────────────────────
  // Um card do editor não pode escrever em qualquer coluna da conversa.
  c = await conversar(
    grafo({ validacao: 'qualquer', guardarEm: 'assigned_to_id' }),
    ['oi', 'tentando virar dono da conversa'],
  )
  ok('campo fora da lista branca NÃO é gravado',
    c.conversa.assigned_to_id === undefined || c.conversa.assigned_to_id === null,
    c.conversa.assigned_to_id)
  ok('  mas a resposta é aceita e o fluxo segue', falou(c, 'Obrigado'), c.enviadas)

  c = await conversar(grafo({ validacao: 'qualquer', guardarEm: 'status' }), ['oi', 'closed'])
  ok('não dá para fechar a conversa por um card de pergunta',
    c.conversa.status === 'open', c.conversa.status)

  // ── a pergunta usa variáveis, como os outros cards ──────────────────────
  c = await conversar(
    {
      root: 'p',
      nodes: [{ id: 'p', type: 'question', data: { text: 'Oi {{nome}}, qual o seu e-mail?', validacao: 'email' } }],
      edges: [],
    },
    ['oi'],
  )
  ok('a pergunta interpola {{nome}}', falou(c, 'Oi Ana'), c.enviadas)

  fim()
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(1) })
