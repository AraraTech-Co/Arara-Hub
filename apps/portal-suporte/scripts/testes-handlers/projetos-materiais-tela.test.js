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

  fim()
})()
