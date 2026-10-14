// O cliente vê quem está atendendo.
//
// A resposta enviada pelo portal sai com o nome de quem respondeu na primeira
// linha: `*Fulano — Suporte Arara*` e o texto abaixo. O composer já prometia
// isso ("sua resposta será assinada como…"), a bolha já tirava esse prefixo do
// corpo e a edição já o preservava — só o envio nunca o colocava, então o
// cliente recebia texto sem autor nenhum.
//
// O que cada caso aqui protege:
//  - a assinatura vai no TEXTO que chega ao provedor, não só num campo interno
//    (é o que o cliente lê, e é o que sobrevive ao eco do provedor);
//  - o corpo gravado é IGUAL ao texto enviado, senão o histórico do portal
//    deixa de ser o que o cliente recebeu;
//  - sem pessoa identificada, nada é inventado;
//  - o robô e o aviso de plantão NÃO são assinados;
//  - o prefixo que o servidor produz é exatamente o que a bolha sabe tirar —
//    o teste lê a expressão da própria tela para não haver duas verdades.
//
// Roda com: node assinatura-operador.test.js
const fs = require('fs')
const path = require('path')
const { carregarHandler, reply, ok, fim, ARQ } = require('./_carregar.js')

const enviar = carregarHandler('464 whatsapp POST /whatsapp')
const acao = carregarHandler('490i whatsapp POST /whatsapp/mensagem/:id/acao')

const CONV = {
  id: 'c1', remote_jid: '5511999990000@s.whatsapp.net', is_group: false,
  assigned_to_id: null, phase: 'novo', first_response_at: null,
}
const PERFIL = { id: 'u1', role: 'support', full_name: 'Judá Mendes', active: true }

/** Guarda o que foi pedido ao provedor e o que foi gravado. */
function cenario({ perfil = PERFIL, comSessao = false, assinatura = undefined, conv = CONV } = {}) {
  const enviadas = []
  const gravadas = []
  const ctx = {
    params: {}, query: {}, headers: comSessao ? { 'x-portal-sessao': 'abc.def' } : {},
    body: {},
    user: comSessao ? {} : { id: 'u1' },
    secrets: { get: async () => 'token-falso' },
    fetch: async (url, opcoes) => {
      let corpo = {}
      try { corpo = JSON.parse(opcoes.body) } catch { corpo = {} }
      enviadas.push({ url: String(url), corpo })
      return { status: 200, body: '{"ok":true}' }
    },
    models: {
      WhatsAppConversation: {
        findById: async () => ({ ...conv }),
        findMany: async () => [{ ...conv }],
        update: async () => ({ ...conv }),
      },
      WhatsAppMessage: {
        findById: async () => null,
        findMany: async () => [],
        create: async (r) => { gravadas.push(r); return { ...r } },
        update: async (id, p) => { gravadas.push({ id, ...p }); return p },
      },
      Profile: { findById: async () => perfil, findMany: async () => (perfil ? [perfil] : []) },
      Sessao: {
        findById: async () => (comSessao
          ? { id: 'ses_abc', verificador: 'def', user_id: 'u1', revogada: false, expira_em: null }
          : null),
      },
      SystemSettings: {
        findMany: async () => [assinatura === undefined ? {} : { id: 's1', waAssinaturaOperador: assinatura }],
        update: async () => ({}),
      },
      WaTags: { findMany: async () => [] },
      WaConversationTag: { findMany: async () => [] },
    },
    reply: reply(),
  }
  return { ctx, enviadas, gravadas }
}

const textoEnviado = (enviadas) => {
  const t = enviadas.find((e) => /sendMessage(Group)?$/.test(e.url))
  return t ? String(t.corpo.message || '') : null
}
const corpoGravado = (gravadas) => {
  const g = gravadas.find((x) => x.from_me === true)
  return g ? String(g.body || '') : null
}

// A expressão que a BOLHA usa para tirar o autor do corpo, lida da própria
// tela: se o formato do servidor e o da tela divergirem, este teste reprova em
// vez de deixar o asterisco aparecer cru para quem atende.
function regexDaBolha() {
  const arq = path.resolve(__dirname, '../../app/_components/inbox/message-list.tsx')
  const src = fs.readFileSync(arq, 'utf8')
  const m = /const AUTHOR_PREFIX_RE = (\/.+\/)\n/.exec(src)
  if (!m) throw new Error('não achei AUTHOR_PREFIX_RE em message-list.tsx')
  const corpo = /^\/(.*)\/([a-z]*)$/.exec(m[1])
  return new RegExp(corpo[1], corpo[2])
}

;(async () => {
  // ── a resposta sai assinada ──────────────────────────────────────────────
  {
    const { ctx, enviadas, gravadas } = cenario()
    ctx.body = { conversationId: 'c1', message: 'Bom dia! Já estou vendo seu chamado.' }
    const r = await enviar(ctx)
    ok('envio responde sem erro', r.status === 201 || r.status === 200, { status: r.status, body: r.body })
    const texto = textoEnviado(enviadas)
    ok('o provedor recebe a assinatura na primeira linha',
      texto === '*Judá — Suporte Arara*\nBom dia! Já estou vendo seu chamado.', texto)
    ok('  primeiro nome, como o composer promete', texto && texto.startsWith('*Judá —'), texto)
    ok('o corpo gravado é IGUAL ao texto enviado', corpoGravado(gravadas) === texto,
      { gravado: corpoGravado(gravadas), enviado: texto })
  }

  // ── o contrato com a bolha ───────────────────────────────────────────────
  {
    // A mensagem CONTÉM o nome do operador de propósito: é o que torna a
    // contagem significativa. Com um texto qualquer, "o texto despido não
    // contém o nome" seria zero contra zero e passaria com a bolha quebrada.
    const { ctx, enviadas } = cenario()
    ctx.body = { conversationId: 'c1', message: 'Judá aqui: já resolvi seu caso' }
    await enviar(ctx)
    const texto = textoEnviado(enviadas)
    ok('o texto inteiro traz o nome duas vezes (assinatura + corpo)',
      (texto.match(/Judá/g) || []).length === 2, texto)
    const re = regexDaBolha()
    const casou = re.exec(texto)
    ok('a bolha reconhece o prefixo que o servidor produz', !!casou, texto)
    ok('  e separa o autor', casou && casou[1].replace(/:$/, '') === 'Judá — Suporte Arara', casou && casou[1])
    ok('  deixando o texto sem o prefixo', casou && casou[2] === 'Judá aqui: já resolvi seu caso', casou && casou[2])
    ok('  então o corpo da bolha mostra o nome só onde o operador escreveu',
      (casou[2].match(/Judá/g) || []).length === 1, casou[2])
    ok('  e o cabeçalho da bolha mostra o autor uma vez', (String(casou[1]).match(/Judá/g) || []).length === 1, casou[1])
  }

  // ── identidade pela sessão do portal (token vencido) ─────────────────────
  {
    const { ctx, enviadas } = cenario({ comSessao: true })
    ctx.body = { conversationId: 'c1', message: 'oi' }
    await enviar(ctx)
    ok('com a identidade vindo da sessão, assina com o nome da pessoa',
      textoEnviado(enviadas) === '*Judá — Suporte Arara*\noi', textoEnviado(enviadas))
  }

  // ── sem pessoa identificada nada acontece ────────────────────────────────
  // A regra "não inventa nome" está garantida ANTES da assinatura: a guarda de
  // sessão recusa quem não tem perfil com nível, então o handler não chega a
  // rodar. A checagem de perfil no código da assinatura é cinto e suspensório.
  {
    const { ctx, enviadas, gravadas } = cenario({ perfil: null, comSessao: false })
    ctx.user = {}
    ctx.body = { conversationId: 'c1', message: 'oi' }
    const r = await enviar(ctx)
    ok('sem pessoa identificada a resposta é recusada', r.status === 401 || r.status === 403, { status: r.status, body: r.body })
    ok('  e nada é enviado ao provedor', enviadas.length === 0, enviadas)
    ok('  e nada é gravado', gravadas.length === 0, gravadas)
  }

  // ── o interruptor ────────────────────────────────────────────────────────
  {
    const { ctx, enviadas } = cenario({ assinatura: false })
    ctx.body = { conversationId: 'c1', message: 'oi' }
    await enviar(ctx)
    ok('interruptor desligado: sai sem assinatura', textoEnviado(enviadas) === 'oi', textoEnviado(enviadas))
  }
  {
    const { ctx, enviadas } = cenario({ assinatura: true })
    ctx.body = { conversationId: 'c1', message: 'oi' }
    await enviar(ctx)
    ok('interruptor ligado: sai assinada', textoEnviado(enviadas) === '*Judá — Suporte Arara*\noi', textoEnviado(enviadas))
  }
  {
    const { ctx, enviadas } = cenario({ assinatura: undefined })
    ctx.body = { conversationId: 'c1', message: 'oi' }
    await enviar(ctx)
    ok('sem configuração nenhuma, o padrão é assinar', textoEnviado(enviadas) === '*Judá — Suporte Arara*\noi', textoEnviado(enviadas))
  }

  // ── grupo usa a mesma regra ──────────────────────────────────────────────
  {
    const grupo = { ...CONV, id: 'g1', remote_jid: '123456@g.us', is_group: true }
    const { ctx, enviadas } = cenario({ conv: grupo })
    ctx.body = { conversationId: 'g1', message: 'recado' }
    await enviar(ctx)
    const t = enviadas.find((e) => /sendMessageGroup$/.test(e.url))
    ok('em grupo a mensagem também sai assinada',
      t && String(t.corpo.message) === '*Judá — Suporte Arara*\nrecado', t && t.corpo.message)
  }

  // ── o robô e o aviso de plantão não são assinados ────────────────────────
  // A assinatura tem de existir SÓ nas rotas em que uma pessoa aperta enviar.
  // Se aparecer num caminho que fala sozinho com o cliente — o motor do fluxo,
  // o aviso de plantão —, alguém a copiou para onde não há operador nenhum.
  {
    const gerado = fs.readFileSync(ARQ, 'utf8')
    const codigoDaRota = (marca) => {
      const at = gerado.indexOf('  // ' + marca)
      if (at < 0) throw new Error('rota não encontrada: ' + marca)
      const ini = gerado.indexOf('\n    handler: compileController("', at)
      const fimLinha = gerado.indexOf('\n', ini + 1)
      const m = /^    handler: compileController\(("(?:[^"\\]|\\.)*")\),$/.exec(gerado.slice(ini + 1, fimLinha))
      return JSON.parse(m[1])
    }
    // Só a AUSÊNCIA é afirmada por leitura do código: a presença está provada
    // pelos casos de comportamento acima, porque um comentário citando o
    // formato passaria por um grep sem o código fazer nada.
    const SEM = [
      '485 whatsapp POST /whatsapp/inbound (',
      '490k whatsapp POST /whatsapp/flows/:id/simular (',
      '490m whatsapp POST /whatsapp/plantao/varrer (',
      '490l whatsapp POST /whatsapp/:id/backup (',
    ]
    // O travessão faz parte do formato. Sem ele o padrão casaria com
    // "Portal Suporte Arara Tech", que é cabeçalho de outra coisa no inbound.
    const ASSINATURA = /— Suporte Arara/
    for (const marca of SEM) {
      ok(`${marca.split(' ')[0]} NÃO menciona a assinatura`, !ASSINATURA.test(codigoDaRota(marca)), marca)
    }
  }

  // ── editar mantém a assinatura, inclusive para o cliente ─────────────────
  {
    const msgAntiga = {
      id: 'wam1', conversation_id: 'c1', message_id: 'wa123', from_me: true,
      body: '*Judá — Suporte Arara*\ntexto velho', timestamp: new Date().toISOString(), reacoes: [],
    }
    const { ctx, enviadas, gravadas } = cenario()
    ctx.models.WhatsAppMessage.findById = async () => ({ ...msgAntiga })
    ctx.models.WhatsAppMessage.findMany = async () => [{ ...msgAntiga }]
    ctx.params = { id: 'wam1' }
    ctx.body = { acao: 'editar', message: 'texto novo' }
    const r = await acao(ctx)
    ok('editar responde sem erro', r.status === 200 || r.status === undefined, { status: r.status, body: r.body })
    const edit = enviadas.find((e) => /editMessage$/.test(e.url))
    ok('o cliente recebe o texto editado COM a assinatura',
      edit && String(edit.corpo.message) === '*Judá — Suporte Arara*\ntexto novo', edit && edit.corpo.message)
    const gravado = gravadas.find((g) => g.body)
    ok('  e o corpo gravado é o mesmo texto', gravado && gravado.body === '*Judá — Suporte Arara*\ntexto novo', gravado)
  }

  // ── anexo: a legenda é assinada, o rótulo interno não ───────────────────
  {
    const { ctx, enviadas, gravadas } = cenario()
    ctx.body = {
      conversationId: 'c1',
      anexo: { nome: 'boleto.pdf', dados: 'data:application/pdf;base64,JVBERi0xLjQK' },
    }
    await enviar(ctx)
    ok('anexo sem legenda: nada de texto é enviado',
      !enviadas.some((e) => /sendMessage$/.test(e.url)), enviadas.map((e) => e.url))
    ok('  e o rótulo interno do anexo NÃO é assinado',
      corpoGravado(gravadas) === '[documento enviado]', corpoGravado(gravadas))
  }
  {
    const { ctx, enviadas } = cenario()
    ctx.body = {
      conversationId: 'c1', message: 'segue o boleto',
      anexo: { nome: 'boleto.pdf', dados: 'data:application/pdf;base64,JVBERi0xLjQK' },
    }
    await enviar(ctx)
    ok('anexo com legenda: a legenda sai assinada',
      textoEnviado(enviadas) === '*Judá — Suporte Arara*\nsegue o boleto', textoEnviado(enviadas))
  }

  // ── sem nome no cadastro: não assina, e NUNCA com o e-mail ──────────────
  {
    const { ctx, enviadas, gravadas } = cenario({
      perfil: { id: 'u1', role: 'support', email: 'leonardo.carrion@arara-tech.com', active: true },
    })
    ctx.body = { conversationId: 'c1', message: 'segue' }
    await enviar(ctx)
    const texto = textoEnviado(enviadas)
    ok('cadastro sem nome: sai SEM assinatura', texto === 'segue', texto)
    ok('  e o e-mail interno NÃO vai para o cliente', !/arara-tech\.com/.test(String(texto)), texto)
    ok('  o campo interno do portal ainda guarda quem respondeu',
      gravadas.some((g) => g.sender_name === 'leonardo.carrion@arara-tech.com'), gravadas.map((g) => g.sender_name))
  }

  // ── nome com asterisco não quebra o negrito do cliente ──────────────────
  {
    const { ctx, enviadas } = cenario({
      perfil: { id: 'u1', role: 'support', full_name: '*Judá* Mendes', active: true },
    })
    ctx.body = { conversationId: 'c1', message: 'oi' }
    await enviar(ctx)
    ok('asterisco no nome é limpo antes de assinar',
      textoEnviado(enviadas) === '*Judá — Suporte Arara*\noi', textoEnviado(enviadas))
  }

  // ── o limite também no ENVIO, não só na edição ──────────────────────────
  {
    const prefixo = '*Judá — Suporte Arara*\n'
    {
      const { ctx, enviadas } = cenario()
      ctx.body = { conversationId: 'c1', message: 'a'.repeat(4096 - prefixo.length) }
      await enviar(ctx)
      ok('envio que cabe com a assinatura sai',
        String(textoEnviado(enviadas)).length === 4096, String(textoEnviado(enviadas)).length)
    }
    {
      const { ctx, enviadas, gravadas } = cenario()
      ctx.body = { conversationId: 'c1', message: 'a'.repeat(4096 - prefixo.length + 1) }
      const r = await enviar(ctx)
      ok('envio que passa do limite com a assinatura é recusado', r.status === 400, { status: r.status, body: r.body })
      ok('  e nada é gravado nem enviado', gravadas.length === 0 && enviadas.length === 0,
        { gravadas: gravadas.length, enviadas: enviadas.length })
    }
  }

  // ── a citação não repete o nome ─────────────────────────────────────────
  {
    const nossa = {
      id: 'wam9', conversation_id: 'c1', message_id: 'wa999', from_me: true,
      sender_name: 'Judá Mendes', body: '*Judá — Suporte Arara*\nJá resolvi seu caso',
      timestamp: new Date().toISOString(),
    }
    const { ctx, gravadas } = cenario()
    ctx.models.WhatsAppMessage.findMany = async () => [nossa]
    ctx.body = { conversationId: 'c1', message: 'alguma dúvida?', responder_a: { message_id: 'wa999' } }
    await enviar(ctx)
    const comCitacao = gravadas.find((g) => g.citacao)
    ok('a citação guarda o trecho SEM a assinatura',
      comCitacao && comCitacao.citacao.corpo === 'Já resolvi seu caso', comCitacao && comCitacao.citacao)
    ok('  e o autor da citação continua vindo do campo próprio',
      comCitacao && comCitacao.citacao.autor === 'Judá Mendes', comCitacao && comCitacao.citacao)
  }

  // ── a precedência da identidade: token ganha da sessão ──────────────────
  // Com as duas identidades presentes e DIFERENTES, assina quem o token diz —
  // é quem as guardas da rota autorizaram.
  {
    const perfis = {
      u1: { id: 'u1', role: 'support', full_name: 'Judá Mendes', active: true },
      u2: { id: 'u2', role: 'support', full_name: 'Outra Pessoa', active: true },
    }
    const { ctx, enviadas } = cenario()
    ctx.user = { id: 'u1' }
    ctx.headers = { 'x-portal-sessao': 'abc.def' }
    ctx.models.Profile.findById = async (id) => perfis[id] || null
    ctx.models.Sessao.findById = async () => ({ id: 'ses_abc', verificador: 'def', user_id: 'u2', revogada: false, expira_em: null })
    ctx.body = { conversationId: 'c1', message: 'oi' }
    await enviar(ctx)
    ok('com token e sessão de pessoas diferentes, assina quem está no token',
      textoEnviado(enviadas) === '*Judá — Suporte Arara*\noi', textoEnviado(enviadas))
  }

  // ── o limite de tamanho vale para o texto que SAI ───────────────────────
  {
    const msgAntiga = {
      id: 'wam1', conversation_id: 'c1', message_id: 'wa123', from_me: true,
      body: '*Judá — Suporte Arara*\ntexto velho', timestamp: new Date().toISOString(), reacoes: [],
    }
    const prefixo = '*Judá — Suporte Arara*\n'
    // Exatamente no limite CONTANDO a assinatura: passa.
    {
      const { ctx, enviadas } = cenario()
      ctx.models.WhatsAppMessage.findById = async () => ({ ...msgAntiga })
      ctx.models.WhatsAppMessage.findMany = async () => [{ ...msgAntiga }]
      ctx.params = { id: 'wam1' }
      ctx.body = { acao: 'editar', message: 'a'.repeat(4096 - prefixo.length) }
      const r = await acao(ctx)
      const edit = enviadas.find((e) => /editMessage$/.test(e.url))
      ok('edição que cabe com a assinatura é aceita', !!edit && String(edit.corpo.message).length === 4096,
        { status: r.status, tamanho: edit && String(edit.corpo.message).length })
    }
    // Um caractere além: recusa ANTES de falar com o provedor.
    {
      const { ctx, enviadas } = cenario()
      ctx.models.WhatsAppMessage.findById = async () => ({ ...msgAntiga })
      ctx.models.WhatsAppMessage.findMany = async () => [{ ...msgAntiga }]
      ctx.params = { id: 'wam1' }
      ctx.body = { acao: 'editar', message: 'a'.repeat(4096 - prefixo.length + 1) }
      const r = await acao(ctx)
      ok('edição que passa do limite com a assinatura é recusada', r.status === 400, { status: r.status, body: r.body })
      ok('  e o provedor não é chamado', !enviadas.some((e) => /editMessage$/.test(e.url)), enviadas.map((e) => e.url))
    }
  }

  fim()
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(1) })
