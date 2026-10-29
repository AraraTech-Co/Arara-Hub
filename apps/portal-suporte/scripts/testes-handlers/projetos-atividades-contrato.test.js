// O CONTRATO entre as rotas de atividade e a tela.
//
// POR QUE ESTE ARQUIVO EXISTE:
// a página do projeto caiu em produção para todo mundo. A 507 responde
// `data: { atividades, resumo }`, a tela fazia `data || []`, e o agrupamento
// chamou `.filter` num objeto. O Kanban é a vista padrão, então a página
// inteira foi junto.
//
// Eu tinha teste do servidor e teste da tela, e os dois passavam. Nenhum
// atravessava a JUNÇÃO: o servidor era conferido contra as expectativas do
// servidor, e a tela contra as minhas. Até a asserção que eu chamei de
// "tela e servidor não divergem" comparava a CONTA do resumo, não a FORMA da
// resposta.
//
// Então aqui não há massa inventada para a tela: o corpo vem do handler
// carregado, executado com o fake da camada, e passa pela MESMA função que a
// tela usa. Se as duas pontas divergirem de novo, reprova aqui.
//
// Roda com: node projetos-atividades-contrato.test.js
const { carregarHandler, reply, ok, fim } = require('./_carregar.js')
const { registrarTS, importarTela, semComentarios } = require('./_tela.js')

registrarTS()

const LISTAR = '507 projetos GET /projetos/:id/atividades'
const CRIAR = '508 projetos POST /projetos/:id/atividades'
const EDITAR = '509 projetos PATCH /projetos/:id/atividades/:aid'

function ativ(o) {
  return {
    id: o.id, projeto_id: 'p1', fase_id: '', titulo: o.titulo || o.id,
    descricao: 'd', status: o.status || 'backlog', ordem: o.ordem || 0,
    responsavel_id: 'u1', inicio_planejado: '', previsao_entrega: '',
    estimativa_min: 0, concluida_em: '', cancelada_em: '', criado_por: 'u1',
    created_at: '2026-02-01T00:00:00.000Z', updated_at: '2026-02-01T00:00:00.000Z',
  }
}

function contexto({ params, body, atividades }) {
  const linhas = (atividades || []).slice()
  return {
    headers: {}, user: { id: 'u1' }, params: params || { id: 'p1' },
    query: {}, body: body || {}, reply: reply(),
    models: {
      Profile: { findById: async () => ({ id: 'u1', role: 'admin', feature_grants: [] }) },
      Sessao: { findById: async () => null },
      Projeto: { findById: async () => ({ id: 'p1' }), findMany: async () => [] },
      ProjetoFase: { findById: async () => null },
      ProjetoAtividade: {
        findMany: async () => linhas,
        findById: async (id) => linhas.find((l) => String(l.id) === String(id)) || null,
        create: async (d) => { linhas.push(d); return d },
        update: async (id, d) => {
          const i = linhas.findIndex((l) => String(l.id) === String(id))
          if (i >= 0) linhas[i] = Object.assign({}, linhas[i], d)
          return linhas[i]
        },
      },
      ProjetoAtividadeEvento: { create: async () => ({}), findMany: async () => [] },
    },
  }
}

;(async () => {
  const L = await importarTela('lib/projetos-atividades.ts')

  // ── 1. A 507: o corpo real atravessa a extração da tela ──────────────────
  {
    const h = carregarHandler(LISTAR)
    const r = await h(contexto({
      atividades: [
        ativ({ id: 'a1', status: 'backlog' }),
        ativ({ id: 'a2', status: 'deploy_feito' }),
        ativ({ id: 'a3', status: 'cancelada' }),
      ],
    }))
    ok('507-responde-200', r.status === 200, r.status)

    // É AQUI que estava o defeito: `r.body.data` não é array.
    ok('507-o-data-nao-e-array-e-a-tela-tem-de-saber',
      !Array.isArray(r.body.data), typeof r.body.data)

    const { lista, resumo, erro } = L.extrairAtividades(r.body)
    ok('507-contrato:a-extracao-nao-acusa-erro', erro === '', erro)
    ok('507-contrato:a-lista-chega-com-as-tres',
      Array.isArray(lista) && lista.length === 3, lista && lista.length)
    ok('507-contrato:os-ids-batem',
      lista.map((a) => a.id).sort().join(',') === 'a1,a2,a3', lista.map((a) => a.id))
    ok('507-contrato:o-resumo-chega', !!resumo, resumo)
    // Os números do resumo são os do SERVIDOR, não recalculados pela tela.
    ok('507-contrato:o-resumo-tem-os-numeros-do-servidor',
      resumo.total === 2 && resumo.concluidas === 1 && resumo.progresso === 50
      && resumo.canceladas === 1, resumo)

    // E o agrupamento — que foi o que lançou em produção — roda sobre a lista.
    let caiu = ''
    try { L.agrupar(lista) } catch (e) { caiu = String(e.message || e) }
    ok('507-contrato:o-agrupamento-nao-lanca', caiu === '', caiu)
    const g = L.agrupar(lista)
    ok('507-contrato:cada-uma-cai-na-sua-coluna',
      g.colunas[0].itens.length === 1
      && g.colunas[g.colunas.length - 1].itens.length === 1
      && g.canceladas.length === 1,
      { primeira: g.colunas[0].itens.length, ultima: g.colunas[g.colunas.length - 1].itens.length })
  }

  // ── 2. O caminho que derrubou a página, dito por extenso ─────────────────
  //
  // `data || []` num corpo onde `data` é objeto devolve o OBJETO, e o
  // agrupamento chama `.filter` nele. Este caso guarda o erro exato.
  {
    const h = carregarHandler(LISTAR)
    const r = await h(contexto({ atividades: [ativ({ id: 'a1' })] }))
    const comoEra = r.body.data || []
    let mensagem = ''
    try { L.agrupar(comoEra) } catch (e) { mensagem = String(e.message || e) }
    ok('507-o-caminho-antigo-lancava-mesmo', /filter is not a function/.test(mensagem), mensagem)
  }

  // ── 3. A 508 e a 509: `data` é a atividade, e a tela usa assim ───────────
  {
    const hc = carregarHandler(CRIAR)
    const rc = await hc(contexto({
      body: {
        titulo: 'Nova', descricao: 'Detalhe', responsavel_id: 'u9',
        previsao_entrega: '2026-12-01',
      },
    }))
    ok('508-responde-201', rc.status === 201, rc.status)
    ok('508-contrato:data-e-a-atividade',
      !!rc.body.data && !Array.isArray(rc.body.data) && typeof rc.body.data.id === 'string',
      rc.body.data && Object.keys(rc.body.data).slice(0, 5))
    ok('508-contrato:a-atividade-tem-o-que-a-tela-mostra',
      ['id', 'titulo', 'status', 'responsavel_id', 'previsao_entrega', 'updated_at']
        .every((c) => c in rc.body.data), Object.keys(rc.body.data || {}))

    const he = carregarHandler(EDITAR)
    const re = await he(contexto({
      params: { id: 'p1', aid: 'a1' }, body: { status: 'em_desenvolvimento' },
      atividades: [ativ({ id: 'a1' })],
    }))
    ok('509-responde-200', re.status === 200, re.status)
    ok('509-contrato:data-e-a-atividade-movida',
      !!re.body.data && re.body.data.status === 'em_desenvolvimento', re.body.data)
    // A tela troca o cartão pela resposta: `updated_at` TEM de vir, senão o
    // próximo PATCH vai com carimbo velho e leva 409.
    ok('509-contrato:a-resposta-traz-o-updated_at',
      typeof (re.body.data || {}).updated_at === 'string' && !!re.body.data.updated_at,
      (re.body.data || {}).updated_at)
  }

  // ── 4. Forma inesperada NÃO derruba a página ─────────────────────────────
  {
    for (const [nome, corpo] of [
      ['data-vazio', {}],
      ['data-nulo', { data: null }],
      ['data-numero', { data: 7 }],
      ['data-objeto-sem-atividades', { data: { resumo: {} } }],
      ['atividades-nao-array', { data: { atividades: 'oi' } }],
      ['corpo-nulo', null],
      ['corpo-texto', 'erro do gateway'],
    ]) {
      let caiu = ''
      let saida = null
      try { saida = L.extrairAtividades(corpo) } catch (e) { caiu = String(e.message || e) }
      ok('forma-estranha-nao-lanca:' + nome, caiu === '', caiu)
      // `Array.isArray` antes do `.length`: sem isso, um mutante que devolve
      // `lista: undefined` mata o arquivo por exceção em vez de reprovar este
      // caso — e eu perco justamente a informação de qual regra quebrou.
      ok('forma-estranha-vira-erro-na-tela:' + nome,
        !!saida && Array.isArray(saida.lista) && saida.lista.length === 0 && saida.erro !== '',
        saida)
    }
    // E a forma que um dia pode vir — `data` como array — continua funcionando.
    const comArray = L.extrairAtividades({ data: [ativ({ id: 'a1' })], resumo: { total: 1 } })
    ok('se-a-rota-passar-a-devolver-array-a-tela-aguenta',
      comArray.erro === '' && comArray.lista.length === 1 && comArray.resumo.total === 1,
      comArray)
  }

  // ── 5. A tela usa a função, e não o caminho antigo ───────────────────────
  {
    const quadro = semComentarios('_components/projetos/kanban-de-atividades.tsx')
    ok('a-tela-extrai-pela-funcao', quadro.includes('extrairAtividades(r)'), null)
    ok('a-tela-nao-usa-mais-o-caminho-antigo',
      !/setAtividades\(r\.data \|\| \[\]\)/.test(quadro) && !/setResumoDoServidor\(r\.resumo/.test(quadro),
      null)
    ok('forma-estranha-vai-para-o-estado-de-erro',
      /setErro\(erroDeForma\)/.test(quadro), null)
  }

  fim()
})()
