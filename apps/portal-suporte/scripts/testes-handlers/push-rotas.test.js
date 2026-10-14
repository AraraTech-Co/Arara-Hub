// Fase 4 — as rotas de Web Push e o enfileiramento.
//
// NADA é enviado aqui: o envio não acontece em handler nenhum (assinar VAPID
// vive na biblioteca `web-push`, que handler não pode importar). O handler só
// ENFILEIRA; o tick do relógio envia, e o teste do tick é push-envio.test.js.
//
// Roda com: node push-rotas.test.js
const { carregarHandler, reply, ok, fim } = require('./_carregar.js')

const chave = carregarHandler('490p1 push GET /push/chave-publica')
const inscrever = carregarHandler('490p2 push POST /push/inscrever')
const desinscrever = carregarHandler('490p3 push DELETE /push/inscrever')
const lerPrefs = carregarHandler('490p4 push GET /push/preferencias')
const salvarPrefs = carregarHandler('490p5 push PUT /push/preferencias')

const EU = 'u-ana'

function cenario({ segredos = { push_vapid_public: 'BPublica' }, inscricoes = [], prefs = [], semModels = false } = {}) {
  const estado = { inscricoes: [...inscricoes], prefs: [...prefs], fila: [] }
  const models = {
    Profile: { findById: async () => ({ id: EU, role: 'support' }) },
    Sessao: { findById: async () => null },
  }
  if (!semModels) {
    models.PushInscricao = {
      findMany: async (f) => {
        const ch = Object.keys(f || {})
        if (!ch.length) return estado.inscricoes
        return estado.inscricoes.filter((x) => ch.every((k) => String(x[k] ?? '') === String(f[k])))
      },
      create: async (x) => { estado.inscricoes.push(x); return x },
      update: async (id, p) => { const x = estado.inscricoes.find((y) => y.id === id); if (x) Object.assign(x, p); return x },
      delete: async (id) => { estado.inscricoes = estado.inscricoes.filter((y) => y.id !== id) },
    }
    models.PushPreferencia = {
      findMany: async (f) => {
        const ch = Object.keys(f || {})
        if (!ch.length) return estado.prefs
        return estado.prefs.filter((x) => ch.every((k) => String(x[k] ?? '') === String(f[k])))
      },
      create: async (x) => { estado.prefs.push(x); return x },
      update: async (id, p) => { const x = estado.prefs.find((y) => y.id === id); if (x) Object.assign(x, p); return x },
    }
    models.PushNaFila = { create: async (x) => { estado.fila.push(x); return x } }
  }
  return {
    estado,
    ctx: (extra = {}) => Object.assign({
      params: {}, query: {}, body: {}, headers: {},
      user: { id: EU },
      models,
      secrets: { get: async (n) => segredos[n] ?? null },
      reply: reply(),
    }, extra),
  }
}

;(async () => {
  // ══ chave pública ══════════════════════════════════════════════════════
  let c = cenario()
  let r = await chave(c.ctx())
  ok('chave pública: ligado com a chave', r.body?.data?.ligado === true && r.body.data.chave === 'BPublica', r.body?.data)

  c = cenario({ segredos: {} })
  r = await chave(c.ctx())
  ok('sem chave no cofre: ligado=false, sem erro',
    r.status === 200 && r.body?.data?.ligado === false, { status: r.status, data: r.body?.data })

  c = cenario()
  r = await chave(c.ctx({ user: null }))
  ok('chave pública exige sessão: 401', r.status === 401, r.status)

  // ══ inscrever ══════════════════════════════════════════════════════════
  const ASSINATURA = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
    keys: { p256dh: 'p256-xyz', auth: 'auth-xyz' },
    ua: 'Chrome/140',
  }
  c = cenario()
  r = await inscrever(c.ctx({ body: ASSINATURA }))
  ok('inscrever: guarda a assinatura', r.body?.data?.nova === true && c.estado.inscricoes.length === 1, r.body?.data)
  ok('  com o dono certo', c.estado.inscricoes[0].user_id === EU, c.estado.inscricoes[0].user_id)

  // O MESMO endpoint reinscrito substitui: senão a pessoa recebe duas vezes.
  r = await inscrever(c.ctx({ body: ASSINATURA }))
  ok('reinscrever o mesmo endpoint não duplica',
    r.body?.data?.nova === false && c.estado.inscricoes.length === 1, c.estado.inscricoes.length)

  c = cenario()
  r = await inscrever(c.ctx({ body: { endpoint: 'http://nao-https/x', keys: ASSINATURA.keys } }))
  ok('endpoint que não é https: 400', r.status === 400, r.status)
  c = cenario()
  r = await inscrever(c.ctx({ body: { endpoint: ASSINATURA.endpoint } }))
  ok('sem as chaves do navegador: 400', r.status === 400, r.status)
  c = cenario()
  r = await inscrever(c.ctx({ body: ASSINATURA, user: null }))
  ok('inscrever exige sessão: 401', r.status === 401, r.status)
  c = cenario({ semModels: true })
  r = await inscrever(c.ctx({ body: ASSINATURA }))
  ok('sem o schema da Fase 4: 503 com motivo', r.status === 503, r.status)

  // ══ desinscrever ═══════════════════════════════════════════════════════
  c = cenario({ inscricoes: [
    { id: 'i1', user_id: EU, endpoint: 'https://fcm.googleapis.com/fcm/send/1' },
    { id: 'i2', user_id: EU, endpoint: 'https://fcm.googleapis.com/fcm/send/2' },
    { id: 'i3', user_id: 'outra-pessoa', endpoint: 'https://fcm.googleapis.com/fcm/send/3' },
  ] })
  r = await desinscrever(c.ctx({ body: { endpoint: 'https://fcm.googleapis.com/fcm/send/1' } }))
  ok('desinscrever um endpoint: apaga só ele', r.body?.data?.apagadas === 1
    && c.estado.inscricoes.map((x) => x.id).join(',') === 'i2,i3', c.estado.inscricoes.map((x) => x.id))

  r = await desinscrever(c.ctx())
  ok('sem endpoint: apaga todas as MINHAS', r.body?.data?.apagadas === 1
    && c.estado.inscricoes.map((x) => x.id).join(',') === 'i3', c.estado.inscricoes.map((x) => x.id))
  ok('  e nunca a de outra pessoa', c.estado.inscricoes.some((x) => x.id === 'i3'), c.estado.inscricoes)

  // ══ preferências ═══════════════════════════════════════════════════════
  c = cenario()
  r = await lerPrefs(c.ctx())
  ok('sem linha gravada: tudo ligado (quem se inscreve quer receber)',
    r.body?.data?.fila === true && r.body.data.minha_conversa === true && r.body.data.chamado_atribuido === true,
    r.body?.data)

  c = cenario()
  r = await salvarPrefs(c.ctx({ body: { fila: false, minha_conversa: true, chamado_atribuido: false } }))
  ok('salvar: grava o que veio', r.body?.data?.fila === false && r.body.data.minha_conversa === true, r.body?.data)
  ok('  criando a linha', c.estado.prefs.length === 1, c.estado.prefs.length)
  r = await lerPrefs(c.ctx())
  ok('  e a leitura seguinte devolve o gravado',
    r.body?.data?.fila === false && r.body.data.chamado_atribuido === false, r.body?.data)

  r = await salvarPrefs(c.ctx({ body: { fila: true, minha_conversa: true, chamado_atribuido: true } }))
  ok('salvar de novo ATUALIZA em vez de duplicar', c.estado.prefs.length === 1, c.estado.prefs.length)

  c = cenario()
  r = await salvarPrefs(c.ctx({ body: {}, user: null }))
  ok('salvar exige sessão: 401', r.status === 401, r.status)

  // ══ o ENFILEIRAMENTO, nos pontos que alimentam o sino ══════════════════
  // Três portas: sem o model não faz nada; sem inscrição não enfileira (não
  // adianta); preferência desligada não enfileira. "Tudo desligado" é o mesmo
  // que não estar inscrito.
  const { carregarContexto } = require('./_carregar.js')
  const dentro = carregarContexto('490p2 push POST /push/inscrever')
  // O helper vive nos handlers que notificam; pego o do inbound.
  const inbound = carregarContexto('485 whatsapp POST /whatsapp/inbound')
  const enfileirar = inbound._enfileirarPush
  ok('o helper de enfileirar existe no inbound', typeof enfileirar === 'function', typeof enfileirar)

  function ctxFila({ inscricoes = [{ id: 'i1', user_id: EU }], prefs = [], semFila = false } = {}) {
    const estado = { fila: [] }
    const models = {
      PushInscricao: { findMany: async (f) => inscricoes.filter((x) => String(x.user_id) === String(f.user_id)) },
      PushPreferencia: { findMany: async (f) => prefs.filter((x) => String(x.user_id) === String(f.user_id)) },
    }
    if (!semFila) models.PushNaFila = { create: async (x) => { estado.fila.push(x); return x } }
    return { estado, ctx: { models } }
  }

  let f = ctxFila()
  await enfileirar(f.ctx, EU, 'minha_conversa', 'Título', 'Corpo', '/inbox?c=1')
  ok('com inscrição e sem preferência gravada: enfileira', f.estado.fila.length === 1, f.estado.fila.length)
  ok('  com status pendente e o tipo', f.estado.fila[0]?.status === 'pendente'
    && f.estado.fila[0]?.tipo === 'minha_conversa', f.estado.fila[0])

  f = ctxFila({ inscricoes: [] })
  await enfileirar(f.ctx, EU, 'minha_conversa', 'T', 'C', '/x')
  ok('sem inscrição: NÃO enfileira', f.estado.fila.length === 0, f.estado.fila.length)

  f = ctxFila({ prefs: [{ id: 'p1', user_id: EU, minha_conversa: false }] })
  await enfileirar(f.ctx, EU, 'minha_conversa', 'T', 'C', '/x')
  ok('preferência daquele tipo desligada: NÃO enfileira', f.estado.fila.length === 0, f.estado.fila.length)

  f = ctxFila({ prefs: [{ id: 'p1', user_id: EU, minha_conversa: false }] })
  await enfileirar(f.ctx, EU, 'fila', 'T', 'C', '/x')
  ok('  mas outro tipo continua valendo', f.estado.fila.length === 1, f.estado.fila.length)

  f = ctxFila({ semFila: true })
  await enfileirar(f.ctx, EU, 'fila', 'T', 'C', '/x')
  ok('sem o schema da Fase 4: não estoura e não enfileira', f.estado.fila.length === 0, f.estado.fila.length)

  f = ctxFila()
  await enfileirar(f.ctx, null, 'fila', 'T', 'C', '/x')
  ok('sem destinatário: não enfileira', f.estado.fila.length === 0, f.estado.fila.length)

  // ══ revisão: host de push conhecido ═══════════════════════════════════
  // Sem esta lista, o endpoint é uma URL arbitrária que o RELÓGIO passaria a
  // chamar com POST a cada tick — um atendente poderia apontá-lo para onde
  // quisesse.
  for (const [url, vale] of [
    ['https://fcm.googleapis.com/fcm/send/abc', true],
    ['https://web.push.apple.com/QWERTY', true],
    ['https://updates.push.services.mozilla.com/wpush/v2/xyz', true],
    ['https://br.notify.windows.com/w/?token=x', true],
    ['https://meu-servidor-qualquer.com/webhook', false],
    ['https://localhost:9999/x', false],
  ]) {
    c = cenario()
    r = await inscrever(c.ctx({ body: { endpoint: url, keys: ASSINATURA.keys } }))
    ok(`${vale ? 'aceita' : 'recusa'} ${url.replace(/^https:\/\//, '').slice(0, 34)}`,
      vale ? r.status === 200 : r.status === 400, { status: r.status, erro: r.body?.error })
  }

  // ══ revisão: reinscrição não rouba a inscrição de outra pessoa ═════════
  // Acontece de verdade quando duas pessoas usam o mesmo navegador: antes, o
  // `update` trocava o `user_id` e os avisos da primeira passavam a sair para
  // a segunda.
  c = cenario({ inscricoes: [{ id: 'da-outra', user_id: 'outra-pessoa', endpoint: ASSINATURA.endpoint, p256dh: 'p', auth: 'a' }] })
  r = await inscrever(c.ctx({ body: ASSINATURA }))
  ok('endpoint de OUTRA pessoa: a inscrição dela sai e entra a minha',
    r.status === 200 && r.body?.data?.nova === true, { status: r.status, data: r.body?.data })
  ok('  sem sobrar inscrição com o dono trocado',
    c.estado.inscricoes.length === 1 && c.estado.inscricoes[0].user_id === EU,
    c.estado.inscricoes.map((i) => ({ id: i.id, dono: i.user_id })))

  // Mesmo dono reinscrevendo: atualiza, não duplica, e não muda o dono.
  c = cenario({ inscricoes: [{ id: 'minha', user_id: EU, endpoint: ASSINATURA.endpoint, p256dh: 'velho', auth: 'velho' }] })
  r = await inscrever(c.ctx({ body: ASSINATURA }))
  ok('mesmo dono: atualiza as chaves sem duplicar',
    r.body?.data?.nova === false && c.estado.inscricoes.length === 1
      && c.estado.inscricoes[0].p256dh === ASSINATURA.keys.p256dh,
    c.estado.inscricoes[0])

  // ══ revisão: os TRÊS eventos existem de verdade ═══════════════════════
  // A primeira versão enfileirava só "chamado_atribuido" e um caso de
  // rodízio: o tipo "fila" não era enfileirado em lugar nenhum, e mensagem de
  // cliente em conversa COM dono — o caso mais comum — não avisava ninguém,
  // porque o `return` do "bot cala a boca" vinha antes.
  const _triagem = carregarContexto('485 whatsapp POST /whatsapp/inbound')._triagem
  function cenarioInbound({ conversa, inscritos = [{ id: 'i1', user_id: 'u-dono' }] }) {
    const estado = { fila: [], enviadas: [] }
    return {
      estado,
      ctx: {
        body: { from_me: false },
        models: {
          WhatsAppConversation: {
            findById: async () => conversa, findMany: async () => [conversa],
            update: async (id, p) => { Object.assign(conversa, p); return conversa },
          },
          WhatsAppMessage: { findMany: async () => [], create: async () => ({}) },
          SystemSettings: { findMany: async () => [{ waMenuEnabled: true }] },
          Profile: { findMany: async () => [], findById: async () => null },
          SupportSchedule: { findMany: async () => [] },
          WaConversationEvents: { findMany: async () => [], create: async () => ({}) },
          WaFlows: { findMany: async () => [] },
          PushInscricao: { findMany: async (f) => (f && f.user_id ? inscritos.filter((i) => i.user_id === f.user_id) : inscritos) },
          PushPreferencia: { findMany: async () => [] },
          PushNaFila: { create: async (x) => { estado.fila.push(x); return x } },
          Sessao: { findById: async () => null },
        },
        secrets: { get: async () => 'tok' },
        fetch: async (u, o) => { estado.enviadas.push(o && o.body); return { status: 200, body: '{}' } },
      },
    }
  }

  // minha_conversa: cliente escreve numa conversa que TEM dono
  let ci = cenarioInbound({
    conversa: { id: 'c1', remote_jid: '5519999990001', status: 'open', phase: 'em_atendimento', assigned_to_id: 'u-dono', contact_name: 'Cliente' },
  })
  await _triagem(ci.ctx, ci.ctx.models.WhatsAppConversation.findById ? await ci.ctx.models.WhatsAppConversation.findById() : null, 'preciso de ajuda')
  ok('mensagem de cliente em conversa COM dono avisa o dono',
    ci.estado.fila.length === 1 && ci.estado.fila[0].tipo === 'minha_conversa'
      && ci.estado.fila[0].user_id === 'u-dono',
    ci.estado.fila[0])
  ok('  com o texto do cliente no corpo',
    String(ci.estado.fila[0]?.corpo || '').includes('preciso de ajuda'), ci.estado.fila[0]?.corpo)

  // e a mensagem NOSSA não avisa ninguém
  ci = cenarioInbound({
    conversa: { id: 'c1', remote_jid: '5519999990001', status: 'open', phase: 'em_atendimento', assigned_to_id: 'u-dono' },
  })
  ci.ctx.body = { from_me: true }
  await _triagem(ci.ctx, { id: 'c1', remote_jid: '5519999990001', status: 'open', phase: 'em_atendimento', assigned_to_id: 'u-dono' }, 'resposta nossa')
  ok('  e a mensagem NOSSA não avisa', ci.estado.fila.length === 0, ci.estado.fila)

  fim()
})()
