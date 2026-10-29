// Servidor HML no Kanban Dev: a opção "sem servidor" e a troca depois.
//
// Pedido do Willian, decidido pelo Leonardo (29/10/2026).
//
// O campo continua OBRIGATÓRIO ao mover para Pronto p/ Teste: o que entra é uma
// escolha explícita a mais, e não a ausência de escolha. E a troca depois tem as
// mesmas portas da rota de mover, porque trocar o servidor de um card é mexer
// no card.
//
// Roda com: node kanban-dev-servidor-hml.test.js
const { carregarHandler, carregarContexto, reply, ok, fim } = require('./_carregar.js')
const { registrarTS, importarTela } = require('./_tela.js')

registrarTS()

const MOVER = '393 tickets POST /dev/tickets/:id/mover'
const TROCAR = '511 tickets PATCH /dev/tickets/:id/servidor-hml'

function card(o) {
  return {
    id: o.id, ticket_number: o.numero || ('DEV-' + o.id), quadro: 'dev',
    status: o.status || 'em_desenvolvimento', environment: o.env === undefined ? '' : o.env,
    title: 'Card', updated_at: '2026-02-01T00:00:00.000Z',
    pull_request_url: 'https://github.com/x/y/pull/1',
  }
}

function montar({ perfil, params, body, cards }) {
  const linhas = (cards || []).slice()
  const reg = { update: [], log: [] }
  return {
    reg,
    linhas,
    ctx: {
      headers: {}, user: { id: 'u1' }, params: params || { id: 'c1' }, query: {},
      body: body || {}, reply: reply(),
      models: {
        Profile: {
          findById: async () => Object.assign(
            { id: 'u1', role: 'developer', feature_grants: [] }, perfil || {}),
        },
        Sessao: { findById: async () => null },
        Ticket: {
          findById: async (id) => linhas.find((l) => String(l.id) === String(id)) || null,
          findMany: async () => linhas.slice(),
          update: async (id, d) => {
            reg.update.push({ id: String(id), dados: d })
            const i = linhas.findIndex((l) => String(l.id) === String(id))
            if (i >= 0) linhas[i] = Object.assign({}, linhas[i], d)
            return linhas[i]
          },
        },
        ActivityLog: { create: async (d) => { reg.log.push(d); return d } },
        TicketMessage: { create: async () => ({}) },
      },
    },
  }
}

;(async () => {
  const L = await importarTela('lib/servidores-hml.ts')
  const SEM = L.SEM_SERVIDOR_HML

  // ── 1. O valor reservado é um só, e não é servidor ────────────────────────
  {
    ok('o-valor-reservado-nao-e-servidor', !L.SERVIDORES_HML.includes(SEM), SEM)
    ok('o-valor-reservado-tem-nome-proprio',
      L.labelServidorHml(SEM) === 'Sem servidor HML', L.labelServidorHml(SEM))
    ok('o-valor-reservado-e-escolha-valida', L.ehEscolhaDeHml(SEM) && !L.ehServidorHml(SEM), null)
  }

  // ── 2. Uma lista só: as cópias não podem divergir ────────────────────────
  //
  // A lista existe na tela e dentro dos handlers. Lista repetida é a que fica
  // para trás quando um servidor entra, e aí a tela oferece o que a rota
  // recusa — ou pior, a rota aceita o que a tela não mostra.
  {
    for (const marca of [MOVER, TROCAR]) {
      const ctx = carregarContexto(marca)
      const noServidor = (ctx.SERVIDORES_HML || []).slice()
      ok('a-lista-existe-no-handler:' + marca.split(' ')[0], noServidor.length > 0, noServidor.length)
      ok('a-lista-do-handler-e-igual-a-da-tela:' + marca.split(' ')[0],
        noServidor.join(',') === L.SERVIDORES_HML.join(','),
        { handler: noServidor.length, tela: L.SERVIDORES_HML.length })
      ok('o-valor-reservado-e-o-mesmo:' + marca.split(' ')[0], ctx.SEM_SERVIDOR_HML === SEM,
        ctx.SEM_SERVIDOR_HML)
      ok('as-colunas-que-reservam-sao-as-mesmas:' + marca.split(' ')[0],
        Object.keys(ctx.STATUS_TRAVAM_HML || {}).sort().join(',')
          === L.STATUS_TRAVAM_HML.slice().sort().join(','),
        Object.keys(ctx.STATUS_TRAVAM_HML || {}))
    }
  }

  // ── 3. Mover com "sem servidor" ──────────────────────────────────────────
  {
    const h = carregarHandler(MOVER)
    const m = montar({
      params: { id: 'c1' },
      body: { status: 'pronto_para_teste', environment: SEM },
      cards: [card({ id: 'c1', status: 'finalizado_dev' })],
    })
    const r = await h(m.ctx)
    const gravado = (m.reg.update[0] || {}).dados || {}
    ok('mover-com-sem-servidor-grava', r.status === 200 || r.status === undefined,
      { status: r.status, body: r.body })
    ok('mover-com-sem-servidor-guarda-o-valor-reservado', gravado.environment === SEM, gravado)

    // E não ocupa nada: um segundo card pode ir para a mesma situação.
    const h2 = carregarHandler(MOVER)
    const m2 = montar({
      params: { id: 'c2' },
      body: { status: 'pronto_para_teste', environment: SEM },
      cards: [card({ id: 'c1', status: 'pronto_para_teste', env: SEM }),
        card({ id: 'c2', status: 'finalizado_dev' })],
    })
    const r2 = await h2(m2.ctx)
    ok('dois-cards-sem-servidor-convivem', r2.status === 200 || r2.status === undefined,
      { status: r2.status, body: r2.body })
  }

  // ── 4. Não escolher nada continua dando 400 ──────────────────────────────
  {
    for (const [nome, env] of [['sem-campo', undefined], ['vazio', ''], ['inventado', 'servidor-x']]) {
      const h = carregarHandler(MOVER)
      const m = montar({
        params: { id: 'c1' },
        body: Object.assign({ status: 'pronto_para_teste' }, env === undefined ? {} : { environment: env }),
        cards: [card({ id: 'c1', status: 'finalizado_dev' })],
      })
      const r = await h(m.ctx)
      ok('mover-sem-escolher-recusa:' + nome, r.status === 400, { nome, status: r.status })
      ok('mover-sem-escolher-nao-grava:' + nome, m.reg.update.length === 0, m.reg.update)
    }
  }

  // ── 5. Trocar o servidor depois ──────────────────────────────────────────
  {
    const livre = L.SERVIDORES_HML[1]
    const ocupado = L.SERVIDORES_HML[2]

    // Para um livre: grava, e o antigo deixa de estar ocupado.
    {
      const h = carregarHandler(TROCAR)
      const m = montar({
        params: { id: 'c1' }, body: { environment: livre },
        cards: [card({ id: 'c1', status: 'pronto_para_teste', env: L.SERVIDORES_HML[0] })],
      })
      const r = await h(m.ctx)
      const g = (m.reg.update[0] || {}).dados || {}
      ok('trocar-para-livre-grava', (r.status === 200 || r.status === undefined) && g.environment === livre,
        { status: r.status, g })
      // A ocupação é DERIVADA: o antigo fica livre sem nenhuma gravação nele.
      const aindaOcupado = m.linhas.some((c) => String(c.environment) === L.SERVIDORES_HML[0])
      ok('o-antigo-fica-livre-na-hora', !aindaOcupado, m.linhas.map((c) => c.environment))
      ok('a-troca-vai-para-o-historico', m.reg.log.length === 1, m.reg.log)
      const d = (m.reg.log[0] || {}).details || {}
      ok('o-historico-diz-de-para-e-quem',
        d.from === L.SERVIDORES_HML[0] && d.to === livre && (m.reg.log[0] || {}).user_id === 'u1',
        { d, user: (m.reg.log[0] || {}).user_id })
      ok('o-historico-tem-quando', typeof (m.reg.log[0] || {}).created_at === 'string', m.reg.log[0])
    }

    // Para um ocupado por OUTRO card: recusa nomeando o card, nada gravado.
    {
      const h = carregarHandler(TROCAR)
      const m = montar({
        params: { id: 'c1' }, body: { environment: ocupado },
        cards: [card({ id: 'c1', status: 'pronto_para_teste', env: L.SERVIDORES_HML[0] }),
          card({ id: 'c2', numero: 'DEV-77', status: 'em_testes', env: ocupado })],
      })
      const r = await h(m.ctx)
      ok('trocar-para-ocupado-recusa', r.status === 400, { status: r.status, body: r.body })
      ok('trocar-para-ocupado-nomeia-o-card',
        String((r.body || {}).error || '').includes('DEV-77'), r.body)
      ok('trocar-para-ocupado-nao-grava', m.reg.update.length === 0, m.reg.update)
    }

    // Fora das duas colunas: recusa.
    {
      for (const st of ['em_desenvolvimento', 'teste_aprovado', 'backlog']) {
        const h = carregarHandler(TROCAR)
        const m = montar({
          params: { id: 'c1' }, body: { environment: livre },
          cards: [card({ id: 'c1', status: st, env: L.SERVIDORES_HML[0] })],
        })
        const r = await h(m.ctx)
        ok('trocar-fora-das-colunas-recusa:' + st, r.status === 400, { st, status: r.status })
        ok('trocar-fora-das-colunas-nao-grava:' + st, m.reg.update.length === 0, m.reg.update)
      }
    }

    // Valor igual não grava: o formulário manda o atual junto.
    {
      const h = carregarHandler(TROCAR)
      const m = montar({
        params: { id: 'c1' }, body: { environment: L.SERVIDORES_HML[0] },
        cards: [card({ id: 'c1', status: 'em_testes', env: L.SERVIDORES_HML[0] })],
      })
      const r = await h(m.ctx)
      ok('valor-igual-nao-grava', m.reg.update.length === 0, m.reg.update)
      ok('valor-igual-nao-entra-no-historico', m.reg.log.length === 0, m.reg.log)
      ok('valor-igual-responde-sem-erro', r.status === 200 || r.status === undefined, r.status)
    }

    // Trocar PARA "sem servidor" libera a máquina.
    {
      const h = carregarHandler(TROCAR)
      const m = montar({
        params: { id: 'c1' }, body: { environment: SEM },
        cards: [card({ id: 'c1', status: 'em_testes', env: L.SERVIDORES_HML[0] })],
      })
      const r = await h(m.ctx)
      const g = (m.reg.update[0] || {}).dados || {}
      ok('trocar-para-sem-servidor-grava', g.environment === SEM, { status: r.status, g })
    }

    // E "sem servidor" não disputa: dois cards podem estar assim.
    {
      const h = carregarHandler(TROCAR)
      const m = montar({
        params: { id: 'c1' }, body: { environment: SEM },
        cards: [card({ id: 'c1', status: 'em_testes', env: L.SERVIDORES_HML[0] }),
          card({ id: 'c2', status: 'pronto_para_teste', env: SEM })],
      })
      const r = await h(m.ctx)
      ok('sem-servidor-nao-disputa-na-troca',
        (r.status === 200 || r.status === undefined)
        && ((m.reg.update[0] || {}).dados || {}).environment === SEM,
        { status: r.status, body: r.body })
    }

    // Escolha inválida na troca.
    {
      for (const [nome, env] of [['vazio', ''], ['inventado', 'nao-existe']]) {
        const h = carregarHandler(TROCAR)
        const m = montar({
          params: { id: 'c1' }, body: { environment: env },
          cards: [card({ id: 'c1', status: 'em_testes', env: L.SERVIDORES_HML[0] })],
        })
        const r = await h(m.ctx)
        ok('trocar-com-escolha-invalida-recusa:' + nome, r.status === 400, { nome, status: r.status })
        ok('trocar-com-escolha-invalida-nao-grava:' + nome, m.reg.update.length === 0, m.reg.update)
      }
    }
  }

  // ── 6. As portas: sem permissão e sem sessão ─────────────────────────────
  {
    const livre = L.SERVIDORES_HML[1]
    // Nível abaixo de developer.
    for (const papel of ['support', 'user']) {
      const h = carregarHandler(TROCAR)
      const m = montar({
        perfil: { role: papel }, params: { id: 'c1' }, body: { environment: livre },
        cards: [card({ id: 'c1', status: 'em_testes', env: L.SERVIDORES_HML[0] })],
      })
      const r = await h(m.ctx)
      ok('sem-permissao-403:' + papel, r.status === 403, { papel, status: r.status })
      ok('sem-permissao-nao-grava:' + papel, m.reg.update.length === 0, m.reg.update)
    }
    // Sem pessoa identificada: a guarda de sessão responde antes de tudo.
    {
      const h = carregarHandler(TROCAR)
      const m = montar({
        params: { id: 'c1' }, body: { environment: livre },
        cards: [card({ id: 'c1', status: 'em_testes', env: L.SERVIDORES_HML[0] })],
      })
      m.ctx.user = {}
      const r = await h(m.ctx)
      ok('sem-sessao-401', r.status === 401, { status: r.status, body: r.body })
      ok('sem-sessao-nao-grava', m.reg.update.length === 0, m.reg.update)
    }
    // Card de outro quadro, e card inexistente.
    {
      const h = carregarHandler(TROCAR)
      const m = montar({
        params: { id: 'c1' }, body: { environment: livre },
        cards: [Object.assign(card({ id: 'c1', status: 'em_testes' }), { quadro: 'suporte' })],
      })
      ok('card-de-outro-quadro-recusa', (await h(m.ctx)).status === 400, null)
      const h2 = carregarHandler(TROCAR)
      const m2 = montar({ params: { id: 'NAO_EXISTE' }, body: { environment: livre }, cards: [] })
      ok('card-inexistente-404', (await h2(m2.ctx)).status === 404, null)
    }
  }

  fim()
})()
