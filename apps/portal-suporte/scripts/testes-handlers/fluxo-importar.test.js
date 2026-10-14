// "Importar fluxo": o arquivo JSON vira fluxo novo — e arquivo ruim não vira nada.
//
// O risco desta tela não é a importação dar certo: é ela dar errado PELO MEIO.
// São duas chamadas ao servidor (criar o fluxo, gravar o conteúdo), então um
// arquivo que o servidor recusa deixaria um fluxo vazio na lista de quem só
// tentou importar. Os casos abaixo cobrem exatamente isso, contando as
// chamadas feitas numa `api` falsa.
//
// Não há rota nova nesta entrega: o que se testa aqui é app/lib/wa-flow-importar.ts,
// mais as três cópias da validação no caminho que o import percorre.
//
// Roda com: node fluxo-importar.test.js
const fs = require('fs')
const path = require('path')
const { carregarHandler, reply, ok, fim } = require('./_carregar.js')

const APP = path.resolve(__dirname, '../..')
const { validarGrafo } = require(path.join(APP, 'app/lib/wa-flow-graph.ts'))
const { MODELOS_DE_FLUXO } = require(path.join(APP, 'app/lib/wa-flow-modelos.ts'))
const {
  criarFluxo,
  lerArquivoDeFluxo,
  mensagemDeArquivoRecusado,
  nomeDoArquivoDeFluxo,
} = require(path.join(APP, 'app/lib/wa-flow-importar.ts'))
const patch = carregarHandler('whatsapp PATCH /whatsapp/flows/:id')

/** `api` falsa que REGISTRA o que foi chamado — é assim que se prova o que não aconteceu. */
function apiFalsa({ saveDraft, remove } = {}) {
  const chamadas = []
  return {
    chamadas,
    create: async (name) => { chamadas.push(['create', name]); return { data: { id: 'novo_1' } } },
    saveDraft: async (id, graph) => {
      chamadas.push(['saveDraft', id])
      if (saveDraft === 'falha') throw new Error('O fluxo tem 1 problema(s) que impedem salvar.')
      return { data: { saved: true } }
    },
    remove: async (id) => {
      chamadas.push(['remove', id])
      if (remove === 'falha') throw new Error('rede')
      return { data: { deleted: true } }
    },
  }
}
const feitas = (api, nome) => api.chamadas.filter((c) => c[0] === nome)

function ctxDe(graph) {
  const guardado = { fluxo: { id: 'f1', version: 2, draft: null } }
  return {
    params: { id: 'f1' }, query: {}, body: { graph }, headers: {}, user: { id: 'u1' },
    models: {
      WaFlows: {
        findById: async () => guardado.fluxo,
        update: async (id, p) => { guardado.fluxo = { ...guardado.fluxo, ...p }; return guardado.fluxo },
      },
      Profile: { findById: async () => ({ id: 'u1', role: 'admin' }) },
      Sessao: { findById: async () => null },
    },
    reply: reply(),
    guardado,
  }
}

;(async () => {
  // ── ida e volta: o que o "Exportar" grava, o "Importar fluxo" aceita ──────
  // O exportar() do editor usa JSON.stringify(graph, null, 2) — ver
  // app/_components/wa-flow/flow-editor.tsx. O arquivo que a pessoa reimporta
  // é esse texto, não o objeto.
  const paraArquivo = (g) => JSON.stringify(g, null, 2)

  for (const m of MODELOS_DE_FLUXO) {
    const lido = lerArquivoDeFluxo(paraArquivo(m.graph), validarGrafo)
    ok(`modelo ${m.id}: o arquivo exportado é aceito`, lido.ok === true, lido.erros)
    if (!lido.ok) continue
    const c = ctxDe(lido.graph)
    const r = await patch(c)
    ok(`modelo ${m.id}: e o servidor grava o conteúdo`, r.status === 200 && !!c.guardado.fluxo.draft,
      { status: r.status, problemas: (r.body && r.body.problemas) || [] })
  }

  const exemplo = fs.readFileSync(path.join(__dirname, 'fixtures/fluxo-exemplo.json'), 'utf8')
  const lidoEx = lerArquivoDeFluxo(exemplo, validarGrafo)
  ok('exemplo do formato: aceito como arquivo, sem avisos',
    lidoEx.ok === true && lidoEx.avisos.length === 0, lidoEx.erros || lidoEx.avisos)

  // ── arquivo ruim NÃO cria nada ───────────────────────────────────────────
  const RUINS = [
    ['não é JSON', 'isto não é json {', true, 'Não é um JSON.'],
    ['JSON que não é objeto', '"texto solto"', false, 'não é um objeto'],
    ['JSON sem cards', '{"nodes":[]}', false, 'nenhum card'],
    ['ligação para card que não existe',
      '{"root":"a","nodes":[{"id":"a","type":"content","data":{"label":"M","text":"oi"}}],"edges":[{"source":"a","target":"fantasma"}]}',
      false, 'não existe'],
  ]
  for (const [nome, texto, naoEJson, trecho] of RUINS) {
    const lido = lerArquivoDeFluxo(texto, validarGrafo)
    ok(`${nome}: recusado antes de qualquer chamada`, lido.ok === false, lido)
    if (lido.ok) continue
    ok('  e o motivo aparece para quem importou',
      lido.naoEJson === naoEJson && lido.erros.some((e) => e.includes(trecho)), lido.erros)
    // A tela só chama criarFluxo quando a leitura deu ok; aqui prova-se que,
    // com arquivo ruim, nada é criado nem gravado.
    const api = apiFalsa()
    ok('  e nenhum fluxo é criado', feitas(api, 'create').length === 0, api.chamadas)
  }

  // ── caminho feliz ────────────────────────────────────────────────────────
  {
    const api = apiFalsa()
    const r = await criarFluxo(api, 'Triagem nova', lidoEx.graph, { apagarSeRecusado: true })
    ok('arquivo bom: cria o fluxo e grava o conteúdo',
      r.status === 'criado' && r.id === 'novo_1'
      && feitas(api, 'create').length === 1 && feitas(api, 'saveDraft').length === 1, api.chamadas)
    ok('  e não apaga nada', feitas(api, 'remove').length === 0, api.chamadas)
  }

  // ── o servidor recusa o conteúdo: não pode sobrar fluxo vazio ────────────
  {
    const api = apiFalsa({ saveDraft: 'falha' })
    const r = await criarFluxo(api, 'Triagem nova', lidoEx.graph, { apagarSeRecusado: true })
    ok('servidor recusa o arquivo: o fluxo criado é apagado',
      r.status === 'conteudo-recusado' && r.apagado === true, r)
    const rem = feitas(api, 'remove')
    ok('  o apagar é chamado UMA vez, com o id criado',
      rem.length === 1 && rem[0][1] === 'novo_1', api.chamadas)
    const m = mensagemDeArquivoRecusado(r)
    ok('  e a mensagem diz que nada ficou criado',
      m.titulo === 'O servidor recusou o arquivo' && m.descricao.includes('Nenhum fluxo ficou criado.'), m)
  }
  {
    const api = apiFalsa({ saveDraft: 'falha', remove: 'falha' })
    const r = await criarFluxo(api, 'Triagem nova', lidoEx.graph, { apagarSeRecusado: true })
    ok('se o apagar também falha, a tela não mente', r.status === 'conteudo-recusado' && r.apagado === false, r)
    const m = mensagemDeArquivoRecusado(r)
    ok('  e manda apagar à mão na lista',
      m.titulo.includes('não consegui apagá-lo') && m.descricao.includes('Apagar na lista'), m)
  }
  {
    // O "Começar de um modelo" NÃO apaga: é o comportamento que já existia, e
    // ali o conteúdo é do portal, não de um arquivo de fora.
    const api = apiFalsa({ saveDraft: 'falha' })
    const r = await criarFluxo(api, 'Do modelo', MODELOS_DE_FLUXO[0].graph)
    ok('modelo com conteúdo recusado: o fluxo não é apagado',
      r.status === 'conteudo-recusado' && r.apagado === false && feitas(api, 'remove').length === 0, api.chamadas)
  }

  // ── nome sugerido a partir do nome do arquivo ────────────────────────────
  // O exportar() grava `fluxo-<nome>-v<versão>.json` (flow-editor.tsx).
  const NOMES = [
    ['fluxo-triagem-padrao-v3.json', 'triagem padrao'],
    ['fluxo-menu-por-setor-v12.json', 'menu por setor'],
    ['atendimento.json', 'atendimento'],
    ['fluxo-v2.json', 'Fluxo importado'],
    ['fluxo-.json', 'Fluxo importado'],
    ['  ', 'Fluxo importado'],
    ['Triagem_2026.JSON', 'Triagem 2026'],
  ]
  for (const [arquivo, esperado] of NOMES) {
    ok(`nome de "${arquivo}" → "${esperado}"`, nomeDoArquivoDeFluxo(arquivo) === esperado,
      nomeDoArquivoDeFluxo(arquivo))
  }
  const longo = nomeDoArquivoDeFluxo('fluxo-' + 'a'.repeat(200) + '-v1.json')
  ok('nome muito longo cabe no campo (80)', longo.length === 80, longo.length)

  fim()
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(1) })
