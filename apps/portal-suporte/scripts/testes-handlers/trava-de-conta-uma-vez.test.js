// Abrir conversa (rota 434): a conversa é lida UMA vez e a trava de conta é
// avaliada UMA vez — sem mudar a decisão da autorização em nenhum caso.
//
// Eram três `findById` do mesmo registro na mesma requisição (a trava, a data
// de nascimento da conversa e o contador de não lidas) e DUAS avaliações da
// trava. A de dentro era a mais fraca: ficava num try/catch que engole, então
// uma exceção ali faria a rota seguir entregando as mensagens — o defeito que
// o comentário da trava de cima diz ter sido corrigido movendo-a para fora do
// try, reintroduzido por baixo.
//
// Este teste existe para provar que a DECISÃO não mudou. Desempenho sem isso
// não vale nada: a troca aqui é em código de autorização.
//
// Roda com: node trava-de-conta-uma-vez.test.js
const { carregarHandler, reply, ok, fim } = require('./_carregar.js')

const mensagens = carregarHandler('434 whatsapp GET /whatsapp/:id/messages')

const EU = 'u-ana'
const AGORA = Date.now()
const iso = (h) => new Date(AGORA - h * 3600000).toISOString()

/**
 * @param conta        conta_id da conversa ("default" ou nomeada)
 * @param papel        papel de quem chama
 * @param grants       feature_grants de quem chama
 * @param conversa     null = não existe; "ERRO" = a leitura lança
 * @param perfilFalha  a partir de qual chamada o Profile.findById lança
 */
function cenario({ conta = 'default', papel = 'support', grants = [], conversa = 'ok', perfilFalha = 0, semModelConv = false } = {}) {
  const conv = {
    id: 'c1', remote_jid: '5519999990001@s.whatsapp.net', conta_id: conta,
    unread_count: 0, created_at: iso(5),
  }
  const estado = { leiturasDaConversa: 0, leiturasDePerfil: 0 }
  const msgs = [
    { id: 'm1', conversation_id: 'c1', message_id: 'WA_1', from_me: false, body: 'oi', timestamp: iso(1) },
  ]
  const models = {
    Sessao: { findById: async () => null },
    Profile: {
      findById: async () => {
        estado.leiturasDePerfil++
        if (perfilFalha && estado.leiturasDePerfil >= perfilFalha) throw new Error('perfil fora')
        return { id: EU, role: papel, feature_grants: grants }
      },
      findMany: async () => [],
    },
    WhatsAppMessage: { findMany: async () => msgs },
    WaConversationEvents: { findMany: async () => [], create: async (e) => e },
    SystemSettings: { findMany: async () => [] },
  }
  if (!semModelConv) {
    models.WhatsAppConversation = {
      findById: async () => {
        estado.leiturasDaConversa++
        if (conversa === 'ERRO') throw new Error('banco fora')
        return conversa === 'ok' ? conv : null
      },
      findMany: async () => (conversa === 'ok' ? [conv] : []),
      update: async () => {},
    }
  }
  return {
    estado,
    ctx: {
      params: { id: 'c1' }, query: {}, headers: {}, body: {},
      user: { id: EU },
      secrets: { get: async () => '' },
      fetch: async () => ({ status: 200, body: '{}' }),
      models,
      reply: reply(),
    },
  }
}

const temMensagens = (r) => !!(r && r.body && r.body.data && r.body.data.length)

;(async () => {
  // ══ conta default: passa, e lê a conversa UMA vez ══════════════════════
  {
    const c = cenario()
    const r = await mensagens(c.ctx)
    ok('conta default: responde 200', r.status === 200, { status: r.status, body: r.body })
    ok('  com as mensagens', temMensagens(r), r.body && r.body.data)
    ok('  e lê a conversa UMA vez (eram três)', c.estado.leiturasDaConversa === 1, c.estado.leiturasDaConversa)
  }

  // ══ conta nomeada sem grant: BARRA ═════════════════════════════════════
  {
    const c = cenario({ conta: 'vendas', grants: [] })
    const r = await mensagens(c.ctx)
    ok('conta nomeada sem grant: 403', r.status === 403, { status: r.status, body: r.body })
    ok('  e NENHUMA mensagem sai', !temMensagens(r), r.body)
  }

  // ══ conta nomeada com o grant: passa ═══════════════════════════════════
  {
    const c = cenario({ conta: 'vendas', grants: ['wa_conta_vendas'] })
    const r = await mensagens(c.ctx)
    ok('conta nomeada com o grant: 200', r.status === 200, { status: r.status, body: r.body })
    ok('  com as mensagens', temMensagens(r), r.body && r.body.data)
  }

  // ══ admin passa em qualquer conta ══════════════════════════════════════
  {
    const c = cenario({ conta: 'vendas', papel: 'admin', grants: [] })
    const r = await mensagens(c.ctx)
    ok('admin em conta nomeada: 200', r.status === 200, { status: r.status, body: r.body })
  }

  // ══ O CASO QUE IMPORTA: erro na checagem tem de BARRAR ════════════════
  //
  // O perfil é lido TRÊS vezes no caminho de conta nomeada, e eu medi para
  // não chutar: 1) guarda de sessão, 2) camada de controle de acesso,
  // 3) a trava de conta. Falhando só a TERCEIRA, a falha cai exatamente na
  // trava — e quem passaria (admin) tem de ser barrado, nunca liberado.
  //
  // Falhar a segunda não serviria: aquela camada não captura, a exceção sai do
  // handler e o resultado seria 500. Também barra, mas por outro caminho, e o
  // teste não provaria nada sobre a trava.
  {
    const c = cenario({ conta: 'vendas', papel: 'admin', grants: [], perfilFalha: 3 })
    const r = await mensagens(c.ctx)
    ok('erro na checagem do perfil: BARRA, não libera', r.status === 403, { status: r.status, body: r.body })
    ok('  e NENHUMA mensagem sai', !temMensagens(r), r.body)
  }

  // ══ erro ao carregar a conversa: BARRA com 404 ════════════════════════
  {
    const c = cenario({ conversa: 'ERRO' })
    const r = await mensagens(c.ctx)
    ok('erro ao ler a conversa: 404, não libera', r.status === 404, { status: r.status, body: r.body })
    ok('  e NENHUMA mensagem sai', !temMensagens(r), r.body)
  }

  // ══ conversa inexistente: 404 ═════════════════════════════════════════
  {
    const c = cenario({ conversa: null })
    const r = await mensagens(c.ctx)
    ok('conversa inexistente: 404', r.status === 404, { status: r.status, body: r.body })
  }

  // ══ sem o model de conversas: passa, como hoje ════════════════════════
  //
  // A função antiga devolvia "pode passar" quando o model não existia, e a
  // rota seguia entregando mensagens. Virar 404 aqui seria mudança de
  // comportamento disfarçada de limpeza.
  {
    const c = cenario({ semModelConv: true })
    const r = await mensagens(c.ctx)
    ok('sem o model de conversas: continua respondendo 200', r.status === 200, { status: r.status, body: r.body })
    ok('  com as mensagens', temMensagens(r), r.body && r.body.data)
  }

  // ══ sem id no caminho: passa a trava, como hoje ═══════════════════════
  //
  // A função antiga devolvia "pode passar" com id vazio. A rota é
  // `/whatsapp/:id/messages`, então na prática o id vem sempre — mas tirar a
  // condição transformaria este caso em 404, e isso é mudança que ninguém
  // pediu. Está aqui para a condição `&& id` não poder ser removida em
  // silêncio.
  {
    const c = cenario()
    c.ctx.params = {}
    const r = await mensagens(c.ctx)
    ok('sem id: a trava não barra, como hoje', r.status === 200, { status: r.status, body: r.body })
    ok('  e a conversa não é lida', c.estado.leiturasDaConversa === 0, c.estado.leiturasDaConversa)
  }

  fim()
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(1) })
