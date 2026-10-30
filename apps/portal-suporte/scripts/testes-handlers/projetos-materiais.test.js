// Materiais de Apoio do projeto: o campo fica DENTRO do projeto e isolado do
// acervo de Arquivos.
//
// Pedido do Leonardo (30/10): "não quero que vincule para não misturar os
// arquivos, se for somente no backend beleza, mas o campo tem que ser dentro do
// projeto e isolado dos outros kanbans".
//
// O armazenamento é o mesmo do acervo — `Arquivo` + `ArquivoConteudo`, que já
// têm conferência de tipo, teto de 10 MB e apagar lógico provados. A separação
// é de ESCOPO. E isolamento que vale só na tela não é isolamento: o que este
// teste cobra é que as rotas do acervo não alcancem o material nem com o id na
// mão — nem listando, nem baixando, nem apagando.
//
// Roda com: node projetos-materiais.test.js
const { carregarHandler, reply, ok, fim } = require('./_carregar.js')
const { camadaFindMany } = require('./_camada.js')

const LISTAR = '512 projetos GET /projetos/:id/materiais'
const ENVIAR = '513 projetos POST /projetos/:id/materiais'
const BAIXAR = '514 projetos GET /projetos/:id/materiais/:mid/conteudo'
const APAGAR = '515 projetos DELETE /projetos/:id/materiais/:mid'
const ACERVO_LISTA = '490a1 arquivos GET /arquivos'
const ACERVO_UM = '490a3 arquivos GET /arquivos/:id'
const ACERVO_APAGA = '490a4 arquivos DELETE /arquivos/:id'

const PDF = 'data:application/pdf;base64,' + Buffer.from('conteudo').toString('base64')

/** Um material já gravado, como o POST o grava. */
function material(o) {
  return Object.assign({
    id: 'm1', nome: 'Escopo.pdf', tipo: 'application/pdf', tamanho: 8,
    dono_id: 'u1', escopo: 'projeto', projeto_id: 'p1', pasta: '',
    // SEM `ativo`, como o POST grava: é o que tira o material do filtro da
    // listagem do acervo.
    acl_nivel: '', acl_grant: '',
    criado_em: '2026-10-30T10:00:00.000Z', created_at: '2026-10-30T10:00:00.000Z',
  }, o)
}

/** Um arquivo do ACERVO: sem escopo, como o POST /arquivos o grava. */
function doAcervo(o) {
  return Object.assign({
    id: 'a1', nome: 'Manual.pdf', tipo: 'application/pdf', tamanho: 8,
    dono_id: 'u1', pasta: 'manuais', ativo: 'sim', acl_nivel: '', acl_grant: '',
    criado_em: '2026-10-30T09:00:00.000Z', created_at: '2026-10-30T09:00:00.000Z',
  }, o)
}

function montar(o) {
  const op = o || {}
  const arquivos = (op.arquivos || []).slice()
  const conteudos = (op.conteudos || []).slice()
  const reg = { update: [], create: [], delete: [], log: [] }
  const perfil = Object.assign(
    { id: 'u1', role: 'developer', feature_grants: ['projetos'] }, op.perfil || {})
  return {
    reg,
    arquivos,
    ctx: {
      headers: {}, user: { id: perfil.id }, query: op.query || {},
      params: op.params || { id: 'p1' },
      body: op.body || {},
      reply: reply(),
      models: {
        Profile: { findById: async () => perfil },
        Sessao: { findById: async () => null },
        Projeto: {
          findById: async (id) => (op.semProjeto ? null
            : { id: String(id), nome: 'Projeto', responsavel_id: 'u9' }),
        },
        Arquivo: {
          findById: async (id) => arquivos.find((a) => String(a.id) === String(id)) || null,
          // O emulador FIEL da camada: filtro de campo ANTES do teto de 500.
          // Com um fake que devolvesse tudo, o caso de acervo grande passaria
          // sem medir nada.
          findMany: async (f) => camadaFindMany(arquivos, f),
          create: async (d) => {
            if (op.falhaAoCriarArquivo) throw new Error('falhou')
            reg.create.push(d); arquivos.push(d); return d
          },
          update: async (id, d) => {
            reg.update.push({ id: String(id), dados: d })
            const i = arquivos.findIndex((a) => String(a.id) === String(id))
            if (i >= 0) arquivos[i] = Object.assign({}, arquivos[i], d)
            return arquivos[i]
          },
          delete: async (id) => {
            reg.delete.push(String(id))
            const i = arquivos.findIndex((a) => String(a.id) === String(id))
            if (i >= 0) arquivos.splice(i, 1)
          },
        },
        ArquivoConteudo: {
          findById: async (id) => conteudos.find((c) => String(c.id) === String(id)) || null,
          create: async (d) => {
            if (op.falhaAoCriarConteudo) throw new Error('falhou')
            conteudos.push(d); return d
          },
        },
        ArquivoEvento: { create: async () => ({}) },
        ActivityLog: { create: async (d) => { reg.log.push(d); return d } },
      },
    },
  }
}

async function chamar(marca, o) {
  const h = carregarHandler(marca)
  const m = montar(o)
  const r = await h(m.ctx)
  return { r, m }
}

;(async () => {
  // ── 1. O acervo não enxerga o material ───────────────────────────────────
  //
  // É o pedido, e é a parte que precisa valer no SERVIDOR: esconder só na tela
  // deixaria o material a um id de distância de quem abrisse Arquivos.
  {
    const massa = [doAcervo(), material()]

    const lista = await chamar(ACERVO_LISTA, { arquivos: massa, query: {} })
    const ids = ((lista.r.body.data || {}).arquivos || []).map((a) => a.id)
    ok('acervo:a-listagem-nao-mostra-material', !ids.includes('m1'), ids)
    // E o laboratório mede: o arquivo do acervo, na mesma massa, aparece.
    ok('acervo:a-listagem-continua-mostrando-o-que-e-do-acervo', ids.includes('a1'), ids)

    // Defesa em profundidade, e ela é testada: uma linha de material que
    // CARREGUE o estado do acervo (`ativo: "sim"`) atravessa o filtro da
    // camada, e é a conferência de escopo dentro do laço que a tira da vista.
    // Sem este caso, aquela conferência seria uma linha que nenhum mutante
    // mata — e linha que nada mata é linha que não dá para dizer que protege.
    {
      const comEstado = await chamar(ACERVO_LISTA, {
        arquivos: [doAcervo(), material({ ativo: 'sim' })], query: {},
      })
      const vistos = ((comEstado.r.body.data || {}).arquivos || []).map((a) => a.id)
      ok('acervo:material-com-estado-do-acervo-ainda-assim-nao-aparece',
        !vistos.includes('m1'), vistos)
      ok('acervo:e-o-arquivo-do-acervo-continua-aparecendo', vistos.includes('a1'), vistos)
    }

    // O conteúdo do material VAI na massa: sem ele o 404 viria da falta de
    // conteúdo e não da trava de escopo, e o caso passaria com a trava fora.
    const conteudos = [
      { id: 'm1', arquivo_id: 'm1', conteudo: PDF },
      { id: 'a1', arquivo_id: 'a1', conteudo: PDF },
    ]
    const um = await chamar(ACERVO_UM, {
      arquivos: massa, conteudos, params: { id: 'm1' },
    })
    ok('acervo:baixar-material-pelo-acervo-da-404', um.r.status === 404,
      { status: um.r.status, body: um.r.body })
    const umAcervo = await chamar(ACERVO_UM, {
      arquivos: massa, conteudos, params: { id: 'a1' },
    })
    ok('acervo:baixar-o-que-e-do-acervo-continua-funcionando', umAcervo.r.status === 200,
      umAcervo.r.status)

    const apaga = await chamar(ACERVO_APAGA, { arquivos: massa, params: { id: 'm1' } })
    ok('acervo:apagar-material-pelo-acervo-da-404', apaga.r.status === 404, apaga.r.status)
    ok('acervo:apagar-material-pelo-acervo-nao-grava', apaga.m.reg.update.length === 0,
      apaga.m.reg.update)

    // ── O acervo não pode ENCOLHER por causa do material ──────────────────
    //
    // A listagem do acervo sem pasta filtra por `ativo: "sim"` na camada
    // justamente para não gastar a janela de 500 com linha que será descartada
    // depois. Material que gravasse `ativo: "sim"` entraria nessa janela e
    // empurraria o acervo para fora dela: a lista encolheria em silêncio.
    //
    // A massa é feita do que o POST REALMENTE grava, não de um objeto
    // inventado aqui: é a junção entre as duas rotas que precisa valer.
    {
      const criado = await chamar(ENVIAR, {
        params: { id: 'p1' }, body: { nome: 'Escopo.pdf', conteudo: PDF },
      })
      const linhaDoPost = criado.m.reg.create[0]
      ok('acervo:o-post-gravou-para-esta-prova', !!linhaDoPost, criado.r.status)

      // O arquivo do acervo é o mais ANTIGO — primeiro na ordem de inserção,
      // que é como a camada ordena ("a mais recente primeiro" é a ordem da
      // tabela invertida). É o pior caso: os 500 materiais mais novos enchem a
      // janela antes de ele ser alcançado.
      const massa = [doAcervo({ id: 'a1', pasta: '' })]
      for (let i = 0; i < 500; i++) {
        massa.push(Object.assign({}, linhaDoPost, {
          id: 'mm' + i,
          criado_em: '2026-11-0' + (1 + (i % 9)) + 'T10:00:00.000Z',
          created_at: '2026-11-0' + (1 + (i % 9)) + 'T10:00:00.000Z',
        }))
      }

      const r = await chamar(ACERVO_LISTA, { arquivos: massa, query: {} })
      const vistos = ((r.r.body.data || {}).arquivos || []).map((a) => a.id)
      ok('acervo:nao-encolhe-com-500-materiais-mais-novos',
        vistos.includes('a1'), { vistos: vistos.length, primeiros: vistos.slice(0, 3) })
      ok('acervo:nao-encolhe-e-nao-mostra-material',
        !vistos.some((id) => String(id).startsWith('mm')), vistos.slice(0, 3))

      // A prova de que o laboratório mede: COM `ativo` na linha, a mesma massa
      // enche a janela e o arquivo do acervo some. Se este caso parar de
      // falhar no cenário antigo, a medição deixou de valer.
      {
        const comAtivo = massa.map((l) => (String(l.id).startsWith('mm')
          ? Object.assign({}, l, { ativo: 'sim' }) : l))
        const r2 = await chamar(ACERVO_LISTA, { arquivos: comAtivo, query: {} })
        const vistos2 = ((r2.r.body.data || {}).arquivos || []).map((a) => a.id)
        ok('acervo:com-ativo-no-material-o-acervo-sumiria', !vistos2.includes('a1'),
          { vistos: vistos2.length })
      }
    }
  }

  // ── 2. A listagem do projeto ─────────────────────────────────────────────
  {
    const arquivos = [
      material({ id: 'm1', nome: 'A.pdf', criado_em: '2026-10-30T10:00:00.000Z' }),
      material({ id: 'm2', nome: 'B.pdf', criado_em: '2026-10-30T11:00:00.000Z' }),
      material({ id: 'm3', nome: 'Apagado.pdf', apagado_em: '2026-10-30T12:00:00.000Z' }),
      material({ id: 'm4', nome: 'De outro projeto.pdf', projeto_id: 'p2' }),
      doAcervo({ id: 'a1' }),
    ]
    const { r } = await chamar(LISTAR, { arquivos })
    const lista = (r.body.data || {}).materiais || []
    const ids = lista.map((x) => x.id)
    ok('lista:traz-so-os-do-projeto-e-ativos', ids.join(',') === 'm2,m1', ids)
    ok('lista:o-mais-novo-primeiro', ids[0] === 'm2', ids)
    // Campo a campo, e não "não tem `conteudo`": a listagem é o lugar onde um
    // campo novo entra sem querer, e `x.conteudo === undefined` passaria de
    // graça porque material nenhum guarda `conteudo` na linha.
    const CAMPOS = 'criado_em,dono_id,id,nome,tamanho,tipo'
    ok('lista:nao-devolve-o-conteudo',
      lista.every((x) => Object.keys(x).sort().join(',') === CAMPOS),
      lista.map((x) => Object.keys(x).sort().join(',')))

    // Acervo grande: o material deste projeto não pode sumir porque o acervo
    // passou das 500 linhas mais novas. O filtro vai para a CAMADA.
    const grande = [material({ id: 'mAntigo', criado_em: '2020-01-01T00:00:00.000Z' })]
    for (let i = 0; i < 600; i++) grande.push(doAcervo({ id: 'g' + i }))
    const g = await chamar(LISTAR, { arquivos: grande })
    ok('lista:acima-de-500-o-material-continua-aparecendo',
      ((g.r.body.data || {}).materiais || []).map((x) => x.id).join(',') === 'mAntigo',
      (g.r.body.data || {}).materiais)
    // A prova de que o laboratório mede, pelo MESMO fake que o handler recebe.
    {
      const m = montar({ arquivos: grande })
      const semFiltro = (await m.ctx.models.Arquivo.findMany({})) || []
      ok('lista:o-teto-da-camada-esconderia-o-material',
        semFiltro.length === 500 && !semFiltro.some((x) => x.id === 'mAntigo'),
        { lidas: semFiltro.length })
    }

    const semP = await chamar(LISTAR, { arquivos, semProjeto: true })
    ok('lista:projeto-que-nao-existe-da-404', semP.r.status === 404, semP.r.status)
  }

  // ── 3. Enviar ────────────────────────────────────────────────────────────
  {
    const base = { params: { id: 'p1' } }
    const bom = await chamar(ENVIAR, Object.assign({}, base, {
      body: { nome: 'Escopo.pdf', conteudo: PDF },
    }))
    ok('enviar:aceita-e-responde-201', bom.r.status === 201,
      { status: bom.r.status, body: bom.r.body })
    const gravado = bom.m.reg.create[0] || {}
    ok('enviar:grava-com-escopo-de-projeto', gravado.escopo === 'projeto', gravado)
    ok('enviar:grava-o-projeto', gravado.projeto_id === 'p1', gravado)
    // O material NÃO grava `ativo`: é o que o tira do filtro da listagem do
    // acervo. O caso de regressão logo abaixo prova a consequência.
    ok('enviar:nao-grava-o-estado-que-o-acervo-filtra', gravado.ativo === undefined, gravado)
    ok('enviar:grava-quem-enviou', gravado.dono_id === 'u1', gravado)
    ok('enviar:nao-inventa-acl', gravado.acl_nivel === '' && gravado.acl_grant === '', gravado)
    ok('enviar:mede-o-tamanho-do-proprio-conteudo', gravado.tamanho === 8, gravado)
    ok('enviar:registra-no-historico',
      (bom.m.reg.log[0] || {}).action === 'material_enviado', bom.m.reg.log)

    const semNome = await chamar(ENVIAR, Object.assign({}, base, {
      body: { nome: '   ', conteudo: PDF },
    }))
    ok('enviar:sem-nome-recusa', semNome.r.status === 400, semNome.r.status)
    ok('enviar:sem-nome-nao-grava', semNome.m.reg.create.length === 0, semNome.m.reg.create)

    const tipoRuim = await chamar(ENVIAR, Object.assign({}, base, {
      body: { nome: 'x.exe', conteudo: 'data:application/x-msdownload;base64,QUJD' },
    }))
    ok('enviar:tipo-fora-da-lista-recusa', tipoRuim.r.status === 400, tipoRuim.r.body)
    ok('enviar:tipo-fora-da-lista-nao-grava', tipoRuim.m.reg.create.length === 0,
      tipoRuim.m.reg.create)

    const semDataUri = await chamar(ENVIAR, Object.assign({}, base, {
      body: { nome: 'x.pdf', conteudo: 'QUJD' },
    }))
    ok('enviar:conteudo-sem-data-uri-recusa', semDataUri.r.status === 400, semDataUri.r.body)

    const base64Ruim = await chamar(ENVIAR, Object.assign({}, base, {
      body: { nome: 'x.pdf', conteudo: 'data:application/pdf;base64,<<<lixo>>>' },
    }))
    ok('enviar:base64-invalido-recusa', base64Ruim.r.status === 400, base64Ruim.r.body)
    ok('enviar:base64-invalido-nao-grava', base64Ruim.m.reg.create.length === 0,
      base64Ruim.m.reg.create)

    // O teto é medido no conteúdo, não no que a tela declara.
    const grande = 'data:application/pdf;base64,' + 'A'.repeat(14 * 1024 * 1024)
    const acimaDoTeto = await chamar(ENVIAR, Object.assign({}, base, {
      body: { nome: 'grande.pdf', conteudo: grande, tamanho: 1 },
    }))
    ok('enviar:acima-de-10mb-recusa', acimaDoTeto.r.status === 400, acimaDoTeto.r.body)
    ok('enviar:acima-de-10mb-nao-grava', acimaDoTeto.m.reg.create.length === 0,
      acimaDoTeto.m.reg.create)

    // O nome vira `download="..."` no navegador: barra e `..` saem.
    const nomeSujo = await chamar(ENVIAR, Object.assign({}, base, {
      body: { nome: '../../etc/passwd', conteudo: PDF },
    }))
    ok('enviar:limpa-o-nome',
      !String((nomeSujo.m.reg.create[0] || {}).nome || '').includes('/')
      && !String((nomeSujo.m.reg.create[0] || {}).nome || '').includes('..'),
      (nomeSujo.m.reg.create[0] || {}).nome)

    // Conteúdo que não grava não pode deixar metadado que aparece e não baixa.
    const semConteudo = await chamar(ENVIAR, Object.assign({}, base, {
      body: { nome: 'x.pdf', conteudo: PDF }, falhaAoCriarConteudo: true,
    }))
    ok('enviar:conteudo-que-falha-devolve-erro', semConteudo.r.status === 500,
      semConteudo.r.status)
    ok('enviar:conteudo-que-falha-apaga-o-metadado',
      semConteudo.m.reg.delete.length === 1, semConteudo.m.reg.delete)

    const semProjeto = await chamar(ENVIAR, Object.assign({}, base, {
      body: { nome: 'x.pdf', conteudo: PDF }, semProjeto: true,
    }))
    ok('enviar:projeto-que-nao-existe-da-404', semProjeto.r.status === 404, semProjeto.r.status)
    ok('enviar:projeto-que-nao-existe-nao-grava', semProjeto.m.reg.create.length === 0,
      semProjeto.m.reg.create)
  }

  // ── 4. Baixar ────────────────────────────────────────────────────────────
  {
    const arquivos = [material(), doAcervo(), material({ id: 'm9', projeto_id: 'p2' })]
    const conteudos = [
      { id: 'm1', arquivo_id: 'm1', conteudo: PDF },
      { id: 'a1', arquivo_id: 'a1', conteudo: PDF },
      { id: 'm9', arquivo_id: 'm9', conteudo: PDF },
    ]
    const bom = await chamar(BAIXAR, { arquivos, conteudos, params: { id: 'p1', mid: 'm1' } })
    ok('baixar:devolve-o-conteudo',
      bom.r.status === 200 && (bom.r.body.data || {}).conteudo === PDF, bom.r.status)

    const doAcervoPorAqui = await chamar(BAIXAR, {
      arquivos, conteudos, params: { id: 'p1', mid: 'a1' },
    })
    ok('baixar:arquivo-do-acervo-por-esta-rota-da-404', doAcervoPorAqui.r.status === 404,
      doAcervoPorAqui.r.body)

    const deOutroProjeto = await chamar(BAIXAR, {
      arquivos, conteudos, params: { id: 'p1', mid: 'm9' },
    })
    ok('baixar:material-de-outro-projeto-da-404', deOutroProjeto.r.status === 404,
      deOutroProjeto.r.body)

    const apagado = await chamar(BAIXAR, {
      arquivos: [material({ apagado_em: '2026-10-30T12:00:00.000Z' })], conteudos,
      params: { id: 'p1', mid: 'm1' },
    })
    ok('baixar:material-apagado-da-404', apagado.r.status === 404, apagado.r.status)

    // A mesma linha do acervo com `projeto_id` deste projeto e SEM escopo: é
    // ela que torna a conferência de escopo uma guarda no download também.
    const semEscopo = { ...doAcervo({ id: 'x1' }), projeto_id: 'p1' }
    delete semEscopo.escopo
    const baixarSemEscopo = await chamar(BAIXAR, {
      arquivos: [semEscopo],
      conteudos: [{ id: 'x1', arquivo_id: 'x1', conteudo: PDF }],
      params: { id: 'p1', mid: 'x1' },
    })
    ok('baixar:linha-sem-escopo-mas-com-projeto-da-404', baixarSemEscopo.r.status === 404,
      baixarSemEscopo.r.body)
  }

  // ── 5. Apagar ────────────────────────────────────────────────────────────
  {
    const arquivos = () => [material({ dono_id: 'u1' })]

    const dono = await chamar(APAGAR, {
      arquivos: arquivos(), params: { id: 'p1', mid: 'm1' },
      perfil: { id: 'u1', role: 'developer', feature_grants: ['projetos'] },
    })
    ok('apagar:o-dono-apaga-o-que-enviou', dono.r.status === 200, dono.r.body)
    // `|| {}` nos DOIS níveis: sem gravação nenhuma, `.dados` é undefined e a
    // asserção MATARIA o arquivo por exceção em vez de reprovar com nome.
    const gravadoNoApagar = ((dono.m.reg.update[0] || {}).dados) || {}
    ok('apagar:apagar-e-logico', !!gravadoNoApagar.apagado_em, dono.m.reg.update)
    // E não grava `ativo`: seria devolver o material ao filtro do acervo.
    ok('apagar:nao-grava-ativo', gravadoNoApagar.ativo === undefined, dono.m.reg.update)
    ok('apagar:registra-no-historico',
      (dono.m.reg.log[0] || {}).action === 'material_apagado', dono.m.reg.log)

    const estranho = await chamar(APAGAR, {
      arquivos: arquivos(), params: { id: 'p1', mid: 'm1' },
      perfil: { id: 'uX', role: 'developer', feature_grants: ['projetos'] },
    })
    ok('apagar:quem-nao-enviou-nem-planeja-recusa', estranho.r.status === 403, estranho.r.body)
    ok('apagar:recusa-nao-grava', estranho.m.reg.update.length === 0, estranho.m.reg.update)

    const planeja = await chamar(APAGAR, {
      arquivos: arquivos(), params: { id: 'p1', mid: 'm1' },
      perfil: { id: 'uX', role: 'support', feature_grants: ['planejamento'] },
    })
    ok('apagar:quem-planeja-apaga-o-de-outro', planeja.r.status === 200, planeja.r.body)

    const doAcervoPorAqui = await chamar(APAGAR, {
      arquivos: [doAcervo()], params: { id: 'p1', mid: 'a1' },
    })
    ok('apagar:arquivo-do-acervo-por-esta-rota-da-404', doAcervoPorAqui.r.status === 404,
      doAcervoPorAqui.r.body)
    ok('apagar:arquivo-do-acervo-por-esta-rota-nao-grava',
      doAcervoPorAqui.m.reg.update.length === 0, doAcervoPorAqui.m.reg.update)

    // Material de OUTRO projeto, apagado por este: 404 e nada gravado. Sem
    // este caso, tirar a conferência de projeto do apagar não mataria nada.
    const deOutroProjeto = await chamar(APAGAR, {
      arquivos: [material({ id: 'm9', projeto_id: 'p2', dono_id: 'u1' })],
      params: { id: 'p1', mid: 'm9' },
    })
    ok('apagar:material-de-outro-projeto-da-404', deOutroProjeto.r.status === 404,
      deOutroProjeto.r.body)
    ok('apagar:material-de-outro-projeto-nao-grava',
      deOutroProjeto.m.reg.update.length === 0, deOutroProjeto.m.reg.update)

    // Linha do ACERVO com `projeto_id` deste projeto e SEM escopo. É o caso que
    // faz da conferência de escopo uma guarda, e não um acaso: sem ele, o
    // `projeto_id` vazio do acervo já barrava tudo e a linha do escopo podia
    // sair sem nada morrer.
    const semEscopoMasComProjeto = { id: 'x1', ...doAcervo({ id: 'x1' }), projeto_id: 'p1' }
    delete semEscopoMasComProjeto.escopo
    const apagarSemEscopo = await chamar(APAGAR, {
      arquivos: [semEscopoMasComProjeto], params: { id: 'p1', mid: 'x1' },
    })
    ok('apagar:linha-sem-escopo-mas-com-projeto-da-404', apagarSemEscopo.r.status === 404,
      apagarSemEscopo.r.body)
    ok('apagar:linha-sem-escopo-mas-com-projeto-nao-grava',
      apagarSemEscopo.m.reg.update.length === 0, apagarSemEscopo.m.reg.update)

    // Material JÁ apagado: 404, e nada gravado. Sem este caso, apagar de novo
    // respondia 200, regravava `apagado_em` — perdendo a data original — e
    // duplicava o log.
    const jaApagado = await chamar(APAGAR, {
      arquivos: [material({ apagado_em: '2026-10-29T08:00:00.000Z', dono_id: 'u1' })],
      params: { id: 'p1', mid: 'm1' },
    })
    ok('apagar:material-ja-apagado-da-404', jaApagado.r.status === 404, jaApagado.r.body)
    ok('apagar:material-ja-apagado-nao-regrava-a-data',
      jaApagado.m.reg.update.length === 0, jaApagado.m.reg.update)
    ok('apagar:material-ja-apagado-nao-duplica-o-log',
      jaApagado.m.reg.log.length === 0, jaApagado.m.reg.log)

    // E some da listagem depois de apagado.
    const depois = await chamar(LISTAR, {
      arquivos: [material({ apagado_em: '2026-10-30T12:00:00.000Z' })],
    })
    ok('apagar:some-da-listagem',
      ((depois.r.body.data || {}).materiais || []).length === 0, depois.r.body)
  }

  // ── 6. A porta é a do módulo de Projetos ─────────────────────────────────
  //
  // As quatro rotas são do módulo `projetos` e carregam a mesma porta: o campo
  // "Projetos" em Editar membro. Sem o campo, nem a lista.
  {
    const sem = { id: 'u1', role: 'developer', feature_grants: [] }
    for (const [marca, params] of [
      [LISTAR, { id: 'p1' }],
      [ENVIAR, { id: 'p1' }],
      [BAIXAR, { id: 'p1', mid: 'm1' }],
      [APAGAR, { id: 'p1', mid: 'm1' }],
    ]) {
      const { r } = await chamar(marca, {
        arquivos: [material()], params, perfil: sem,
        body: { nome: 'x.pdf', conteudo: PDF },
      })
      ok('porta:sem-o-campo-recusa:' + marca.split(' ')[0], r.status === 403,
        { status: r.status, body: r.body })
    }
    // Com o campo, as mesmas chamadas passam: sem este contraste, "403" passaria
    // também num handler que recusasse todo mundo.
    const com = { id: 'u1', role: 'developer', feature_grants: ['projetos'] }
    const { r } = await chamar(LISTAR, { arquivos: [material()], perfil: com })
    ok('porta:com-o-campo-passa', r.status === 200, r.status)
  }

  fim()
})()
