// Todo cartão que o editor oferece pode ser salvo e publicado.
//
// A validação do grafo existe em três cópias: `validarGrafo()` no front
// (app/lib/wa-flow-graph.ts) e o espelho dela no PATCH e no publish do
// servidor. Se uma cópia esquece um tipo que o editor oferece, quem desenha
// com aquele cartão não consegue salvar — e nada no editor avisa antes.
//
// Por isso os tipos NÃO são listados aqui à mão: vêm dos botões da barra
// "Adicionar:" do flow-editor.tsx, e cada cartão nasce com os dados que o
// próprio editor dá a ele (NOVO_CARD). Botão novo no editor entra neste teste
// sozinho, e reprova até as três cópias aceitarem.
//
// Roda com: node tipos-de-cartao.test.js
const fs = require('fs')
const path = require('path')
const { carregarHandler, reply, ok, fim } = require('./_carregar.js')

const APP = path.resolve(__dirname, '../..')
const { validarGrafo } = require(path.join(APP, 'app/lib/wa-flow-graph.ts'))
const { MODELOS_DE_FLUXO } = require(path.join(APP, 'app/lib/wa-flow-modelos.ts'))
const patch = carregarHandler('whatsapp PATCH /whatsapp/flows/:id')
const publish = carregarHandler('whatsapp POST /whatsapp/flows/:id/publish')

// ── o que o editor oferece ──────────────────────────────────────────────────
const editor = fs.readFileSync(path.join(APP, 'app/_components/wa-flow/flow-editor.tsx'), 'utf8')
const TIPOS = [...editor.matchAll(/onClick=\{\(\) => addNode\('(\w+)'\)\}/g)].map((m) => m[1])

// NOVO_CARD é um objeto literal; tirando a anotação de tipo, é JavaScript.
const ini = editor.indexOf('const NOVO_CARD')
const igual = ini < 0 ? -1 : editor.indexOf('= {', ini)
const fecha = igual < 0 ? -1 : editor.indexOf('\n}\n', igual)
if (ini < 0 || igual < 0 || fecha < 0) throw new Error('NOVO_CARD não encontrado no flow-editor.tsx')
const NOVO_CARD = new Function(`return ${editor.slice(igual + 2, fecha + 2)}`)()

/** Raiz Mensagem → o cartão, com os dados que o editor dá ao cartão novo (addNode). */
function grafoCom(tipo) {
  const m = NOVO_CARD[tipo]
  return {
    root: 'inicio',
    nodes: [
      { id: 'inicio', type: 'content', position: { x: 0, y: 0 }, data: { label: 'Mensagem', text: 'Olá!' } },
      { id: 'novo', type: tipo, position: { x: 240, y: 0 }, data: { label: m.label, text: m.text, ...m.data } },
    ],
    edges: [{ id: 'e1', source: 'inicio', target: 'novo', sourceHandle: 'next' }],
  }
}

function ctxDe({ body = {}, draft = null } = {}) {
  const guardado = { fluxo: { id: 'f1', version: 2, draft } }
  return {
    params: { id: 'f1' }, query: {}, body, headers: {},
    user: { id: 'u1' },
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

const problemas = (r) => (r.body && r.body.problemas) || []

/** As três cópias, cada uma dizendo se aceitou. */
async function nasTres(nome, g) {
  const v = validarGrafo(JSON.parse(JSON.stringify(g)))
  ok(`${nome}: front aceita`, v.ok, v.erros)
  const cp = ctxDe({ body: { graph: g } })
  const rp = await patch(cp)
  ok(`${nome}: servidor salva (PATCH)`, rp.status === 200 && !!cp.guardado.fluxo.draft, { status: rp.status, problemas: problemas(rp) })
  const cu = ctxDe({ draft: g })
  const ru = await publish(cu)
  ok(`${nome}: servidor publica`, ru.status === 200 && cu.guardado.fluxo.version === 3, { status: ru.status, problemas: problemas(ru) })
}

;(async () => {
  ok('a barra "Adicionar:" oferece pelo menos os 7 cartões de hoje',
    ['menu', 'content', 'handoff', 'condition', 'delay', 'question', 'tag'].every((t) => TIPOS.includes(t)), TIPOS)

  for (const tipo of TIPOS) {
    ok(`${tipo}: o editor tem dados iniciais para o cartão`, !!NOVO_CARD[tipo], Object.keys(NOVO_CARD))
    if (NOVO_CARD[tipo]) await nasTres(`cartão ${tipo}`, grafoCom(tipo))
  }

  for (const m of MODELOS_DE_FLUXO) await nasTres(`modelo ${m.id}`, m.graph)

  // ── o servidor recusa o mesmo que o front recusa na pergunta ──────────────
  const RECUSAS = [
    ['pergunta sem texto', { text: '   ' }, 'está sem a pergunta'],
    ['pergunta com 0 tentativas', { tentativas: 0 }, 'tentativas precisa ser 1 ou mais'],
    ['pergunta com tentativas que não é número', { tentativas: 'duas' }, 'tentativas precisa ser 1 ou mais'],
  ]
  for (const [nome, mexe, trecho] of RECUSAS) {
    const g = grafoCom('question')
    Object.assign(g.nodes[1].data, mexe)
    const v = validarGrafo(JSON.parse(JSON.stringify(g)))
    ok(`${nome}: front recusa`, !v.ok && v.erros.some((e) => e.includes(trecho)), v.erros)

    const cp = ctxDe({ body: { graph: g } })
    const rp = await patch(cp)
    ok(`${nome}: PATCH recusa com a mesma mensagem do front`,
      rp.status === 400 && JSON.stringify(problemas(rp)) === JSON.stringify(v.erros), { status: rp.status, problemas: problemas(rp), front: v.erros })
    ok('  e não grava o rascunho', cp.guardado.fluxo.draft === null, cp.guardado.fluxo)

    const cu = ctxDe({ draft: g })
    const ru = await publish(cu)
    ok(`${nome}: publish recusa`, ru.status === 400, { status: ru.status, body: ru.body })
    ok('  e não muda a versão', cu.guardado.fluxo.version === 2, cu.guardado.fluxo.version)
  }

  fim()
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(1) })
