// Etapa 2 — atividades próprias do projeto: as três rotas novas do módulo
// `projetos` (`scripts/projetos-atividades.py`).
//
// O que estes casos existem para provar, em ordem de importância:
//
//   1. a atividade NUNCA toca `Ticket`, `CardDependencia` nem `ActivityLog` —
//      é a decisão B do Leonardo, e é a única parte desta entrega que, se
//      estiver errada, estraga dado que não é do módulo;
//   2. toda recusa sai sem gravar;
//   3. o projeto é o da URL e a fase é do mesmo projeto;
//   4. o resumo não mente: ou é a lista inteira, ou a rota recusa.
//
// Os valores de negócio (colunas, fórmula do progresso, campos do cadastro) são
// PROTÓTIPO autorizado, não regra aprovada. Os casos que dependem deles estão
// marcados `prototipo:` para que trocar a decisão não pareça defeito.
const { carregarHandlerEContexto, reply, ok, fim } = require('./_carregar.js')
const { camadaFindMany } = require('./_camada.js')

const HOJE = '2026-03-10'
const AGORA = HOJE + 'T12:00:00.000Z'

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

const LISTAR = 'projetos GET /projetos/:id/atividades'
const CRIAR = 'projetos POST /projetos/:id/atividades'
const EDITAR = 'projetos PATCH /projetos/:id/atividades/:aid'

function montar(o) {
  const reg = { update: [], create: [], delete: [], findMany: [], findById: [] }
  const perfil = o.perfil === null ? null : (o.perfil || { role: 'admin', feature_grants: [] })

  function modelo(nome, linhas) {
    return {
      // `findById` também é registrado: provar que a recusa não GRAVOU é metade;
      // a outra é provar que ela não LEU, e sem registrar a leitura por id a
      // asserção ficaria afirmando o que não mede.
      findById: async (id) => { reg.findById.push({ modelo: nome, id: String(id) }); return linhas.find((l) => String(l.id) === String(id)) || null },
      findMany: async (f) => { reg.findMany.push({ modelo: nome, filtro: f }); return camadaFindMany(linhas, f) },
      create: async (d) => { reg.create.push({ modelo: nome, dados: d }); linhas.push(d); return d },
      update: async (id, d) => {
        reg.update.push({ modelo: nome, id: String(id), dados: d })
        const i = linhas.findIndex((l) => String(l.id) === String(id))
        if (i >= 0) linhas[i] = Object.assign({}, linhas[i], d)
        return linhas[i]
      },
      delete: async (id) => { reg.delete.push({ modelo: nome, id: String(id) }); return true },
    }
  }

  const models = {
    Profile: { findById: async () => (perfil ? Object.assign({ id: 'u1' }, perfil) : null) },
    Sessao: { findById: async () => null },
    Projeto: modelo('Projeto', o.projetos || [{ id: 'p1', nome: 'Projeto 1', created_at: '2026-01-01T00:00:00.000Z' }]),
    Ticket: modelo('Ticket', o.tickets || []),
    ProjetoFase: modelo('ProjetoFase', o.fases || []),
    CardDependencia: modelo('CardDependencia', o.deps || []),
    ActivityLog: modelo('ActivityLog', []),
    ProjetoAtividade: o.semModeloAtividade ? undefined : modelo('ProjetoAtividade', (o.atividades || []).slice()),
    ProjetoAtividadeEvento: modelo('ProjetoAtividadeEvento', []),
  }
  if (o.atividadeModelo) models.ProjetoAtividade = o.atividadeModelo(reg)
  if (o.semModeloAtividade) delete models.ProjetoAtividade

  const ctx = {
    headers: {},
    user: o.semSessao ? {} : { id: 'u1' },
    params: o.params || { id: 'p1' },
    query: o.query || {},
    body: corpoDeCriacao(o.body, o.corpoCru) || {},
    reply: reply(),
    models,
  }
  return { ctx, reg }
}

// Os quatro obrigatórios, para os casos que não são sobre eles. O valor que o
// caso passa sempre vence — inclusive um vazio de propósito.
const OBRIGATORIOS = {
  descricao: 'O que precisa ser feito',
  responsavel_id: 'u1',
  previsao_entrega: '2026-12-01',
}
function corpoDeCriacao(body, cru) {
  if (cru || !body) return body
  return Object.assign({}, OBRIGATORIOS, body)
}

function ativ(o) {
  return {
    id: o.id, projeto_id: o.proj === undefined ? 'p1' : o.proj, fase_id: o.fase || '',
    titulo: o.titulo || 'Atividade', descricao: 'd', status: o.status || 'backlog',
    ordem: o.ordem === undefined ? 0 : o.ordem, responsavel_id: '',
    inicio_planejado: o.ini || '', previsao_entrega: o.fim || '', estimativa_min: 0,
    concluida_em: o.concluida || '', cancelada_em: o.cancelada || '', criado_por: 'u1',
    created_at: o.criado || '2026-02-01T00:00:00.000Z', updated_at: o.atualizado || '2026-02-01T00:00:00.000Z',
  }
}

/** Escritas fora de ProjetoAtividade/ProjetoAtividadeEvento — o que B proíbe. */
function escritasForaDasAtividades(reg) {
  const meus = ['ProjetoAtividade', 'ProjetoAtividadeEvento']
  return [].concat(reg.update, reg.create, reg.delete).filter((e) => !meus.includes(e.modelo))
}

async function roda() {
  // ───────────────────────────────────────────────────────────────────────────
  // 1. Decisão B: nenhuma das três rotas toca dado que não é da atividade
  // ───────────────────────────────────────────────────────────────────────────
  {
    const casos = [
      [LISTAR, { id: 'p1' }, {}],
      [CRIAR, { id: 'p1' }, { titulo: 'Nova', fase_id: 'f1' }],
      [EDITAR, { id: 'p1', aid: 'a1' }, { titulo: 'Outro', status: 'deploy_feito', fase_id: 'f1' }],
    ]
    for (const [marca, params, body] of casos) {
      const { handler } = carregar(marca)
      const { ctx, reg } = montar({
        params, body,
        fases: [{ id: 'f1', projeto_id: 'p1', nome: 'F', ordem: 1 }],
        tickets: [{ id: 't1', projeto_id: 'p1', fase_id: 'f1', status: 'backlog' }],
        deps: [{ id: 'd1', projeto_id: 'p1', origem_ticket_id: 't1', destino_ticket_id: 't2' }],
        atividades: [ativ({ id: 'a1' })],
      })
      const r = await handler(ctx)
      const nome = marca.split(' ')[1]
      ok('B-nada-fora-da-atividade:' + nome, escritasForaDasAtividades(reg).length === 0, { nome, fora: escritasForaDasAtividades(reg) })
      ok('B-nao-leu-Ticket:' + nome, !reg.findMany.some((f) => f.modelo === 'Ticket'), { nome, lidos: reg.findMany.map((f) => f.modelo) })
      ok('B-nao-leu-dependencia:' + nome, !reg.findMany.some((f) => f.modelo === 'CardDependencia'), { nome, lidos: reg.findMany.map((f) => f.modelo) })
      ok('B-resposta-de-sucesso:' + nome, r.status === 200 || r.status === 201, { nome, status: r.status, body: r.body })
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 2. O texto das rotas não menciona os modelos alheios (nem por engano futuro)
  // ───────────────────────────────────────────────────────────────────────────
  {
    // Buscar no texto cru daria o oposto da verdade: o comentário do `_logAtiv`
    // EXPLICA que não grava no ActivityLog, e por isso contém a palavra.
    const semComentarios = (c) => c.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
    const fs = require('fs')
    const path = require('path')
    for (const marca of [LISTAR, CRIAR, EDITAR]) {
      const arq = path.resolve(__dirname, '../../../../packages/api/src/apps/portal-suporte/routes.generated.ts')
      const texto = fs.readFileSync(arq, 'utf8')
      const at = texto.indexOf(marca)
      const re = /compileController\(\s*"((?:[^"\\]|\\.)*)"\s*\)/g
      re.lastIndex = at
      const m = re.exec(texto)
      const codigo = semComentarios(JSON.parse('"' + m[1] + '"'))
      const nome = marca.split(' ')[1]
      ok('texto-sem-models-Ticket:' + nome, !codigo.includes('models.Ticket'), nome)
      ok('texto-sem-models-ActivityLog:' + nome, !codigo.includes('models.ActivityLog'), nome)
      ok('texto-sem-models-CardDependencia:' + nome, !codigo.includes('models.CardDependencia'), nome)
      // `_sessaoDoPortal` mora no `_perfilDe` e existiria mesmo SEM a guarda:
      // exigir só ele daria verde num handler desprotegido. O que prova a
      // guarda é o invólucro — `_gsEuSou` e o export apontando para ele.
      ok('texto-tem-guarda-de-sessao:' + nome, codigo.includes('_gsEuSou') && /module\.exports\s*=\s*\{\s*handler:\s*_gsComSessao\s*\}/.test(codigo), nome)
      // Sem a guarda, `_perfilDe` trata "sem pessoa" como serviço e as três
      // permissões do módulo liberam tudo — o furo que o caso 4 pega.
      ok('texto-tem-401-sem-sessao:' + nome, codigo.includes('Requer sessão do portal'), nome)
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Permissão: ver com `_podeVer`, escrever com `_podeMexerNoCard`
  // ───────────────────────────────────────────────────────────────────────────
  {
    const ver = [
      ['user', { role: 'user', feature_grants: [] }, 403],
      ['support', { role: 'support', feature_grants: [] }, 403],
      ['support+qa', { role: 'support', feature_grants: ['qa'] }, 403],
      ['developer', { role: 'developer', feature_grants: [] }, 403],
      ['developer+projetos', { role: 'developer', feature_grants: ['projetos'] }, 200],
      ['admin', { role: 'admin', feature_grants: [] }, 200],
    ]
    for (const [nome, perfil, esperado] of ver) {
      const { handler } = carregar(LISTAR)
      const { ctx } = montar({ perfil })
      const r = await handler(ctx)
      ok('prototipo: ver-atividades:' + nome, r.status === esperado, { nome, status: r.status, esperado })
    }
    // D6c, decidido em 29/10: CRIAR é só de quem planeja. O developer comum
    // perdeu essa porta — ele vê, e mexe na atividade de que é responsável,
    // mas não abre atividade nova.
    const escrever = [
      ['support', { role: 'support', feature_grants: [] }, 403],
      ['support+qa', { role: 'support', feature_grants: ['qa'] }, 403],
      ['support+planejamento', { role: 'support', feature_grants: ['planejamento'] }, 201],
      ['admin', { role: 'admin', feature_grants: [] }, 201],
      ['developer', { role: 'developer', feature_grants: [] }, 403],
      ['developer+planejamento', { role: 'developer', feature_grants: ['planejamento'] }, 201],
    ]
    for (const [nome, perfil, esperado] of escrever) {
      const { handler } = carregar(CRIAR)
      const { ctx } = montar({ perfil, body: { titulo: 'Nova' } })
      const r = await handler(ctx)
      ok('criar-atividade-e-so-de-quem-planeja:' + nome, r.status === esperado, { nome, status: r.status, esperado })
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Sem sessão: 401, nada lido e nada gravado
  // ───────────────────────────────────────────────────────────────────────────
  {
    for (const marca of [LISTAR, CRIAR, EDITAR]) {
      const { handler } = carregar(marca)
      // A atividade `a1` EXISTE de propósito: sem ela, o PATCH sem guarda
      // cairia em 404 antes de gravar, e a asserção "não gravou" passaria pelo
      // motivo errado — ela não poderia falhar.
      const { ctx, reg } = montar({
        semSessao: true, perfil: null,
        params: { id: 'p1', aid: 'a1' }, body: { titulo: 'x' },
        atividades: [ativ({ id: 'a1' })],
      })
      const r = await handler(ctx)
      const nome = marca.split(' ')[1]
      ok('sem-sessao-401:' + nome, r.status === 401, { nome, status: r.status })
      ok('sem-sessao-nada-gravado:' + nome, reg.create.length === 0 && reg.update.length === 0, { nome, reg })
      // E nada lido: a recusa vem antes de qualquer leitura de projeto ou de
      // atividade. Só o `Profile` de quem chamou pode ter sido consultado.
      const leu = [].concat(reg.findMany, reg.findById).filter((e) => e.modelo !== 'Profile' && e.modelo !== 'Sessao')
      ok('sem-sessao-nada-lido:' + nome, leu.length === 0, { nome, leu })
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Recusa não grava
  // ───────────────────────────────────────────────────────────────────────────
  {
    for (const [marca, params, body] of [
      [CRIAR, { id: 'p1' }, { titulo: 'Nova' }],
      [EDITAR, { id: 'p1', aid: 'a1' }, { titulo: 'Outro' }],
    ]) {
      const { handler } = carregar(marca)
      const { ctx, reg } = montar({ perfil: { role: 'user', feature_grants: [] }, params, body, atividades: [ativ({ id: 'a1' })] })
      const r = await handler(ctx)
      const nome = marca.split(' ')[1]
      ok('recusa-403:' + nome, r.status === 403, { nome, status: r.status })
      ok('recusa-nao-grava:' + nome, reg.create.length === 0 && reg.update.length === 0, { nome, reg })
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 6. O projeto é o da URL, e só ele
  // ───────────────────────────────────────────────────────────────────────────
  {
    const a = carregar(CRIAR)
    const ma = montar({ params: { id: 'NAO_EXISTE' }, body: { titulo: 'Nova' } })
    const ra = await a.handler(ma.ctx)
    ok('criar-projeto-inexistente-404', ra.status === 404 && ma.reg.create.length === 0, { status: ra.status, reg: ma.reg })

    // `projeto_id` no corpo é IGNORADO: aceitar o do corpo deixaria quem pode
    // escrever num projeto escrever em qualquer outro.
    const b = carregar(CRIAR)
    const mb = montar({ params: { id: 'p1' }, body: { titulo: 'Nova', projeto_id: 'OUTRO' } })
    const rb = await b.handler(mb.ctx)
    ok('criar-ignora-projeto_id-do-corpo', (rb.body.data || {}).projeto_id === 'p1', rb.body.data)

    // Atividade de outro projeto não é editável por este.
    const c = carregar(EDITAR)
    const mc = montar({ params: { id: 'p1', aid: 'a1' }, body: { titulo: 'Outro' }, atividades: [ativ({ id: 'a1', proj: 'OUTRO' })] })
    const rc = await c.handler(mc.ctx)
    ok('editar-atividade-de-outro-projeto-404', rc.status === 404 && mc.reg.update.length === 0, { status: rc.status, reg: mc.reg })
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 7. Fase: do mesmo projeto, nas duas rotas de escrita
  // ───────────────────────────────────────────────────────────────────────────
  {
    const fases = [
      { id: 'f1', projeto_id: 'p1', nome: 'Desta', ordem: 1 },
      { id: 'fx', projeto_id: 'OUTRO', nome: 'Alheia', ordem: 1 },
    ]
    const casos = [
      [CRIAR, { id: 'p1' }, { titulo: 'Nova', fase_id: 'f1' }, 201],
      [CRIAR, { id: 'p1' }, { titulo: 'Nova', fase_id: 'fx' }, 400],
      [CRIAR, { id: 'p1' }, { titulo: 'Nova', fase_id: 'NAO_EXISTE' }, 400],
      [CRIAR, { id: 'p1' }, { titulo: 'Nova', fase_id: '' }, 201],
      [EDITAR, { id: 'p1', aid: 'a1' }, { fase_id: 'f1' }, 200],
      [EDITAR, { id: 'p1', aid: 'a1' }, { fase_id: 'fx' }, 400],
      [EDITAR, { id: 'p1', aid: 'a1' }, { fase_id: '' }, 200],
    ]
    for (const [marca, params, body, esperado] of casos) {
      const { handler } = carregar(marca)
      const { ctx, reg } = montar({ params, body, fases, atividades: [ativ({ id: 'a1' })] })
      const r = await handler(ctx)
      const nome = marca.split(' ')[1] + ':' + (body.fase_id === '' ? 'vazia' : body.fase_id)
      ok('fase-do-mesmo-projeto:' + nome, r.status === esperado, { nome, status: r.status, esperado })
      if (esperado === 400) {
        ok('fase-alheia-nao-grava:' + nome, reg.create.length === 0 && reg.update.length === 0, { nome, reg })
      }
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 8. prototipo: cadastro — título obrigatório, resto opcional
  // ───────────────────────────────────────────────────────────────────────────
  {
    const casos = [
      ['sem-titulo', {}, 400],
      ['titulo-vazio', { titulo: '' }, 400],
      ['titulo-so-espaco', { titulo: '   ' }, 400],
      ['titulo-nulo', { titulo: null }, 400],
      ['so-titulo', { titulo: 'Nova' }, 201],
    ]
    for (const [nome, body, esperado] of casos) {
      const { handler } = carregar(CRIAR)
      const { ctx, reg } = montar({ body })
      const r = await handler(ctx)
      ok('prototipo: titulo:' + nome, r.status === esperado, { nome, status: r.status, esperado })
      if (esperado === 400) ok('titulo-invalido-nao-grava:' + nome, reg.create.length === 0, { nome, reg })
    }
    const { handler } = carregar(CRIAR)
    const { ctx } = montar({ body: { titulo: '  com espaço em volta  ' } })
    const r = await handler(ctx)
    ok('titulo-sem-espaco-em-volta', r.body.data.titulo === 'com espaço em volta', r.body.data.titulo)

    const b = carregar(CRIAR)
    const mb = montar({ body: { titulo: 'x'.repeat(300) } })
    const rb = await b.handler(mb.ctx)
    ok('titulo-cortado-em-200', (rb.body.data || {}).titulo.length === 200, (rb.body.data || {}).titulo.length)
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 9. Lista branca de campos: o que não é do cadastro não é gravado
  // ───────────────────────────────────────────────────────────────────────────
  {
    const { handler } = carregar(CRIAR)
    const { ctx, reg } = montar({
      body: {
        titulo: 'Nova', ticket_id: 't1', quadro: 'dev', inventado: 1,
        id: 'EU_ESCOLHI', created_at: '1999-01-01T00:00:00.000Z', criado_por: 'OUTRA_PESSOA',
      },
    })
    const r = await handler(ctx)
    const gravado = reg.create.find((c) => c.modelo === 'ProjetoAtividade').dados
    ok('lista-branca-ignora-campo-de-fora', gravado.ticket_id === undefined && gravado.quadro === undefined && gravado.inventado === undefined, gravado)
    ok('lista-branca-ignora-id-do-corpo', gravado.id !== 'EU_ESCOLHI' && String(gravado.id).indexOf('pativ_') === 0, gravado.id)
    ok('lista-branca-ignora-created_at-do-corpo', gravado.created_at === AGORA, gravado.created_at)
    ok('criado_por-vem-de-quem-chamou', gravado.criado_por === 'u1', gravado.criado_por)
    ok('criar-devolve-201', r.status === 201, r.status)
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 10. prototipo: status, carimbos e reabertura
  // ───────────────────────────────────────────────────────────────────────────
  {
    for (const [nome, status, esperado] of [
      ['backlog', 'backlog', 201],
      ['em_desenvolvimento', 'em_desenvolvimento', 201],
      ['finalizado_dev', 'finalizado_dev', 201],
      ['pronto_para_teste', 'pronto_para_teste', 201],
      ['teste_aprovado', 'teste_aprovado', 201],
      ['teste_reprovado', 'teste_reprovado', 201],
      ['deploy_feito', 'deploy_feito', 201],
      ['cancelada', 'cancelada', 201],
      ['inventado', 'arquivada', 400],
      // As etapas do protótipo anterior deixaram de existir: mandá-las agora
      // é mandar status inválido, e o 400 é o que separa a regra nova da velha.
      ['a_fazer-saiu', 'a_fazer', 400],
      ['em_andamento-saiu', 'em_andamento', 400],
      ['concluida-saiu', 'concluida', 400],
    ]) {
      const { handler } = carregar(CRIAR)
      const { ctx, reg } = montar({ body: { titulo: 'Nova', status } })
      const r = await handler(ctx)
      ok('prototipo: status-no-cadastro:' + nome, r.status === esperado, { nome, status: r.status, esperado })
      if (esperado === 400) ok('status-invalido-nao-grava:' + nome, reg.create.length === 0, { nome, reg })
    }

    // Concluir carimba; REABRIR limpa o carimbo — sem isso a atividade volta
    // para a coluna "a fazer" ainda com data de conclusão.
    const a = carregar(EDITAR)
    const ma = montar({ params: { id: 'p1', aid: 'a1' }, body: { status: 'deploy_feito' }, atividades: [ativ({ id: 'a1' })] })
    const ra = await a.handler(ma.ctx)
    ok('concluir-carimba', (ra.body.data || {}).concluida_em === AGORA, ra.body.data)

    const b = carregar(EDITAR)
    const mb = montar({ params: { id: 'p1', aid: 'a1' }, body: { status: 'backlog' }, atividades: [ativ({ id: 'a1', status: 'deploy_feito', concluida: '2026-02-05T00:00:00.000Z' })] })
    const rb = await b.handler(mb.ctx)
    ok('reabrir-limpa-o-carimbo', (rb.body.data || {}).concluida_em === '', rb.body.data)

    const c = carregar(EDITAR)
    const mc = montar({ params: { id: 'p1', aid: 'a1' }, body: { status: 'cancelada' }, atividades: [ativ({ id: 'a1' })] })
    const rc = await c.handler(mc.ctx)
    ok('cancelar-carimba', (rc.body.data || {}).cancelada_em === AGORA && (rc.body.data || {}).concluida_em === '', rc.body.data)

    // Concluir duas vezes não reescreve o primeiro carimbo.
    const d = carregar(EDITAR)
    const md = montar({ params: { id: 'p1', aid: 'a1' }, body: { status: 'deploy_feito' }, atividades: [ativ({ id: 'a1', status: 'deploy_feito', concluida: '2026-02-05T00:00:00.000Z' })] })
    const rd = await d.handler(md.ctx)
    ok('concluir-de-novo-mantem-o-carimbo', (rd.body.data || {}).concluida_em === '2026-02-05T00:00:00.000Z', rd.body.data)
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 11. Datas, janela, estimativa e ordem
  // ───────────────────────────────────────────────────────────────────────────
  {
    const casos = [
      [CRIAR, { titulo: 'N', previsao_entrega: '30/04/2026' }, 400],
      [CRIAR, { titulo: 'N', inicio_planejado: '2026-04-30', previsao_entrega: '2026-04-01' }, 400],
      [CRIAR, { titulo: 'N', inicio_planejado: '2026-04-01', previsao_entrega: '2026-04-30' }, 201],
      [CRIAR, { titulo: 'N', previsao_entrega: '2026-04-30' }, 201],
      [CRIAR, { titulo: 'N', estimativa_min: -1 }, 400],
      [CRIAR, { titulo: 'N', estimativa_min: 'muito' }, 400],
      [CRIAR, { titulo: 'N', ordem: 'primeiro' }, 400],
      [EDITAR, { previsao_entrega: '30/04/2026' }, 400],
      [EDITAR, { previsao_entrega: '2026-01-01' }, 400],
      [EDITAR, { estimativa_min: -5 }, 400],
      [EDITAR, { ordem: 'x' }, 400],
      [EDITAR, { ordem: 3 }, 200],
    ]
    for (const [marca, body, esperado] of casos) {
      const { handler } = carregar(marca)
      const { ctx, reg } = montar({
        params: { id: 'p1', aid: 'a1' }, body,
        // Só a criação exige os quatro campos; no PATCH, completar o corpo
        // faria a linha testar outra coisa.
        corpoCru: marca !== CRIAR,
        atividades: [ativ({ id: 'a1', ini: '2026-02-01', fim: '2026-02-28' })],
      })
      const r = await handler(ctx)
      const nome = marca.split(' ')[1] + ':' + JSON.stringify(body).slice(0, 48)
      ok('datas-e-numeros:' + nome, r.status === esperado, { nome, status: r.status, esperado })
      if (esperado === 400) ok('invalido-nao-grava:' + nome, reg.create.length === 0 && reg.update.length === 0, { nome, reg })
    }
    const { handler } = carregar(CRIAR)
    const { ctx } = montar({ body: { titulo: 'N', estimativa_min: 90.6, ordem: 2.4 } })
    const r = await handler(ctx)
    ok('estimativa-e-ordem-arredondam', r.body.data.estimativa_min === 91 && r.body.data.ordem === 2, r.body.data)
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 12. Concorrência otimista: igual à do módulo, e opcional como lá
  // ───────────────────────────────────────────────────────────────────────────
  {
    const a = carregar(EDITAR)
    const ma = montar({
      params: { id: 'p1', aid: 'a1' },
      body: { titulo: 'Outro', updated_at: '2026-01-01T00:00:00.000Z' },
      atividades: [ativ({ id: 'a1', atualizado: '2026-02-01T00:00:00.000Z' })],
    })
    const ra = await a.handler(ma.ctx)
    ok('conflito-409-quando-informado', ra.status === 409 && ma.reg.update.length === 0, { status: ra.status, reg: ma.reg })

    const b = carregar(EDITAR)
    const mb = montar({ params: { id: 'p1', aid: 'a1' }, body: { titulo: 'Outro' }, atividades: [ativ({ id: 'a1' })] })
    const rb = await b.handler(mb.ctx)
    ok('prototipo: sem-updated_at-grava-como-no-resto-do-modulo', rb.status === 200 && mb.reg.update.length === 1, { status: rb.status, reg: mb.reg })
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 13. PATCH sem mudança não grava
  // ───────────────────────────────────────────────────────────────────────────
  {
    const { handler } = carregar(EDITAR)
    // Corpo CRU: este caso é sobre o corpo vazio, e completá-lo com os
    // obrigatórios faria o PATCH deixar de ser vazio.
    const { ctx, reg } = montar({ params: { id: 'p1', aid: 'a1' }, body: {}, corpoCru: true, atividades: [ativ({ id: 'a1' })] })
    const r = await handler(ctx)
    ok('patch-vazio-nao-grava', r.status === 200 && reg.update.length === 0 && r.body.data.id === 'a1', { status: r.status, reg })
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 14. Histórico PRÓPRIO, não o do portal
  // ───────────────────────────────────────────────────────────────────────────
  {
    const a = carregar(CRIAR)
    const ma = montar({ body: { titulo: 'Nova' } })
    await a.handler(ma.ctx)
    ok('criar-registra-no-historico-proprio', ma.reg.create.some((c) => c.modelo === 'ProjetoAtividadeEvento' && c.dados.action === 'atividade_criada'), ma.reg.create.map((c) => c.modelo))
    ok('criar-nao-registra-no-ActivityLog', !ma.reg.create.some((c) => c.modelo === 'ActivityLog'), ma.reg.create.map((c) => c.modelo))

    const b = carregar(EDITAR)
    const mb = montar({ params: { id: 'p1', aid: 'a1' }, body: { titulo: 'Outro' }, atividades: [ativ({ id: 'a1' })] })
    await b.handler(mb.ctx)
    ok('editar-registra-no-historico-proprio', mb.reg.create.some((c) => c.modelo === 'ProjetoAtividadeEvento' && c.dados.action === 'atividade_alterada'), mb.reg.create.map((c) => c.modelo))
    ok('editar-nao-registra-no-ActivityLog', !mb.reg.create.some((c) => c.modelo === 'ActivityLog'), mb.reg.create.map((c) => c.modelo))

    // Sem o modelo de histórico, a escrita da atividade continua acontecendo:
    // perder o registro não pode perder o trabalho.
    const c = carregar(CRIAR)
    const mc = montar({ body: { titulo: 'Nova' } })
    delete mc.ctx.models.ProjetoAtividadeEvento
    const rc = await c.handler(mc.ctx)
    ok('sem-modelo-de-historico-ainda-cria', rc.status === 201, rc.status)
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 15. prototipo: resumo — progresso por conclusão, cancelada fora do total
  // ───────────────────────────────────────────────────────────────────────────
  {
    const casos = [
      ['sem-atividade', [], { total: 0, concluidas: 0, progresso: 0 }],
      ['uma-a-fazer', [ativ({ id: 'a' })], { total: 1, concluidas: 0, progresso: 0 }],
      ['uma-de-quatro', [ativ({ id: 'a', status: 'deploy_feito' }), ativ({ id: 'b' }), ativ({ id: 'c' }), ativ({ id: 'd' })], { total: 4, concluidas: 1, progresso: 25 }],
      ['quatro-de-quatro', [1, 2, 3, 4].map((n) => ativ({ id: 'a' + n, status: 'deploy_feito' })), { total: 4, concluidas: 4, progresso: 100 }],
      ['cancelada-fora-do-total', [ativ({ id: 'a', status: 'deploy_feito' }), ativ({ id: 'b', status: 'cancelada' })], { total: 1, concluidas: 1, canceladas: 1, progresso: 100 }],
      ['tudo-cancelado-nunca-100', [ativ({ id: 'a', status: 'cancelada' }), ativ({ id: 'b', status: 'cancelada' })], { total: 0, concluidas: 0, canceladas: 2, progresso: 0 }],
      ['um-de-tres-arredonda', [ativ({ id: 'a', status: 'deploy_feito' }), ativ({ id: 'b' }), ativ({ id: 'c' })], { total: 3, concluidas: 1, progresso: 33 }],
    ]
    for (const [nome, atividades, esperado] of casos) {
      const { handler } = carregar(LISTAR)
      const { ctx } = montar({ atividades })
      const r = await handler(ctx)
      const resumo = r.body.data.resumo
      const bate = Object.keys(esperado).every((k) => resumo[k] === esperado[k])
      ok('prototipo: resumo:' + nome, bate, { nome, resumo, esperado })
    }
    // Cancelada sai do total mas CONTINUA visível na lista.
    const { handler } = carregar(LISTAR)
    const { ctx } = montar({ atividades: [ativ({ id: 'a', status: 'cancelada' })] })
    const r = await handler(ctx)
    ok('prototipo: cancelada-continua-visivel', r.body.data.atividades.length === 1 && r.body.data.atividades[0].status === 'cancelada', r.body.data.atividades)
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 16. Atraso da atividade
  // ───────────────────────────────────────────────────────────────────────────
  {
    const casos = [
      ['prazo-ontem', ativ({ id: 'a', fim: '2026-03-09' }), true],
      ['prazo-hoje', ativ({ id: 'a', fim: HOJE }), false],
      ['prazo-amanha', ativ({ id: 'a', fim: '2026-03-11' }), false],
      ['sem-prazo', ativ({ id: 'a' }), false],
      ['concluida-nunca-atrasa', ativ({ id: 'a', fim: '2026-01-01', status: 'deploy_feito' }), false],
      ['cancelada-nunca-atrasa', ativ({ id: 'a', fim: '2026-01-01', status: 'cancelada' }), false],
    ]
    for (const [nome, a, esperado] of casos) {
      const { handler } = carregar(LISTAR)
      const { ctx } = montar({ atividades: [a] })
      const r = await handler(ctx)
      ok('atraso:' + nome, r.body.data.atividades[0].atrasada === esperado, { nome, deu: r.body.data.atividades[0].atrasada, esperado })
    }
    const { handler } = carregar(LISTAR)
    const { ctx } = montar({ atividades: [ativ({ id: 'a', fim: '2026-03-09' }), ativ({ id: 'b', fim: '2026-03-11' })] })
    const r = await handler(ctx)
    // Com o relógio do dia em que o teste roda, os dois estariam no passado e a
    // conta daria 2 — o 1 é a prova de que a fixação do relógio valeu.
    ok('relogio-fixo-vale', r.body.data.resumo.atrasadas === 1, r.body.data.resumo)
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 17. Ordem da lista: `ordem`, depois criação, depois id
  // ───────────────────────────────────────────────────────────────────────────
  {
    const { handler } = carregar(LISTAR)
    const { ctx } = montar({
      atividades: [
        ativ({ id: 'c', ordem: 2 }),
        ativ({ id: 'a', ordem: 1, criado: '2026-02-02T00:00:00.000Z' }),
        ativ({ id: 'b', ordem: 1, criado: '2026-02-01T00:00:00.000Z' }),
        ativ({ id: 'z', ordem: 1, criado: '2026-02-01T00:00:00.000Z' }),
      ],
    })
    const r = await handler(ctx)
    // ordem 1: 'b' e 'z' empatam em created_at e desempatam por id; 'a' é mais
    // nova. Depois vem 'c', de ordem 2.
    ok('lista-ordena-por-ordem-criacao-id', r.body.data.atividades.map((a) => a.id).join(',') === 'b,z,a,c', r.body.data.atividades.map((a) => a.id))
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 18. Filtro recorta a lista e NÃO muda o resumo
  // ───────────────────────────────────────────────────────────────────────────
  {
    const atividades = [
      ativ({ id: 'a', fase: 'f1', status: 'deploy_feito' }),
      ativ({ id: 'b', fase: 'f1' }),
      ativ({ id: 'c', fase: 'f2' }),
      ativ({ id: 'd', fase: '' }),
    ]
    const a = carregar(LISTAR)
    const ma = montar({ atividades, query: { fase_id: 'f1' } })
    const ra = await a.handler(ma.ctx)
    ok('filtro-por-fase-recorta', (ra.body.data || {}).atividades.map((x) => x.id).join(',') === 'a,b', (ra.body.data || {}).atividades.map((x) => x.id))
    ok('filtro-nao-muda-o-resumo', (ra.body.data || {}).resumo.total === 4 && (ra.body.data || {}).resumo.progresso === 25, (ra.body.data || {}).resumo)

    const b = carregar(LISTAR)
    const mb = montar({ atividades, query: { fase_id: '' } })
    const rb = await b.handler(mb.ctx)
    ok('filtro-fase-vazia-traz-sem-fase', (rb.body.data || {}).atividades.map((x) => x.id).join(',') === 'd', (rb.body.data || {}).atividades.map((x) => x.id))

    const c = carregar(LISTAR)
    const mc = montar({ atividades, query: { status: 'deploy_feito' } })
    const rc = await c.handler(mc.ctx)
    ok('filtro-por-status-recorta', (rc.body.data || {}).atividades.map((x) => x.id).join(',') === 'a', (rc.body.data || {}).atividades.map((x) => x.id))
    ok('filtro-status-nao-muda-o-resumo', (rc.body.data || {}).resumo.total === 4, (rc.body.data || {}).resumo)
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 19. Barreira T4: leitura por páginas, desduplicação e teto com recusa
  // ───────────────────────────────────────────────────────────────────────────
  {
    // 1.200 atividades: três páginas de 500, 500 e 200.
    const muitas = []
    for (let i = 0; i < 1200; i++) muitas.push(ativ({ id: 'a' + String(i).padStart(5, '0'), ordem: i }))
    const a = carregar(LISTAR)
    const ma = montar({ atividades: muitas })
    const ra = await a.handler(ma.ctx)
    ok('T4-le-as-1200', (ra.body.data || {}).resumo.total === 1200 && (ra.body.data || {}).atividades.length === 1200, { resumo: (ra.body.data || {}).resumo, lidas: (ra.body.data || {}).atividades.length })
    const paginas = ma.reg.findMany.filter((f) => f.modelo === 'ProjetoAtividade')
    ok('T4-pagina-de-500-com-offset', paginas.length === 3 && paginas.every((p) => p.filtro.limit === 500) && paginas.map((p) => p.filtro.offset).join(',') === '0,500,1000', paginas.map((p) => p.filtro))

    // Página que REPETE linha, que é o que a camada pode fazer em empate de
    // `created_at` (não tem desempate). Aqui é simulação explícita do efeito.
    const b = carregar(LISTAR)
    const repetida = ativ({ id: 'repetida' })
    const mb = montar({
      atividadeModelo: (reg) => ({
        findById: async () => null,
        findMany: async (f) => {
          reg.findMany.push({ modelo: 'ProjetoAtividade', filtro: f })
          const pagina = []
          for (let i = 0; i < 499; i++) pagina.push(ativ({ id: 'x' + f.offset + '_' + i }))
          pagina.push(repetida)
          return (f.offset || 0) < 500 ? pagina : [repetida]
        },
        create: async (d) => d, update: async (_i, d) => d, delete: async () => true,
      }),
    })
    const rb = await b.handler(mb.ctx)
    const ids = (rb.body.data || {}).atividades.map((x) => x.id)
    ok('T4-desduplica-por-id', ids.filter((x) => x === 'repetida').length === 1, { repetidas: ids.filter((x) => x === 'repetida').length, total: ids.length })
    ok('T4-total-sem-a-repetida', (rb.body.data || {}).resumo.total === 500, (rb.body.data || {}).resumo)

    // O LIMITE, medido e não prometido: linha PULADA na virada de página não é
    // recuperável aqui. Esta é a simulação do que a camada pode fazer em empate
    // de `created_at` — a segunda página começa DEPOIS de uma linha que a
    // primeira não trouxe. O total sai menor, sem 409 e sem aviso, e a barreira
    // T4 continua aberta acima de 500.
    const d = carregar(LISTAR)
    const md = montar({
      atividadeModelo: (reg) => ({
        findById: async () => null,
        findMany: async (f) => {
          reg.findMany.push({ modelo: 'ProjetoAtividade', filtro: f })
          const off = f.offset || 0
          if (off === 0) {
            const pagina = []
            for (let i = 0; i < 500; i++) pagina.push(ativ({ id: 'p0_' + i }))
            return pagina
          }
          // A linha `p0_500` existia e não veio em nenhuma das duas páginas.
          if (off === 500) return [ativ({ id: 'p1_0' })]
          return []
        },
        create: async (x) => x, update: async (_i, x) => x, delete: async () => true,
      }),
    })
    const rd = await d.handler(md.ctx)
    ok('atual conhecido: linha-pulada-na-virada-nao-e-recuperada', rd.status === 200 && (rd.body.data || {}).resumo.total === 501, { status: rd.status, resumo: rd.body && rd.body.data && (rd.body.data || {}).resumo })

    // Acima do teto: RECUSA, e sem total nenhum na resposta.
    const c = carregar(LISTAR)
    const demais = []
    for (let i = 0; i < 10000; i++) demais.push(ativ({ id: 'b' + String(i).padStart(6, '0') }))
    const mc = montar({ atividades: demais })
    const rc = await c.handler(mc.ctx)
    ok('T4-acima-do-teto-recusa', rc.status === 409, rc.status)
    ok('T4-recusa-nao-traz-total', rc.body.data === undefined && rc.body.limite === 10000, rc.body)
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 20. Sem o modelo das atividades: 500, não lista vazia
  // ───────────────────────────────────────────────────────────────────────────
  {
    for (const marca of [LISTAR, CRIAR]) {
      const { handler } = carregar(marca)
      const { ctx } = montar({ semModeloAtividade: true, body: { titulo: 'Nova' } })
      const r = await handler(ctx)
      const nome = marca.split(' ')[1]
      // Lista vazia faria o projeto parecer sem atividade nenhuma, que é a
      // mentira mais cara que esta rota poderia contar.
      ok('sem-modelo-da-500:' + nome, r.status === 500, { nome, status: r.status, body: r.body })
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 2b-A. Os quatro obrigatórios (D5, 29/10)
  // ───────────────────────────────────────────────────────────────────────────
  {
    const cheio = {
      titulo: 'Nova', descricao: 'Detalhe', responsavel_id: 'u9',
      previsao_entrega: '2026-12-01',
    }
    // Cada um dos quatro, faltando sozinho. Um por um e não todos de uma vez:
    // com todos faltando, o primeiro erro esconderia os outros três.
    for (const campo of ['titulo', 'descricao', 'responsavel_id', 'previsao_entrega']) {
      const corpo = Object.assign({}, cheio)
      delete corpo[campo]
      const { handler } = carregar(CRIAR)
      const { ctx, reg } = montar({ body: corpo, corpoCru: true })
      const r = await handler(ctx)
      ok('2b: criar-sem-' + campo + '-recusa', r.status === 400, { campo, status: r.status, body: r.body })
      ok('2b: criar-sem-' + campo + '-nao-grava',
        reg.create.filter((c) => c.modelo === 'ProjetoAtividade').length === 0, reg.create)
    }
    // Em branco é tão ausente quanto não mandar: espaço não preenche campo.
    for (const campo of ['titulo', 'descricao', 'responsavel_id', 'previsao_entrega']) {
      const corpo = Object.assign({}, cheio)
      corpo[campo] = '   '
      const { handler } = carregar(CRIAR)
      const { ctx } = montar({ body: corpo, corpoCru: true })
      const r = await handler(ctx)
      ok('2b: criar-com-' + campo + '-em-branco-recusa', r.status === 400, { campo, status: r.status })
    }
    // Com os quatro, cria.
    {
      const { handler } = carregar(CRIAR)
      const { ctx, reg } = montar({ body: cheio, corpoCru: true })
      const r = await handler(ctx)
      const g = reg.create.find((c) => c.modelo === 'ProjetoAtividade')
      ok('2b: criar-com-os-quatro-cria', r.status === 201, { status: r.status, body: r.body })
      ok('2b: nasce-em-backlog', !!g && g.dados.status === 'backlog', g && g.dados.status)
      ok('2b: guarda-o-responsavel', !!g && g.dados.responsavel_id === 'u9', g && g.dados.responsavel_id)
    }
    // O PATCH não pode ESVAZIAR nenhum dos quatro — exigir no nascimento e
    // deixar apagar depois é a mesma regra valendo pela metade.
    for (const campo of ['titulo', 'descricao', 'responsavel_id', 'previsao_entrega']) {
      const corpo = {}
      corpo[campo] = ''
      const { handler } = carregar(EDITAR)
      const { ctx, reg } = montar({
        params: { id: 'p1', aid: 'a1' }, body: corpo, corpoCru: true,
        perfil: { role: 'admin', feature_grants: [] },
        atividades: [ativ({ id: 'a1' })],
      })
      const r = await handler(ctx)
      ok('2b: patch-nao-esvazia-' + campo, r.status === 400, { campo, status: r.status, body: r.body })
      ok('2b: patch-nao-esvazia-' + campo + '-nao-grava', reg.update.length === 0, reg.update)
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 2b-B. Progresso: só `deploy_feito` conta (D4, 29/10)
  // ───────────────────────────────────────────────────────────────────────────
  {
    const { contexto } = carregarHandlerEContexto(LISTAR)
    const r1 = contexto._resumoAtiv([
      ativ({ id: 'a', status: 'teste_aprovado' }), ativ({ id: 'b', status: 'backlog' }),
    ])
    ok('2b: teste-aprovado-nao-conta-como-pronto',
      r1.total === 2 && r1.concluidas === 0 && r1.progresso === 0, r1)
    // E o espelho: com uma no ar e uma em backlog, dá 50. Os dois juntos
    // separam "conta só deploy_feito" de "conta qualquer etapa avançada".
    const r1b = contexto._resumoAtiv([
      ativ({ id: 'a', status: 'deploy_feito' }), ativ({ id: 'b', status: 'backlog' }),
    ])
    ok('2b: so-a-que-esta-no-ar-conta',
      r1b.total === 2 && r1b.concluidas === 1 && r1b.progresso === 50, r1b)
    // A etapa anterior ao deploy é a que mais tenta parecer pronta: aprovado no
    // teste ainda não está no ar.
    const r2 = contexto._resumoAtiv([
      ativ({ id: 'a', status: 'teste_aprovado' }), ativ({ id: 'b', status: 'teste_aprovado' }),
    ])
    ok('2b: tudo-aprovado-mas-nada-no-ar-e-zero',
      r2.total === 2 && r2.concluidas === 0 && r2.progresso === 0, r2)
    const r3 = contexto._resumoAtiv([
      ativ({ id: 'a', status: 'deploy_feito' }), ativ({ id: 'b', status: 'cancelada' }),
    ])
    ok('2b: cancelada-continua-fora-do-total',
      r3.total === 1 && r3.canceladas === 1 && r3.progresso === 100, r3)
    const r4 = contexto._resumoAtiv([ativ({ id: 'a', status: 'teste_reprovado' })])
    ok('2b: teste-reprovado-conta-no-total',
      r4.total === 1 && r4.concluidas === 0, r4)
    // `por_status` cobre as 8 etapas: com 7 colunas, contador fixo de duas
    // deixaria cinco invisíveis.
    const r5 = contexto._resumoAtiv([ativ({ id: 'a', status: 'pronto_para_teste' })])
    const chaves = Object.keys(r5.por_status).sort().join(',')
    ok('2b: por_status-tem-as-oito-etapas',
      chaves === 'backlog,cancelada,deploy_feito,em_desenvolvimento,finalizado_dev,'
        + 'pronto_para_teste,teste_aprovado,teste_reprovado', chaves)
    ok('2b: por_status-conta-a-etapa-certa',
      r5.por_status.pronto_para_teste === 1 && r5.por_status.backlog === 0, r5.por_status)
    ok('2b: resumo-nao-tem-mais-contador-de-etapa-que-saiu',
      r5.a_fazer === undefined && r5.em_andamento === undefined, Object.keys(r5))
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 2b-C. Atraso: terminal é no ar ou cancelada
  // ───────────────────────────────────────────────────────────────────────────
  {
    const { contexto } = carregarHandlerEContexto(LISTAR)
    const passado = '2026-01-01'
    ok('2b: deploy-feito-no-passado-nao-atrasa',
      contexto._ativAtrasada(ativ({ id: 'a', fim: passado, status: 'deploy_feito' })) === false)
    ok('2b: cancelada-no-passado-nao-atrasa',
      contexto._ativAtrasada(ativ({ id: 'a', fim: passado, status: 'cancelada' })) === false)
    // Aprovado no teste AINDA tem prazo a cumprir: o deploy não aconteceu.
    ok('2b: teste-aprovado-no-passado-atrasa',
      contexto._ativAtrasada(ativ({ id: 'a', fim: passado, status: 'teste_aprovado' })) === true)
    ok('2b: backlog-no-passado-atrasa',
      contexto._ativAtrasada(ativ({ id: 'a', fim: passado, status: 'backlog' })) === true)
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 2b-D. Porta de edição: quem planeja OU o responsável (D6c, 29/10)
  // ───────────────────────────────────────────────────────────────────────────
  {
    const casos = [
      ['quem-planeja-mexe-na-de-outro', { role: 'admin', feature_grants: [] }, 'OUTRO', 200],
      ['grant-de-planejamento-mexe', { role: 'support', feature_grants: ['planejamento'] }, 'OUTRO', 200],
      // O responsável precisa do campo "Projetos" para ALCANÇAR o módulo: sem
      // ele a 509 recusa antes de olhar de quem é a atividade. Ser responsável
      // não é passe para o módulo, é permissão DENTRO dele.
      ['responsavel-mexe-na-sua', { role: 'developer', feature_grants: ['projetos'] }, 'u1', 200],
      ['responsavel-sem-o-campo-nao-alcanca',
        { role: 'developer', feature_grants: [] }, 'u1', 403],
      ['developer-nao-mexe-na-de-outro',
        { role: 'developer', feature_grants: ['projetos'] }, 'OUTRO', 403],
      ['quem-nem-ve-nao-mexe', { role: 'support', feature_grants: [] }, 'u1', 403],
    ]
    for (const [nome, perfil, dono, esperado] of casos) {
      const { handler } = carregar(EDITAR)
      const { ctx, reg } = montar({
        params: { id: 'p1', aid: 'a1' }, body: { status: 'em_desenvolvimento' }, corpoCru: true,
        perfil,
        atividades: [Object.assign(ativ({ id: 'a1' }), { responsavel_id: dono })],
      })
      const r = await handler(ctx)
      ok('2b: ' + nome, r.status === esperado, { nome, status: r.status, esperado, body: r.body })
      if (esperado === 403) {
        ok('2b: ' + nome + '-nao-grava', reg.update.length === 0, reg.update)
      }
    }
    // O caso perigoso: atividade SEM responsável não pode virar atividade de
    // todo mundo. `"" === ""` daria true e abriria a porta.
    {
      const { handler } = carregar(EDITAR)
      const { ctx, reg } = montar({
        params: { id: 'p1', aid: 'a1' }, body: { status: 'em_desenvolvimento' }, corpoCru: true,
        perfil: { role: 'developer', feature_grants: [] },
        atividades: [Object.assign(ativ({ id: 'a1' }), { responsavel_id: '' })],
      })
      const r = await handler(ctx)
      ok('2b: atividade-sem-responsavel-nao-e-de-todos', r.status === 403, { status: r.status, body: r.body })
      ok('2b: atividade-sem-responsavel-nao-grava', reg.update.length === 0, reg.update)
    }
    // O responsável mandando o PRÓPRIO id, sem mudar nada, tem de conseguir
    // salvar: o formulário manda o objeto inteiro, e recusar aqui o deixaria
    // sem gravar nada na atividade dele — que é o que a porta de cima acabou
    // de permitir. Mesma lição da permissão extra em Editar membro.
    {
      const { handler } = carregar(EDITAR)
      const { ctx, reg } = montar({
        params: { id: 'p1', aid: 'a1' },
        body: { responsavel_id: 'u1', status: 'em_desenvolvimento' }, corpoCru: true,
        perfil: { role: 'developer', feature_grants: ['projetos'] },
        atividades: [Object.assign(ativ({ id: 'a1' }), { responsavel_id: 'u1' })],
      })
      const r = await handler(ctx)
      const gravado = (reg.update[0] || {}).dados || {}
      ok('2b: responsavel-manda-o-proprio-id-e-grava-o-resto',
        r.status === 200 && gravado.status === 'em_desenvolvimento', { status: r.status, gravado })
      // E o valor igual NÃO entra na gravação: gravar o mesmo dado mexeria no
      // `updated_at` e levaria o próximo PATCH a um 409 sem motivo.
      ok('2b: responsavel-igual-nao-entra-na-gravacao',
        gravado.responsavel_id === undefined, gravado)
    }
    // Mas mandar OUTRO id continua recusado.
    {
      const { handler } = carregar(EDITAR)
      const { ctx, reg } = montar({
        params: { id: 'p1', aid: 'a1' },
        body: { responsavel_id: 'u9', status: 'em_desenvolvimento' }, corpoCru: true,
        perfil: { role: 'developer', feature_grants: [] },
        atividades: [Object.assign(ativ({ id: 'a1' }), { responsavel_id: 'u1' })],
      })
      const r = await handler(ctx)
      ok('2b: responsavel-mandando-outro-id-recusa', r.status === 403, { status: r.status, body: r.body })
      ok('2b: responsavel-mandando-outro-id-nao-grava', reg.update.length === 0, reg.update)
    }

    // Trocar o RESPONSÁVEL é só de quem planeja (protótipo declarado).
    for (const [nome, perfil, esperado] of [
      ['quem-planeja-troca-o-responsavel', { role: 'admin', feature_grants: [] }, 200],
      ['responsavel-nao-passa-adiante', { role: 'developer', feature_grants: [] }, 403],
    ]) {
      const { handler } = carregar(EDITAR)
      const { ctx, reg } = montar({
        params: { id: 'p1', aid: 'a1' }, body: { responsavel_id: 'u7' }, corpoCru: true,
        perfil,
        atividades: [Object.assign(ativ({ id: 'a1' }), { responsavel_id: 'u1' })],
      })
      const r = await handler(ctx)
      ok('2b: ' + nome, r.status === esperado, { nome, status: r.status, body: r.body })
      if (esperado === 403) ok('2b: ' + nome + '-nao-grava', reg.update.length === 0, reg.update)
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 2b-E. O carimbo acompanha `deploy_feito`, nos dois sentidos
  // ───────────────────────────────────────────────────────────────────────────
  {
    const mover = async (de, para) => {
      const { handler } = carregar(EDITAR)
      const { ctx, reg } = montar({
        params: { id: 'p1', aid: 'a1' }, body: { status: para }, corpoCru: true,
        perfil: { role: 'admin', feature_grants: [] },
        atividades: [Object.assign(ativ({ id: 'a1', status: de }),
          { concluida_em: de === 'deploy_feito' ? '2026-02-02T00:00:00.000Z' : '' })],
      })
      const r = await handler(ctx)
      return { r, gravado: (reg.update[0] || {}).dados || {} }
    }
    const subiu = await mover('teste_aprovado', 'deploy_feito')
    ok('2b: ao-entrar-no-ar-carimba', !!subiu.gravado.concluida_em, subiu.gravado)
    const voltou = await mover('deploy_feito', 'teste_reprovado')
    ok('2b: ao-sair-do-ar-limpa-o-carimbo', voltou.gravado.concluida_em === '', voltou.gravado)
  }

  fim()
}

roda().catch((e) => { console.log('ERRO', e && e.stack || e); process.exit(1) })
