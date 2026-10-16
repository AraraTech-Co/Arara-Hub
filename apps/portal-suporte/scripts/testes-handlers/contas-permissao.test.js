// Fase 3c — a trava por conta, no SERVIDOR.
//
// A tela esconde a aba; aqui é a verdade. Quem abre a conversa de outra conta
// por URL direta leva 403, mesmo tendo nível de atendimento.
//
// E tem um caso que NÃO é sobre comportamento: a conferência de que toda rota
// que busca conversa por id recebeu a trava. É teste porque, se ficar como
// passo manual, a próxima rota nasce sem ela e nada acusa.
//
// Roda com: node contas-permissao.test.js
const fs = require('node:fs')
const path = require('node:path')
const { carregarHandler, reply, ok, fim } = require('./_carregar.js')

const ARQ = path.resolve(__dirname, '../../../../packages/api/src/apps/portal-suporte/routes.generated.ts')

const ATENDENTE = { id: 'u-ana', role: 'support', full_name: 'Ana', feature_grants: [] }
const COM_GRANT = { id: 'u-bia', role: 'support', full_name: 'Bia', feature_grants: ['wa_conta_vendas'] }
const CHEFE = { id: 'u-chefe', role: 'admin', full_name: 'Chefe', feature_grants: [] }

function cenario(perfil, conta) {
  const conv = {
    id: 'c1', remote_jid: '5519999990001', status: 'open', phase: 'novo',
    conta_id: conta, contact_name: 'Cliente',
  }
  return {
    conv,
    ctx: {
      params: { id: 'c1' }, query: {}, body: {}, headers: {},
      user: { id: perfil.id },
      models: {
        WhatsAppConversation: {
          findById: async () => conv,
          findMany: async () => [conv],
          update: async (id, p) => { Object.assign(conv, p); return conv },
        },
        WhatsAppMessage: { findMany: async () => [], create: async (m) => m, update: async () => ({}) },
        Profile: { findById: async (id) => (id === perfil.id ? perfil : null), findMany: async () => [perfil] },
        SystemSettings: { findMany: async () => [{}] },
        WaConversationEvents: { findMany: async () => [], create: async () => ({}) },
        WaConta: { findMany: async () => [{ id: 'vendas', nome: 'Vendas', ativa: true }], findById: async () => null },
        Contact: { findMany: async () => [], findById: async () => null },
        Company: { findMany: async () => [], findById: async () => null },
        Ticket: { findMany: async () => [], findById: async () => null },
        Sessao: { findById: async () => null },
        ConvTag: { findMany: async () => [] },
        Tag: { findMany: async () => [] },
        Dept: { findMany: async () => [] },
        Unit: { findMany: async () => [] },
      },
      secrets: { get: async () => 'tok' },
      fetch: async () => ({ status: 200, body: '{}' }),
      reply: reply(),
    },
  }
}

;(async () => {
  // ══ 403 por URL direta ════════════════════════════════════════════════
  const ler = carregarHandler('433 whatsapp GET /whatsapp/:id')
  const resolver = carregarHandler('469 whatsapp POST /whatsapp/:id/resolve')

  let c = cenario(ATENDENTE, 'vendas')
  let r = await ler(c.ctx)
  ok('leitura de conversa de outra conta: 403', r.status === 403, { status: r.status, body: r.body })
  ok('  e não devolve o contato', !JSON.stringify(r.body || {}).includes('Cliente'), r.body)

  c = cenario(ATENDENTE, 'vendas')
  r = await resolver(c.ctx)
  ok('ESCRITA em conversa de outra conta: 403', r.status === 403, r.status)
  ok('  e a conversa não foi alterada', c.conv.status === 'open', c.conv.status)

  // ══ quem tem o grant entra ════════════════════════════════════════════
  c = cenario(COM_GRANT, 'vendas')
  r = await ler(c.ctx)
  ok('com o grant wa_conta_vendas: entra', r.status !== 403, { status: r.status })

  c = cenario(CHEFE, 'vendas')
  r = await ler(c.ctx)
  ok('admin entra sem grant por conta', r.status !== 403, { status: r.status })

  // ══ a conta default não muda para ninguém ═════════════════════════════
  for (const [nome, perfil] of [['atendente', ATENDENTE], ['admin', CHEFE]]) {
    c = cenario(perfil, 'default')
    r = await ler(c.ctx)
    ok(`conta default: ${nome} entra como sempre`, r.status !== 403, { status: r.status })
    c = cenario(perfil, null)
    r = await ler(c.ctx)
    ok(`  e conversa SEM conta_id também (${nome})`, r.status !== 403, { status: r.status })
  }

  // ══ a lista não traz conversa de conta sem acesso ═════════════════════
  const lista = carregarHandler('432 whatsapp GET /whatsapp')
  function cenarioLista(perfil, conversas) {
    return {
      params: {}, query: {}, body: {}, headers: {},
      user: { id: perfil.id },
      models: {
        WhatsAppConversation: {
          findById: async (id) => conversas.find((c) => c.id === id) || null,
          findMany: async (arg) => {
            const ch = Object.keys(arg || {})
            if (!ch.length) return conversas
            return conversas.filter((c) => ch.every((k) => String(c[k] ?? '') === String(arg[k])))
          },
          update: async () => ({}),
        },
        WhatsAppMessage: { findMany: async () => [] },
        Profile: { findById: async (id) => (id === perfil.id ? perfil : null), findMany: async () => [perfil] },
        SystemSettings: { findMany: async () => [{}] },
        WaConversationEvents: { findMany: async () => [] },
        Contact: { findMany: async () => [] },
        Company: { findMany: async () => [] },
        Ticket: { findMany: async () => [] },
        ConvTag: { findMany: async () => [] },
        Tag: { findMany: async () => [] },
        Dept: { findMany: async () => [] },
        Unit: { findMany: async () => [] },
        Sessao: { findById: async () => null },
      },
      secrets: { get: async () => 'tok' },
      fetch: async () => ({ status: 200, body: '{}' }),
      reply: reply(),
    }
  }
  const TRES = [
    { id: 'a', remote_jid: '551', status: 'open', conta_id: 'default' },
    { id: 'b', remote_jid: '552', status: 'open', conta_id: 'vendas' },
    { id: 'c', remote_jid: '553', status: 'open' },
  ]
  r = await lista(cenarioLista(ATENDENTE, TRES))
  let ids = (r.body?.data || []).map((x) => x.id).sort().join(',')
  ok('lista esconde a conversa da conta sem acesso', ids === 'a,c', ids)

  r = await lista(cenarioLista(COM_GRANT, TRES))
  ids = (r.body?.data || []).map((x) => x.id).sort().join(',')
  ok('  e mostra para quem tem o grant', ids === 'a,b,c', ids)

  const comAba = cenarioLista(COM_GRANT, TRES)
  comAba.query = { conta: 'vendas' }
  r = await lista(comAba)
  ids = (r.body?.data || []).map((x) => x.id).sort().join(',')
  ok('  aba de uma conta mostra só ela', ids === 'b', ids)

  // ══ a rota das contas visíveis ════════════════════════════════════════
  const contas = carregarHandler('490o whatsapp GET /whatsapp/contas')
  function ctxContas(perfil, comModel = true) {
    const models = {
      Profile: { findById: async (id) => (id === perfil.id ? perfil : null) },
      Sessao: { findById: async () => null },
    }
    if (comModel) {
      models.WaConta = {
        findMany: async () => [
          { id: 'vendas', nome: 'Vendas', setor: 'vendas', ativa: true, numero: '5519333330001' },
          { id: 'adm', nome: 'Adm', setor: 'adm', ativa: true },
          { id: 'velha', nome: 'Velha', ativa: false },
        ],
      }
    }
    return { params: {}, query: {}, body: {}, headers: {}, user: { id: perfil.id }, models, reply: reply() }
  }
  r = await contas(ctxContas(ATENDENTE))
  ok('sem grant: nenhuma conta nomeada na lista', (r.body?.data || []).length === 0, r.body?.data)
  r = await contas(ctxContas(COM_GRANT))
  ok('com grant: só a conta liberada', (r.body?.data || []).map((c) => c.id).join(',') === 'vendas',
    (r.body?.data || []).map((c) => c.id))
  r = await contas(ctxContas(CHEFE))
  ok('admin: todas as ativas', (r.body?.data || []).map((c) => c.id).sort().join(',') === 'adm,vendas',
    (r.body?.data || []).map((c) => c.id))
  ok('  e nunca a desativada', !JSON.stringify(r.body?.data || []).includes('velha'), r.body?.data)
  ok('  sem expor o número da conta', !JSON.stringify(r.body?.data || []).includes('5519333330001'), r.body?.data)
  r = await contas(ctxContas(CHEFE, false))
  ok('sem o schema do 3a: lista vazia (inbox fica como hoje)',
    r.status === 200 && (r.body?.data || []).length === 0, { status: r.status, data: r.body?.data })
  r = await contas({ params: {}, query: {}, body: {}, headers: {}, user: null, models: { Sessao: { findById: async () => null } }, reply: reply() })
  ok('sem sessão: 401', r.status === 401, r.status)

  // ══ A CONFERÊNCIA ════════════════════════════════════════════════════
  // Isto não testa comportamento: testa que ninguém criou rota nova sem a
  // trava. Como passo manual, a próxima rota nasceria sem ela.
  //
  // O critério da primeira versão era só `var x = await ...findById(`, e por
  // isso PERDIA três famílias de rota: as que atribuem sem declarar (`conv =
  // await ...`), as que trabalham por `conversation_id` sem nunca buscar a
  // conversa (notas e etiquetas — justamente onde a revisão achou o furo), e
  // as que usam Promise.all. Critério novo: toda rota cujo caminho tem
  // `/whatsapp/:id` OU cujo código toca Conv/Note/Tag/Message usando
  // `params.id` precisa da trava.
  const fonte = fs.readFileSync(ARQ, 'utf8')
  const CAB = /\/\/ (\d+\w*) (\S+) (GET|POST|PUT|PATCH|DELETE) (\S+)/g
  const RE = /compileController\(\s*"((?:[^"\\]|\\.)*)"\s*\)/g

  // Rotas de SISTEMA que atravessam contas de propósito. Cada exceção tem de
  // ter o motivo escrito aqui — lista sem justificativa é lista que cresce.
  const EXCECOES = {
    '/whatsapp/inbound': 'webhook da Avisa: é ele que DESCOBRE a conta da mensagem',
    '/whatsapp/plantao/varrer': 'varredura do relógio: atravessa contas por desenho',
    '/whatsapp/conversa/nova': 'a conversa ainda não existe; valida a conta pedida no corpo',
    '/whatsapp/manutencao/unir-duplicatas': 'manutenção, exige admin',
  }
  // Exceções por VERBO + caminho, mais estreitas que as de cima (que valem para
  // o caminho inteiro). Cada uma é VERIFICADA, não só declarada: ver abaixo.
  const EXCECOES_POR_ROTA = {
    'GET /whatsapp': 'a lista relê, em segundo plano, a conversa de uma LINHA DA PRÓPRIA LISTA ' +
      '(nunca um id vindo de `params`) para não atropelar um nome digitado; nada que a releitura ' +
      'traz volta ao chamador',
  }
  // Exceção que não aparece mais no arquivo é lista apodrecendo: some daqui.
  const excecoesVistas = new Set()

  const semTrava = []
  let m, comTrava = 0, excecoes = 0
  while ((m = CAB.exec(fonte))) {
    RE.lastIndex = m.index
    const mm = RE.exec(fonte)
    if (!mm) continue
    const cod = JSON.parse('"' + mm[1] + '"')
    const path = m[4]
    // Critério preciso, em três formas — a largura importa, mas acusar rota de
    // fluxo e de chamado faria a lista virar ruído que ninguém lê:
    //  a) o caminho é de uma conversa (`/whatsapp/:id...`);
    //  b) o código busca a conversa por id, COM ou SEM declarar a variável;
    //  c) o código consulta algo por `conversation_id: id` (notas, etiquetas).
    const porCaminho = /^\/whatsapp\/:id(\/|$)/.test(path)
    const buscaConversa = /\b\w+\s*=\s*await\s+[\w.]*(?:Conv|Conversation)\w*\.findById\(/.test(cod)
    const porConversationId = /conversation_id:\s*(?:id|String\(id)/.test(cod)
    const ehDeMidia = path === '/whatsapp/midia/:id'
    if (!porCaminho && !buscaConversa && !porConversationId && !ehDeMidia) continue
    if (EXCECOES[path]) { excecoes++; excecoesVistas.add(path); continue }
    const chaveRota = `${m[3]} ${path}`
    if (EXCECOES_POR_ROTA[chaveRota]) {
      // A exceção só vale enquanto a rota NÃO lê id de entrada, venha de onde
      // vier: `params`, `query` ou `body`. Listagem ganha filtro por id com
      // naturalidade (`?id=`); no dia em que isso entrar, a lista volta a
      // precisar da trava.
      const idDeEntrada = cod.match(/\b(?:ctx\.)?(?:params|query|body)\s*(?:\.\s*id\b|\[\s*["']id["']\s*\])/)
      if (idDeEntrada) { semTrava.push(`${m[1]} ${chaveRota} (exceção não vale: lê id de entrada — ${idDeEntrada[0]})`); continue }
      excecoes++; excecoesVistas.add(chaveRota); continue
    }
    if (/_barrarPorConta(?:PorId)?\(/.test(cod)) comTrava++
    else semTrava.push(`${m[1]} ${m[3]} ${path}`)
  }
  ok(`as ${comTrava} rotas que tocam conversa têm a trava de conta`,
    semTrava.length === 0, semTrava)
  ok('  e a conferência não está vazia (senão não prova nada)', comTrava >= 15, comTrava)
  // As quatro rotas de sistema NÃO caem no critério (não buscam conversa por
  // id nem consultam por `conversation_id: id`), então hoje a lista acima é
  // documentação, não filtro — `excecoes` vem 0 e está certo. O filtro fica
  // para o caso de uma delas passar a casar: aí a decisão é consciente, com o
  // motivo escrito, em vez de a rota entrar calada na lista de sem-trava.
  // EXATAMENTE estas duas, e cada uma pela mesma razão: relê a conversa por um
  // id que o PRÓPRIO handler já resolveu (a linha da lista; a conversa da
  // mensagem), em segundo plano, para gravar o nome do grupo sem atropelar um
  // nome digitado. O webhook já estava em `EXCECOES` por caminho, com o motivo
  // escrito; a lista entra por verbo+caminho e se autoverifica.
  ok('  e as únicas exceções são a lista de conversas e o webhook de entrada',
    excecoes === 2 && excecoesVistas.size === 2 &&
      excecoesVistas.has('GET /whatsapp') && excecoesVistas.has('/whatsapp/inbound'),
    { excecoes, vistas: [...excecoesVistas] })

  // ══ A ORDEM: autorização antes da validação do corpo ══════════════════
  // O corpo do PR afirmava isso; agora há verificação. Em cada rota que tem
  // trava e um 400 de corpo, o 400 precisa vir DEPOIS.
  const ordemErrada = []
  CAB.lastIndex = 0
  while ((m = CAB.exec(fonte))) {
    RE.lastIndex = m.index
    const mm = RE.exec(fonte)
    if (!mm) continue
    const cod = JSON.parse('"' + mm[1] + '"')
    const iTrava = cod.search(/_barrarPorConta(?:PorId)?\(ctx/)
    if (iTrava < 0) continue
    // o primeiro 400 de validação de corpo depois do começo do handler
    const i400 = cod.search(/return fail\(ctx, 400, "[^"]*obrigat/)
    if (i400 >= 0 && i400 < iTrava) ordemErrada.push(`${m[1]} ${m[3]} ${m[4]}`)
  }
  ok('nenhuma rota valida o corpo antes de autorizar', ordemErrada.length === 0, ordemErrada)

  // ══ e a trava nunca roda antes de ter a conversa ══════════════════════
  const antesDaConversa = []
  CAB.lastIndex = 0
  while ((m = CAB.exec(fonte))) {
    RE.lastIndex = m.index
    const mm = RE.exec(fonte)
    if (!mm) continue
    const cod = JSON.parse('"' + mm[1] + '"')
    for (const uso of cod.matchAll(/(?<!function )_barrarPorConta\(ctx, (\w+)\)/g)) {
      const antes = cod.slice(Math.max(0, uso.index - 30), uso.index)
      if (antes.includes('function')) continue
      const atrib = new RegExp(`(?:var|const|let)\\s+${uso[1]}\\s*=\\s*await\\s+[\\w.]*(?:Conv|Conversation)\\w*\\.findById\\(`).exec(cod)
      if (!atrib || atrib.index > uso.index) antesDaConversa.push(`${m[1]} ${m[3]} ${m[4]}`)
    }
  }
  ok('nenhuma rota usa a trava antes de carregar a conversa', antesDaConversa.length === 0, antesDaConversa)

  fim()
})()
