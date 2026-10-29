// O quadro de atividades — a REGRA dele, executada.
//
// A regra do quadro (colunas, agrupamento, ordem, progresso, para onde o
// teclado move, atraso, campos obrigatórios) mora em
// `app/lib/projetos-atividades.ts` justamente para poder ser executada: regra
// dentro de componente só se testa com renderizador, que este projeto não tem.
//
// O caso que importa mais não é nenhum deles isolado: é a comparação com o
// SERVIDOR. A tela refaz o progresso e a ordem para não ir ao servidor a cada
// render; são duas implementações da mesma conta, em linguagens diferentes, e
// o que as amarra é o bloco 6 — a mesma massa nas duas, comparada.
//
// Roda com: node projetos-kanban-de-atividades.test.js
const { carregarHandlerEContexto, reply, ok, fim } = require('./_carregar.js')
const fs = require('node:fs')
const path = require('node:path')
const { registrarTS, importarTela, semComentarios, APP } = require('./_tela.js')

registrarTS()

const HOJE = '2026-03-10'

// A ordem das 7 etapas, decidida pelo Leonardo em 29/10. Mora no topo porque
// dois blocos a usam; dentro de um deles, o outro não a veria.
const ORDEM = 'backlog,em_desenvolvimento,finalizado_dev,pronto_para_teste,'
  + 'teste_aprovado,teste_reprovado,deploy_feito'

function a(o) {
  return {
    id: o.id, projeto_id: 'p1', titulo: o.titulo || o.id, status: o.status || 'backlog',
    ordem: o.ordem === undefined ? 0 : o.ordem,
    created_at: o.criado || '2026-02-01T00:00:00.000Z',
    previsao_entrega: o.fim || '', updated_at: '2026-02-01T00:00:00.000Z',
  }
}

;(async () => {
  const L = await importarTela('lib/projetos-atividades.ts')

  // ── 1. O lugar único das duas decisões em aberto ──────────────────────────
  {
    ok('as-colunas-sao-as-sete-etapas-na-ordem',
      L.COLUNAS.map((c) => c.status).join(',') === ORDEM, L.COLUNAS.map((c) => c.status))
    ok('toda-coluna-tem-titulo', L.COLUNAS.every((c) => !!c.titulo && c.titulo.length > 2), L.COLUNAS)
    ok('a-etapa-pronta-e-a-ultima-coluna',
      L.ST_PRONTO === 'deploy_feito' && L.COLUNAS[L.COLUNAS.length - 1].status === L.ST_PRONTO,
      L.ST_PRONTO)
    ok('a-etapa-inicial-e-a-primeira-coluna',
      L.ST_INICIAL === 'backlog' && L.COLUNAS[0].status === L.ST_INICIAL, L.ST_INICIAL)
    ok('cancelada-nao-e-coluna',
      !L.COLUNAS.some((c) => c.status === 'cancelada')
      && L.STATUS_CONHECIDOS.includes('cancelada'), L.STATUS_CONHECIDOS)
    ok('os-quatro-campos-sao-obrigatorios',
      L.CAMPOS_OBRIGATORIOS.join(',') === 'titulo,descricao,responsavel_id,previsao_entrega',
      L.CAMPOS_OBRIGATORIOS)
    ok('todo-obrigatorio-tem-rotulo',
      L.CAMPOS_OBRIGATORIOS.every((c) => !!L.ROTULOS[c]), L.ROTULOS)
    ok('todo-status-conhecido-tem-rotulo',
      L.STATUS_CONHECIDOS.every((s) => !!L.STATUS_LABELS[s]), L.STATUS_LABELS)
  }

  // ── 2. O que falta para gravar ────────────────────────────────────────────
  {
    const CHEIO = {
      titulo: 'Fazer', descricao: 'Detalhe', responsavel_id: 'u9', previsao_entrega: '2026-12-01',
    }
    ok('rascunho-vazio-falta-os-quatro',
      L.faltando(L.RASCUNHO_VAZIO).join(',') === 'titulo,descricao,responsavel_id,previsao_entrega',
      L.faltando(L.RASCUNHO_VAZIO))
    ok('com-os-quatro-nao-falta-nada', L.faltando(CHEIO).length === 0, L.faltando(CHEIO))
    // Um por um: com todos faltando, o primeiro esconderia os outros três.
    for (const campo of ['titulo', 'descricao', 'responsavel_id', 'previsao_entrega']) {
      const r = Object.assign({}, CHEIO); r[campo] = ''
      ok('falta-' + campo, L.faltando(r).join(',') === campo, L.faltando(r))
      const e = Object.assign({}, CHEIO); e[campo] = '   '
      ok('so-espaco-nao-preenche-' + campo, L.faltando(e).join(',') === campo, L.faltando(e))
    }
    // Campo que NÃO é obrigatório não entra na conta: entraria e o botão
    // ficaria desabilitado para sempre.
    ok('fase-vazia-nao-falta', L.faltando(Object.assign({}, CHEIO, { fase_id: '' })).length === 0,
      L.faltando(Object.assign({}, CHEIO, { fase_id: '' })))
  }

  // ── 3. Agrupar e ordenar ──────────────────────────────────────────────────
  {
    const todas = [
      a({ id: 'c', status: 'deploy_feito' }),
      a({ id: 'b', status: 'backlog', ordem: 2 }),
      a({ id: 'a', status: 'backlog', ordem: 1 }),
      a({ id: 'x', status: 'cancelada' }),
      a({ id: 'z', status: 'em_revisao' }),
    ]
    const g = L.agrupar(todas)
    ok('sete-colunas-na-ordem', g.colunas.map((c) => c.status).join(',') === ORDEM,
      g.colunas.map((c) => c.status))
    ok('as-sete-colunas-existem-mesmo-vazias', g.colunas.length === 7, g.colunas.length)
    ok('a-primeira-coluna-vem-por-ordem', g.colunas[0].itens.map((i) => i.id).join(',') === 'a,b',
      g.colunas[0].itens.map((i) => i.id))
    ok('coluna-vazia-existe-e-fica-vazia', g.colunas[1].itens.length === 0, g.colunas[1])
    ok('cancelada-sai-das-colunas-mas-nao-desaparece',
      !g.colunas.some((c) => c.itens.some((i) => i.id === 'x'))
      && g.canceladas.map((i) => i.id).join(',') === 'x', g.canceladas)
    // Status novo do servidor não pode sumir da tela sem ninguém notar.
    ok('status-desconhecido-nao-e-engolido',
      g.foraDasColunas.map((i) => i.id).join(',') === 'z', g.foraDasColunas)
    const total = g.colunas.reduce((n, c) => n + c.itens.length, 0)
      + g.canceladas.length + g.foraDasColunas.length
    ok('nenhuma-atividade-se-perde-no-agrupamento', total === todas.length, { total })
  }

  // ── 4. Empate de ordem cai no created_at, e depois no id ──────────────────
  {
    // Os ids estão na ordem CONTRÁRIA às datas de propósito: com 'a' mais
    // novo que 'b', um desempate que caísse direto no id devolveria 'a,b' e o
    // caso passaria sem provar nada sobre o created_at.
    const g = L.agrupar([
      a({ id: 'a-novo', ordem: 1, criado: '2026-02-02T00:00:00.000Z' }),
      a({ id: 'b-velho', ordem: 1, criado: '2026-02-01T00:00:00.000Z' }),
    ])
    ok('empate-de-ordem-vai-pelo-created_at',
      g.colunas[0].itens.map((i) => i.id).join(',') === 'b-velho,a-novo',
      g.colunas[0].itens.map((i) => i.id))
    const g2 = L.agrupar([
      a({ id: 'bb', ordem: 1, criado: '2026-02-01T00:00:00.000Z' }),
      a({ id: 'aa', ordem: 1, criado: '2026-02-01T00:00:00.000Z' }),
    ])
    ok('empate-total-vai-pelo-id', g2.colunas[0].itens.map((i) => i.id).join(',') === 'aa,bb',
      g2.colunas[0].itens.map((i) => i.id))
  }

  // ── 5. Mover por teclado e toque ──────────────────────────────────────────
  {
    ok('backlog-avanca-uma-etapa', L.destinoDoTeclado('backlog', 'proxima') === 'em_desenvolvimento')
    ok('anda-uma-etapa-por-vez-no-meio', L.destinoDoTeclado('pronto_para_teste', 'proxima') === 'teste_aprovado')
    ok('reprovado-volta-uma-etapa', L.destinoDoTeclado('teste_reprovado', 'anterior') === 'teste_aprovado')
    ok('a-segunda-volta-para-a-primeira', L.destinoDoTeclado('em_desenvolvimento', 'anterior') === 'backlog')
    // Nas pontas fica onde está: dar a volta faria "Concluída" virar "A fazer"
    // num toque a mais, e desfazer isso é outro movimento.
    ok('primeira-coluna-nao-tem-anterior', L.destinoDoTeclado('backlog', 'anterior') === null)
    ok('ultima-coluna-nao-tem-proxima', L.destinoDoTeclado('deploy_feito', 'proxima') === null)
    ok('cancelada-nao-anda-pelas-colunas',
      L.destinoDoTeclado('cancelada', 'proxima') === null
      && L.destinoDoTeclado('cancelada', 'anterior') === null)
    ok('status-desconhecido-nao-anda', L.destinoDoTeclado('em_revisao', 'proxima') === null)
  }

  // ── 6. A conta da tela e a do servidor dão o mesmo número ─────────────────
  {
    const massas = [
      [],
      [a({ id: '1', status: 'deploy_feito' }), a({ id: '2' })],
      [a({ id: '1', status: 'cancelada' }), a({ id: '2', status: 'deploy_feito' })],
      [a({ id: '1', status: 'cancelada' })],
      [a({ id: '1' }), a({ id: '2' }), a({ id: '3', status: 'deploy_feito' })],
    ]
    const { contexto } = carregarHandlerEContexto('507 projetos GET /projetos/:id/atividades')
    ok('o-servidor-expoe-a-conta-do-resumo', typeof contexto._resumoAtiv === 'function',
      typeof contexto._resumoAtiv)
    const divergem = []
    for (const m of massas) {
      const tela = L.resumo(m)
      const serv = contexto._resumoAtiv(m)
      // TODAS as chaves da tela, não uma lista escolhida: assim um campo novo
      // que a tela invente — ou que mude de nome — reprova aqui em vez de
      // passar porque a lista do teste não o mencionava. O servidor pode ter
      // chaves a mais (em_andamento, a_fazer, atrasadas); a tela, nenhuma.
      const iguais = Object.keys(tela).every((k) => tela[k] === serv[k])
      if (!iguais) divergem.push({ m: m.map((x) => x.status), tela, serv })
    }
    ok('tela-e-servidor-dao-o-mesmo-resumo', divergem.length === 0, divergem)
    // E o caso que a fórmula do protótipo precisa garantir, dito por extenso:
    const so1 = L.resumo([a({ id: '1', status: 'cancelada' })])
    ok('projeto-so-com-cancelada-nao-vira-100-por-cento',
      so1.total === 0 && so1.progresso === 0, so1)
    // O nome do campo faz parte do contrato: `percentual` passaria no valor e
    // quebraria quem lê a resposta do servidor.
    ok('a-tela-usa-o-nome-do-servidor-para-o-progresso',
      'progresso' in so1 && !('percentual' in so1), Object.keys(so1))
  }

  // ── 7. Atraso ─────────────────────────────────────────────────────────────
  {
    ok('sem-previsao-nao-atrasa', L.atrasada(a({ id: '1' }), HOJE) === false)
    ok('previsao-no-passado-atrasa', L.atrasada(a({ id: '1', fim: '2026-03-09' }), HOJE) === true)
    ok('previsao-hoje-nao-atrasa', L.atrasada(a({ id: '1', fim: HOJE }), HOJE) === false)
    ok('previsao-no-futuro-nao-atrasa', L.atrasada(a({ id: '1', fim: '2026-03-11' }), HOJE) === false)
    // Terminada não atrasa: cobrar prazo de trabalho que já acabou é a tela
    // acusando atraso que não existe mais.
    ok('deploy-feito-no-passado-nao-atrasa',
      L.atrasada(a({ id: '1', fim: '2026-03-01', status: 'deploy_feito' }), HOJE) === false)
    ok('cancelada-no-passado-nao-atrasa',
      L.atrasada(a({ id: '1', fim: '2026-03-01', status: 'cancelada' }), HOJE) === false)
  }

  // ── 8. A aba, e o que o quadro NÃO faz ───────────────────────────────────
  {
    const tela = semComentarios('(admin)/admin/projetos/ver/client.tsx')
    ok('a-aba-kanban-existe', tela.includes("setVista('kanban')") && tela.includes('Kanban'), null)
    ok('cronograma-e-lista-continuam',
      tela.includes("setVista('gantt')") && tela.includes("setVista('lista')"), null)
    ok('kanban-e-a-visao-padrao', /VISTA_PADRAO = 'kanban'/.test(tela), null)
    ok('a-vista-padrao-e-usada-no-estado', /useState<[^>]*>\(VISTA_PADRAO\)/.test(tela), null)
    // Com três vistas, o Gantt não pode ser o "senão" da lista: seria o
    // Cronograma aparecendo embaixo do Kanban.
    // `vista === 'lista' ?` aparece também no ternário de ESTILO do botão —
    // asserção sobre ele passaria com o galho da vista desfeito. O que prova é
    // a cadeia inteira: Gantt, senão Lista, senão nada.
    ok('as-tres-vistas-sao-exclusivas',
      /\)\s*:\s*vista === 'lista' \?\s*\(/.test(tela) && tela.includes(') : null}'), null)

    const quadro = semComentarios('_components/projetos/kanban-de-atividades.tsx')
    ok('os-tres-estados-existem',
      quadro.includes('Carregando atividades') && quadro.includes('Tentar de novo')
      && quadro.includes('ainda não tem atividades'), null)
    ok('o-erro-de-leitura-e-anunciado', (quadro.match(/role="alert"/g) || []).length >= 2, null)
    ok('mover-tem-rotulo-para-leitor-de-tela',
      (quadro.match(/aria-label=\{/g) || []).length >= 2, null)
    ok('o-quadro-usa-o-destino-do-teclado', quadro.includes('destinoDoTeclado'), null)
    ok('o-arraste-usa-a-mesma-biblioteca-do-quadro-dev',
      quadro.includes("from '@dnd-kit/core'") && quadro.includes('DndContext'), null)
    ok('o-arraste-exige-distancia-minima', /activationConstraint: \{ distance: \d+ \}/.test(quadro), null)
    // Com 7 etapas, lado a lado no celular daria cartões de ~50px. Empilha no
    // telefone e vira faixa que rola para o lado no desktop.
    ok('as-colunas-empilham-no-celular',
      quadro.includes('flex flex-col sm:flex-row') && quadro.includes('sm:overflow-x-auto'), null)
    ok('a-coluna-tem-largura-fixa-no-desktop', quadro.includes('sm:w-56 sm:shrink-0'), null)
    // Decisão B: atividade não é card do Dev, e o quadro local não lê nem
    // escreve nada do quadro global.
    // A lista proíbe o que o COMPONENTE poderia escrever para alcançar o card
    // Dev — `cards/` sozinho mora na camada de API, não aqui, e proibi-lo dava
    // a impressão de cobertura que não existia.
    for (const proibido of [
      'Ticket', 'dev/tickets', 'CardDependencia', 'cards/',
      'projetosApi.cards', 'projetosApi.dependencias', 'ticket_id', 'card_id',
    ]) {
      ok('quadro-nao-toca-no-card-dev:' + proibido, !quadro.includes(proibido), null)
    }
    ok('o-quadro-nao-decide-coluna-por-conta-propria',
      !/const COLUNAS|colunas = \[/.test(quadro) && quadro.includes("from '@/lib/projetos-atividades'"), null)

    const form = semComentarios('_components/projetos/nova-atividade.tsx')
    ok('o-formulario-le-o-obrigatorio-do-lugar-unico',
      form.includes('CAMPOS_OBRIGATORIOS') && form.includes('faltando('), null)
    ok('o-formulario-diz-o-que-falta', form.includes('Falta:'), null)
    // A gravação otimista TEM de desfazer: sem isso o cartão fica na coluna
    // nova com o servidor dizendo outra coisa, e a próxima leitura o joga de
    // volta sem explicação. Isto é asserção de TEXTO, e a digo como tal: o
    // comportamento vive dentro do componente, e este projeto não tem
    // renderizador para exercitá-lo de verdade.
    ok('o-mover-desfaz-no-erro-(asserção-de-texto)',
      /catch \(e\) \{\s*setAtividades\(antes\)/.test(quadro), null)
    ok('o-mover-adota-a-resposta-do-servidor-(asserção-de-texto)',
      /setAtividades\(\(atual\)[\s\S]{0,160}r\.data/.test(quadro), null)

    ok('o-formulario-nao-apaga-o-rascunho-no-erro',
      /catch[\s\S]{0,200}setErro\(/.test(form) && !/catch[\s\S]{0,120}fechar\(\)/.test(form), null)
  }

  // ── 9. Quem pode mover (D6c, 29/10) ──────────────────────────────────────
  {
    const casos = [
      ['planeja-move-a-de-outro', { responsavel_id: 'OUTRO' }, { podePlanejar: true, meuId: 'u1' }, true],
      ['planeja-move-a-sem-responsavel', { responsavel_id: '' }, { podePlanejar: true, meuId: 'u1' }, true],
      ['responsavel-move-a-sua', { responsavel_id: 'u1' }, { podePlanejar: false, meuId: 'u1' }, true],
      ['nao-move-a-de-outro', { responsavel_id: 'OUTRO' }, { podePlanejar: false, meuId: 'u1' }, false],
      // O caso perigoso: atividade sem responsável não pode virar de todo
      // mundo. `"" === ""` daria true.
      ['sem-responsavel-nao-e-de-todos', { responsavel_id: '' }, { podePlanejar: false, meuId: 'u1' }, false],
      ['sem-identidade-nao-move', { responsavel_id: 'u1' }, { podePlanejar: false, meuId: '' }, false],
      ['dois-vazios-nao-casam', { responsavel_id: '' }, { podePlanejar: false, meuId: '' }, false],
    ]
    for (const [nome, ativ_, quem, esperado] of casos) {
      ok('podeMover:' + nome, L.podeMover(ativ_, quem) === esperado, { nome, ativ_, quem })
    }
    // A mesma régua do servidor: compara com a tabela do teste do handler.
    const servidor = {
      'planeja-move-a-de-outro': true, 'responsavel-move-a-sua': true,
      'nao-move-a-de-outro': false, 'sem-responsavel-nao-e-de-todos': false,
    }
    const divergem = casos
      .filter(([nome]) => servidor[nome] !== undefined)
      .filter(([nome, a_, q]) => L.podeMover(a_, q) !== servidor[nome])
      .map(([nome]) => nome)
    ok('podeMover-nao-diverge-do-servidor', divergem.length === 0, divergem)
  }

  // ── 10. O PATCH manda só o que mudou ─────────────────────────────────────
  {
    const orig = { titulo: 'A', descricao: 'B', responsavel_id: 'u1', previsao_entrega: '2026-12-01' }
    ok('nada-mudou-nao-manda-nada',
      Object.keys(L.soOqueMudou(orig, Object.assign({}, orig))).length === 0,
      L.soOqueMudou(orig, orig))
    ok('manda-so-o-campo-trocado',
      JSON.stringify(L.soOqueMudou(orig, Object.assign({}, orig, { titulo: 'C' }))) === '{"titulo":"C"}',
      L.soOqueMudou(orig, Object.assign({}, orig, { titulo: 'C' })))
    // É o caso que a revisão do 2b pegou: o responsável salvando a descrição
    // não pode mandar `responsavel_id`, senão bate na trava de troca.
    const soDesc = L.soOqueMudou(orig, Object.assign({}, orig, { descricao: 'Z' }))
    ok('responsavel-igual-nao-vai-no-corpo', soDesc.responsavel_id === undefined, soDesc)
    ok('campo-ausente-no-original-conta-como-vazio',
      JSON.stringify(L.soOqueMudou({}, { titulo: 'X' })) === '{"titulo":"X"}',
      L.soOqueMudou({}, { titulo: 'X' }))
    ok('vazio-para-vazio-nao-e-mudanca',
      Object.keys(L.soOqueMudou({ fase_id: '' }, { fase_id: '' })).length === 0, null)
    // Campo que o servidor nem devolveu, com o formulário vazio, NÃO é
    // mudança. Sem isso o PATCH mandaria um obrigatório vazio e levaria 400.
    ok('ausente-no-original-e-vazio-no-rascunho-nao-e-mudanca',
      Object.keys(L.soOqueMudou({}, { descricao: '' })).length === 0,
      L.soOqueMudou({}, { descricao: '' }))
    ok('undefined-no-original-e-vazio-no-rascunho-nao-e-mudanca',
      Object.keys(L.soOqueMudou({ descricao: undefined }, { descricao: '' })).length === 0,
      L.soOqueMudou({ descricao: undefined }, { descricao: '' }))
  }

  // ── 11. O recado de erro: sem stack e sem nome de model ──────────────────
  //
  // Até a publicação dos models, as três rotas respondem erro em produção. O
  // texto que vem de lá é "Model ProjetoAtividade missing", que não diz nada a
  // quem está usando o portal.
  {
    const comModel = L.mensagemDeErro(new Error('Model ProjetoAtividade missing'))
    ok('model-missing-vira-recado-humano',
      comModel.includes('ainda não estão disponíveis') && !comModel.includes('Model'), comModel)
    const comPilha = L.mensagemDeErro(new Error('TypeError: x is not a function\n    at foo (/a/b.js:1:1)'))
    ok('pilha-nao-chega-na-tela',
      !comPilha.includes('at ') && !comPilha.includes('/a/b.js') && !comPilha.includes('TypeError'),
      comPilha)
    ok('erro-vazio-tem-recado-de-leitura',
      L.mensagemDeErro(new Error('')).includes('ler as atividades'), L.mensagemDeErro(new Error('')))
    ok('erro-vazio-na-gravacao-fala-de-salvar',
      L.mensagemDeErro(new Error(''), 'gravar').includes('salvar'),
      L.mensagemDeErro(new Error(''), 'gravar'))
    // Mensagem de negócio do servidor PASSA: é ela que explica o 400.
    ok('mensagem-de-negocio-passa',
      L.mensagemDeErro(new Error('A previsão não pode ser anterior ao início'))
        === 'A previsão não pode ser anterior ao início', null)
    // Mensagem de negócio com pilha colada atrás: a primeira linha passa, o
    // resto não. Sem o descarte, o `at ...` apareceria na tela.
    const negocioComPilha = L.mensagemDeErro(
      new Error('A previsão não pode ser anterior ao início\n    at foo'))
    ok('pilha-atras-de-mensagem-de-negocio-nao-chega',
      negocioComPilha === 'A previsão não pode ser anterior ao início', negocioComPilha)
    ok('nenhum-recado-vaza-caminho-de-arquivo',
      !L.mensagemDeErro(new Error('falhou em /var/app/x.js')).includes('/var'), null)
  }

  // ── 12. A tela respeita as portas ────────────────────────────────────────
  {
    const quadro = semComentarios('_components/projetos/kanban-de-atividades.tsx')
    ok('o-quadro-usa-podeMover-para-o-cartao', /podeMexer=\{podeMover\(a, \{ podePlanejar, meuId \}\)\}/.test(quadro), null)
    ok('o-arraste-respeita-a-mesma-porta', quadro.includes('disabled: !podeMexer || salvando'), null)
    ok('mover-confere-a-porta-antes-de-gravar',
      /if \(!podeMover\(a, \{ podePlanejar, meuId \}\)\) return/.test(quadro), null)
    ok('criar-aparece-so-para-quem-planeja',
      /\{podePlanejar && \(\s*<NovaAtividade/.test(quadro), null)
    ok('o-quadro-prefere-o-resumo-do-servidor',
      quadro.includes('resumoDoServidor || resumo(todas)'), null)
    ok('o-erro-passa-pelo-recado-humano',
      (quadro.match(/mensagemDeErro\(/g) || []).length >= 2, null)

    const ed = semComentarios('_components/projetos/editar-atividade.tsx')
    ok('a-edicao-manda-so-o-que-mudou', ed.includes('soOqueMudou(original, r)'), null)
    ok('a-edicao-manda-o-updated_at-lido', ed.includes('updated_at: atividade.updated_at'), null)
    ok('a-edicao-trava-o-responsavel-para-quem-nao-planeja',
      ed.includes('disabled={!podePlanejar}'), null)
    ok('a-edicao-nao-salva-sem-mudanca', /disabled=\{!!falta\.length \|\| nada \|\| gravando\}/.test(ed), null)
    ok('a-edicao-oferece-cancelar-como-etapa', ed.includes("value=\"cancelada\""), null)

    const form = semComentarios('_components/projetos/nova-atividade.tsx')
    ok('o-formulario-tem-campo-de-responsavel', form.includes('ativ-dono'), null)
    ok('o-formulario-diz-o-que-falta-com-rotulo', form.includes('ROTULOS[c]'), null)
  }

  // ── 13. Os botões do cartão ficam atrás da MESMA porta do arraste ────────
  //
  // Provar que o arraste está travado não prova nada sobre os botões: trocar
  // `{podeMexer && (` por `{true && (` deixa ‹ ›, › e Editar na tela de todo
  // mundo e nenhuma asserção de permissão reprova. Então o recorte é
  // estrutural: a função `Cartao`, e dentro dela o bloco da porta.
  {
    const fonte = fs.readFileSync(
      path.join(APP, '_components/projetos/kanban-de-atividades.tsx'), 'utf8')
    const iCartao = fonte.indexOf('function Cartao(')
    const iColuna = fonte.indexOf('function Coluna(')
    ok('achou-a-funcao-do-cartao', iCartao > 0 && iColuna > iCartao, { iCartao, iColuna })
    const cartao = fonte.slice(iCartao, iColuna)

    const iPorta = cartao.indexOf('{podeMexer && (')
    ok('o-cartao-tem-o-bloco-da-porta', iPorta > 0, iPorta)
    const dentro = cartao.slice(iPorta)
    const fora = cartao.slice(0, iPorta)

    // Os três controles de escrita moram DENTRO do bloco, e nenhum fora dele.
    for (const [nome, marca] of [
      ['mover-para-a-etapa-anterior', '<ChevronLeft'],
      ['mover-para-a-proxima-etapa', '<ChevronRight'],
      ['editar', '<Pencil'],
    ]) {
      ok('controle-dentro-da-porta:' + nome, dentro.includes(marca), { nome, marca })
      ok('controle-nao-aparece-fora-da-porta:' + nome, !fora.includes(marca), { nome, marca })
    }
    // E a porta é a MESMA que trava o arraste: um `true` no lugar dela deixaria
    // os botões soltos com o arraste ainda travado.
    ok('a-porta-do-bloco-e-a-variavel-e-nao-um-literal',
      /\{podeMexer && \(/.test(cartao) && !/\{true && \(/.test(cartao), null)
    ok('o-arraste-usa-a-mesma-variavel', cartao.includes('disabled: !podeMexer || salvando'), null)
    // Nenhum `onClick` de escrita fora do bloco.
    ok('nenhum-clique-de-escrita-fora-da-porta',
      !/onClick=\{\(\) => (aoMover|aoEditar)/.test(fora), null)
  }

  // ── 14. `podePlanejar` é a régua do catálogo, não uma cópia ──────────────
  //
  // Este campo decide o botão de criar atividade e o seletor de responsável. A
  // conta estava refeita dentro do hook, e trocar `temNivel('admin')` por
  // `temNivel('developer')` passava por todos os testes.
  {
    const G = await importarTela('lib/auth/feature-grants.ts')
    const esperado = [
      ['developer-sem-grant', { role: 'developer', featureGrants: [] }, false],
      ['support-sem-grant', { role: 'support', featureGrants: [] }, false],
      ['user-sem-grant', { role: 'user', featureGrants: [] }, false],
      ['support+planejamento', { role: 'support', featureGrants: ['planejamento'] }, true],
      ['developer+planejamento', { role: 'developer', featureGrants: ['planejamento'] }, true],
      ['admin', { role: 'admin', featureGrants: [] }, true],
      ['master', { role: 'master', featureGrants: [] }, true],
      // QA não é planejamento: são permissões diferentes.
      ['support+qa', { role: 'support', featureGrants: ['qa'] }, false],
    ]
    for (const [nome, actor, vale] of esperado) {
      ok('canPlanejar:' + nome, G.canPlanejar(actor) === vale, { nome, actor })
    }

    // `canCadastrarEmpresa` entrou aqui porque o hook passou a depender dela
    // junto com `canPlanejar` — e regra da qual a tela depende sem tabela-
    // verdade é regra que pode perder uma metade sem ninguém notar. Tirar o
    // grant dela passava na suíte inteira.
    const empresa = [
      ['admin', { role: 'admin', featureGrants: [] }, true],
      ['master', { role: 'master', featureGrants: [] }, true],
      ['support+cadastro_empresa', { role: 'support', featureGrants: ['cadastro_empresa'] }, true],
      ['developer+cadastro_empresa', { role: 'developer', featureGrants: ['cadastro_empresa'] }, true],
      ['developer-sem-grant', { role: 'developer', featureGrants: [] }, false],
      ['support-sem-grant', { role: 'support', featureGrants: [] }, false],
      // Planejamento não é cadastro de empresa: são permissões diferentes.
      ['support+planejamento', { role: 'support', featureGrants: ['planejamento'] }, false],
    ]
    for (const [nome, actor, vale] of empresa) {
      ok('canCadastrarEmpresa:' + nome, G.canCadastrarEmpresa(actor) === vale, { nome, actor })
    }
    // As duas são permissões SEPARADAS: quem tem uma não ganha a outra.
    ok('as-duas-permissoes-nao-se-confundem',
      G.canPlanejar({ role: 'support', featureGrants: ['cadastro_empresa'] }) === false
      && G.canCadastrarEmpresa({ role: 'support', featureGrants: ['planejamento'] }) === false, null)

    // E o hook CHAMA a regra, em vez de repeti-la.
    const hook = semComentarios('_hooks/use-meu-acesso.ts')
    ok('o-hook-chama-canPlanejar', /podePlanejar: canPlanejar\(\{/.test(hook), null)
    ok('o-hook-nao-refaz-a-conta-do-planejamento',
      !/podePlanejar:\s*temNivel\(/.test(hook) && !hook.includes("includes('planejamento')"), null)
    // O vizinho tinha a mesma cópia e foi junto: deixar um dos dois refeito
    // seria manter o mesmo defeito ao lado do conserto.
    ok('o-vizinho-do-cadastro-de-empresa-tambem-chama-a-regra',
      /podeCadastrarEmpresa: canCadastrarEmpresa\(\{/.test(hook), null)
  }

  fim()
})()
