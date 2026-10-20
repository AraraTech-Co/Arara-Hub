// Validação do grafo — Entrega 5 do Fluxo v2.
//
// A validação existe em dois lugares: `validarGrafo()` no front
// (app/lib/wa-flow-graph.ts) e o espelho dela dentro do PATCH e do publish. A
// duplicação é inevitável — TypeScript num arquivo, string compilada no outro,
// sem módulo comum — então este teste exercita a cópia DO SERVIDOR, que é a
// que protege de verdade: a API aceita chamada direta, sem passar pelo editor.
//
// Roda com: node validar-grafo.test.js
const fs = require('fs')
const path = require('path')
const { carregarHandler, reply, ok, fim } = require('./_carregar.js')
const { validarGrafo } = require(path.resolve(__dirname, '../../app/lib/wa-flow-graph.ts'))

const patch = carregarHandler('whatsapp PATCH /whatsapp/flows/:id')
const publish = carregarHandler('whatsapp POST /whatsapp/flows/:id/publish')

const BOM = {
  root: 'inicio',
  nodes: [
    { id: 'inicio', type: 'menu', data: { text: 'Olá! Como ajudar?', options: [{ id: 'a', label: 'Suporte' }] } },
    { id: 'pessoa', type: 'handoff', data: { text: 'Chamando alguém.' } },
  ],
  edges: [{ source: 'inicio', target: 'pessoa', sourceHandle: 'opt:a' }],
}

function ctxDe({ body = {}, fluxo = { id: 'f1', version: 2, draft: BOM } } = {}) {
  const guardado = { fluxo: { ...fluxo } }
  return {
    params: { id: 'f1' }, query: {}, body, headers: {},
    user: { id: 'u1' },
    models: {
      WaFlows: {
        findById: async () => guardado.fluxo,
        update: async (id, p) => { Object.assign(guardado.fluxo, p); return guardado.fluxo },
      },
      Profile: { findById: async () => ({ id: 'u1', role: 'admin' }) },
      Sessao: { findById: async () => null },
    },
    reply: reply(),
    guardado,
  }
}

const problemas = (r) => (r.body && r.body.problemas) || []

;(async () => {
  // ── o que PASSA ───────────────────────────────────────────────────────────
  let c = ctxDe({ body: { graph: BOM } })
  let r = await patch(c)
  ok('grafo bom é salvo', r.status !== 400, r.body)
  ok('  e grava o rascunho', !!c.guardado.fluxo.draft, c.guardado.fluxo)

  // ── os ERROS, que impedem salvar ─────────────────────────────────────────
  const ERRADOS = [
    ['não é objeto', 'texto solto', 'não é um objeto'],
    ['sem cards', { nodes: [] }, 'nenhum card'],
    ['card sem id', { nodes: [{ type: 'content', data: { text: 'x' } }] }, 'sem id'],
    ['dois cards com o mesmo id', {
      nodes: [
        { id: 'a', type: 'content', data: { text: 'x' } },
        { id: 'a', type: 'content', data: { text: 'y' } },
      ],
    }, 'dois cards com o id'],
    ['tipo que não existe', { nodes: [{ id: 'a', type: 'telepatia', data: {} }] }, 'não existe'],
    ['card sem conteúdo', { nodes: [{ id: 'a', type: 'content' }] }, 'sem conteúdo'],
    ['menu sem opção', { nodes: [{ id: 'a', type: 'menu', data: { text: 'oi', options: [] } }] }, 'sem opção nenhuma'],
    ['opção sem id', { nodes: [{ id: 'a', type: 'menu', data: { text: 'oi', options: [{ label: 'x' }] } }] }, 'sem id'],
    ['duas opções com o mesmo id', {
      nodes: [{ id: 'a', type: 'menu', data: { text: 'oi', options: [{ id: 'x', label: 'A' }, { id: 'x', label: 'B' }] } }],
    }, 'duas opções com o id'],
    ['opção sem texto', { nodes: [{ id: 'a', type: 'menu', data: { text: 'oi', options: [{ id: 'x', label: '  ' }] } }] }, 'sem texto'],
    ['raiz que não existe', {
      root: 'fantasma',
      nodes: [{ id: 'a', type: 'content', data: { text: 'x' } }],
    }, 'não tem começo'],
    ['ligação saindo de card inexistente', {
      root: 'a',
      nodes: [{ id: 'a', type: 'content', data: { text: 'x' } }],
      edges: [{ source: 'fantasma', target: 'a' }],
    }, 'sai de um card que não existe'],
    ['ligação para card inexistente', {
      root: 'a',
      nodes: [{ id: 'a', type: 'content', data: { text: 'x' } }],
      edges: [{ source: 'a', target: 'fantasma' }],
    }, 'vai para um card que não existe'],
    ['edges não é lista', {
      root: 'a', nodes: [{ id: 'a', type: 'content', data: { text: 'x' } }], edges: 'nada',
    }, 'não são uma lista'],
  ]
  for (const [nome, graph, pedaco] of ERRADOS) {
    const cc = ctxDe({ body: { graph } })
    const rr = await patch(cc)
    const achou = problemas(rr).some((p) => String(p).includes(pedaco))
    ok(`recusa: ${nome}`, rr.status === 400 && achou, { status: rr.status, problemas: problemas(rr) })
    ok(`  e não grava nada`, cc.guardado.fluxo.draft === BOM, 'rascunho foi alterado')
  }

  // ── os AVISOS, que NÃO impedem ───────────────────────────────────────────
  // Desenhar em partes é normal, e o motor sabe lidar: opção sem destino
  // entrega a uma pessoa.
  const INCOMPLETO = {
    root: 'inicio',
    nodes: [
      { id: 'inicio', type: 'menu', data: { text: 'Olá!', options: [{ id: 'a', label: 'Suporte' }, { id: 'b', label: 'Outro' }] } },
      { id: 'pessoa', type: 'handoff', data: { text: 'Chamando.' } },
      { id: 'orfao', type: 'content', data: { text: 'ninguém chega aqui' } },
    ],
    edges: [{ source: 'inicio', target: 'pessoa', sourceHandle: 'opt:a' }],
  }
  c = ctxDe({ body: { graph: INCOMPLETO } })
  r = await patch(c)
  ok('grafo incompleto SALVA', r.status !== 400, r.body)
  const avisos = (r.body && r.body.data && r.body.data.avisos) || (r.body && r.body.avisos) || []
  ok('  e avisa da opção sem destino',
    avisos.some((a) => String(a).includes('não leva a nenhum card')), avisos)
  ok('  e do card inalcançável',
    avisos.some((a) => String(a).includes('não é alcançável')), avisos)

  const COND_SOLTA = {
    root: 'c',
    nodes: [
      { id: 'c', type: 'condition', data: { check: 'businessHours' } },
      { id: 'd', type: 'content', data: { text: 'sim' } },
    ],
    edges: [{ source: 'c', target: 'd', sourceHandle: 'true' }],
  }
  r = await patch(ctxDe({ body: { graph: COND_SOLTA } }))
  const av2 = (r.body && r.body.data && r.body.data.avisos) || (r.body && r.body.avisos) || []
  ok('avisa da condição com um ramo solto',
    av2.some((a) => String(a).includes('saída Não')), av2)

  // ── publish ──────────────────────────────────────────────────────────────
  r = await publish(ctxDe({ fluxo: { id: 'f1', version: 2, draft: BOM } }))
  ok('publica rascunho bom', r.status !== 400, r.body)

  r = await publish(ctxDe({ fluxo: { id: 'f1', version: 2, draft: null } }))
  ok('não publica rascunho vazio (antes publicava null)',
    r.status === 400 && String(r.body.error).includes('Não há rascunho'), r.body)

  const cc = ctxDe({ fluxo: { id: 'f1', version: 2, draft: { nodes: [{ id: 'a', type: 'telepatia', data: {} }] } } })
  r = await publish(cc)
  ok('não publica rascunho quebrado', r.status === 400, r.body)
  ok('  e não mexe na versão', cc.guardado.fluxo.version === 2, cc.guardado.fluxo.version)

  // Rascunho guardado como string JSON também é validado.
  r = await publish(ctxDe({ fluxo: { id: 'f1', version: 2, draft: JSON.stringify(BOM) } }))
  ok('rascunho em string JSON é aceito', r.status !== 400, r.body)

  // ── prazo do card Atendente (LEGADO, 21/10/2026) ────────────────────────
  // O prazo do aviso é uma configuração única (painel "Configuração de avisos"). O card não o
  // oferece nem o valida: um `avisarApos` antigo, mesmo absurdo, não pode impedir o salvamento
  // de um fluxo sem que a tela tenha onde corrigi-lo.
  for (const [prazo, deveRecusar] of [
    [0, false], [1, false], [240, false],
    [-1, false], [241, false], [10.5, false], ['dez', false],
  ]) {
    const g = {
      root: 'a',
      nodes: [{ id: 'a', type: 'handoff', data: { label: 'Atendente', text: 'ok', avisarApos: prazo } }],
      edges: [],
    }
    const r = await patch(ctxDe({ body: { graph: g } }))
    const recusou = r.status === 400
    ok(`avisarApos legado ${JSON.stringify(prazo)} não impede salvar`,
      recusou === deveRecusar, { status: r.status, problemas: problemas(r) })
  }

  // ── o exemplo do documento do formato JSON ───────────────────────────────
  // O exemplo que a equipe (e uma IA) copia para escrever fluxo fora do portal
  // mora em fixtures/fluxo-exemplo.json e é o MESMO texto do documento. Se ele
  // não passar, o documento ensina a escrever um fluxo que não entra: por isso
  // o exemplo é teste, e não só prosa.
  const exemplo = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'fixtures/fluxo-exemplo.json'), 'utf8'),
  )
  const vf = validarGrafo(JSON.parse(JSON.stringify(exemplo)))
  ok('exemplo do formato: front aceita sem nenhum erro', vf.ok && vf.erros.length === 0, vf.erros)
  ok('  e sem nenhum aviso', vf.avisos.length === 0, vf.avisos)

  const ce = ctxDe({ body: { graph: exemplo } })
  r = await patch(ce)
  ok('exemplo do formato: servidor salva', r.status === 200 && !!ce.guardado.fluxo.draft,
    { status: r.status, problemas: problemas(r) })

  const cep = ctxDe({ fluxo: { id: 'f1', version: 2, draft: exemplo } })
  r = await publish(cep)
  ok('exemplo do formato: servidor publica', r.status === 200 && cep.guardado.fluxo.version === 3,
    { status: r.status, problemas: problemas(r) })

  // Usar todos os cartões é o que faz o exemplo servir de referência.
  const tipos = [...new Set(exemplo.nodes.map((n) => n.type))]
  ok('exemplo do formato: usa os 7 cartões do editor',
    ['menu', 'content', 'handoff', 'condition', 'delay', 'question', 'tag'].every((t) => tipos.includes(t)), tipos)

  fim()
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(1) })
