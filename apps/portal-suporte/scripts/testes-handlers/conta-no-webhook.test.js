// Fase 3b — de qual CONTA é a mensagem que chega.
//
// Duas camadas: `?k=<valor opaco>` na URL (identifica E prova) e, sem ela, o
// nosso número no payload casado com WaConta.numero. Nada reconhecido = conta
// default, que é 100% do tráfego de hoje.
//
// Este é o primeiro teste que exercita a ENTRADA do webhook (corpo com
// `jsonData`), e não só a triagem — é lá que a conta é decidida, antes de
// qualquer gravação.
//
// Nada sai para a Avisa: ctx.fetch é interceptado.
// Roda com: node conta-no-webhook.test.js
const { carregarHandler, reply, ok, fim } = require('./_carregar.js')

const inbound = carregarHandler('485 whatsapp POST /whatsapp/inbound')

const SEGREDO_DA_ROTA = 'segredo-da-rota'
const CONTAS = [
  { id: 'vendas', nome: 'Vendas', setor: 'vendas', ativa: true, numero: '5519333330001' },
  { id: 'adm', nome: 'Administrativo', setor: 'adm', ativa: true, numero: '5519333330002' },
  { id: 'velha', nome: 'Desativada', setor: 'x', ativa: false, numero: '5519333330003' },
]
const TOKENS_DE_WEBHOOK = {
  avisa_webhook_token_vendas: 'k-vendas-9f3a',
  avisa_webhook_token_adm: 'k-adm-7b21',
  avisa_webhook_token_velha: 'k-velha-0000',
}

function corpoCru({ deNos = false, meuNumero = null, texto = 'oi' } = {}) {
  const info = {
    Chat: '5519999990001@s.whatsapp.net',
    Sender: deNos ? (meuNumero || '5519333330001') + '@s.whatsapp.net' : '5519999990001@s.whatsapp.net',
    PushName: deNos ? 'Arara Tech' : 'Cliente',
    ID: 'MSG' + Math.random().toString(36).slice(2, 8),
    IsFromMe: deNos,
  }
  // O candidato a "nosso número" em mensagem do cliente.
  if (!deNos && meuNumero) info.RecipientAlt = meuNumero + '@s.whatsapp.net'
  // O texto vem em `Message.conversation` (minúsculo) — é o que o handler lê,
  // junto de dezenas de envelopes alternativos. Com `Conversation` ele
  // responde `{ ignorado: "sem texto" }` e não grava nada.
  return { jsonData: JSON.stringify({ event: { Info: info, Message: { conversation: texto } } }) }
}

function cenario({ contas = CONTAS, semModelDeConta = false } = {}) {
  const estado = { conversas: [], mensagens: [], enviadas: [], eventos: [], segredos: [] }
  const models = {
    WhatsAppConversation: {
      findById: async (id) => estado.conversas.find((c) => c.id === id) || null,
      findMany: async (arg) => {
        const ch = Object.keys(arg || {})
        if (!ch.length) return estado.conversas
        return estado.conversas.filter((c) => ch.every((k) => String(c[k] ?? '') === String(arg[k])))
      },
      create: async (c) => { estado.conversas.push(c); return c },
      // Devolve o registro: o handler faz `conv = await Conv.update(...)` no
      // caminho da conversa que JÁ existe. Mock que não devolve deixa `conv`
      // undefined e estoura adiante — o defeito era do mock, não do handler.
      update: async (id, p) => {
        const c = estado.conversas.find((x) => x.id === id)
        if (c) Object.assign(c, p)
        return c || null
      },
    },
    WhatsAppMessage: {
      findMany: async () => estado.mensagens,
      create: async (m) => { estado.mensagens.push(m); return m },
      update: async () => ({}),
    },
    SystemSettings: { findMany: async () => [{ waMenuEnabled: false }] },
    Profile: { findMany: async () => [], findById: async () => null },
    SupportSchedule: { findMany: async () => [] },
    WaConversationEvents: { findMany: async () => estado.eventos, create: async (e) => { estado.eventos.push(e); return e } },
    WaFlows: { findMany: async () => [] },
    Sessao: { findById: async () => null },
    Company: { findMany: async () => [], findById: async () => null },
    Contact: { findMany: async () => [], findById: async () => null },
    Ticket: { findMany: async () => [], findById: async () => null },
    Unit: { findMany: async () => [] },
    ClientUser: { findMany: async () => [] },
  }
  if (!semModelDeConta) {
    models.WaConta = {
      findMany: async (arg) => {
        const ch = Object.keys(arg || {})
        if (!ch.length) return contas
        return contas.filter((c) => ch.every((k) => String(c[k] ?? '') === String(arg[k])))
      },
      findById: async (id) => contas.find((c) => c.id === id) || null,
    }
  }
  return {
    estado,
    models,
    secrets: {
      get: async (nome) => {
        estado.segredos.push(nome)
        if (nome === 'avisa_webhook_secret') return SEGREDO_DA_ROTA
        if (nome === 'whatsapp_token') return 'tok-geral'
        if (nome === 'whatsapp_token_vendas') return 'tok-vendas'
        return TOKENS_DE_WEBHOOK[nome] || null
      },
    },
    fetch: async (url, o) => { estado.enviadas.push({ url, body: o && o.body }); return { status: 200, body: '{}' } },
  }
}

const ctxDe = (c, { query = {}, body } = {}) => ({
  params: {}, headers: {},
  query: Object.assign({ token: SEGREDO_DA_ROTA }, query),
  body: body || corpoCru(),
  models: c.models,
  secrets: c.secrets,
  fetch: c.fetch,
  reply: reply(),
})

const conta = (c) => c.estado.conversas[0]?.conta_id

;(async () => {
  // ══ sem nada: a conta default (o tráfego de hoje) ══════════════════════
  let c = cenario()
  let r = await inbound(ctxDe(c))
  ok('webhook comum: aceito', r.status !== 403, { status: r.status, body: r.body })
  ok('  conversa nasce na conta default', conta(c) === 'default', conta(c))

  // Sem o segredo da ROTA continua 403, como antes do 3b.
  c = cenario()
  r = await inbound(ctxDe(c, { query: { token: 'errado' } }))
  ok('segredo da rota errado: 403 (inalterado)', r.status === 403, r.status)
  ok('  e nada gravado', c.estado.conversas.length === 0, c.estado.conversas.length)

  // ══ camada (ii): ?k ═══════════════════════════════════════════════════
  c = cenario()
  r = await inbound(ctxDe(c, { query: { k: 'k-vendas-9f3a' } }))
  ok('?k da conta Vendas: conversa nasce em vendas', conta(c) === 'vendas', conta(c))

  c = cenario()
  r = await inbound(ctxDe(c, { query: { k: 'k-adm-7b21' } }))
  ok('?k da conta Administrativo: nasce em adm', conta(c) === 'adm', conta(c))

  c = cenario()
  r = await inbound(ctxDe(c, { query: { k: 'k-que-ninguem-tem' } }))
  ok('?k desconhecido: 403', r.status === 403, { status: r.status, body: r.body })
  ok('  e NADA gravado (não cai na default em silêncio)',
    c.estado.conversas.length === 0 && c.estado.mensagens.length === 0,
    { conversas: c.estado.conversas.length, mensagens: c.estado.mensagens.length })
  ok('  nem mensagem enviada', c.estado.enviadas.length === 0, c.estado.enviadas.length)

  // Token de conta DESATIVADA não vale: desligar a conta fecha a porta dela.
  c = cenario()
  r = await inbound(ctxDe(c, { query: { k: 'k-velha-0000' } }))
  ok('?k de conta inativa: 403', r.status === 403, r.status)
  ok('  e nada gravado', c.estado.conversas.length === 0, c.estado.conversas.length)

  // ?k com o segredo da ROTA (não é token de conta) também não passa.
  c = cenario()
  r = await inbound(ctxDe(c, { query: { k: SEGREDO_DA_ROTA } }))
  ok('?k com o segredo compartilhado da rota: 403', r.status === 403, r.status)

  // Sem o model WaConta (schema do 3a não aplicado): ?k não resolve nada.
  c = cenario({ semModelDeConta: true })
  r = await inbound(ctxDe(c, { query: { k: 'k-vendas-9f3a' } }))
  ok('sem o schema do 3a, ?k é recusado', r.status === 403, r.status)
  // E sem ?k o portal segue funcionando sem o schema — o caso de HOJE.
  c = cenario({ semModelDeConta: true })
  r = await inbound(ctxDe(c))
  ok('sem o schema do 3a e sem ?k: funciona como hoje', r.status !== 403, r.status)
  ok('  na conta default', conta(c) === 'default', conta(c))

  // ══ camada (i): o nosso número no payload ═════════════════════════════
  c = cenario()
  r = await inbound(ctxDe(c, { body: corpoCru({ meuNumero: '5519333330002' }) }))
  ok('payload com o nosso número: casa a conta pelo cadastro', conta(c) === 'adm', conta(c))

  // Pela variante do nono dígito — o cadastro pode estar numa forma e o
  // payload na outra.
  c = cenario()
  r = await inbound(ctxDe(c, { body: corpoCru({ meuNumero: '551933330002' }) }))
  ok('  e pela variante do nono dígito', conta(c) === 'adm', conta(c))

  // Número que não é de conta nenhuma: default, sem recusar.
  c = cenario()
  r = await inbound(ctxDe(c, { body: corpoCru({ meuNumero: '5511888887777' }) }))
  ok('número desconhecido no payload: default, sem recusar',
    r.status !== 403 && conta(c) === 'default', { status: r.status, conta: conta(c) })

  // O ?k VENCE o payload: prova explícita manda mais que heurística de campo.
  c = cenario()
  r = await inbound(ctxDe(c, {
    query: { k: 'k-vendas-9f3a' },
    body: corpoCru({ meuNumero: '5519333330002' }),
  }))
  ok('?k vence o número do payload', conta(c) === 'vendas', conta(c))

  // ══ conversa que JÁ existe não é reescrita ════════════════════════════
  // A conversa entra no cenário pronta, em vez de nascer de um inbound
  // anterior: encadear duas entradas faria o teste depender de todo o resto do
  // handler, e o que importa aqui é só a conta.
  c = cenario()
  c.estado.conversas.push({
    // O handler grava `remote_jid` em DÍGITOS (o corpo normalizado faz
    // `phone: _canon(jid.split(/[:@]/)[0])`), não com o sufixo @s.whatsapp.net.
    // Com o sufixo, ele não acha a conversa e tenta criar outra.
    id: 'c-velha', remote_jid: '5519999990001', status: 'open',
    phase: 'novo', conta_id: 'default',
  })
  const rExistente = await inbound(ctxDe(c, { query: { k: 'k-vendas-9f3a' } }))
  ok('  (a entrada foi aceita)', rExistente.status !== 403, { status: rExistente.status, body: rExistente.body })
  ok('conversa existente não muda de conta sozinha',
    c.estado.conversas.length === 1 && c.estado.conversas[0].conta_id === 'default',
    { n: c.estado.conversas.length, conta: c.estado.conversas[0].conta_id })

  // ══ o ENVIO sai pela conta da conversa ════════════════════════════════
  // Responder ao cliente por outro número faria a resposta chegar de um
  // remetente que ele não conhece.
  const envio = carregarHandler('464 whatsapp POST /whatsapp')
  async function enviaPor(contaDaConversa) {
    const lidos = []
    const conv = {
      id: 'c1', remote_jid: '5519999990001', status: 'open', phase: 'em_atendimento',
      assigned_to_id: 'u1', conta_id: contaDaConversa,
    }
    const ctx = {
      params: {}, query: {}, headers: {},
      body: { conversationId: 'c1', message: 'olá' },
      user: { id: 'u1' },
      models: {
        WhatsAppConversation: { findById: async () => conv, findMany: async () => [conv], update: async () => conv },
        WhatsAppMessage: { findMany: async () => [], create: async (m) => m, update: async () => ({}) },
        Profile: { findById: async () => ({ id: 'u1', role: 'support', full_name: 'Ana' }), findMany: async () => [] },
        SystemSettings: { findMany: async () => [{}] },
        WaConversationEvents: { findMany: async () => [], create: async () => ({}) },
        Contact: { findMany: async () => [], findById: async () => null },
        Company: { findMany: async () => [], findById: async () => null },
        Sessao: { findById: async () => null },
      },
      secrets: { get: async (n) => { lidos.push(n); return n === 'whatsapp_token_vendas' ? 'tok-vendas' : (n === 'whatsapp_token' ? 'tok-geral' : null) } },
      fetch: async (url, o) => ({ status: 200, body: '{}', _auth: (o.headers || {}).Authorization }),
      reply: reply(),
    }
    const r = await envio(ctx)
    return { r, lidos }
  }

  let e = await enviaPor('default')
  ok('conversa default: lê só o token de sempre',
    e.lidos.filter((n) => n.startsWith('whatsapp_token_')).length === 0, e.lidos)

  e = await enviaPor('vendas')
  ok('conversa de Vendas: procura o token da conta',
    e.lidos.includes('whatsapp_token_vendas'), e.lidos)

  e = await enviaPor('semsegredo')
  ok('conta sem segredo próprio: cai no de sempre (não fica muda)',
    e.lidos.includes('whatsapp_token_semsegredo') && e.lidos.includes('whatsapp_token'), e.lidos)

  // ══ cadastro SEM o 55 (revisão do #36) ════════════════════════════════
  // O payload da Avisa vem sempre com DDI. Cadastro com 10/11 dígitos gerava
  // uma variante só, nunca casava, e a mensagem caía na default em silêncio —
  // o mesmo sintoma que este PR corrigiu na outra ponta.
  const SEM_DDI = [{ id: 'local', nome: 'Local', setor: 'x', ativa: true, numero: '19333330009' }]
  c = cenario({ contas: SEM_DDI })
  r = await inbound(ctxDe(c, { body: corpoCru({ meuNumero: '5519333330009' }) }))
  ok('cadastro sem o 55 casa com o payload (que vem com DDI)', conta(c) === 'local', conta(c))

  c = cenario({ contas: SEM_DDI })
  r = await inbound(ctxDe(c, { body: corpoCru({ meuNumero: '551933330009' }) }))
  ok('  e também pela variante do nono dígito', conta(c) === 'local', conta(c))

  // ══ a ORDEM das guardas (revisão do #36) ══════════════════════════════
  // O `?k` só é avaliado DEPOIS do segredo da rota, e as duas recusas têm a
  // MESMA mensagem: diferentes contariam a quem não tem o segredo que o `?k`
  // existe e que aquele valor não é de ninguém.
  c = cenario()
  const semSegredo = await inbound(ctxDe(c, { query: { token: 'errado', k: 'k-vendas-9f3a' } }))
  ok('sem o segredo da rota, o ?k nem é avaliado: 403', semSegredo.status === 403, semSegredo.status)
  c = cenario()
  const kRuim = await inbound(ctxDe(c, { query: { k: 'nao-existe' } }))
  ok('  e a recusa do k desconhecido tem a MESMA mensagem',
    JSON.stringify(semSegredo.body) === JSON.stringify(kRuim.body),
    { semSegredo: semSegredo.body, kRuim: kRuim.body })

  // `?k` vazio é ausência, e cai na default — documentado no PR.
  c = cenario()
  r = await inbound(ctxDe(c, { query: { k: '' } }))
  ok('?k vazio é tratado como ausência: conta default',
    r.status !== 403 && conta(c) === 'default', { status: r.status, conta: conta(c) })

  fim()
})()
