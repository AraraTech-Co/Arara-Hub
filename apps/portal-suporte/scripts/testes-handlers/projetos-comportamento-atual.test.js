// T9 — caracterização do comportamento ATUAL do módulo de Projetos.
//
// Não é teste de regra desejada. É o retrato do que o código faz HOJE, escrito
// ANTES de mexer nele, para que qualquer entrega seguinte mostre o que mudou em
// vez de afirmar. Dois grupos de caso convivem aqui de propósito:
//
//   - `atual conhecido:` — defeito já catalogado (§3.8 do plano técnico de
//     28/10/2026). Está afirmado como ESTÁ, não como deveria ser. Quando um
//     desses casos falhar, o defeito foi corrigido: o caso muda junto, não se
//     apaga.
//   - `vai sair:` — comportamento que as decisões B e D do Leonardo retiram
//     (Projetos independente do card Dev). Hoje é verdade e precisa estar
//     provado; na entrega da transição estes casos viram o oposto.
//
// O relógio é FIXO (`hoje` = 2026-03-10). Sem isso "atrasado" muda de resultado
// conforme o dia em que o teste roda, e um retrato que muda sozinho não é
// retrato. A fixação é conferida por contraprova no primeiro caso.
const { carregarHandlerEContexto, reply, ok, fim } = require('./_carregar.js')
const { camadaFindMany } = require('./_camada.js')

const HOJE = '2026-03-10'
const AGORA = HOJE + 'T12:00:00.000Z'

/** Handler com o Date do contexto trocado por um de "hoje" fixo. */
function carregar(marca) {
  const { handler, contexto } = carregarHandlerEContexto(marca)
  const Real = contexto.Date
  class Fixa extends Real {
    constructor(...a) { if (a.length === 0) super(AGORA); else super(...a) }
    static now() { return new Real(AGORA).getTime() }
  }
  contexto.Date = Fixa
  return { handler, contexto }
}

/**
 * `ctx` falso que REGISTRA toda escrita. É o registro que prova a parte difícil
 * de um teste de permissão: não que a resposta foi 403, e sim que nada foi
 * gravado junto com o 403.
 */
function montar(o) {
  const reg = { update: [], create: [], delete: [], findMany: [] }
  const perfil = o.perfil === null ? null : (o.perfil || { role: 'admin', feature_grants: [] })
  const tickets = (o.tickets || []).slice()
  const fases = (o.fases || []).slice()
  const deps = (o.deps || []).slice()

  function modelo(nome, linhas) {
    return {
      findById: async (id) => linhas.find((l) => String(l.id) === String(id)) || null,
      findMany: async (f) => { reg.findMany.push({ modelo: nome, filtro: f }); return camadaFindMany(linhas, f) },
      create: async (d) => { reg.create.push({ modelo: nome, dados: d }); linhas.push(d); return d },
      update: async (id, d) => {
        reg.update.push({ modelo: nome, id: String(id), dados: d })
        const i = linhas.findIndex((l) => String(l.id) === String(id))
        if (i >= 0) linhas[i] = Object.assign({}, linhas[i], d)
        return linhas[i]
      },
      delete: async (id) => {
        reg.delete.push({ modelo: nome, id: String(id) })
        const i = linhas.findIndex((l) => String(l.id) === String(id))
        if (i >= 0) linhas.splice(i, 1)
        return true
      },
    }
  }

  const ctx = {
    headers: {},
    user: o.semSessao ? {} : { id: 'u1' },
    params: o.params || {},
    query: o.query || {},
    body: o.body || {},
    reply: reply(),
    models: {
      Profile: { findById: async () => (perfil ? Object.assign({ id: 'u1' }, perfil) : null) },
      Sessao: { findById: async () => null },
      Projeto: modelo('Projeto', o.projetos || [{ id: 'p1', nome: 'Projeto 1', created_at: '2026-01-01T00:00:00.000Z' }]),
      Ticket: modelo('Ticket', tickets),
      ProjetoFase: modelo('ProjetoFase', fases),
      ProjetoMembro: modelo('ProjetoMembro', o.membros || []),
      ProjetoMarco: modelo('ProjetoMarco', o.marcos || []),
      CardDependencia: modelo('CardDependencia', deps),
      ActivityLog: modelo('ActivityLog', []),
      TicketSequence: modelo('TicketSequence', []),
    },
  }
  return { ctx, reg, tickets, fases, deps }
}

/** Card com os campos que o planejamento lê. */
function card(o) {
  return {
    id: o.id, ticket_number: o.num || 1, title: o.t || 'card', quadro: o.quadro || 'dev',
    status: o.status || 'backlog', projeto_id: o.proj === undefined ? 'p1' : o.proj,
    fase_id: o.fase || '', inicio_planejado: o.ini || '', previsao_entrega: o.fim || '',
    estimativa_min: o.est || 0, progresso: o.prog === undefined ? null : o.prog,
    created_at: o.criado || '2026-01-01T00:00:00.000Z', updated_at: o.atualizado || '2026-02-01T00:00:00.000Z',
  }
}

/** Escritas em Ticket registradas — é o que as decisões B e D vão proibir. */
function escritasEmTicket(reg) {
  return reg.update.filter((u) => u.modelo === 'Ticket')
}

async function roda() {
  // ───────────────────────────────────────────────────────────────────────────
  // 1. Relógio fixo, com contraprova
  // ───────────────────────────────────────────────────────────────────────────
  {
    const { handler } = carregar('293 projetos GET /projetos/:id')
    const { ctx } = montar({
      params: { id: 'p1' },
      tickets: [card({ id: 't1', fim: '2026-03-09' }), card({ id: 't2', fim: '2026-03-11' })],
    })
    const r = await handler(ctx)
    // Um prazo antes de 2026-03-10 e um depois. Com o relógio do dia em que o
    // teste roda, os DOIS estariam no passado e a conta daria 2 — este 1 é a
    // prova de que o relógio fixado valeu.
    ok('relogio-fixo-vale', r.body.data.cards_atrasados === 1, r.body.data.cards_atrasados)
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Permissão de LEITURA do módulo (`_podeVer`): developer+ ou grant `qa`
  // ───────────────────────────────────────────────────────────────────────────
  {
    const casos = [
      ['user', { role: 'user', feature_grants: [] }, 403],
      ['support', { role: 'support', feature_grants: [] }, 403],
      ['support+qa', { role: 'support', feature_grants: ['qa'] }, 200],
      ['developer', { role: 'developer', feature_grants: [] }, 200],
      ['admin', { role: 'admin', feature_grants: [] }, 200],
      ['master', { role: 'master', feature_grants: [] }, 200],
    ]
    for (const [nome, perfil, esperado] of casos) {
      const { handler } = carregar('292 projetos GET /projetos')
      const { ctx } = montar({ perfil })
      const r = await handler(ctx)
      ok('ver-lista:' + nome, r.status === esperado, { nome, status: r.status, esperado })
    }
    // Era o item 5 da §3.8: quem tinha só `planejamento` GRAVAVA no módulo e
    // não o VIA. Corrigido por decisão do Leonardo em 29/10 ("libera a
    // lista") — este caso passou a afirmar a regra nova, e é ele que impede o
    // defeito de voltar.
    const { handler } = carregar('292 projetos GET /projetos')
    const { ctx } = montar({ perfil: { role: 'support', feature_grants: ['planejamento'] } })
    const r = await handler(ctx)
    ok('planejamento-sozinho-agora-ve', r.status === 200, r.status)
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Sem sessão: 401 antes de qualquer leitura
  // ───────────────────────────────────────────────────────────────────────────
  {
    const { handler } = carregar('292 projetos GET /projetos')
    const { ctx, reg } = montar({ semSessao: true, perfil: null })
    const r = await handler(ctx)
    ok('sem-sessao-401', r.status === 401, r.status)
    ok('sem-sessao-nao-leu-projeto', !reg.findMany.some((f) => f.modelo === 'Projeto'), reg.findMany)
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Permissão de PLANEJAMENTO (`_podePlanejar`): admin ou grant `planejamento`
  // ───────────────────────────────────────────────────────────────────────────
  {
    const casos = [
      ['developer', { role: 'developer', feature_grants: [] }, 403],
      ['developer+qa', { role: 'developer', feature_grants: ['qa'] }, 403],
      // Criar fase responde 201, não 200.
      ['support+planejamento', { role: 'support', feature_grants: ['planejamento'] }, 201],
      ['admin', { role: 'admin', feature_grants: [] }, 201],
    ]
    for (const [nome, perfil, esperado] of casos) {
      const { handler } = carregar('302 projetos POST /projetos/:id/fases')
      const { ctx } = montar({ perfil, params: { id: 'p1' }, body: { nome: 'Fase 1' } })
      const r = await handler(ctx)
      ok('criar-fase:' + nome, r.status === esperado, { nome, status: r.status, esperado })
    }
    // As duas portas não coincidem, e isto é DERIVADO dos status, não afirmado:
    // o developer vê o módulo e não cria fase; o support com `planejamento`
    // cria fase e não vê o módulo. Um `ok(..., true)` aqui não poderia falhar,
    // e asserção que não pode falhar não é prova de nada.
    const porta = {}
    for (const [quem, perfil] of [
      ['developer', { role: 'developer', feature_grants: [] }],
      ['support+planejamento', { role: 'support', feature_grants: ['planejamento'] }],
    ]) {
      const a = carregar('292 projetos GET /projetos')
      const ma = montar({ perfil })
      porta[quem + '/ver'] = (await a.handler(ma.ctx)).status

      const b = carregar('302 projetos POST /projetos/:id/fases')
      const mb = montar({ perfil, params: { id: 'p1' }, body: { nome: 'Fase 1' } })
      porta[quem + '/planejar'] = (await b.handler(mb.ctx)).status
    }
    // As duas portas continuam DIFERENTES, mas não são mais independentes:
  // planejar implica ver (29/10), e ver não implica planejar. O developer
  // enxerga o módulo e não planeja; quem planeja faz as duas coisas.
  ok('planejar-implica-ver-mas-ver-nao-implica-planejar',
      porta['developer/ver'] === 200 && porta['developer/planejar'] === 403 &&
      porta['support+planejamento/ver'] === 200 && porta['support+planejamento/planejar'] === 201,
      porta)
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Permissão de MEXER NO CARD (`_podeMexerNoCard`): developer+ ou `planejamento`
  // ───────────────────────────────────────────────────────────────────────────
  {
    const casos = [
      ['support', { role: 'support', feature_grants: [] }, 403],
      ['support+qa', { role: 'support', feature_grants: ['qa'] }, 403],
      ['support+planejamento', { role: 'support', feature_grants: ['planejamento'] }, 200],
      ['developer', { role: 'developer', feature_grants: [] }, 200],
    ]
    for (const [nome, perfil, esperado] of casos) {
      const { handler } = carregar('300 projetos POST /projetos/:id/cards')
      const { ctx } = montar({ perfil, params: { id: 'p1' }, body: { ticket_id: 't1' }, tickets: [card({ id: 't1', proj: '' })] })
      const r = await handler(ctx)
      ok('pendurar-card:' + nome, r.status === esperado, { nome, status: r.status, esperado })
    }
    // §3.8 item 4: a tela só oferece "Pendurar cards" a quem planeja; o
    // servidor aceita de qualquer developer. A tela é mais restrita que a rota.
    const { handler } = carregar('300 projetos POST /projetos/:id/cards')
    const { ctx, reg } = montar({
      perfil: { role: 'developer', feature_grants: [] },
      params: { id: 'p1' }, body: { ticket_id: 't1' }, tickets: [card({ id: 't1', proj: '' })],
    })
    const r = await handler(ctx)
    ok('atual conhecido: developer-pendura-sem-planejamento', r.status === 200 && escritasEmTicket(reg).length === 1, { status: r.status, escritas: escritasEmTicket(reg).length })
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 6. Recusa não grava
  // ───────────────────────────────────────────────────────────────────────────
  {
    for (const [marca, params, body] of [
      ['300 projetos POST /projetos/:id/cards', { id: 'p1' }, { ticket_id: 't1' }],
      ['296 projetos PATCH /projetos/:id/cards/:tid', { id: 'p1', tid: 't1' }, { estimativa_min: 90 }],
      ['287 projetos DELETE /projetos/:id/cards/:tid', { id: 'p1', tid: 't1' }, {}],
      ['289 projetos DELETE /projetos/:id/fases/:fid', { id: 'p1', fid: 'f1' }, {}],
    ]) {
      const { handler } = carregar(marca)
      const { ctx, reg } = montar({
        perfil: { role: 'user', feature_grants: [] }, params, body,
        tickets: [card({ id: 't1', fase: 'f1' })],
        fases: [{ id: 'f1', projeto_id: 'p1', nome: 'F', ordem: 1 }],
        deps: [{ id: 'd1', projeto_id: 'p1', origem_ticket_id: 't1', destino_ticket_id: 't2' }],
      })
      const r = await handler(ctx)
      const nome = marca.split(' ')[0]
      ok('recusa-403:' + nome, r.status === 403, { nome, status: r.status })
      ok('recusa-nao-grava:' + nome, reg.update.length === 0 && reg.delete.length === 0 && reg.create.length === 0, { nome, reg })
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 7. Progresso: média ponderada pela estimativa, `descartado` fora do total
  // ───────────────────────────────────────────────────────────────────────────
  {
    const casos = [
      ['sem-cards', [], 0],
      ['um-em-desenvolvimento', [card({ id: 'a', status: 'em_desenvolvimento' })], 25],
      ['dois-sem-estimativa-pesam-igual', [card({ id: 'a', status: 'backlog' }), card({ id: 'b', status: 'aplicado_no_cliente' })], 50],
      // 480 min a 0% e 60 min a 100%: (0*480 + 100*60) / 540 = 11,1 → 11.
      ['estimativa-pondera', [card({ id: 'a', status: 'backlog', est: 480 }), card({ id: 'b', status: 'aplicado_no_cliente', est: 60 })], 11],
      // `descartado` sai do denominador, senão descartar trabalho morto
      // DERRUBARIA o progresso do projeto.
      ['descartado-fora-do-total', [card({ id: 'a', status: 'aplicado_no_cliente' }), card({ id: 'b', status: 'descartado' })], 100],
      ['tudo-descartado-da-zero', [card({ id: 'a', status: 'descartado' })], 0],
      // `progresso` preenchido vence o status.
      ['progresso-manual-vence', [card({ id: 'a', status: 'backlog', prog: 42 })], 42],
      ['progresso-manual-acima-de-100-corta', [card({ id: 'a', status: 'backlog', prog: 150 })], 100],
      ['status-desconhecido-vale-zero', [card({ id: 'a', status: 'inventado' })], 0],
      // O servidor conhece `em_revisao`; a tela, não (caso 12).
      ['em-revisao-no-servidor', [card({ id: 'a', status: 'em_revisao' })], 60],
    ]
    for (const [nome, tickets, esperado] of casos) {
      const { handler } = carregar('293 projetos GET /projetos/:id')
      const { ctx } = montar({ params: { id: 'p1' }, tickets })
      const r = await handler(ctx)
      ok('progresso:' + nome, r.body.data.progresso === esperado, { nome, deu: r.body.data.progresso, esperado })
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 8. Atraso: "hoje" do SERVIDOR, em UTC (§3.8 item 1)
  // ───────────────────────────────────────────────────────────────────────────
  {
    const casos = [
      ['prazo-ontem', card({ id: 'a', fim: '2026-03-09' }), true],
      ['prazo-hoje-nao-atrasa', card({ id: 'a', fim: HOJE }), false],
      ['prazo-amanha', card({ id: 'a', fim: '2026-03-11' }), false],
      ['sem-prazo', card({ id: 'a', fim: '' }), false],
      ['aplicado-no-cliente-nunca-atrasa', card({ id: 'a', fim: '2026-01-01', status: 'aplicado_no_cliente' }), false],
      ['descartado-nunca-atrasa', card({ id: 'a', fim: '2026-01-01', status: 'descartado' }), false],
    ]
    for (const [nome, t, esperado] of casos) {
      const { handler } = carregar('293 projetos GET /projetos/:id')
      const { ctx } = montar({ params: { id: 'p1' }, tickets: [t] })
      const r = await handler(ctx)
      ok('atraso:' + nome, r.body.data.cards[0].atrasado === esperado, { nome, deu: r.body.data.cards[0].atrasado, esperado })
    }
    // O corte é a data UTC do servidor. Às 23h de Brasília do dia 09 já é dia
    // 10 em UTC, e um prazo de 09 aparece atrasado antes de o dia acabar para
    // quem está olhando. É o §3.8 item 1, afirmado como ESTÁ.
    const { handler, contexto } = carregarHandlerEContexto('293 projetos GET /projetos/:id')
    const Real = contexto.Date
    class Virada extends Real {
      constructor(...a) { if (a.length === 0) super('2026-03-10T02:00:00.000Z'); else super(...a) }
      static now() { return new Real('2026-03-10T02:00:00.000Z').getTime() }
    }
    contexto.Date = Virada
    const { ctx } = montar({ params: { id: 'p1' }, tickets: [card({ id: 'a', fim: '2026-03-09' })] })
    const r = await handler(ctx)
    ok('atual conhecido: corte-usa-utc-do-servidor', r.body.data.cards[0].atrasado === true, r.body.data.cards[0])
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 9. A tela não conhece `em_revisao` (§3.8 item 2)
  // ───────────────────────────────────────────────────────────────────────────
  {
    const fs = require('fs')
    const path = require('path')
    const arq = path.resolve(__dirname, '../../app/lib/projetos.ts')
    const texto = fs.readFileSync(arq, 'utf8')
    // Recorta o literal pela âncora da declaração, não por busca de palavra: o
    // comentário acima dela também fala de progresso e de status.
    const at = texto.indexOf('export const PROGRESSO_POR_STATUS')
    const fecha = texto.indexOf('\n}', at)
    ok('tela-tem-o-mapa-de-progresso', at >= 0 && fecha > at, { at, fecha })
    const bloco = texto.slice(at, fecha)
    const chavesTela = (bloco.match(/^\s{2}(\w+):/gm) || []).map((s) => s.trim().replace(':', '')).sort()

    const { contexto } = carregar('293 projetos GET /projetos/:id')
    const chavesServidor = Object.keys(contexto._PCT).sort()
    ok('servidor-expoe-o-mapa', chavesServidor.length === 10, chavesServidor)

    const faltando = chavesServidor.filter((k) => !chavesTela.includes(k))
    ok('atual conhecido: tela-nao-tem-em-revisao', faltando.length === 1 && faltando[0] === 'em_revisao', { faltando, chavesTela })
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 10. vai sair: pendurar card GRAVA no card Dev
  // ───────────────────────────────────────────────────────────────────────────
  {
    const { handler } = carregar('300 projetos POST /projetos/:id/cards')
    const { ctx, reg } = montar({
      params: { id: 'p1' }, body: { ticket_id: 't1', fase_id: 'f1' },
      tickets: [card({ id: 't1', proj: '' })],
      fases: [{ id: 'f1', projeto_id: 'p1', nome: 'F', ordem: 1 }],
    })
    const r = await handler(ctx)
    const esc = escritasEmTicket(reg)
    ok('vai sair: pendurar-grava-no-card', r.status === 200 && esc.length === 1 && esc[0].dados.projeto_id === 'p1' && esc[0].dados.fase_id === 'f1', { status: r.status, esc })
    ok('vai sair: pendurar-registra-no-activitylog', reg.create.some((c) => c.modelo === 'ActivityLog' && c.dados.action === 'card_no_projeto'), reg.create)
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 11. atual conhecido: pendurar aceita QUALQUER Ticket (§3.8 item 3)
  // ───────────────────────────────────────────────────────────────────────────
  {
    const { handler } = carregar('300 projetos POST /projetos/:id/cards')
    const { ctx, reg } = montar({
      params: { id: 'p1' }, body: { ticket_id: 't9' },
      // Chamado de SUPORTE, não card do quadro Dev.
      tickets: [Object.assign(card({ id: 't9', proj: '' }), { quadro: 'suporte' })],
    })
    const r = await handler(ctx)
    ok('atual conhecido: pendura-chamado-de-suporte', escritasEmTicket(reg).length === 1 && r.body.data.vinculados === 1, { reg: escritasEmTicket(reg), body: r.body })
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 12. vai sair: planejar card grava os campos de planejamento no card Dev
  // ───────────────────────────────────────────────────────────────────────────
  {
    const { handler } = carregar('296 projetos PATCH /projetos/:id/cards/:tid')
    const { ctx, reg } = montar({
      params: { id: 'p1', tid: 't1' },
      body: { inicio_planejado: '2026-04-01', previsao_entrega: '2026-04-30', estimativa_min: 90.6 },
      tickets: [card({ id: 't1' })],
    })
    const r = await handler(ctx)
    const esc = escritasEmTicket(reg)
    ok('vai sair: planejar-grava-no-card', esc.length === 1 && esc[0].dados.inicio_planejado === '2026-04-01' && esc[0].dados.previsao_entrega === '2026-04-30', { esc })
    ok('planejar-arredonda-estimativa', esc.length === 1 && esc[0].dados.estimativa_min === 91, { esc })
    ok('planejar-devolve-o-card', r.body && r.body.success === true && r.body.data.id === 't1', r.body)
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 13. Validação do planejamento: data, janela e progresso
  // ───────────────────────────────────────────────────────────────────────────
  {
    const casos = [
      ['data-fora-do-formato', { previsao_entrega: '30/04/2026' }, 400],
      ['fim-antes-do-inicio', { inicio_planejado: '2026-04-30', previsao_entrega: '2026-04-01' }, 400],
      ['estimativa-negativa', { estimativa_min: -1 }, 400],
      ['progresso-acima-de-100', { progresso: 101 }, 400],
      ['fase-de-outro-projeto', { fase_id: 'fx' }, 400],
      ['janela-valida', { inicio_planejado: '2026-04-01', previsao_entrega: '2026-04-30' }, 200],
    ]
    for (const [nome, body, esperado] of casos) {
      const { handler } = carregar('296 projetos PATCH /projetos/:id/cards/:tid')
      const { ctx, reg } = montar({
        params: { id: 'p1', tid: 't1' }, body,
        tickets: [card({ id: 't1' })],
        fases: [{ id: 'fx', projeto_id: 'OUTRO', nome: 'F', ordem: 1 }],
      })
      const r = await handler(ctx)
      ok('planejar-valida:' + nome, r.status === esperado, { nome, status: r.status, esperado })
      if (esperado === 400) {
        ok('planejar-valida-nao-grava:' + nome, escritasEmTicket(reg).length === 0, { nome, esc: escritasEmTicket(reg) })
      }
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 14. atual conhecido: concorrência otimista é OPCIONAL (§3.8 item 7)
  // ───────────────────────────────────────────────────────────────────────────
  {
    // Mandando o `updated_at` que leu, e sendo ele velho, a rota recusa.
    const { handler } = carregar('296 projetos PATCH /projetos/:id/cards/:tid')
    const { ctx, reg } = montar({
      params: { id: 'p1', tid: 't1' },
      body: { estimativa_min: 10, updated_at: '2026-01-01T00:00:00.000Z' },
      tickets: [card({ id: 't1', atualizado: '2026-02-01T00:00:00.000Z' })],
    })
    const r = await handler(ctx)
    ok('conflito-detectado-quando-informado', r.status === 409 && escritasEmTicket(reg).length === 0, { status: r.status, esc: escritasEmTicket(reg) })

    // NÃO mandando nada, a mesma edição passa por cima da versão atual.
    const b = carregar('296 projetos PATCH /projetos/:id/cards/:tid')
    const m = montar({
      params: { id: 'p1', tid: 't1' }, body: { estimativa_min: 10 },
      tickets: [card({ id: 't1', atualizado: '2026-02-01T00:00:00.000Z' })],
    })
    const r2 = await b.handler(m.ctx)
    ok('atual conhecido: sem-updated_at-grava-sem-checar', r2.status === 200 && escritasEmTicket(m.reg).length === 1, { status: r2.status, esc: escritasEmTicket(m.reg) })
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 15. vai sair: soltar card limpa o vínculo E APAGA as dependências
  // ───────────────────────────────────────────────────────────────────────────
  {
    const { handler } = carregar('287 projetos DELETE /projetos/:id/cards/:tid')
    const { ctx, reg } = montar({
      params: { id: 'p1', tid: 't1' },
      tickets: [card({ id: 't1', fase: 'f1' })],
      deps: [
        { id: 'd1', projeto_id: 'p1', origem_ticket_id: 't1', destino_ticket_id: 't2' },
        { id: 'd2', projeto_id: 'p1', origem_ticket_id: 't3', destino_ticket_id: 't1' },
        { id: 'd3', projeto_id: 'p1', origem_ticket_id: 't3', destino_ticket_id: 't4' },
      ],
    })
    const r = await handler(ctx)
    const esc = escritasEmTicket(reg)
    ok('vai sair: soltar-limpa-o-vinculo', esc.length === 1 && esc[0].dados.projeto_id === '' && esc[0].dados.fase_id === '', { esc })
    const apagadas = reg.delete.filter((d) => d.modelo === 'CardDependencia').map((d) => d.id).sort()
    ok('vai sair: soltar-apaga-dependencias-do-card', apagadas.join(',') === 'd1,d2', apagadas)
    ok('soltar-nao-apaga-dependencia-alheia', !apagadas.includes('d3'), apagadas)
    ok('soltar-informa-quantas-apagou', r.body.data.dependencias_apagadas === 2, r.body)
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 16. vai sair: apagar fase limpa o `fase_id` dos cards dela
  // ───────────────────────────────────────────────────────────────────────────
  {
    const { handler } = carregar('289 projetos DELETE /projetos/:id/fases/:fid')
    const { ctx, reg } = montar({
      params: { id: 'p1', fid: 'f1' },
      fases: [{ id: 'f1', projeto_id: 'p1', nome: 'Fase 1', ordem: 1 }],
      tickets: [card({ id: 't1', fase: 'f1' }), card({ id: 't2', fase: 'f1' }), card({ id: 't3', fase: 'f2' })],
    })
    const r = await handler(ctx)
    const esc = escritasEmTicket(reg)
    ok('vai sair: apagar-fase-limpa-fase_id-dos-cards', esc.length === 2 && esc.every((u) => u.dados.fase_id === ''), { esc })
    ok('apagar-fase-nao-toca-card-de-outra-fase', !esc.some((u) => u.id === 't3'), esc)
    ok('apagar-fase-apaga-a-fase', reg.delete.some((d) => d.modelo === 'ProjetoFase' && d.id === 'f1'), reg.delete)
    ok('apagar-fase-informa-quantos-soltou', r.body.data.cards_soltos === 2, r.body)
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 17. Fases: datas derivadas dos cards, salvo `datas_manuais`
  // ───────────────────────────────────────────────────────────────────────────
  {
    const { handler } = carregar('293 projetos GET /projetos/:id')
    const { ctx, reg } = montar({
      params: { id: 'p1' },
      fases: [
        { id: 'f1', projeto_id: 'p1', nome: 'Derivada', ordem: 2 },
        { id: 'f2', projeto_id: 'p1', nome: 'Fixada', ordem: 1, datas_manuais: true, inicio_planejado: '2026-05-01', fim_planejado: '2026-05-31' },
      ],
      tickets: [
        card({ id: 't1', fase: 'f1', ini: '2026-04-10', fim: '2026-04-20' }),
        card({ id: 't2', fase: 'f1', ini: '2026-04-05', fim: '2026-04-15' }),
        card({ id: 't3', fase: 'f2', ini: '2026-06-01', fim: '2026-06-30' }),
      ],
    })
    const r = await handler(ctx)
    const fs_ = r.body.data.fases
    ok('fases-saem-por-ordem', fs_.map((f) => f.id).join(',') === 'f2,f1', fs_.map((f) => f.id))
    const derivada = fs_.find((f) => f.id === 'f1')
    ok('fase-deriva-janela-dos-cards', derivada.inicio_efetivo === '2026-04-05' && derivada.fim_efetivo === '2026-04-20', derivada)
    const fixada = fs_.find((f) => f.id === 'f2')
    ok('fase-com-datas_manuais-ignora-os-cards', fixada.inicio_efetivo === '2026-05-01' && fixada.fim_efetivo === '2026-05-31', fixada)
    ok('fase-conta-os-proprios-cards', derivada.total_cards === 2 && fixada.total_cards === 1, fs_)
    // Nenhuma data derivada é gravada: a derivação é só de leitura.
    ok('derivacao-nao-grava-em-ProjetoFase', !reg.update.some((u) => u.modelo === 'ProjetoFase'), reg.update)
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 18. atual conhecido: a lista lê Ticket uma vez POR PROJETO, sem `limit`
  //     (§3.8 item 6)
  // ───────────────────────────────────────────────────────────────────────────
  {
    const { handler } = carregar('292 projetos GET /projetos')
    const { ctx, reg } = montar({
      projetos: [
        { id: 'p1', nome: 'A', created_at: '2026-01-01T00:00:00.000Z' },
        { id: 'p2', nome: 'B', created_at: '2026-02-01T00:00:00.000Z' },
        { id: 'p3', nome: 'C', created_at: '2026-03-01T00:00:00.000Z' },
      ],
      tickets: [card({ id: 't1', proj: 'p1' }), card({ id: 't2', proj: 'p2' })],
    })
    const r = await handler(ctx)
    const leiturasDeTicket = reg.findMany.filter((f) => f.modelo === 'Ticket')
    ok('atual conhecido: uma-leitura-de-ticket-por-projeto', leiturasDeTicket.length === 3, leiturasDeTicket.length)
    ok('atual conhecido: leitura-de-ticket-sem-limit', leiturasDeTicket.every((f) => f.filtro.limit === undefined), leiturasDeTicket)
    ok('lista-ordena-do-mais-novo-para-o-mais-velho', r.body.data.map((p) => p.id).join(',') === 'p3,p2,p1', r.body.data.map((p) => p.id))
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 19. Lista: arquivado só quando pedido
  // ───────────────────────────────────────────────────────────────────────────
  {
    const projetos = [
      { id: 'p1', nome: 'Vivo', created_at: '2026-01-01T00:00:00.000Z' },
      { id: 'p2', nome: 'Arquivado', created_at: '2026-02-01T00:00:00.000Z', arquivado_em: '2026-02-15T00:00:00.000Z' },
    ]
    const a = carregar('292 projetos GET /projetos')
    const ma = montar({ projetos })
    const ra = await a.handler(ma.ctx)
    ok('lista-esconde-arquivado', ra.body.data.map((p) => p.id).join(',') === 'p1', ra.body.data.map((p) => p.id))

    const b = carregar('292 projetos GET /projetos')
    const mb = montar({ projetos, query: { arquivados: '1' } })
    const rb = await b.handler(mb.ctx)
    ok('lista-mostra-so-arquivado-quando-pedido', rb.body.data.map((p) => p.id).join(',') === 'p2', rb.body.data.map((p) => p.id))
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 20. Projeto inexistente: 404 sem gravar
  // ───────────────────────────────────────────────────────────────────────────
  {
    const { handler } = carregar('300 projetos POST /projetos/:id/cards')
    const { ctx, reg } = montar({
      params: { id: 'NAO_EXISTE' }, body: { ticket_id: 't1' },
      tickets: [card({ id: 't1', proj: '' })],
    })
    const r = await handler(ctx)
    ok('projeto-inexistente-404', r.status === 404, r.status)
    ok('projeto-inexistente-nao-grava', escritasEmTicket(reg).length === 0, reg.update)
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 21b. atual conhecido: o lote grava o que já passou antes de recusar
  // ───────────────────────────────────────────────────────────────────────────
  {
    const { handler } = carregar('300 projetos POST /projetos/:id/cards')
    const { ctx, reg } = montar({
      params: { id: 'p1' }, body: { ticket_ids: ['t1', 't2', 't3'] },
      tickets: [
        card({ id: 't1', proj: '' }),
        card({ id: 't2', proj: 'OUTRO' }),
        card({ id: 't3', proj: '' }),
      ],
    })
    const r = await handler(ctx)
    const esc = escritasEmTicket(reg)
    // `t1` já foi gravado quando `t2` derrubou a chamada, e `t3` não chegou a
    // ser visto. A recusa é parcial: o 409 não desfaz o que passou antes dele.
    ok('atual conhecido: lote-grava-antes-do-409', r.status === 409 && esc.length === 1 && esc[0].id === 't1', { status: r.status, esc })
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 21c. atual conhecido: card inexistente é pulado em silêncio
  // ───────────────────────────────────────────────────────────────────────────
  {
    const { handler } = carregar('300 projetos POST /projetos/:id/cards')
    const { ctx, reg } = montar({
      params: { id: 'p1' }, body: { ticket_ids: ['NAO_EXISTE', 't1'] },
      tickets: [card({ id: 't1', proj: '' })],
    })
    const r = await handler(ctx)
    // Sucesso com `vinculados: 1` de dois pedidos: quem chamou não tem como
    // saber que um dos ids não existia.
    ok('atual conhecido: card-inexistente-pulado-em-silencio', r.status === 200 && r.body.data.vinculados === 1 && r.body.data.ids.join(',') === 't1', r.body)
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 21. Card já de outro projeto: 409
  // ───────────────────────────────────────────────────────────────────────────
  {
    const { handler } = carregar('300 projetos POST /projetos/:id/cards')
    const { ctx, reg } = montar({
      params: { id: 'p1' }, body: { ticket_id: 't1' },
      tickets: [card({ id: 't1', proj: 'OUTRO' })],
    })
    const r = await handler(ctx)
    ok('card-de-outro-projeto-409', r.status === 409, r.status)
    ok('card-de-outro-projeto-nao-grava', escritasEmTicket(reg).length === 0, reg.update)
  }

  fim()
}

roda().catch((e) => { console.log('ERRO', e && e.stack || e); process.exit(1) })
