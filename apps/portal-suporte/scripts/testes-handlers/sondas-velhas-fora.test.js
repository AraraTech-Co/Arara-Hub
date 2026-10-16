// Duas sondas antigas saíram do webhook de entrada.
//
// O que elas faziam: liam a tabela de eventos INTEIRA, sem filtro, só para
// contar quantos registros já tinham e decidir se ainda podiam gravar. Com o
// teto alcançado (12 na de recibo, 8 na de endereçamento), a leitura continuava
// acontecendo em todo webhook e a gravação nunca mais.
//
//   diag_recibo    → em todo evento SEM mensagem (os recibos de entrega)
//   diag_endereco  → em toda mensagem de conversa com LID
//
// Nenhuma das duas tinha rota que lesse o que capturaram, e os registros já
// gravados continuam na tabela: o que sai é a contagem e a escrita, não o dado.
//
// As outras quatro sondas FICAM, e a diferença entre elas e as que saíram é o
// ponto deste teste: as que ficam tentam o filtro por `kind` primeiro, e só
// caem na varredura como reserva. As que saíram nem tentavam.
//
// Roda com: node sondas-velhas-fora.test.js
const { carregarHandler, reply, ok, fim } = require('./_carregar.js')

const inbound = carregarHandler('485 whatsapp POST /whatsapp/inbound')

const SEGREDO = 'segredo-da-rota'
const JID_LID = '123456789012345@lid'
const JID = '5519999990001@s.whatsapp.net'

function cenario() {
  const conversa = {
    id: 'c1', remote_jid: JID, conta_id: 'default', phase: 'em_atendimento',
    assigned_to_id: 'u1', menu_node: null, status: 'open',
  }
  const estado = { eventos: [], criadas: [], varreduras: 0, filtradas: [] }
  const models = {
    WhatsAppConversation: {
      findById: async () => ({ ...conversa }),
      findMany: async () => [{ ...conversa }],
      create: async (c) => c,
      update: async (id, p) => Object.assign(conversa, p),
    },
    WhatsAppMessage: {
      findMany: async () => [],
      findById: async () => null,
      create: async (m) => { estado.criadas.push(m); return m },
      update: async () => null,
    },
    WaConversationEvents: {
      findMany: async (f) => {
        const ch = Object.keys(f || {})
        if (!ch.length) { estado.varreduras++; return estado.eventos }
        estado.filtradas.push(ch.join(','))
        return estado.eventos.filter((e) => ch.every((k) => e[k] === f[k]))
      },
      create: async (e) => { estado.eventos.push(e); return e },
    },
    Profile: { findById: async () => ({ id: 'u1', role: 'support' }), findMany: async () => [] },
    Sessao: { findById: async () => null },
    SystemSettings: { findMany: async () => [{ waMenuEnabled: false }] },
    SupportSchedule: { findMany: async () => [] },
    WaFlows: { findMany: async () => [] },
    Company: { findMany: async () => [], findById: async () => null },
    Contact: { findMany: async () => [], findById: async () => null },
    Ticket: { findMany: async () => [], findById: async () => null },
    Unit: { findMany: async () => [] },
    ClientUser: { findMany: async () => [] },
    WaConta: { findMany: async () => [], findById: async () => null },
  }
  return {
    estado,
    ctx: (body) => ({
      params: {}, headers: {}, query: { token: SEGREDO }, body, models,
      secrets: { get: async (n) => (n === 'avisa_webhook_secret' ? SEGREDO : 'tok') },
      fetch: async () => ({ status: 200, body: '{}' }),
      reply: reply(),
    }),
  }
}

/** Evento SEM mensagem: é o que acionava a sonda de recibo. */
const recibo = () => ({
  jsonData: JSON.stringify({
    event: {
      Info: { Chat: JID, Sender: JID, PushName: 'Cliente', ID: 'WA_R1', IsFromMe: false },
      Receipt: { Type: 'read', MessageIDs: ['WA_X', 'WA_Y'] },
    },
  }),
})

/** Mensagem de conversa com LID: é o que acionava a sonda de endereçamento. */
const mensagemLid = () => ({
  jsonData: JSON.stringify({
    event: {
      Info: { Chat: JID_LID, Sender: JID_LID, SenderAlt: JID, PushName: 'Cliente', ID: 'WA_L1', IsFromMe: false },
      Message: { conversation: 'oi' },
    },
  }),
})

const sonda = (c, kind) => c.estado.eventos.filter((e) => e.kind === kind)

;(async () => {
  // ══ evento de recibo: nenhuma varredura, nenhum registro ══════════════
  {
    const c = cenario()
    await inbound(c.ctx(recibo()))
    ok('recibo: a tabela de eventos NÃO é varrida', c.estado.varreduras === 0,
      { varreduras: c.estado.varreduras, filtradas: c.estado.filtradas })
    ok('  e a sonda de recibo não grava mais', sonda(c, 'diag_recibo').length === 0,
      c.estado.eventos.map((e) => e.kind))
  }

  // ══ mensagem com LID: idem ════════════════════════════════════════════
  {
    const c = cenario()
    await inbound(c.ctx(mensagemLid()))
    ok('mensagem com LID: a sonda de endereçamento não grava mais',
      sonda(c, 'diag_endereco').length === 0, c.estado.eventos.map((e) => e.kind))
    // A mensagem em si tem de continuar chegando: a sonda sai, o atendimento não.
    ok('  e a mensagem continua sendo gravada', c.estado.criadas.length === 1,
      c.estado.criadas.length)
  }

  // ══ com a tabela JÁ CHEIA, nada de varredura ══════════════════════════
  //
  // Era este o custo: teto alcançado, gravação nenhuma, e a leitura inteira
  // acontecendo em todo webhook.
  {
    const c = cenario()
    for (let i = 0; i < 12; i++) {
      c.estado.eventos.push({ id: 'drec_' + i, kind: 'diag_recibo', conversation_id: 'diagnostico', payload: '{}' })
    }
    for (let i = 0; i < 8; i++) {
      c.estado.eventos.push({ id: 'dend_' + i, kind: 'diag_endereco', conversation_id: 'diagnostico', payload: '{}' })
    }
    const antes = c.estado.varreduras
    await inbound(c.ctx(recibo()))
    await inbound(c.ctx(mensagemLid()))
    ok('tabela cheia: segue sem varredura nenhuma', c.estado.varreduras === antes,
      { antes, depois: c.estado.varreduras })
  }

  // ══ e os registros antigos continuam lá ═══════════════════════════════
  {
    const c = cenario()
    c.estado.eventos.push({ id: 'drec_0', kind: 'diag_recibo', conversation_id: 'diagnostico', payload: '{"tipo":"read"}' })
    await inbound(c.ctx(recibo()))
    ok('o que a sonda já capturou não é apagado',
      sonda(c, 'diag_recibo').length === 1, sonda(c, 'diag_recibo'))
  }

  // ══ as outras sondas continuam, e continuam tentando o filtro ═════════
  {
    const c = cenario()
    // Mensagem de grupo sem nome é o que aciona a sonda de nome de grupo.
    await inbound(c.ctx({
      jsonData: JSON.stringify({
        event: {
          Info: { Chat: '120363123456@g.us', Sender: JID, PushName: 'Cliente', ID: 'WA_G1', IsFromMe: false, IsGroup: true },
          Message: { conversation: 'oi do grupo' },
        },
      }),
    }))
    // Ela pode nem rodar (depende do interruptor de grupos), mas se consultar a
    // tabela de eventos tem de ser PELO FILTRO primeiro.
    const porFiltro = c.estado.filtradas.filter((f) => f === 'kind').length
    ok('qualquer consulta à tabela de eventos tenta o filtro antes',
      c.estado.varreduras === 0 || porFiltro > 0,
      { varreduras: c.estado.varreduras, filtradas: c.estado.filtradas })
  }

  fim()
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(1) })
