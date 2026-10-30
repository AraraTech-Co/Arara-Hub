// A tela dos Materiais de Apoio, e o contrato dela com o servidor.
//
// O corpo que o handler devolve ATRAVESSA a função que a tela usa. Foi a falta
// desse atravessamento que derrubou a página do projeto: havia teste dos dois
// lados e nenhum cruzando a junção, e `data` era um objeto onde a tela
// esperava um array.
//
// Roda com: node projetos-materiais-tela.test.js
const { carregarHandler, reply, ok, fim } = require('./_carregar.js')
const { registrarTS, importarTela, semComentarios } = require('./_tela.js')

const LISTAR = '512 projetos GET /projetos/:id/materiais'
const APAGAR = '515 projetos DELETE /projetos/:id/materiais/:mid'

registrarTS([])

function material(o) {
  return Object.assign({
    id: 'm1', nome: 'Escopo.pdf', tipo: 'application/pdf', tamanho: 2048,
    dono_id: 'u1', escopo: 'projeto', projeto_id: 'p1', pasta: '',
    ativo: 'sim', criado_em: '2026-10-30T10:00:00.000Z',
  }, o)
}

function montar(o) {
  const op = o || {}
  const arquivos = (op.arquivos || []).slice()
  const reg = { update: [] }
  const perfil = Object.assign(
    { id: 'u1', role: 'developer', feature_grants: ['projetos'] }, op.perfil || {})
  return {
    reg,
    ctx: {
      headers: {}, user: { id: perfil.id }, query: {},
      params: op.params || { id: 'p1' }, body: {}, reply: reply(),
      models: {
        Profile: { findById: async () => perfil },
        Sessao: { findById: async () => null },
        Projeto: { findById: async (id) => ({ id: String(id), nome: 'Projeto' }) },
        Arquivo: {
          findById: async (id) => arquivos.find((a) => String(a.id) === String(id)) || null,
          findMany: async (f) => arquivos.filter((a) => Object.keys(f || {})
            .filter((k) => k !== 'limit' && k !== 'offset')
            .every((k) => String(a[k]) === String(f[k]))),
          update: async (id, d) => { reg.update.push({ id: String(id), dados: d }); return d },
        },
        ArquivoConteudo: { findById: async () => null, create: async () => ({}) },
        ActivityLog: { create: async () => ({}) },
      },
    },
  }
}

;(async () => {
  const L = await importarTela('lib/projetos-materiais.ts')

  // ── 1. A leitura da resposta nunca estoura ───────────────────────────────
  {
    const esquisitas = [
      ['nulo', null], ['texto', 'oi'], ['numero', 7], ['array', []],
      ['sem-data', { success: true }],
      ['data-nulo', { data: null }],
      ['data-array', { data: [] }],
      ['materiais-objeto', { data: { materiais: { id: 'm1' } } }],
      ['materiais-ausente', { data: {} }],
    ]
    for (const [nome, valor] of esquisitas) {
      let saida = null
      let estourou = false
      try { saida = L.extrairMateriais(valor) } catch { estourou = true }
      ok('forma-estranha-nao-estoura:' + nome, !estourou, nome)
      ok('forma-estranha-vira-lista-vazia-com-recado:' + nome,
        !estourou && Array.isArray(saida.lista) && saida.lista.length === 0
        && saida.erro.length > 0, saida)
    }
    // E item sem id não entra: um buraco na lista derruba a renderização.
    const comLixo = L.extrairMateriais({ data: { materiais: [material(), null, { nome: 'x' }] } })
    ok('item-sem-id-nao-entra', comLixo.lista.length === 1 && comLixo.erro === '', comLixo)
  }

  // ── 2. CONTRATO: o corpo real do handler atravessa a função da tela ──────
  {
    const h = carregarHandler(LISTAR)
    const m = montar({ arquivos: [material({ id: 'm1' }), material({ id: 'm2' })] })
    const r = await h(m.ctx)
    ok('contrato:o-handler-respondeu-200', r.status === 200, r.status)
    const saida = L.extrairMateriais(r.body)
    ok('contrato:a-tela-le-a-resposta-sem-recado', saida.erro === '', saida.erro)
    ok('contrato:a-tela-ve-os-dois-materiais', saida.lista.length === 2,
      saida.lista.map((x) => x.id))
    // Os campos que a tela MOSTRA vêm preenchidos do servidor. Sem isto,
    // "atravessou" poderia ser uma lista de objetos vazios.
    ok('contrato:os-campos-que-a-tela-mostra-vem-preenchidos',
      saida.lista.every((x) => !!x.nome && Number(x.tamanho) > 0 && !!x.criado_em),
      saida.lista)
  }

  // ── 3. Quem apaga: a tela diz o mesmo que o servidor ─────────────────────
  //
  // Os dois lados rodam os MESMOS casos: a tela pela função, o servidor pelo
  // handler. Divergir aqui é a tela oferecer um botão que volta 403, ou
  // esconder um que funcionaria.
  {
    const casos = [
      ['o-dono', { id: 'u1', role: 'developer', feature_grants: ['projetos'] }, true],
      ['quem-planeja', { id: 'uX', role: 'support', feature_grants: ['planejamento'] }, true],
      ['admin', { id: 'uX', role: 'admin', feature_grants: [] }, true],
      ['estranho', { id: 'uX', role: 'developer', feature_grants: ['projetos'] }, false],
    ]
    for (const [nome, perfil, esperado] of casos) {
      const h = carregarHandler(APAGAR)
      const m = montar({
        arquivos: [material({ dono_id: 'u1' })], params: { id: 'p1', mid: 'm1' }, perfil,
      })
      const r = await h(m.ctx)
      const servidorDeixa = r.status === 200
      const telaDeixa = L.podeApagarMaterial({ dono_id: 'u1' }, {
        meuId: perfil.id,
        // A tela recebe `podePlanejar` do hook, que é a mesma régua do servidor.
        podePlanejar: perfil.role === 'admin' || perfil.role === 'master'
          || (perfil.feature_grants || []).includes('planejamento'),
      })
      ok('apagar:servidor-e-tela-dizem-o-mesmo:' + nome,
        servidorDeixa === esperado && telaDeixa === esperado,
        { nome, servidorDeixa, telaDeixa, esperado })
    }
  }

  // ── 4. Tamanho e recusa antecipada ───────────────────────────────────────
  {
    ok('tamanho:bytes', L.tamanhoLegivel(900) === '900 B', L.tamanhoLegivel(900))
    ok('tamanho:kb', L.tamanhoLegivel(2048) === '2 KB', L.tamanhoLegivel(2048))
    ok('tamanho:mb', L.tamanhoLegivel(3 * 1024 * 1024) === '3 MB',
      L.tamanhoLegivel(3 * 1024 * 1024))
    ok('tamanho:valor-estranho-nao-vira-NaN', L.tamanhoLegivel('oi') === '—',
      L.tamanhoLegivel('oi'))

    ok('recusa:no-limite-passa', L.recusaAntesDeLer({ size: L.MAX_BYTES }) === '',
      L.recusaAntesDeLer({ size: L.MAX_BYTES }))
    ok('recusa:acima-do-limite-avisa-antes-de-ler',
      L.recusaAntesDeLer({ size: L.MAX_BYTES + 1 }).includes('10 MB'),
      L.recusaAntesDeLer({ size: L.MAX_BYTES + 1 }))
    // O teto da tela é o MESMO do servidor: dois tetos diferentes dariam um
    // arquivo aceito aqui e recusado lá, depois de o usuário esperar o upload.
    ok('recusa:o-teto-da-tela-e-o-do-servidor', L.MAX_BYTES === 10 * 1024 * 1024, L.MAX_BYTES)

    ok('erro:a-mensagem-do-servidor-vence',
      L.mensagemDeErroNoEnvio({ error: 'Tipo de arquivo não aceito: x' })
        === 'Tipo de arquivo não aceito: x', null)
    ok('erro:sem-mensagem-tem-recado-proprio',
      L.mensagemDeErroNoEnvio(null).length > 10, L.mensagemDeErroNoEnvio(null))
  }

  // ── 5. A tela usa a régua, e não uma cópia dela ──────────────────────────
  {
    const bloco = semComentarios('_components/projetos/materiais-do-projeto.tsx')
    ok('a-tela-le-a-resposta-pela-funcao', bloco.includes('extrairMateriais('), null)
    ok('a-tela-usa-a-regra-de-apagar', bloco.includes('podeApagarMaterial('), null)
    ok('a-tela-recusa-antes-de-ler', bloco.includes('recusaAntesDeLer('), null)
    ok('a-tela-nao-reimplementa-o-teto',
      !bloco.includes('10 * 1024 * 1024') && !bloco.includes('10485760'), null)
    ok('a-tela-anuncia-o-erro', bloco.includes('role="alert"'), null)
    ok('os-botoes-tem-rotulo-para-leitor-de-tela',
      (bloco.match(/aria-label=\{/g) || []).length >= 2, null)

    const pagina = semComentarios('(admin)/admin/projetos/ver/client.tsx')
    ok('a-pagina-monta-o-bloco', pagina.includes('<MateriaisDoProjeto'), null)
    // Fora do seletor de vistas: material de apoio não é mais uma leitura do
    // andamento, e some se ficar atrás de `vista === ...`.
    const linha = pagina.split('\n').findIndex((l) => l.includes('<MateriaisDoProjeto'))
    const antes = pagina.split('\n').slice(Math.max(0, linha - 6), linha).join('\n')
    ok('o-bloco-nao-fica-atras-do-seletor-de-vistas', !antes.includes("vista === '"), antes)
  }

  // ── 6. Lista longa: a altura do bloco para de depender do acervo ────────
  //
  // Com algumas centenas de materiais, a lista inteira empurrava marcos e
  // atividades para fora da tela. O bloco passa a recolher, a rolar por conta
  // própria e a filtrar por nome.
  {
    const nomes = (lista) => lista.map((x) => x.nome)
    const acervo = [
      material({ id: 'a', nome: 'Contrato Anexo.pdf' }),
      material({ id: 'b', nome: 'ESCOPO final.docx' }),
      material({ id: 'c', nome: 'Orçamento revisão 2.xlsx' }),
    ]

    ok('busca:vazia-devolve-tudo', L.filtrarMateriais(acervo, '').length === 3, null)
    ok('busca:so-espaco-devolve-tudo', L.filtrarMateriais(acervo, '   ').length === 3, null)
    // Devolver a MESMA lista no caso comum: filtrar 500 itens a cada tecla, para
    // nada, é trabalho que a tela não precisa fazer.
    ok('busca:vazia-nao-copia-a-lista', L.filtrarMateriais(acervo, '') === acervo, null)

    ok('busca:acha-no-meio-do-nome',
      nomes(L.filtrarMateriais(acervo, 'anexo')).join() === 'Contrato Anexo.pdf',
      nomes(L.filtrarMateriais(acervo, 'anexo')))
    ok('busca:ignora-maiuscula',
      L.filtrarMateriais(acervo, 'escopo').length === 1, null)
    ok('busca:ignora-acento',
      L.filtrarMateriais(acervo, 'orcamento').length === 1
      && L.filtrarMateriais(acervo, 'revisao').length === 1, null)
    ok('busca:sem-resultado-devolve-vazio',
      L.filtrarMateriais(acervo, 'contrato social').length === 0, null)
    // Nome ausente não pode estourar no meio da renderização.
    ok('busca:material-sem-nome-nao-estoura',
      L.filtrarMateriais([material({ nome: undefined })], 'x').length === 0, null)

    ok('a-tela-e-o-teste-usam-o-mesmo-limiar', L.MUITOS === 8, L.MUITOS)

    // ── o que aparece, por COMPORTAMENTO ──────────────────────────────────
    //
    // A decisão inteira mora na régua justamente para ser medida chamando a
    // função. Enquanto ela morava no JSX, a única prova possível era procurar
    // texto no arquivo — e atributo presente não é bloco recolhido.
    const muitos = []
    for (let i = 0; i < 9; i++) muitos.push(material({ id: 'm' + i, nome: `Doc ${i}.pdf` }))
    const base = { aberto: true, carregando: false, erro: '', materiais: acervo, busca: '' }
    const v = (o) => L.oQueMostrar(Object.assign({}, base, o))

    // Recolhido é recolhido — em qualquer tamanho, com ou sem busca.
    for (const caso of [
      ['acervo-pequeno', { materiais: acervo }],
      ['acervo-grande', { materiais: muitos }],
      ['com-busca-digitada', { materiais: muitos, busca: 'doc' }],
      ['sem-material', { materiais: [] }],
    ]) {
      const r = v(Object.assign({ aberto: false }, caso[1]))
      ok('recolhido:nao-desenha-nada:' + caso[0],
        r.lista.length === 0 && !r.mostrarBusca && !r.recadoVazio && !r.recadoSemResultado, r)
    }
    // E o contraste: os MESMOS casos, abertos, desenham algo. Sem isto,
    // "recolhido não desenha nada" passaria com uma função que nunca desenha.
    ok('aberto:o-mesmo-acervo-aparece', v({ materiais: acervo }).lista.length === 3, null)
    ok('aberto:o-acervo-grande-aparece', v({ materiais: muitos }).lista.length === 9, null)
    ok('aberto:sem-material-tem-recado', v({ materiais: [] }).recadoVazio.length > 10, null)

    ok('busca-aparece-so-acima-do-limiar',
      !v({ materiais: muitos.slice(0, L.MUITOS) }).mostrarBusca
      && v({ materiais: muitos }).mostrarBusca,
      { com8: v({ materiais: muitos.slice(0, L.MUITOS) }).mostrarBusca,
        com9: v({ materiais: muitos }).mostrarBusca })
    ok('ate-o-limiar-a-lista-nao-e-filtrada',
      v({ materiais: acervo, busca: 'nada casa isto' }).lista.length === 3, null)
    ok('acima-do-limiar-a-busca-filtra',
      v({ materiais: muitos, busca: 'Doc 3' }).lista.length === 1, null)
    ok('busca-sem-resultado-tem-recado-e-lista-vazia',
      v({ materiais: muitos, busca: 'zzz' }).recadoSemResultado.includes('acento')
      && v({ materiais: muitos, busca: 'zzz' }).lista.length === 0, null)
    // Os dois recados são diferentes: "não há material" e "a busca não achou"
    // pedem ações opostas de quem está olhando.
    ok('os-dois-recados-nao-se-confundem',
      v({ materiais: [] }).recadoSemResultado === ''
      && v({ materiais: muitos, busca: 'zzz' }).recadoVazio === ''
      && v({ materiais: [] }).recadoVazio !== v({ materiais: muitos, busca: 'zzz' }).recadoSemResultado,
      null)
    ok('carregando-nao-diz-que-nao-ha-material',
      v({ materiais: [], carregando: true }).recadoVazio === '', null)
    ok('com-erro-nenhum-dos-recados-aparece',
      v({ materiais: [], erro: 'deu ruim' }).recadoVazio === ''
      && v({ materiais: [], erro: 'deu ruim' }).recadoSemResultado === '', null)
    // Em try/catch: estourar aqui mataria o ARQUIVO de teste, e arquivo morto
    // não é mutante morto — a saída não diria qual regra quebrou.
    let semLista = null
    try {
      semLista = L.oQueMostrar({ aberto: true, carregando: false, erro: '', busca: '' })
    } catch (e) { semLista = { estouro: String(e && e.message) } }
    ok('materiais-ausente-nao-estoura',
      !!semLista && Array.isArray(semLista.lista) && semLista.lista.length === 0, semLista)

    // O clique: o próximo estado é da régua, então dá para medir.
    ok('alternar-abre-e-fecha', L.alternar(true) === false && L.alternar(false) === true, null)

    const bloco = semComentarios('_components/projetos/materiais-do-projeto.tsx')
    ok('a-lista-rola-por-conta-propria',
      /<ul id="materiais-do-projeto-lista" className="[^"]*max-h-\d+[^"]*overflow-y-auto/.test(bloco),
      null)
    // O JSX não pode ter régua própria: nenhuma condição de aparecer fora da
    // `vista`, senão os mutantes do recolher voltam a sobreviver.
    ok('o-bloco-desenha-so-o-que-a-regua-mandou',
      bloco.includes('{vista.lista.map((m) => (')
      && bloco.includes('{vista.recadoVazio && (')
      && bloco.includes('{vista.recadoSemResultado && (')
      && bloco.includes('{vista.mostrarBusca && ('), null)
    ok('o-bloco-nao-decide-nada-por-fora',
      !bloco.includes('aberto &&') && !bloco.includes('muitos &&')
      && !bloco.includes('filtrarMateriais(') && !bloco.includes('.toLowerCase()'), null)
    ok('o-clique-usa-a-regua', bloco.includes('onClick={() => setAberto(alternar)}'), null)
    // Botão só aceita conteúdo de frase: com o h2 dentro dele, o HTML é
    // inválido e o leitor de tela perde o título da seção.
    // Um h2 só, e ele ABRE antes do botão: assim o título não pode voltar
    // para dentro do botão sem reprovar, por mais longe que fique.
    ok('o-botao-fica-dentro-do-titulo',
      (bloco.match(/<h2[\s>]/g) || []).length === 1
      && /<h2[^>]*>\s*<button/.test(bloco)
      && bloco.indexOf('<h2') < bloco.indexOf('<button'), null)
    ok('o-botao-aponta-para-a-lista-que-ele-recolhe',
      bloco.includes('aria-controls="materiais-do-projeto-lista"')
      && bloco.includes('id="materiais-do-projeto-lista"'), null)
    ok('o-bloco-recolhe', bloco.includes('aria-expanded={aberto}'), null)
    ok('a-busca-tem-rotulo-para-leitor-de-tela',
      bloco.includes('aria-label="Buscar material pelo nome"'), null)
    // Recolhido ou com uma busca que não casa, o arquivo recém-enviado entraria
    // invisível e pareceria que o envio falhou.
    const envio = bloco.slice(bloco.indexOf('async function enviar'),
      bloco.indexOf('async function baixar'))
    ok('enviar-reabre-o-bloco-e-limpa-a-busca',
      envio.includes('setAberto(true)') && envio.includes("setBusca('')"), null)
  }

  fim()
})()
