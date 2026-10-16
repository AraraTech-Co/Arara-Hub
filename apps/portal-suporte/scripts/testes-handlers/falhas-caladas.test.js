// Três falhas que aconteciam em silêncio. A pior coisa de cada uma não era o
// defeito: era ninguém saber que tinha acontecido.
//
// 1. CITAÇÃO (rota 464): a mensagem citada era procurada varrendo a tabela sem
//    filtro, e a plataforma devolve no máximo 500 por consulta, da mais nova
//    para a mais velha. Citar mensagem mais antiga que as 500 últimas não
//    achava nada, e a resposta saía SEM a citação — sem aviso a quem citou.
// 2. REAÇÃO (rota 485): mesma varredura, mesmo teto. O emoji aparecia no
//    aparelho do cliente e nunca no portal.
// 3. PRÉVIA (lista de conversas): o servidor calcula `previa_indisponivel`, o
//    tipo da inbox já o declarava e a apresentação já sabia desenhá-lo — mas o
//    `fromLegacy` copia campo por campo e o deixava cair no chão. Conversa com
//    histórico fora do alcance aparecia como "Sem mensagens", que diz outra
//    coisa: uma é "não consegui ler", a outra é "não existe".
//
// O falso dos dois primeiros casos imita o teto de verdade: filtro por
// `message_id` acha, varredura devolve só as 500 mais NOVAS. Com a mensagem
// antiga fora dessa janela, só o caminho novo a encontra.
//
// Roda com: node falhas-caladas.test.js
const fs = require('node:fs')
const path = require('node:path')
const { carregarHandler, reply, ok, fim } = require('./_carregar.js')

const enviar = carregarHandler('464 whatsapp POST /whatsapp')
const inbound = carregarHandler('485 whatsapp POST /whatsapp/inbound')

const APP = path.resolve(__dirname, '../..')
const SEGREDO = 'segredo-da-rota'
const CONV = 'c1'
const JID = '5519999990001@s.whatsapp.net'
const TETO = 500
const ANTIGA = 'WA_ANTIGA_FORA_DA_JANELA'

/** 500 mensagens novas + a antiga, que fica FORA da janela da varredura. */
function tabela() {
  const msgs = []
  const agora = Date.now()
  msgs.push({
    id: 'm_antiga', conversation_id: CONV, message_id: ANTIGA, from_me: false,
    body: 'a mensagem que será citada', sender_jid: JID, sender_name: 'Cliente',
    timestamp: new Date(agora - 400 * 86400000).toISOString(),
  })
  for (let i = 0; i < TETO; i++) {
    msgs.push({
      id: 'm' + i, conversation_id: CONV, message_id: 'WA_NOVA_' + i, from_me: false,
      body: 'ruido ' + i, sender_jid: JID,
      timestamp: new Date(agora - i * 1000).toISOString(),
    })
  }
  return msgs
}

function cenario() {
  const conversa = {
    id: CONV, remote_jid: JID, conta_id: 'default', phase: 'em_atendimento',
    assigned_to_id: 'u1', menu_node: null, status: 'open',
  }
  const estado = { msgs: tabela(), criadas: [], patches: [], enviadas: [], varreu: 0, porId: 0 }
  const novasPrimeiro = (l) => l.slice().sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)))

  const models = {
    WhatsAppConversation: {
      findById: async () => ({ ...conversa }),
      findMany: async () => [{ ...conversa }],
      create: async (c) => c,
      update: async (id, p) => Object.assign(conversa, p),
    },
    WhatsAppMessage: {
      findMany: async (f) => {
        const ch = Object.keys(f || {})
        if (!ch.length) {
          // A varredura de verdade: só as 500 mais NOVAS. A antiga não entra.
          estado.varreu++
          return novasPrimeiro(estado.msgs).slice(0, TETO)
        }
        estado.porId++
        return estado.msgs.filter((m) => ch.every((k) => String(m[k] ?? '') === String(f[k])))
      },
      findById: async (id) => estado.msgs.find((m) => m.id === id) || null,
      create: async (m) => { estado.criadas.push(m); estado.msgs.push(m); return m },
      update: async (id, p) => {
        estado.patches.push({ id, ...p })
        const m = estado.msgs.find((x) => x.id === id)
        if (m) Object.assign(m, p)
        return m || null
      },
    },
    Profile: { findById: async () => ({ id: 'u1', role: 'support', full_name: 'Ana' }), findMany: async () => [] },
    Sessao: { findById: async () => null },
    SystemSettings: { findMany: async () => [{ waMenuEnabled: false }] },
    WaConversationEvents: { findMany: async () => [], create: async (e) => e },
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
    models,
    ctxEnvio: (body) => ({
      params: {}, headers: {}, query: {}, body,
      user: { id: 'u1' }, models,
      secrets: { get: async () => 'tok' },
      fetch: async (url, o) => { estado.enviadas.push({ url, body: o && o.body }); return { status: 200, body: '{}' } },
      reply: reply(),
    }),
    ctxInbound: (body) => ({
      params: {}, headers: {}, query: { token: SEGREDO }, body, models,
      secrets: { get: async (n) => (n === 'avisa_webhook_secret' ? SEGREDO : 'tok') },
      fetch: async () => ({ status: 200, body: '{}' }),
      reply: reply(),
    }),
  }
}

;(async () => {
  // ══ 1. citar mensagem FORA da janela de 500 ═══════════════════════════
  {
    const c = cenario()
    const r = await enviar(c.ctxEnvio({
      conversationId: CONV,
      message: 'respondendo ao que você disse lá atrás',
      responder_a: { message_id: ANTIGA },
    }))
    ok('o envio é aceito', r.status === 200 || r.status === 201, { status: r.status, body: r.body })
    ok('  buscou pelo id, não varrendo', c.estado.porId >= 1, { porId: c.estado.porId, varreu: c.estado.varreu })

    const paraAvisa = c.estado.enviadas.map((e) => String(e.body || '')).join(' ')
    ok('  a CITAÇÃO vai para o provedor', paraAvisa.includes(ANTIGA),
      c.estado.enviadas.map((e) => String(e.body || '').slice(0, 120)))
    const gravada = c.estado.criadas[0]
    ok('  e a citação é gravada na mensagem',
      gravada && gravada.citacao && gravada.citacao.message_id === ANTIGA, gravada && gravada.citacao)
    ok('  com o trecho citado', gravada && gravada.citacao
      && String(gravada.citacao.corpo).includes('será citada'), gravada && gravada.citacao)
  }

  // ══ citar mensagem que existe na janela continua funcionando ══════════
  {
    const c = cenario()
    await enviar(c.ctxEnvio({
      conversationId: CONV, message: 'resposta', responder_a: { message_id: 'WA_NOVA_3' },
    }))
    const g = c.estado.criadas[0]
    ok('citar mensagem recente: segue funcionando',
      g && g.citacao && g.citacao.message_id === 'WA_NOVA_3', g && g.citacao)
  }

  // ══ citar id que não existe: nada de citação, e sem quebrar ═══════════
  {
    const c = cenario()
    const r = await enviar(c.ctxEnvio({
      conversationId: CONV, message: 'resposta', responder_a: { message_id: 'WA_QUE_NAO_EXISTE' },
    }))
    ok('id inexistente: a mensagem sai sem citação, sem erro',
      (r.status === 200 || r.status === 201) && c.estado.criadas[0] && !c.estado.criadas[0].citacao,
      { status: r.status, citacao: c.estado.criadas[0] && c.estado.criadas[0].citacao })
  }

  // ══ 2. reagir a mensagem FORA da janela de 500 ════════════════════════
  {
    const c = cenario()
    await inbound(c.ctxInbound({
      jsonData: JSON.stringify({
        event: {
          Info: { Chat: JID, Sender: JID, PushName: 'Cliente', ID: 'WA_REAC', IsFromMe: false },
          Message: { reactionMessage: { key: { ID: ANTIGA }, text: '👍' } },
        },
      }),
    }))
    const patch = c.estado.patches.find((p) => p.id === 'm_antiga')
    ok('a reação chega na mensagem antiga', !!patch, c.estado.patches.map((p) => p.id))
    ok('  com o emoji', patch && Array.isArray(patch.reacoes)
      && patch.reacoes.some((x) => x.emoji === '👍'), patch && patch.reacoes)
    ok('  e buscou pelo id', c.estado.porId >= 1, { porId: c.estado.porId })
  }

  // ══ reagir a mensagem recente continua funcionando ════════════════════
  {
    const c = cenario()
    await inbound(c.ctxInbound({
      jsonData: JSON.stringify({
        event: {
          Info: { Chat: JID, Sender: JID, PushName: 'Cliente', ID: 'WA_REAC2', IsFromMe: false },
          Message: { reactionMessage: { key: { ID: 'WA_NOVA_7' }, text: '❤️' } },
        },
      }),
    }))
    ok('reagir a mensagem recente: segue funcionando',
      c.estado.patches.some((p) => p.id === 'm7'), c.estado.patches.map((p) => p.id))
  }

  // ══ 3. a prévia indisponível chega à tela ═════════════════════════════
  //
  // O comportamento vive num componente React, então a afirmação é sobre o
  // código publicado, com os comentários removidos antes de buscar.
  {
    const semComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
    const hook = semComentarios(fs.readFileSync(path.join(APP, 'app/_hooks/use-inbox-stream.ts'), 'utf8'))
    const meta = semComentarios(fs.readFileSync(path.join(APP, 'app/_components/inbox/conversation-meta.tsx'), 'utf8'))
    const tipos = semComentarios(fs.readFileSync(path.join(APP, 'app/lib/api/whatsapp.ts'), 'utf8'))

    ok('o hook da lista COPIA previa_indisponivel',
      /previa_indisponivel:\s*c\.previa_indisponivel/.test(hook),
      'fromLegacy continua descartando o campo')
    ok('  o tipo que vem do servidor declara o campo',
      /export interface WAConversation \{[\s\S]*?previa_indisponivel\?: boolean/.test(tipos),
      'WAConversation sem o campo: o hook não compilaria')
    ok('  e a tela já sabia desenhar a diferença',
      /previa_indisponivel \? 'Prévia indisponível' : 'Sem mensagens'/.test(meta),
      'a apresentação mudou: conferir conversation-meta')
  }

  fim()
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(1) })
