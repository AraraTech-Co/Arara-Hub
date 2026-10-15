// Responder pelo portal grava UMA mensagem, não duas.
//
// A rota de resposta grava a mensagem com um identificador provisório
// (`local_…`) e manda o texto ao provedor; o provedor devolve a mesma mensagem
// por este webhook. Até aqui o webhook criava OUTRA linha, porque nada
// procurava a primeira — a marca `local_` não era consultada na entrada.
//
// Duas consequências, as duas cobertas abaixo:
//  - o histórico de toda conversa respondida pelo portal dobrava;
//  - a linha do envio não aceitava reagir, editar nem apagar, porque essas
//    ações exigem o identificador do WhatsApp, que só o eco traz.
//
// O casamento é conservador de propósito: mesma conversa, mensagem NOSSA,
// identificador ainda provisório, texto idêntico e recente. Se o provedor não
// ecoar o que sai pela API, nada disto acontece — e é por isso que há caso
// para "não achou candidata: grava como antes".
//
// Nada sai para a Avisa: ctx.fetch é interceptado.
// Roda com: node eco-sem-duplicar.test.js
const { carregarHandler, reply, ok, fim } = require('./_carregar.js')

const inbound = carregarHandler('485 whatsapp POST /whatsapp/inbound')
const acaoNaMensagem = carregarHandler('490i whatsapp POST /whatsapp/mensagem/:id/acao')

const SEGREDO = 'segredo-da-rota'
const CONV = 'c1'
const JID_CLIENTE = '5519999990001@s.whatsapp.net'
const NOSSO_NUMERO = '5519333330001'
const TETO = 500

/** O corpo cru do webhook, como a Avisa manda. */
function corpoCru({ deNos = true, texto = 'oi', id = 'WAID123' } = {}) {
  return { jsonData: JSON.stringify({ event: { Info: cabecalho({ deNos, id }), Message: { conversation: texto } } }) }
}

function cabecalho({ deNos = true, id = 'WAID123' } = {}) {
  return {
    Chat: JID_CLIENTE,
    Sender: deNos ? NOSSO_NUMERO + '@s.whatsapp.net' : JID_CLIENTE,
    PushName: deNos ? 'Arara Tech' : 'Cliente',
    ID: id,
    IsFromMe: deNos,
  }
}

/**
 * O eco de um ANEXO: imagem com legenda. Chega com TEXTO — a legenda —, que é
 * justamente por isso que olhar só a linha gravada não bastava.
 */
function corpoComImagem({ legenda = 'segue', id = 'WA_MIDIA' } = {}) {
  return corpoComMensagem({ imageMessage: imagem(legenda) }, id)
}

const imagem = (legenda) => ({ caption: legenda, mimetype: 'image/jpeg', url: 'https://mmg.whatsapp.net/x' })
const documento = (legenda) => ({ caption: legenda, mimetype: 'application/pdf', fileName: 'b.pdf', url: 'https://mmg.whatsapp.net/y' })

function corpoComMensagem(Message, id = 'WA_MIDIA') {
  return { jsonData: JSON.stringify({ event: { Info: cabecalho({ deNos: true, id }), Message } }) }
}

/**
 * As formas de mídia que o tradutor NÃO desembrulha.
 *
 * A detecção de texto do handler abre oito embrulhos, recursivamente; a de
 * mídia abria três. Ligar "isto é mídia?" à segunda deixava o eco de um
 * documento com legenda passar por mensagem de texto — e aí ele casava com a
 * bolha de texto, que passava a apontar para o arquivo no WhatsApp do cliente.
 * Estes são os casos que a revisão independente achou.
 */
const EMBRULHOS = (legenda) => [
  ['documentWithCaptionMessage', { documentWithCaptionMessage: { message: { documentMessage: documento(legenda) } } }],
  ['deviceSentMessage', { deviceSentMessage: { message: { imageMessage: imagem(legenda) } } }],
  ['viewOnceMessageV2Extension', { viewOnceMessageV2Extension: { message: { imageMessage: imagem(legenda) } } }],
  ['editedMessage', { editedMessage: { message: { imageMessage: imagem(legenda) } } }],
  ['ephemeral>viewOnceV2>imagem', { ephemeralMessage: { message: { viewOnceMessageV2: { message: { imageMessage: imagem(legenda) } } } } }],
  ['imageMessage direto', { imageMessage: imagem(legenda) }],
  ['documentMessage direto', { documentMessage: documento(legenda) }],
  ['ephemeral>imagem', { ephemeralMessage: { message: { imageMessage: imagem(legenda) } } }],
]

/** Uma linha como a rota de resposta grava: identificador provisório e nome. */
function doPortal({ texto = 'oi', quandoMin = 0, id = 'wam_local', conv = CONV, messageId = null } = {}) {
  return {
    id,
    conversation_id: conv,
    message_id: messageId || 'local_' + (Date.now() - quandoMin * 60000),
    from_me: true,
    sender_name: 'Judá Mendes',
    body: texto,
    citacao: { message_id: 'wa_citada', corpo: 'trecho', autor: 'Cliente' },
    timestamp: new Date(Date.now() - quandoMin * 60000).toISOString(),
  }
}

function cenario({ mensagens = [], comTeto = false } = {}) {
  const estado = { mensagens: mensagens.slice(), criadas: [], patches: [], enviadas: [] }
  const conversa = {
    id: CONV, remote_jid: JID_CLIENTE, conta_id: 'default', phase: 'em_atendimento',
    assigned_to_id: 'u1', menu_node: null,
  }
  const models = {
    WhatsAppConversation: {
      findById: async () => ({ ...conversa }),
      findMany: async () => [{ ...conversa }],
      create: async (c) => c,
      update: async (id, p) => Object.assign(conversa, p),
    },
    WhatsAppMessage: {
      // Imita a leitura real: teto de 500 nos DOIS casos, e a página vem da
      // mais NOVA para a mais velha (a leitura ordena por data, desc). O falso
      // anterior devolvia as 500 mais VELHAS e modelava um truncamento que em
      // produção não acontece.
      findMany: async (filtro) => {
        const f = filtro || {}
        const novasPrimeiro = (lista) => lista
          .slice()
          .sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')))
        const cortar = (lista) => (comTeto ? novasPrimeiro(lista).slice(0, TETO) : novasPrimeiro(lista))
        if (!Object.keys(f).length) return cortar(estado.mensagens)
        if (f.conversation_id) return cortar(estado.mensagens.filter((m) => m.conversation_id === f.conversation_id))
        return []
      },
      create: async (m) => { estado.criadas.push(m); estado.mensagens.push(m); return m },
      update: async (id, p) => {
        estado.patches.push({ id, ...p })
        const m = estado.mensagens.find((x) => x.id === id)
        if (m) Object.assign(m, p)
        return m || null
      },
    },
    SystemSettings: { findMany: async () => [{ waMenuEnabled: false }] },
    Profile: { findMany: async () => [], findById: async () => null },
    SupportSchedule: { findMany: async () => [] },
    WaConversationEvents: { findMany: async () => [], create: async (e) => e },
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
      fetch: async (url, o) => { estado.enviadas.push({ url, body: o && o.body }); return { status: 200, body: '{}' } },
      reply: reply(),
    }),
  }
}

/** Enche a tabela além do teto, para a varredura vir truncada. */
function encher(n, conv = 'outra') {
  const fora = []
  for (let i = 0; i < n; i++) {
    fora.push({
      id: 'enche_' + i, conversation_id: conv, message_id: 'wa_' + i, from_me: false,
      body: 'ruido ' + i, timestamp: new Date(Date.now() - 86400000).toISOString(),
    })
  }
  return fora
}

;(async () => {
  // ── o eco casa com a resposta do portal ──────────────────────────────────
  {
    const c = cenario({ mensagens: [doPortal({ texto: 'Bom dia!' })] })
    const r = await inbound(c.ctx(corpoCru({ texto: 'Bom dia!', id: 'WA_REAL_1' })))
    ok('o webhook é aceito', r.status !== 403, { status: r.status, body: r.body })
    ok('NÃO cria uma segunda mensagem', c.estado.criadas.length === 0, c.estado.criadas)
    ok('  atualiza a linha do envio', c.estado.patches.length === 1 && c.estado.patches[0].id === 'wam_local',
      c.estado.patches)
    ok('  com o identificador verdadeiro do WhatsApp',
      c.estado.patches[0] && c.estado.patches[0].message_id === 'WA_REAL_1', c.estado.patches[0])
    const linha = c.estado.mensagens.find((m) => m.id === 'wam_local')
    ok('  e o nome de quem respondeu sobrevive', linha && linha.sender_name === 'Judá Mendes', linha)
    ok('  e a citação também', linha && linha.citacao && linha.citacao.corpo === 'trecho', linha && linha.citacao)
    ok('  a tabela fica com UMA mensagem para o envio', c.estado.mensagens.length === 1, c.estado.mensagens.length)
  }

  // ── sem candidata, grava como antes ──────────────────────────────────────
  {
    const c = cenario({ mensagens: [] })
    await inbound(c.ctx(corpoCru({ texto: 'resposta pelo celular' })))
    ok('eco sem linha correspondente: grava normalmente', c.estado.criadas.length === 1, c.estado.criadas)
    ok('  e nada é atualizado', c.estado.patches.length === 0, c.estado.patches)
  }

  // ── mensagem do CLIENTE nunca casa ───────────────────────────────────────
  {
    const c = cenario({ mensagens: [doPortal({ texto: 'mesmo texto' })] })
    await inbound(c.ctx(corpoCru({ deNos: false, texto: 'mesmo texto', id: 'WA_CLI' })))
    ok('mensagem do cliente com texto igual: NÃO casa', c.estado.patches.length === 0, c.estado.patches)
    ok('  e é gravada como mensagem nova', c.estado.criadas.length === 1, c.estado.criadas)
  }

  // ── texto diferente não casa ─────────────────────────────────────────────
  {
    const c = cenario({ mensagens: [doPortal({ texto: 'um texto' })] })
    await inbound(c.ctx(corpoCru({ texto: 'outro texto' })))
    ok('texto diferente: não casa', c.estado.patches.length === 0 && c.estado.criadas.length === 1,
      { patches: c.estado.patches.length, criadas: c.estado.criadas.length })
  }

  // ── linha velha não casa (a janela é de 10 minutos) ──────────────────────
  {
    const c = cenario({ mensagens: [doPortal({ texto: 'oi', quandoMin: 11 })] })
    await inbound(c.ctx(corpoCru({ texto: 'oi' })))
    ok('linha de 11 minutos atrás: não casa', c.estado.patches.length === 0, c.estado.patches)
    const d = cenario({ mensagens: [doPortal({ texto: 'oi', quandoMin: 9 })] })
    await inbound(d.ctx(corpoCru({ texto: 'oi' })))
    ok('linha de 9 minutos atrás: casa', d.estado.patches.length === 1, d.estado.patches)
  }

  // ── linha de OUTRA conversa não casa ─────────────────────────────────────
  {
    const c = cenario({ mensagens: [doPortal({ texto: 'oi', conv: 'outra-conversa' })] })
    await inbound(c.ctx(corpoCru({ texto: 'oi' })))
    ok('linha de outra conversa: não casa', c.estado.patches.length === 0, c.estado.patches)
  }

  // ── linha já casada antes não é roubada ──────────────────────────────────
  {
    const c = cenario({
      mensagens: [doPortal({ texto: 'oi', id: 'wam_ja', messageId: 'WA_ANTIGO' })],
    })
    await inbound(c.ctx(corpoCru({ texto: 'oi', id: 'WA_NOVO' })))
    ok('linha com identificador definitivo: não casa', c.estado.patches.length === 0, c.estado.patches)
    ok('  o eco entra como mensagem nova', c.estado.criadas.length === 1, c.estado.criadas)
  }

  // ── mesmo texto duas vezes: NINGUÉM casa ─────────────────────────────────
  // Escolher entre duas respostas de texto idêntico exigiria saber qual eco é
  // de qual envio, e o webhook não diz: não garante ordem, e a linha cuja
  // ENTREGA FALHOU é indistinguível da que o cliente recebeu. Qualquer
  // critério erraria em silêncio, e o erro seria a bolha apontar para a
  // mensagem do lado — apagar uma apagaria a outra no aparelho do cliente.
  // Na dúvida, fica como era antes: duplica, que é visível.
  {
    const c = cenario({
      mensagens: [
        doPortal({ texto: 'ok', id: 'wam_a', quandoMin: 2 }),
        doPortal({ texto: 'ok', id: 'wam_b', quandoMin: 1 }),
      ],
    })
    await inbound(c.ctx(corpoCru({ texto: 'ok', id: 'WA_1' })))
    ok('duas candidatas: nenhuma é casada', c.estado.patches.length === 0, c.estado.patches)
    ok('  e o eco é gravado, como antes desta mudança', c.estado.criadas.length === 1, c.estado.criadas.length)
    ok('  as duas linhas do portal ficam intactas',
      c.estado.mensagens.filter((m) => String(m.message_id).indexOf('local_') === 0).length === 2,
      c.estado.mensagens.map((m) => m.message_id))
  }
  {
    // E com UMA candidata volta a casar — é o caso comum.
    const c = cenario({ mensagens: [doPortal({ texto: 'ok', id: 'wam_so' })] })
    await inbound(c.ctx(corpoCru({ texto: 'ok', id: 'WA_SO' })))
    ok('uma candidata: casa', c.estado.patches.length === 1 && c.estado.patches[0].id === 'wam_so', c.estado.patches)
  }

  // ── tabela acima do teto: a candidata recente está sempre na página ──────
  // A leitura vem truncada em 500 e ordenada da mais nova para a mais velha,
  // então uma resposta de segundos atrás nunca cai fora da página — é isso que
  // torna desnecessária uma varredura de reserva.
  {
    const c = cenario({
      mensagens: encher(TETO, CONV).concat([doPortal({ texto: 'no fim da fila' })]),
      comTeto: true,
    })
    await inbound(c.ctx(corpoCru({ texto: 'no fim da fila', id: 'WA_FIM' })))
    ok('com 500 linhas velhas na mesma conversa, a recente casa',
      c.estado.patches.length === 1 && c.estado.patches[0].id === 'wam_local', c.estado.patches)
    ok('  e nenhuma mensagem nova é criada', c.estado.criadas.length === 0, c.estado.criadas.length)
  }

  // ── o eco que CHEGA com mídia nunca casa ─────────────────────────────────
  // O eco de um anexo traz a LEGENDA como texto. Se ele casasse com a linha de
  // texto, aquela bolha passaria a apontar para a mensagem de arquivo no
  // WhatsApp — apagar a bolha de texto apagaria o arquivo no cliente — e o
  // arquivo enviado sairia do histórico do portal.
  {
    const c = cenario({ mensagens: [doPortal({ texto: 'segue o boleto' })] })
    await inbound(c.ctx(corpoComImagem({ legenda: 'segue o boleto', id: 'WA_IMG' })))
    ok('eco de imagem com a mesma legenda: NÃO casa com a linha de texto',
      c.estado.patches.length === 0, c.estado.patches)
    ok('  e o eco é gravado, com o tipo de mídia',
      c.estado.criadas.length === 1 && c.estado.criadas[0].media_type === 'image', c.estado.criadas)
    const texto = c.estado.mensagens.find((m) => m.id === 'wam_local')
    ok('  a linha de texto mantém o identificador provisório',
      texto && String(texto.message_id).indexOf('local_') === 0, texto && texto.message_id)
  }

  // ── mídia em QUALQUER embrulho nunca casa ────────────────────────────────
  for (const [nome, Message] of EMBRULHOS('segue o boleto')) {
    const c = cenario({ mensagens: [doPortal({ texto: 'segue o boleto' })] })
    await inbound(c.ctx(corpoComMensagem(Message, 'WA_' + nome.slice(0, 6))))
    const texto = c.estado.mensagens.find((m) => m.id === 'wam_local')
    ok(`eco de mídia (${nome}): NÃO casa com a linha de texto`, c.estado.patches.length === 0, c.estado.patches)
    ok('  e a linha de texto mantém o identificador provisório',
      texto && String(texto.message_id).indexOf('local_') === 0, texto && texto.message_id)
  }

  // ── só TEXTO PURO casa: o que eu não conheço nunca engole uma bolha ─────
  // Lista de permissão, não de exceções. Um tipo de mensagem que ninguém
  // previu — enquete, localização, pedido, o que vier — não casa, e por isso
  // não pode fazer bolha nenhuma desaparecer. O preço é a duplicata continuar
  // nesses casos, que é o defeito visível de sempre.
  {
    const FORMAS_QUE_NAO_CASAM = [
      ['resposta de botão', { buttonsResponseMessage: { selectedDisplayText: 'oi' } }],
      ['resposta de lista', { listResponseMessage: { singleSelectReply: { title: 'oi' } } }],
      ['chave que eu não conheço junto do texto', { conversation: 'oi', algumaCoisaNovaDaMeta: { x: 1 } }],
    ]
    for (const [nome, Message] of FORMAS_QUE_NAO_CASAM) {
      const c = cenario({ mensagens: [doPortal({ texto: 'oi' })] })
      await inbound(c.ctx(corpoComMensagem(Message, 'WA_NC')))
      ok(`${nome}: NÃO casa`, c.estado.patches.length === 0, c.estado.patches)
      ok('  e a mensagem é gravada, nenhuma bolha desaparece', c.estado.criadas.length === 1, c.estado.criadas.length)
    }
  }
  {
    // As duas formas simples casam, inclusive com a carona inofensiva que vem
    // em mensagem comum.
    const FORMAS_QUE_CASAM = [
      ['conversation', { conversation: 'oi' }],
      ['extendedTextMessage', { extendedTextMessage: { text: 'oi' } }],
      ['conversation + messageContextInfo', { conversation: 'oi', messageContextInfo: { deviceListMetadataVersion: 2 } }],
    ]
    for (const [nome, Message] of FORMAS_QUE_CASAM) {
      const c = cenario({ mensagens: [doPortal({ texto: 'oi' })] })
      await inbound(c.ctx(corpoComMensagem(Message, 'WA_C')))
      ok(`${nome}: casa`, c.estado.patches.length === 1 && c.estado.patches[0].id === 'wam_local', c.estado.patches)
    }
  }

  // ── mídia no formato plano (sem passar pelo tradutor) ───────────────────
  {
    const c = cenario({ mensagens: [doPortal({ texto: 'veja' })] })
    await inbound(c.ctx({ from_me: true, phone: '5519999990001', message: 'veja', message_id: 'WA_PLANO', media_data: 'data:image/jpeg;base64,AAA' }))
    ok('eco plano com media_data: NÃO casa', c.estado.patches.length === 0, c.estado.patches)
    const d = cenario({ mensagens: [doPortal({ texto: 'veja' })] })
    await inbound(d.ctx({ from_me: true, phone: '5519999990001', message: 'veja', message_id: 'WA_PLANO2', mediaUrl: 'https://x/y.jpg' }))
    ok('eco plano com mediaUrl: NÃO casa', d.estado.patches.length === 0, d.estado.patches)
  }

  // ── o texto tem de ser IGUAL, não "começa com" ──────────────────────────
  {
    const c = cenario({ mensagens: [doPortal({ texto: 'ok, vou verificar' })] })
    await inbound(c.ctx(corpoCru({ texto: 'ok' })))
    ok('eco "ok" não casa com a linha "ok, vou verificar"', c.estado.patches.length === 0, c.estado.patches)
  }

  // ── a consulta por conversa é necessária, não enfeite ───────────────────
  // 500 mensagens MAIS NOVAS em outras conversas: uma leitura sem filtro
  // devolveria só essas e a candidata ficaria de fora.
  {
    const novasDeOutras = []
    for (let i = 0; i < TETO; i++) {
      novasDeOutras.push({
        id: 'nova_' + i, conversation_id: 'outra', message_id: 'wa_n' + i, from_me: false,
        body: 'ruido', timestamp: new Date(Date.now() + 1000 + i).toISOString(),
      })
    }
    const c = cenario({ mensagens: [doPortal({ texto: 'achar mesmo assim' })].concat(novasDeOutras), comTeto: true })
    await inbound(c.ctx(corpoCru({ texto: 'achar mesmo assim', id: 'WA_F' })))
    ok('com 500 mensagens mais novas em outras conversas, a candidata é achada',
      c.estado.patches.length === 1 && c.estado.patches[0].id === 'wam_local', c.estado.patches)
  }

  // ── o patch grava o aparelho e o identificador de quem falou ────────────
  {
    const c = cenario({ mensagens: [doPortal({ texto: 'oi' })] })
    await inbound(c.ctx(corpoCru({ texto: 'oi', id: 'WA_D' })))
    const patch = c.estado.patches[0]
    ok('o patch grava o aparelho', patch && patch.sender_device === '0', patch)
    ok('  e o identificador de quem falou', patch && String(patch.sender_jid) === NOSSO_NUMERO, patch)
  }

  // ── falha na atualização cai na criação, como antes ──────────────────────
  {
    const c = cenario({ mensagens: [doPortal({ texto: 'oi' })] })
    c.models.WhatsAppMessage.update = async () => { throw new Error('not found') }
    await inbound(c.ctx(corpoCru({ texto: 'oi', id: 'WA_X' })))
    ok('se a atualização falha, o eco é gravado em vez de desaparecer',
      c.estado.criadas.length === 1 && c.estado.criadas[0].message_id === 'WA_X', c.estado.criadas)
  }

  // ── data inválida e data no futuro não casam ─────────────────────────────
  {
    const torta = doPortal({ texto: 'oi' })
    torta.timestamp = 'nao-e-data'
    const c = cenario({ mensagens: [torta] })
    await inbound(c.ctx(corpoCru({ texto: 'oi' })))
    ok('linha com data inválida: não casa', c.estado.patches.length === 0, c.estado.patches)

    const futura = doPortal({ texto: 'oi', id: 'wam_futuro' })
    futura.timestamp = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString()
    const d = cenario({ mensagens: [futura] })
    await inbound(d.ctx(corpoCru({ texto: 'oi' })))
    ok('linha com data no futuro: não casa', d.estado.patches.length === 0, d.estado.patches)
  }

  // ── o casamento preserva o horário do ENVIO ──────────────────────────────
  {
    const linha = doPortal({ texto: 'oi', quandoMin: 2 })
    const horarioDoEnvio = linha.timestamp
    const c = cenario({ mensagens: [linha] })
    await inbound(c.ctx(corpoCru({ texto: 'oi', id: 'WA_T' })))
    const depois = c.estado.mensagens.find((m) => m.id === 'wam_local')
    ok('o horário da mensagem continua sendo o do envio, não o do eco',
      depois && depois.timestamp === horarioDoEnvio, depois && depois.timestamp)
  }

  // ── anexo não entra no casamento: continua como hoje ────────────────────
  // A rota de resposta manda arquivo e legenda em dois envios; qual eco traz o
  // texto não foi medido. Casar no escuro poria o identificador do eco de
  // mídia numa linha que a pessoa vê como texto. Fora do casamento, anexo se
  // comporta exatamente como antes desta mudança.
  {
    const comArquivo = doPortal({ texto: 'segue o boleto' })
    comArquivo.media_type = 'document'
    comArquivo.media_data = 'data:application/pdf;base64,JVBERi0xLjQK'
    const c = cenario({ mensagens: [comArquivo] })
    await inbound(c.ctx(corpoCru({ texto: 'segue o boleto', id: 'WA_ANEXO' })))
    ok('linha com arquivo: NÃO casa', c.estado.patches.length === 0, c.estado.patches)
    ok('  e o eco entra como mensagem nova, como antes', c.estado.criadas.length === 1, c.estado.criadas.length)
  }
  {
    // Só o tipo de mídia, sem o conteúdo (mensagem antiga), também fica fora.
    const soTipo = doPortal({ texto: 'veja a foto' })
    soTipo.media_type = 'image'
    const c = cenario({ mensagens: [soTipo] })
    await inbound(c.ctx(corpoCru({ texto: 'veja a foto', id: 'WA_IMG' })))
    ok('linha com só o tipo de mídia: NÃO casa', c.estado.patches.length === 0, c.estado.patches)
  }

  // ── a recusa da ação diz a frase CERTA para cada caso ───────────────────
  // Antes era uma frase só, que mandava esperar — e para anexo a espera nunca
  // termina, e para mensagem do cliente não há o que esperar.
  {
    const base = {
      id: 'm1', conversation_id: CONV, message_id: 'local_1', from_me: true,
      body: 'oi', timestamp: new Date().toISOString(), reacoes: [],
    }
    const pedir = async (msg, acao = 'reagir') => {
      const c = cenario({ mensagens: [] })
      c.models.WhatsAppMessage.findById = async () => ({ ...msg })
      c.models.WhatsAppMessage.findMany = async () => [{ ...msg }]
      const ctx = c.ctx(corpoCru())
      ctx.params = { id: msg.id }
      ctx.body = { acao, emoji: '👍' }
      ctx.user = { id: 'u1' }
      ctx.models.Profile = { findById: async () => ({ id: 'u1', role: 'admin' }), findMany: async () => [] }
      const r = await acaoNaMensagem(ctx)
      return String((r.body && r.body.error) || '')
    }

    const recente = await pedir({ ...base })
    ok('texto recém-enviado: manda esperar alguns segundos', /alguns segundos/.test(recente), recente)

    const comArquivo = await pedir({ ...base, media_type: 'document', media_data: 'data:application/pdf;base64,AA' })
    ok('com arquivo: diz que não aceita, sem mandar esperar',
      /arquivo/.test(comArquivo) && !/alguns segundos/.test(comArquivo), comArquivo)

    const velha = await pedir({ ...base, timestamp: new Date(Date.now() - 10 * 60000).toISOString() })
    ok('texto antigo sem confirmação: não manda esperar',
      !/alguns segundos/.test(velha) && /n(ã|a)o foi confirmada/.test(velha), velha)

    const doCliente = await pedir({ ...base, from_me: false, message_id: 'in_1' })
    ok('mensagem do cliente: diz que recebidas não têm identificador',
      /recebidas/.test(doCliente) && !/alguns segundos/.test(doCliente), doCliente)
  }

  // ── os quatro casos da terceira revisão ──────────────────────────────────
  //
  // A revisão independente provou que as dezesseis afirmações de "eco de mídia
  // não casa" passavam pela LISTA DE PERMISSÃO, não pela varredura que elas
  // diziam exercitar: nenhuma distinguia uma da outra. Estes quatro casos
  // separam as duas travas e cobrem o que a revisão achou.

  // (1) Resposta de TEXTO que CITA um anexo do cliente — a resposta mais comum
  //     do suporte. A varredura descia na mensagem citada e respondia "tem
  //     mídia", então esta resposta nunca casava e duplicava para sempre.
  {
    const texto = 'pode mandar o print de novo?'
    const c = cenario({ mensagens: [doPortal({ texto })] })
    await inbound(c.ctx(corpoComMensagem({
      extendedTextMessage: {
        text: texto,
        contextInfo: { stanzaId: 'wa_citada', quotedMessage: { imageMessage: imagem('print do erro') } },
      },
    }, 'WA_CITANDO')))
    ok('texto citando anexo do cliente: CASA', c.estado.patches.length === 1, c.estado.patches)
    ok('  e não vira segunda mensagem', c.estado.criadas.length === 0, c.estado.criadas)
    ok('  a bolha recebe o identificador do WhatsApp',
      c.estado.patches[0] && c.estado.patches[0].message_id === 'WA_CITANDO', c.estado.patches[0])
  }

  // (2) Reentrega do webhook depois de a mesma resposta ter saído duas vezes:
  //     a linha de origem já não é candidata, e a SEGUNDA linha ficaria sozinha
  //     recebendo o identificador da primeira — duas bolhas apontando para a
  //     mesma mensagem no aparelho do cliente.
  {
    const c = cenario({ mensagens: [
      doPortal({ texto: 'oi', id: 'wam_a', messageId: 'WA_REENTREGA' }),
      doPortal({ texto: 'oi', id: 'wam_b' }),
    ] })
    await inbound(c.ctx(corpoCru({ texto: 'oi', id: 'WA_REENTREGA' })))
    ok('identificador já na conversa: NÃO casa', c.estado.patches.length === 0, c.estado.patches)
    ok('  grava como a rota fazia antes', c.estado.criadas.length === 1, c.estado.criadas)
    const comOId = c.estado.mensagens.filter((m) => m.message_id === 'WA_REENTREGA')
    ok('  nenhuma linha ANTIGA passa a repetir o identificador',
      comOId.filter((m) => m.id === 'wam_a' || m.id === 'wam_b').length === 1, comOId.map((m) => m.id))
  }

  // (3) Nome herdado de Object.prototype. `{conversation:1}["valueOf"]` devolve
  //     a função herdada, que é verdadeira: com `!` no lugar de `!== 1`, um
  //     campo chamado `valueOf` passava por texto puro.
  {
    const c = cenario({ mensagens: [doPortal({ texto: 'oi' })] })
    await inbound(c.ctx(corpoComMensagem({ conversation: 'oi', valueOf: { algo: 1 } }, 'WA_PROTO')))
    ok('campo com nome herdado de Object.prototype: NÃO casa', c.estado.patches.length === 0, c.estado.patches)
    ok('  e a mensagem não se perde', c.estado.criadas.length === 1, c.estado.criadas)
  }

  // (4) O único caso em que a VARREDURA decide sozinha: mídia pendurada numa
  //     chave que a lista de permissão aceita. Sem a varredura, isto casaria.
  {
    const c = cenario({ mensagens: [doPortal({ texto: 'oi' })] })
    await inbound(c.ctx(corpoComMensagem({
      conversation: 'oi',
      messageContextInfo: { imageMessage: imagem('escondida') },
    }, 'WA_ESCONDIDA')))
    ok('mídia dentro de chave permitida: NÃO casa (a varredura pega)',
      c.estado.patches.length === 0, c.estado.patches)
    ok('  e a mensagem não se perde', c.estado.criadas.length === 1, c.estado.criadas)
  }

  fim()
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(1) })
