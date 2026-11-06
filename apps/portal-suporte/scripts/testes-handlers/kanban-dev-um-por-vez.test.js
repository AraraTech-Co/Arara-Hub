// Kanban Dev: um card em Em Desenvolvimento por pessoa, e a coluna Pausado.
//
// Pedido do Leonardo (06/11/2026). Desenho:
// docs/portal-suporte/2026-11-06-kanban-dev-um-por-vez-e-pausado.md
//
// A regra mora no servidor (`POST /dev/tickets/:id/mover`); a tela repete por
// cortesia. Por isso o teste chama o handler EXPORTADO, com o emulador fiel da
// camada (filtro de campo antes do teto de 500), e não lê o código.
//
// Roda com: node kanban-dev-um-por-vez.test.js
const { carregarHandler, carregarContexto, reply, ok, fim } = require('./_carregar.js')
const { camadaFindMany } = require('./_camada.js')
const { registrarTS, importarTela } = require('./_tela.js')

registrarTS()

const MOVER = '393 tickets POST /dev/tickets/:id/mover'

function card(o) {
  return Object.assign({
    ticket_number: 'DEV-' + o.id, quadro: 'dev', status: 'backlog',
    title: 'Card ' + o.id, description: 'o que fazer', updated_at: '2026-11-01T00:00:00.000Z',
  }, o)
}

const PESSOAS = { u7: 'Hefler', u8: 'Eron Felix de Barros', u1: 'Quem move' }

function montar({ cards, id, body }) {
  const linhas = cards.slice()
  const reg = { update: [] }
  return {
    reg, linhas,
    ctx: {
      headers: {}, user: { id: 'u1' }, params: { id }, query: {},
      body: body || {}, reply: reply(),
      models: {
        Profile: {
          findById: async (pid) => (PESSOAS[pid]
            ? { id: pid, role: 'developer', full_name: PESSOAS[pid], feature_grants: [] }
            : null),
        },
        Sessao: { findById: async () => null },
        Ticket: {
          findById: async (tid) => linhas.find((l) => String(l.id) === String(tid)) || null,
          findMany: async (f) => camadaFindMany(linhas, f),
          update: async (tid, d) => {
            reg.update.push({ id: String(tid), dados: d })
            const i = linhas.findIndex((l) => String(l.id) === String(tid))
            if (i >= 0) linhas[i] = Object.assign({}, linhas[i], d)
            return linhas[i]
          },
        },
        ActivityLog: { create: async (d) => d },
        TicketMessage: { create: async () => ({}) },
      },
    },
  }
}

async function mover(cenario) {
  const h = carregarHandler(MOVER)
  const m = montar(cenario)
  let r
  try { r = await h(m.ctx) } catch (e) { r = { status: 'estouro: ' + e.message } }
  const doCard = m.reg.update.filter((u) => u.id === String(cenario.id))
  return { status: r.status, body: r.body || {}, gravou: doCard.length > 0, patch: (doCard[0] || {}).dados || {}, linhas: m.linhas }
}

const ATIVO = card({ id: 'c1', status: 'em_desenvolvimento', assigned_to: 'u7', ticket_number: 'DEV-00012' })

;(async () => {
  // ── 1. Um card em desenvolvimento por pessoa ───────────────────────────
  for (const de of ['backlog', 'pausado', 'teste_reprovado', 'desenvolvimento_finalizado']) {
    const r = await mover({
      id: 'c2', body: { status: 'em_desenvolvimento' },
      cards: [ATIVO, card({ id: 'c2', status: de, assigned_to: 'u7' })],
    })
    ok(`segundo-card-da-mesma-pessoa-recusado:de-${de}`, r.status === 400 && !r.gravou, [r.status, r.gravou])
  }
  {
    const r = await mover({
      id: 'c2', body: { status: 'em_desenvolvimento' },
      cards: [ATIVO, card({ id: 'c2', status: 'backlog', assigned_to: 'u7' })],
    })
    const msg = String(r.body.error || '')
    ok('a-recusa-diz-quem-e-qual-card', msg.includes('Hefler') && msg.includes('DEV-00012'), msg)
    ok('a-recusa-devolve-o-card-ativo', r.body.card_ativo === 'c1', r.body.card_ativo)
  }
  {
    // O responsável que vale é o do card DEPOIS do movimento: o enviado no
    // arraste, quando há.
    const r = await mover({
      id: 'c2', body: { status: 'em_desenvolvimento', assigned_to: 'u7' },
      cards: [ATIVO, card({ id: 'c2', status: 'backlog', assigned_to: null })],
    })
    ok('o-responsavel-enviado-no-arraste-conta', r.status === 400 && !r.gravou, [r.status, r.gravou])
  }
  {
    const r = await mover({
      id: 'c2', body: { status: 'em_desenvolvimento' },
      cards: [ATIVO, card({ id: 'c2', status: 'backlog', assigned_to: 'u8' })],
    })
    ok('pessoas-diferentes-passam', r.status !== 400 && r.gravou && r.patch.status === 'em_desenvolvimento', [r.status, r.body.error])
  }
  {
    const doSuporte = Object.assign({}, ATIVO, { quadro: 'suporte' })
    const r = await mover({
      id: 'c2', body: { status: 'em_desenvolvimento' },
      cards: [doSuporte, card({ id: 'c2', status: 'backlog', assigned_to: 'u7' })],
    })
    ok('card-de-outro-quadro-nao-conta', r.status !== 400 && r.gravou, [r.status, r.body.error])
  }
  {
    // Card migrado tem a primeira movimentação isenta das validações de etapa,
    // mas a regra de um por vez é sobre a PESSOA, não sobre o card.
    const r = await mover({
      id: 'c2', body: { status: 'em_desenvolvimento' },
      cards: [ATIVO, card({ id: 'c2', status: 'backlog', assigned_to: 'u7', migrado: true })],
    })
    ok('card-migrado-tambem-respeita-um-por-vez', r.status === 400 && !r.gravou, [r.status, r.gravou])
  }
  {
    // Mais de 500 cards da mesma pessoa em outros status, criados DEPOIS do
    // ativo: sem filtrar na camada, o ativo cairia fora das 500 mais novas.
    const velhos = [ATIVO]
    for (let i = 0; i < 600; i++) velhos.push(card({ id: 'v' + i, status: 'aplicado_no_cliente', assigned_to: 'u7' }))
    velhos.push(card({ id: 'c2', status: 'backlog', assigned_to: 'u7' }))
    const r = await mover({ id: 'c2', body: { status: 'em_desenvolvimento' }, cards: velhos })
    ok('acima-de-500-cards-da-pessoa-ainda-acha-o-ativo', r.status === 400 && !r.gravou, [r.status, r.gravou])
  }

  // ── 2. Pausado exige motivo ────────────────────────────────────────────
  {
    const r = await mover({ id: 'c1', body: { status: 'pausado' }, cards: [ATIVO] })
    ok('pausar-sem-motivo-recusa', r.status === 400 && !r.gravou, [r.status, r.gravou])
  }
  {
    const r = await mover({ id: 'c1', body: { status: 'pausado', motivo: '   ' }, cards: [ATIVO] })
    ok('pausar-com-motivo-em-branco-recusa', r.status === 400 && !r.gravou, [r.status, r.gravou])
  }
  {
    const r = await mover({ id: 'c1', body: { status: 'pausado', motivo: 'esperando acesso do cliente' }, cards: [ATIVO] })
    const decl = (r.patch.declaracoes || []).slice(-1)[0] || {}
    ok('pausar-com-motivo-grava', r.status !== 400 && r.gravou && r.patch.status === 'pausado', [r.status, r.body.error])
    ok('o-motivo-fica-no-card', r.patch.motivo_pausa === 'esperando acesso do cliente', r.patch.motivo_pausa)
    ok('o-motivo-fica-no-historico', decl.etapa === 'pausado' && decl.texto === 'esperando acesso do cliente', decl)
  }
  {
    const migrado = Object.assign({}, ATIVO, { migrado: true })
    const r = await mover({ id: 'c1', body: { status: 'pausado' }, cards: [migrado] })
    ok('card-migrado-tambem-precisa-do-motivo-para-pausar', r.status === 400 && !r.gravou, [r.status, r.gravou])
  }
  {
    const pausado = card({ id: 'c1', status: 'pausado', assigned_to: 'u7', motivo_pausa: 'esperando acesso' })
    const r = await mover({ id: 'c1', body: { status: 'em_desenvolvimento' }, cards: [pausado] })
    ok('sair-de-pausado-limpa-o-motivo', r.gravou && r.patch.motivo_pausa === null, r.patch)
  }

  // ── 3. Pausar libera a vaga ────────────────────────────────────────────
  {
    const outro = card({ id: 'c2', status: 'backlog', assigned_to: 'u7' })
    const p = await mover({ id: 'c1', body: { status: 'pausado', motivo: 'bloqueado pelo cliente' }, cards: [ATIVO, outro] })
    const r = await mover({ id: 'c2', body: { status: 'em_desenvolvimento' }, cards: p.linhas })
    ok('pausar-libera-a-vaga-da-pessoa', p.gravou && r.status !== 400 && r.gravou, [p.status, r.status, r.body.error])
  }

  // ── 4. O quadro enxerga o card pausado antigo ─────────────────────────
  //
  // Acima de 500 cards, as leituras de chamados consultam status por status, e
  // só descobrem sozinhas o status que aparece nas 500 linhas mais NOVAS. Card
  // antigo pausado (ou reprovado) sem vizinho do mesmo status entre os mais
  // novos sumiria do quadro: por isso os dois estão na lista conhecida.
  for (const [marca, consulta] of [
    ['378 tickets GET /tickets/kanban', { quadro: 'dev' }],
    ['362 tickets GET /tickets', { quadro: 'dev' }],
  ]) {
    for (const st of ['pausado', 'teste_reprovado']) {
      const linhas = [card({ id: 'antigo', status: st, assigned_to: 'u7' })]
      for (let i = 0; i < 600; i++) linhas.push(card({ id: 'n' + i, status: 'aplicado_no_cliente' }))
      const m = montar({ cards: linhas, id: 'x' })
      m.ctx.query = consulta
      m.ctx.params = {}
      let corpo = ''
      try { corpo = JSON.stringify((await carregarHandler(marca)(m.ctx)).body || {}) } catch (e) { corpo = 'estouro: ' + e.message }
      ok(`${marca.split(' ').slice(-1)[0]}:card-${st}-antigo-aparece-acima-de-500`, corpo.includes('"antigo"'), corpo.slice(0, 120))
    }
  }

  // ── 5. A tela: a mesma conta, e o espelho do servidor ──────────────────
  {
    const L = await importarTela('lib/kanban-dev.ts')
    const cs = [
      { id: 'c1', status: 'em_desenvolvimento', assignee: { id: 'u7' } },
      { id: 'c3', status: 'pausado', assignee: { id: 'u8' } },
      { id: 'c4', status: 'em_desenvolvimento', assignee: { id: 'u9' } },
    ]
    const ativo = L.cardAtivoDaPessoa(cs, 'u7', 'c2')
    ok('tela:acha-o-card-ativo-da-pessoa', ativo && ativo.id === 'c1', ativo)
    ok('tela:o-proprio-card-nao-conta', L.cardAtivoDaPessoa(cs, 'u7', 'c1') === null, null)
    ok('tela:card-pausado-nao-ocupa-a-vaga', L.cardAtivoDaPessoa(cs, 'u8', 'c2') === null, null)
    ok('tela:sem-responsavel-nao-confere', L.cardAtivoDaPessoa(cs, '', 'c2') === null, null)

    // O espelho: a tela só oferece o que o servidor aceita.
    const srv = carregarContexto(MOVER).TRANSICOES
    for (const st of ['em_desenvolvimento', 'pausado']) {
      ok(`tela:transicoes-de-${st}-iguais-as-do-servidor`,
        JSON.stringify((L.DEV_TRANSICOES[st] || []).slice().sort()) === JSON.stringify((srv[st] || []).slice().sort()),
        { tela: L.DEV_TRANSICOES[st], servidor: srv[st] })
    }
    ok('tela:pausado-pede-motivo', !!(L.DEV_EXIGE.pausado && L.DEV_EXIGE.pausado.motivo), L.DEV_EXIGE.pausado)
    ok('tela:pausado-tem-coluna-depois-de-em-desenvolvimento',
      L.DEV_COLUNAS.findIndex((c) => c.id === 'pausado') === L.DEV_COLUNAS.findIndex((c) => c.id === 'em_desenvolvimento') + 1,
      L.DEV_COLUNAS.map((c) => c.id))
  }

  fim()
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(1) })
