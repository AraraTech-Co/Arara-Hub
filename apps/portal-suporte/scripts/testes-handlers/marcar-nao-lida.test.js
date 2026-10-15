// POST /whatsapp/:id/nao-lida (bloco 490y) — marcar conversa como não lida.
//
// O que este teste garante, e por que cada coisa:
//
//  - a CONTAGEM REAL sobrevive. Conversa com 3 por ler que alguém marca como
//    não lida continua com 3. Baixar para 1 apagaria informação que o cliente
//    gerou, para escrever uma marca que o atendente gerou;
//  - `updated_at` NÃO é tocado. A lista ordena por ele: carimbar agora faria a
//    conversa saltar ao topo como se o cliente tivesse falado. É a diferença
//    entre "marquei para depois" e "chegou mensagem", e quem olha a fila não
//    tem como distinguir as duas se o carimbo mudar;
//  - a guarda é a MESMA das outras rotas de conversa — sessão, nível e conta de
//    WhatsApp. O handler foi montado a partir do da rota 472 justamente para
//    não ter uma trava própria, e isto prova que a montagem não perdeu nada.
//
// Roda com: node marcar-nao-lida.test.js
const { carregarHandler, reply, ok, fim } = require('./_carregar.js')

const naoLida = carregarHandler('490y whatsapp POST /whatsapp/:id/nao-lida')

const EU = 'u-ana'
const QUANDO = '2026-10-15T09:00:00.000Z'

function cenario({ conversa = {}, perfil = { id: EU, role: 'support' } } = {}) {
  const conv = Object.assign({
    id: 'c1', remote_jid: '5519999990001@s.whatsapp.net', conta_id: 'default',
    unread_count: 0, updated_at: QUANDO, status: 'open', phase: 'em_atendimento',
  }, conversa)
  const estado = { conversas: [conv], patches: [], eventos: [] }
  return {
    estado,
    conv,
    models: {
      WhatsAppConversation: {
        findById: async (id) => estado.conversas.find((c) => c.id === id) || null,
        findMany: async () => estado.conversas,
        update: async (id, p) => {
          estado.patches.push({ id, ...p })
          const c = estado.conversas.find((x) => x.id === id)
          if (c) Object.assign(c, p)
          return c || null
        },
      },
      WhatsAppMessage: { findMany: async () => [] },
      Profile: { findById: async (id) => (perfil && id === perfil.id ? perfil : null), findMany: async () => (perfil ? [perfil] : []) },
      WaConversationEvents: { create: async (e) => { estado.eventos.push(e); return e } },
      Sessao: { findById: async () => null },
      SystemSettings: { findMany: async () => [{}] },
    },
  }
}

const ctxDe = (c, id = 'c1', extra = {}) => Object.assign({
  params: { id }, query: {}, headers: {},
  body: {},
  user: { id: EU },
  models: c.models,
  reply: reply(),
}, extra)

;(async () => {
  // ══ conversa já lida ganha a marca ════════════════════════════════════
  {
    const c = cenario()
    const r = await naoLida(ctxDe(c))
    ok('responde 200', r.status === 200, { status: r.status, body: r.body })
    ok('  grava 1 não lida', c.conv.unread_count === 1, c.conv.unread_count)
    ok('  devolve o valor gravado', r.body && r.body.data && r.body.data.unread_count === 1, r.body)
    ok('  um patch só', c.estado.patches.length === 1, c.estado.patches)
  }

  // ══ a contagem real não é destruída ═══════════════════════════════════
  {
    const c = cenario({ conversa: { unread_count: 3 } })
    await naoLida(ctxDe(c))
    ok('conversa com 3 por ler continua com 3', c.conv.unread_count === 3, c.conv.unread_count)
  }

  // ══ o lugar na fila não muda ══════════════════════════════════════════
  {
    const c = cenario()
    await naoLida(ctxDe(c))
    ok('updated_at NÃO é tocado', c.conv.updated_at === QUANDO, c.conv.updated_at)
    ok('  e o patch não o menciona',
      c.estado.patches.every((p) => !('updated_at' in p)), c.estado.patches)
  }

  // ══ fica registrado quem marcou ═══════════════════════════════════════
  {
    const c = cenario({ conversa: { unread_count: 2 } })
    await naoLida(ctxDe(c))
    const e = c.estado.eventos[0]
    ok('registra o evento', c.estado.eventos.length === 1, c.estado.eventos)
    ok('  com o tipo certo', e && e.type === 'marcada_nao_lida', e)
    ok('  com de → para', e && e.from_value === '2' && e.to_value === '2', e)
    ok('  e com o autor', e && e.actor_id === EU, e)
  }

  // ══ conversa que não existe ═══════════════════════════════════════════
  {
    const c = cenario()
    const r = await naoLida(ctxDe(c, 'nao-existe'))
    ok('conversa inexistente: 404', r.status === 404, { status: r.status, body: r.body })
    ok('  e nada é gravado', c.estado.patches.length === 0, c.estado.patches)
  }

  // ══ a guarda de sessão sobreviveu à montagem ══════════════════════════
  {
    const c = cenario()
    const r = await naoLida(ctxDe(c, 'c1', { user: {} }))
    ok('sem pessoa identificada: 401', r.status === 401, { status: r.status, body: r.body })
    ok('  e nada é gravado', c.estado.patches.length === 0, c.estado.patches)
  }

  // ══ nível abaixo de support não marca ═════════════════════════════════
  {
    const c = cenario({ perfil: { id: EU, role: 'vendedor' } })
    const r = await naoLida(ctxDe(c))
    ok('vendedor: 403', r.status === 403, { status: r.status, body: r.body })
    ok('  e nada é gravado', c.estado.patches.length === 0, c.estado.patches)
  }

  // ══ conta de WhatsApp nomeada exige o grant ═══════════════════════════
  {
    const c = cenario({ conversa: { conta_id: 'vendas' }, perfil: { id: EU, role: 'support', feature_grants: [] } })
    const r = await naoLida(ctxDe(c))
    ok('conversa de outra conta, sem grant: 403', r.status === 403, { status: r.status, body: r.body })
    ok('  e nada é gravado', c.estado.patches.length === 0, c.estado.patches)

    const d = cenario({ conversa: { conta_id: 'vendas' }, perfil: { id: EU, role: 'support', feature_grants: ['wa_conta_vendas'] } })
    const r2 = await naoLida(ctxDe(d))
    ok('  com o grant da conta: marca', r2.status === 200 && d.conv.unread_count === 1,
      { status: r2.status, unread: d.conv.unread_count })
  }

  // ══ admin passa em qualquer conta ═════════════════════════════════════
  {
    const c = cenario({ conversa: { conta_id: 'vendas' }, perfil: { id: EU, role: 'admin' } })
    const r = await naoLida(ctxDe(c))
    ok('admin marca em conta nomeada sem grant', r.status === 200, { status: r.status, body: r.body })
  }

  fim()
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(1) })
