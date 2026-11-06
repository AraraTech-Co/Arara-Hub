// O card do quadro Dev muda pelo quadro Dev — e a regra de um card em
// desenvolvimento por pessoa vale em toda rota que troca o responsável.
//
// Fatia seguinte ao #174, pedida na revisão do Orquestrador (06/11/2026):
// as rotas genéricas de status (`PATCH`/`POST /tickets/:id/status` e o
// `set_status` do `bulk-action`) moviam card Dev sem passar pelo mover —
// transições, HML, motivo e a regra de um por vez ficavam de fora. E as rotas
// que trocam o responsável (`assign`, `escalate`, o `assign` do lote) davam um
// segundo card em desenvolvimento à mesma pessoa.
//
// Chama o handler EXPORTADO, com o emulador fiel da camada.
//
// Roda com: node kanban-dev-so-pelo-quadro-dev.test.js
const { carregarHandler, reply, ok, fim } = require('./_carregar.js')
const { camadaFindMany } = require('./_camada.js')
const { registrarTS, importarTela } = require('./_tela.js')

registrarTS()

const R = {
  statusPatch: '390 tickets PATCH /tickets/:id/status',
  statusPost: '410 tickets POST /tickets/:id/status',
  lote: '413 tickets POST /tickets/bulk-action',
  assignPatch: '386 tickets PATCH /tickets/:id/assign',
  assignPost: '400 tickets POST /tickets/:id/assign',
  escalar: '405 tickets POST /tickets/:id/escalate',
}

function card(o) {
  return Object.assign({
    ticket_number: 'X-' + o.id, quadro: 'dev', status: 'backlog', title: 'Card ' + o.id,
    description: 'd', updated_at: '2026-11-01T00:00:00.000Z',
  }, o)
}
const PESSOAS = { u1: 'Quem move', u7: 'Hefler', u8: 'Eron' }

function montar(cards, { params, body }) {
  const linhas = cards.slice()
  const reg = { update: [], create: [] }
  const generico = () => ({
    findMany: async () => [], findById: async () => null,
    create: async (d) => { reg.create.push(d); return Object.assign({ id: 'novo' + reg.create.length }, d) },
    update: async (id, d) => Object.assign({ id }, d), delete: async () => ({}),
  })
  const Ticket = {
    findById: async (id) => linhas.find((l) => String(l.id) === String(id)) || null,
    findMany: async (f) => camadaFindMany(linhas, f),
    create: async (d) => { reg.create.push(Object.assign({ modelo: 'Ticket' }, d)); const n = Object.assign({ id: 'novo' + reg.create.length }, d); linhas.push(n); return n },
    update: async (id, d) => {
      reg.update.push({ id: String(id), dados: d })
      const i = linhas.findIndex((l) => String(l.id) === String(id))
      if (i >= 0) linhas[i] = Object.assign({}, linhas[i], d)
      return linhas[i]
    },
  }
  const Profile = {
    findById: async (pid) => (PESSOAS[pid] ? { id: pid, role: 'developer', full_name: PESSOAS[pid], feature_grants: [] } : null),
    findMany: async () => [],
  }
  const models = new Proxy({}, {
    get: (_t, k) => (k === 'Ticket' ? Ticket : k === 'Profile' ? Profile
      : k === 'Sessao' ? { findById: async () => null, findMany: async () => [] } : generico()),
  })
  return {
    reg, linhas,
    ctx: {
      headers: {}, user: { id: 'u1' }, params: params || {}, query: {}, body: body || {},
      reply: reply(), models, notify: async () => {}, secrets: { get: async () => null },
    },
  }
}

async function chamar(rota, cards, req) {
  const m = montar(cards, req)
  let r
  try { r = await carregarHandler(R[rota])(m.ctx) } catch (e) { r = { status: 'estouro: ' + e.message } }
  return { status: r.status || 200, body: r.body || {}, gravou: m.reg.update.length > 0, reg: m.reg }
}

const ATIVO_U7 = card({ id: 'c1', status: 'em_desenvolvimento', assigned_to: 'u7', ticket_number: 'DEV-00012' })

;(async () => {
  // ── 1. Status pelas rotas genéricas: card Dev não ─────────────────────
  for (const rota of ['statusPatch', 'statusPost']) {
    for (const para of ['em_desenvolvimento', 'pendencia_dev', 'resolvido']) {
      const r = await chamar(rota, [card({ id: 'c2', status: 'backlog', assigned_to: 'u7' }), ATIVO_U7],
        { params: { id: 'c2' }, body: { status: para } })
      ok(`${rota}:card-dev-nao-muda-de-status:${para}`, r.status === 409 && !r.gravou, [r.status, r.body.error])
    }
    {
      const r = await chamar(rota, [card({ id: 's1', quadro: 'suporte', status: 'em_atendimento' })],
        { params: { id: 's1' }, body: { status: 'aguardando_cliente' } })
      ok(`${rota}:card-de-suporte-segue-mudando`, r.status === 200 && r.gravou, [r.status, r.body.error])
    }
    {
      // A escalada implícita: o card que muda é o de Suporte; o Dev nasce dele.
      const r = await chamar(rota, [card({ id: 's1', quadro: 'suporte', status: 'em_atendimento' })],
        { params: { id: 's1' }, body: { status: 'pendencia_dev' } })
      const nasceu = r.reg.create.some((d) => d.modelo === 'Ticket' && d.quadro === 'dev')
      ok(`${rota}:escalada-de-suporte-para-dev-segue-criando-o-card`, r.status === 200 && nasceu, [r.status, r.body.error, nasceu])
    }
  }

  // ── 2. O lote ──────────────────────────────────────────────────────────
  {
    const r = await chamar('lote', [card({ id: 's1', quadro: 'suporte', status: 'em_atendimento' }), card({ id: 'c2' })],
      { body: { ids: ['s1', 'c2'], action: 'set_status', status: 'resolvido' } })
    ok('lote:set_status-com-card-dev-recusa-sem-gravar-nada', r.status === 409 && !r.gravou, [r.status, r.reg.update.length])
  }
  {
    const r = await chamar('lote', [card({ id: 's1', quadro: 'suporte', status: 'em_atendimento' })],
      { body: { ids: ['s1'], action: 'set_status', status: 'resolvido' } })
    ok('lote:set_status-de-suporte-segue', r.status === 200 && r.gravou, [r.status, r.body.error])
  }
  {
    const r = await chamar('lote', [ATIVO_U7, card({ id: 'c2', status: 'em_desenvolvimento', assigned_to: 'u8' })],
      { body: { ids: ['c2'], action: 'assign', assignTo: 'u7' } })
    ok('lote:assign-de-card-em-dev-para-quem-ja-tem-recusa', r.status === 400 && !r.gravou, [r.status, r.body.error])
  }
  {
    const r = await chamar('lote', [card({ id: 'c2', status: 'em_desenvolvimento', assigned_to: 'u1' }), card({ id: 'c3', status: 'em_desenvolvimento', assigned_to: 'u1' })],
      { body: { ids: ['c2', 'c3'], action: 'assign', assignTo: 'u8' } })
    ok('lote:dois-cards-em-dev-para-a-mesma-pessoa-no-mesmo-lote-recusa', r.status === 400 && !r.gravou, [r.status, r.body.error])
  }
  {
    const r = await chamar('lote', [ATIVO_U7, card({ id: 'c2', status: 'em_desenvolvimento', assigned_to: 'u7' })],
      { body: { ids: ['c2'], action: 'assign', assignTo: 'u8' } })
    ok('lote:assign-de-card-em-dev-para-quem-esta-livre-passa', r.status === 200 && r.gravou, [r.status, r.body.error])
  }
  {
    const r = await chamar('lote', [ATIVO_U7, card({ id: 's1', quadro: 'suporte', status: 'em_atendimento' })],
      { body: { ids: ['s1'], action: 'assign', assignTo: 'u7' } })
    ok('lote:assign-de-suporte-segue', r.status === 200 && r.gravou, [r.status, r.body.error])
  }
  {
    // O card do lote já é da pessoa e é o único ativo dela: não ocupa a vaga
    // dele mesmo.
    const r = await chamar('lote', [card({ id: 'c2', status: 'em_desenvolvimento', assigned_to: 'u7' })],
      { body: { ids: ['c2'], action: 'assign', assignTo: 'u7' } })
    ok('lote:reatribuir-o-card-em-dev-a-mesma-pessoa-passa', r.status === 200 && r.gravou, [r.status, r.body.error])
  }

  // ── 3. Trocar o responsável, uma por uma ───────────────────────────────
  for (const rota of ['assignPatch', 'assignPost', 'escalar']) {
    const corpo = (quem) => (rota === 'escalar' ? { to_user_id: quem } : { assignee_id: quem, force: true })
    {
      const r = await chamar(rota, [ATIVO_U7, card({ id: 'c2', status: 'em_desenvolvimento', assigned_to: 'u8' })],
        { params: { id: 'c2' }, body: corpo('u7') })
      const msg = String(r.body.error || '')
      ok(`${rota}:card-em-dev-para-quem-ja-tem-recusa`, r.status === 400 && !r.gravou, [r.status, msg])
      ok(`${rota}:a-recusa-diz-quem-e-qual-card`, msg.includes('Hefler') && msg.includes('DEV-00012'), msg)
    }
    {
      // Mais de 500 cards da pessoa criados depois do ativo: a conta filtra na
      // camada, então o teto cai sobre os candidatos e o ativo é achado.
      const linhas = [ATIVO_U7]
      for (let i = 0; i < 600; i++) linhas.push(card({ id: 'v' + i, status: 'aplicado_no_cliente', assigned_to: 'u7' }))
      linhas.push(card({ id: 'c2', status: 'em_desenvolvimento', assigned_to: 'u8' }))
      const r = await chamar(rota, linhas, { params: { id: 'c2' }, body: corpo('u7') })
      ok(`${rota}:acima-de-500-cards-da-pessoa-ainda-acha-o-ativo`, r.status === 400 && !r.gravou, [r.status, r.body.error])
    }
    {
      // O próprio card ativo da pessoa, atribuído de novo a ela, não ocupa
      // a vaga dele mesmo.
      const r = await chamar(rota, [ATIVO_U7], { params: { id: 'c1' }, body: corpo('u7') })
      ok(`${rota}:o-proprio-card-nao-conta`, r.status === 200, [r.status, r.body.error])
    }
    {
      const r = await chamar(rota, [ATIVO_U7, card({ id: 'c2', status: 'backlog', assigned_to: 'u8' })],
        { params: { id: 'c2' }, body: corpo('u7') })
      ok(`${rota}:card-fora-de-em-dev-passa`, r.status === 200 && r.gravou, [r.status, r.body.error])
    }
    {
      const r = await chamar(rota, [ATIVO_U7, card({ id: 's1', quadro: 'suporte', status: 'em_atendimento', assigned_to: 'u8' })],
        { params: { id: 's1' }, body: corpo('u7') })
      ok(`${rota}:card-de-suporte-passa`, r.status === 200 && r.gravou, [r.status, r.body.error])
    }
    {
      // Card de Suporte com o status herdado `em_desenvolvimento` (o quadro
      // de Suporte ainda conhece esse status): a regra é do quadro Dev.
      const r = await chamar(rota, [ATIVO_U7, card({ id: 's1', quadro: 'suporte', status: 'em_desenvolvimento', assigned_to: 'u8' })],
        { params: { id: 's1' }, body: corpo('u7') })
      ok(`${rota}:card-de-suporte-em-desenvolvimento-passa`, r.status === 200 && r.gravou, [r.status, r.body.error])
    }
    {
      // O que a pessoa tem em desenvolvimento NO SUPORTE não ocupa a vaga do Dev.
      const doSuporte = Object.assign({}, ATIVO_U7, { quadro: 'suporte' })
      const r = await chamar(rota, [doSuporte, card({ id: 'c2', status: 'em_desenvolvimento', assigned_to: 'u8' })],
        { params: { id: 'c2' }, body: corpo('u7') })
      ok(`${rota}:card-ativo-de-outro-quadro-nao-conta`, r.status === 200 && r.gravou, [r.status, r.body.error])
    }
  }

  // ── 4. O seletor de responsável do quadro Dev ──────────────────────────
  //
  // A tela manda exatamente o corpo desta função. Sem `force`, a rota recusa
  // com 409 todo card que já tem dono, e trocar o responsável não funcionava.
  {
    const L = await importarTela('lib/kanban-dev.ts')
    const corpo = L.corpoDaTrocaDeResponsavel('u7')
    ok('seletor:o-corpo-pede-a-troca-deliberada', corpo.force === true && corpo.assignee_id === 'u7', corpo)
    ok('seletor:sem-responsavel-vira-null', L.corpoDaTrocaDeResponsavel('').assignee_id === null, L.corpoDaTrocaDeResponsavel(''))
    {
      const r = await chamar('assignPost', [card({ id: 'c2', status: 'backlog', assigned_to: 'u8' })],
        { params: { id: 'c2' }, body: L.corpoDaTrocaDeResponsavel('u7') })
      ok('seletor:troca-o-dono-de-card-que-ja-tem-responsavel', r.status === 200 && r.gravou, [r.status, r.body.error])
    }
    {
      // O `force` não dispensa a regra de um card em desenvolvimento por pessoa.
      const r = await chamar('assignPost', [ATIVO_U7, card({ id: 'c2', status: 'em_desenvolvimento', assigned_to: 'u8' })],
        { params: { id: 'c2' }, body: L.corpoDaTrocaDeResponsavel('u7') })
      ok('seletor:a-troca-deliberada-ainda-respeita-um-por-vez', r.status === 400 && !r.gravou, [r.status, r.body.error])
    }
  }

  fim()
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(1) })
