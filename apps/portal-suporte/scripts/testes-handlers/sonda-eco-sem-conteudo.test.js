// Sonda do anexo duplicado (bloco 485, `diag_eco`) — e a rota que a lê (448).
//
// O #52 acabou com a duplicata da resposta de TEXTO, mas o ANEXO continua
// duplicando. Não dá para consertar sem ver um eco de verdade: arquivo e
// legenda saem em DOIS envios, e eu não sei qual dos dois ecos traz o texto nem
// em que embrulho. A sonda responde isso com um dia de produção.
//
// As duas coisas que este teste existe para garantir:
//  1. a sonda NÃO grava conteúdo. Nem texto de mensagem, nem telefone, nem
//     nome. Só nomes de campo, tamanhos, contagens e booleanos. Uma sonda que
//     vaza conversa de cliente é pior que o defeito que ela investiga;
//  2. ela PARA no teto de 30 — sonda que não para vira a próxima tabela a
//     bater no teto de 500 da plataforma.
//
// Roda com: node sonda-eco-sem-conteudo.test.js
const { carregarHandler, reply, ok, fim } = require('./_carregar.js')

const inbound = carregarHandler('485 whatsapp POST /whatsapp/inbound')
const diagnostico = carregarHandler('448 whatsapp GET /whatsapp/diagnostico/midia')

const SEGREDO = 'segredo-da-rota'
const CONV = 'c1'
const JID_CLIENTE = '5519999990001@s.whatsapp.net'
const NOSSO = '5519333330001'

// Dados que NÃO podem aparecer em registro nenhum da sonda.
const TEXTO_SECRETO = 'meu cartao é 4111 1111 1111 1111'
const TELEFONE = '5519999990001'
const NOME = 'Cliente Fulano de Tal'

function corpoCru({ texto = TEXTO_SECRETO, id = 'WAID1', deNos = true } = {}) {
  return {
    jsonData: JSON.stringify({
      event: {
        Info: {
          Chat: JID_CLIENTE,
          Sender: deNos ? NOSSO + '@s.whatsapp.net' : JID_CLIENTE,
          PushName: NOME,
          ID: id,
          IsFromMe: deNos,
        },
        Message: { conversation: texto },
      },
    }),
  }
}

function cenario({ eventos = [] } = {}) {
  const conversa = {
    id: CONV, remote_jid: JID_CLIENTE, conta_id: 'default',
    phase: 'em_atendimento', assigned_to_id: 'u1', menu_node: null,
  }
  const estado = { eventos: eventos.slice(), mensagens: [], criadas: [] }
  const models = {
    WhatsAppConversation: {
      findById: async () => ({ ...conversa }),
      findMany: async () => [{ ...conversa }],
      create: async (c) => c,
      // Devolve o registro, e não undefined: o handler reatribui `conv` a
      // partir do retorno do update (união de conversas duplicadas). Um falso
      // que devolve undefined quebra a rota por culpa do falso.
      update: async (id, p) => Object.assign(conversa, p),
    },
    WhatsAppMessage: {
      findMany: async () => estado.mensagens,
      create: async (m) => { estado.criadas.push(m); estado.mensagens.push(m); return m },
      update: async () => null,
    },
    WaConversationEvents: {
      findMany: async (f) => {
        const ch = Object.keys(f || {})
        if (!ch.length) return estado.eventos
        return estado.eventos.filter((e) => ch.every((k) => e[k] === f[k]))
      },
      create: async (e) => { estado.eventos.push(e); return e },
    },
    SystemSettings: { findMany: async () => [{ waMenuEnabled: false }] },
    Profile: { findMany: async () => [], findById: async () => null },
    SupportSchedule: { findMany: async () => [] },
    WaFlows: { findMany: async () => [] },
    Sessao: { findById: async () => null },
    Company: { findMany: async () => [], findById: async () => null },
    Contact: { findMany: async () => [], findById: async () => null },
    Ticket: { findMany: async () => [], findById: async () => null },
    Unit: { findMany: async () => [] },
    ClientUser: { findMany: async () => [] },
    WaConta: { findMany: async () => [], findById: async () => null },
  }
  return {
    estado,
    models,
    ctx: (body) => ({
      params: {}, headers: {}, query: { token: SEGREDO },
      body: body || corpoCru(),
      models,
      secrets: { get: async (n) => (n === 'avisa_webhook_secret' ? SEGREDO : 'tok') },
      fetch: async () => ({ status: 200, body: '{}' }),
      reply: reply(),
    }),
  }
}

const capturas = (c) => c.estado.eventos.filter((e) => e.kind === 'diag_eco')

;(async () => {
  // ══ grava, e só o que precisa ═════════════════════════════════════════
  {
    const c = cenario()
    await inbound(c.ctx(corpoCru()))
    const regs = capturas(c)
    ok('a sonda registra o eco nosso', regs.length === 1, regs.length)

    const p = JSON.parse(regs[0].payload)
    ok('  diz o formato', p.formato === 'envelope', p.formato)
    ok('  diz as chaves de message', p.chavesDeMessage === 'conversation', p.chavesDeMessage)
    ok('  diz se era texto puro', typeof p.textoPuro === 'boolean', p.textoPuro)
    ok('  diz se havia mídia crua', typeof p.temMidiaCrua === 'boolean', p.temMidiaCrua)
    ok('  diz se casou', typeof p.casou === 'boolean', p.casou)
    ok('  e diz o MOTIVO, que é a pergunta da sonda', typeof p.motivo === 'string' && p.motivo.length > 0, p.motivo)

    // ── a parte que mais importa ──────────────────────────────────────
    const bruto = JSON.stringify(regs[0])
    ok('NÃO grava o texto da mensagem', !bruto.includes(TEXTO_SECRETO), bruto.slice(0, 200))
    ok('  nem um trecho dele', !bruto.includes('4111'), bruto.slice(0, 200))
    ok('  NÃO grava telefone', !bruto.includes(TELEFONE), bruto.slice(0, 200))
    ok('  NÃO grava nome', !bruto.includes(NOME) && !bruto.includes('Fulano'), bruto.slice(0, 200))
    ok('  guarda o TAMANHO do texto, não o texto',
      p.tamanhoDoTexto === TEXTO_SECRETO.length, { tamanho: p.tamanhoDoTexto, esperado: TEXTO_SECRETO.length })
  }

  // ══ mensagem do cliente não é registrada ══════════════════════════════
  {
    const c = cenario()
    await inbound(c.ctx(corpoCru({ deNos: false })))
    ok('mensagem do cliente: a sonda não registra', capturas(c).length === 0, capturas(c).length)
  }

  // ══ para no teto de 30 ════════════════════════════════════════════════
  {
    const cheios = []
    for (let i = 0; i < 30; i++) {
      cheios.push({ id: 'deco_' + i, kind: 'diag_eco', conversation_id: 'diagnostico', payload: '{}', created_at: new Date().toISOString() })
    }
    const c = cenario({ eventos: cheios })
    await inbound(c.ctx(corpoCru({ id: 'WAID_31' })))
    ok('com 30 registros, para de gravar', capturas(c).length === 30, capturas(c).length)
  }

  // ══ 29 ainda grava: o teto é 30, não "quase 30" ══════════════════════
  {
    const cheios = []
    for (let i = 0; i < 29; i++) {
      cheios.push({ id: 'deco_' + i, kind: 'diag_eco', conversation_id: 'diagnostico', payload: '{}', created_at: new Date().toISOString() })
    }
    const c = cenario({ eventos: cheios })
    await inbound(c.ctx(corpoCru({ id: 'WAID_30' })))
    ok('com 29 registros, ainda grava o 30º', capturas(c).length === 30, capturas(c).length)
  }

  // ══ SE A LEITURA DA CONTAGEM FALHA, A SONDA NÃO GRAVA ═════════════════
  //
  // Sem contagem não há teto. Se a falha deixasse a contagem em 0, a sonda
  // gravaria em toda mensagem nossa, e justamente quando o banco está pior: o
  // instrumento viraria carga na hora em que a carga é o problema. Sonda
  // silenciosa é aceitável; sonda que grava sem limite não é.
  {
    const c = cenario({ eventos: [] })
    const lerOriginal = c.models.WaConversationEvents.findMany
    c.models.WaConversationEvents.findMany = async (f) => {
      if (f && f.kind === 'diag_eco') throw new Error('banco indisponível')
      return lerOriginal(f)
    }
    await inbound(c.ctx(corpoCru({ id: 'WAID_F' })))
    ok('leitura da contagem falhou: a sonda não grava', capturas(c).length === 0, capturas(c).length)

    const normal = cenario({ eventos: [] })
    await inbound(normal.ctx(corpoCru({ id: 'WAID_G' })))
    ok('controle: com a leitura funcionando, a mesma entrada grava', capturas(normal).length === 1, capturas(normal).length)
  }

  // ══ O FILTRO NÃO É MAIS CONFERIDO POR VARREDURA ══════════════════════
  //
  // A reserva por varredura existia por desconfiança do filtro por campo, que
  // foi provado contra Postgres real. Se o filtro devolver vazio, a contagem é
  // zero e a sonda grava; sem varredura de reserva, a tabela não é lida inteira.
  {
    const cheios = []
    for (let i = 0; i < 30; i++) cheios.push({ id: 'deco_' + i, kind: 'diag_eco', conversation_id: 'diagnostico', payload: '{}', created_at: new Date().toISOString() })
    const c = cenario({ eventos: cheios })
    const lerOriginal = c.models.WaConversationEvents.findMany
    const leituras = []
    c.models.WaConversationEvents.findMany = async (f) => { leituras.push(Object.keys(f || {}).length); return lerOriginal(f) }
    await inbound(c.ctx(corpoCru({ id: 'WAID_H' })))
    ok('teto cheio: não grava e não lê a tabela inteira (só leituras com filtro)', capturas(c).length === 30 && leituras.length >= 1 && leituras.every((n) => n > 0), { capturas: capturas(c).length, leituras })
  }

  // ══ a sonda nunca atrapalha a entrada ════════════════════════════════
  {
    const c = cenario()
    c.models.WaConversationEvents.create = async () => { throw new Error('tabela de eventos fora') }
    const r = await inbound(c.ctx(corpoCru({ id: 'WAID_X' })))
    ok('sonda que falha não derruba o webhook', r.status !== 500, { status: r.status })
    ok('  e a mensagem é gravada de qualquer forma', c.estado.criadas.length === 1, c.estado.criadas.length)
  }

  // ══ a rota de diagnóstico devolve as capturas, sem perder as antigas ══
  {
    const c = cenario({
      eventos: [
        { id: 'dmid_1', kind: 'diag_midia', conversation_id: 'diagnostico', payload: '{"campo":"imageMessage"}', created_at: '2026-10-15T10:00:00.000Z' },
        { id: 'deco_1', kind: 'diag_eco', conversation_id: 'diagnostico', payload: '{"motivo":"tem-midia"}', created_at: '2026-10-15T11:00:00.000Z' },
      ],
    })
    // A rota de diagnóstico tem guarda de nível: sem perfil a resposta é 403,
    // e o teste mediria a guarda em vez da leitura. Perfil de suporte, então.
    const models = { ...c.models, Profile: { findById: async () => ({ id: 'u1', role: 'support' }), findMany: async () => [] } }
    const r = await diagnostico({
      params: {}, query: {}, headers: {}, body: {},
      user: { id: 'u1' },
      models,
      reply: reply(),
    })
    const d = r.body && r.body.data
    ok('a rota 448 continua devolvendo as capturas de mídia', d && d.total === 1 && d.capturas.length === 1, d)
    ok('  e passa a devolver as do eco', d && d.eco_total === 1 && d.eco.length === 1, d)
    ok('  com o motivo legível', d && JSON.parse(d.eco[0].payload).motivo === 'tem-midia', d && d.eco[0])
  }

  fim()
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(1) })
