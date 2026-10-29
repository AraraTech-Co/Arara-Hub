// A porta de VER o módulo de Projetos, no SERVIDOR.
//
// Decisão de 28/10: o acesso ao módulo é o campo "Projetos" em Editar membro,
// sem concessão automática por cargo e sem o grant de QA valendo como passe.
// Adm e master continuam entrando por nível.
//
// A troca NÃO acontece no deploy. Enquanto `_PORTA_ANTIGA_DE_PROJETOS` for
// `true`, a porta antiga (developer+ ou grant `qa`) vale ao lado da nova, para
// ninguém perder o módulo antes de existir a lista de quem recebe o campo.
//
// Por isso este teste tem DOIS blocos de comportamento: hoje (transição) e o
// dia da troca. O dia da troca é provado virando a constante DENTRO do contexto
// do handler — `var` de topo no `vm` é propriedade do contexto, e a função lê o
// valor na hora da chamada. Sem esse bloco, o comentário da constante seria uma
// promessa sem prova.
//
// E tem um caso que não é sobre comportamento: a conferência de que os 21
// handlers do módulo têm a MESMA porta. Se ficar como passo manual, a próxima
// rota nasce com a porta antiga e nada acusa.
//
// Roda com: node projetos-porta-de-acesso.test.js
const fs = require('node:fs')
const { carregarHandlerEContexto, reply, ok, fim, ARQ } = require('./_carregar.js')

const VER = '292 projetos GET /projetos'
const VER_ATIV = '507 projetos GET /projetos/:id/atividades'
const ESCREVER_ATIV = '508 projetos POST /projetos/:id/atividades'

function modelo(linhas) {
  return {
    findById: async (id) => linhas.find((l) => String(l.id) === String(id)) || null,
    findMany: async () => linhas.slice(),
    create: async (d) => { linhas.push(d); return d },
    update: async (id, d) => {
      const i = linhas.findIndex((l) => String(l.id) === String(id))
      if (i >= 0) linhas[i] = Object.assign({}, linhas[i], d)
      return linhas[i]
    },
    delete: async () => true,
  }
}

function montar(perfil, o) {
  o = o || {}
  return {
    headers: {},
    user: { id: 'u1' },
    params: o.params || { id: 'p1' },
    query: {},
    body: o.body || {},
    reply: reply(),
    models: {
      Profile: { findById: async () => Object.assign({ id: 'u1' }, perfil) },
      Sessao: { findById: async () => null },
      Projeto: modelo([{ id: 'p1', nome: 'Projeto 1', created_at: '2026-01-01T00:00:00.000Z' }]),
      Ticket: modelo([]),
      ProjetoFase: modelo([]),
      CardDependencia: modelo([]),
      ActivityLog: modelo([]),
      ProjetoAtividade: modelo([]),
      ProjetoAtividadeEvento: modelo([]),
    },
  }
}

// Quem é quem. `nivel` do servidor vem de `role` pelo _RANK/_APELIDOS: master
// é apelido de admin, member/agent são apelidos de support.
const QUEM = {
  'master':              { role: 'master',    feature_grants: [] },
  'admin':               { role: 'admin',     feature_grants: [] },
  'developer':           { role: 'developer', feature_grants: [] },
  'developer+projetos':  { role: 'developer', feature_grants: ['projetos'] },
  'developer+planejamento': { role: 'developer', feature_grants: ['planejamento'] },
  'support+qa':          { role: 'support',   feature_grants: ['qa'] },
  'support+planejamento': { role: 'support',  feature_grants: ['planejamento'] },
  'support':             { role: 'support',   feature_grants: [] },
  'user+projetos':       { role: 'user',      feature_grants: ['projetos'] },
  'user':                { role: 'user',      feature_grants: [] },
}

async function statusDe(marca, quem, portaAntiga, extra) {
  // Nome fora do mapa daria `perfil: undefined`, um 403 e a impressão de que a
  // regra recusou. Melhor parar dizendo o nome errado.
  if (!QUEM[quem]) throw new Error('perfil desconhecido no teste: ' + quem)
  const { handler, contexto } = carregarHandlerEContexto(marca)
  if (portaAntiga === false) contexto._PORTA_ANTIGA_DE_PROJETOS = false
  const r = await handler(montar(QUEM[quem], extra))
  return r.status
}

;(async () => {
  // ── 1. A constante existe no handler e vale `true` no arquivo entregue ─────
  {
    const { contexto } = carregarHandlerEContexto(VER)
    ok('a-constante-da-transicao-existe-no-handler',
      contexto._PORTA_ANTIGA_DE_PROJETOS === true, contexto._PORTA_ANTIGA_DE_PROJETOS)
  }

  // ── 2. Hoje: a porta nova vale, e a antiga ainda vale ao lado dela ─────────
  {
    const esperado = {
      'master': 200, 'admin': 200,
      'user+projetos': 200, 'developer+projetos': 200,
      'developer': 200, 'support+qa': 200,
      // Quem planeja vê, hoje e depois da troca (decisão de 29/10).
      'support+planejamento': 200,
      'support': 403, 'user': 403,
    }
    for (const marca of [VER, VER_ATIV]) {
      const vistos = {}
      for (const quem of Object.keys(esperado)) vistos[quem] = await statusDe(marca, quem)
      for (const quem of Object.keys(esperado)) {
        ok(`hoje:${quem}:${marca.split(' ')[0]}=${esperado[quem]}`,
          vistos[quem] === esperado[quem], vistos)
      }
    }
  }

  // ── 3. O dia da troca: só admin/master por nível e o grant `projetos` ─────
  {
    const esperado = {
      'master': 200, 'admin': 200,
      'user+projetos': 200, 'developer+projetos': 200,
      'developer': 403, 'support+qa': 403,
      // Quem planeja continua vendo no dia da troca: a liberação vem ANTES da
      // conferência da transição, justamente para não cair com ela.
      'support+planejamento': 200,
      'support': 403, 'user': 403,
    }
    for (const marca of [VER, VER_ATIV]) {
      const vistos = {}
      for (const quem of Object.keys(esperado)) vistos[quem] = await statusDe(marca, quem, false)
      for (const quem of Object.keys(esperado)) {
        ok(`troca:${quem}:${marca.split(' ')[0]}=${esperado[quem]}`,
          vistos[quem] === esperado[quem], vistos)
      }
    }
    // O que prova que a constante é a causa: os MESMOS perfis, o mesmo handler,
    // e a diferença aparece só quando ela vira.
    const comPorta = await statusDe(VER, 'developer')
    const semPorta = await statusDe(VER, 'developer', false)
    ok('a-constante-e-a-causa-da-diferenca', comPorta === 200 && semPorta === 403,
      { comPorta, semPorta })
  }

  // ── 4. O campo dá ACESSO, não escrita ─────────────────────────────────────
  //
  // O alcance por ação (D6c) foi decidido em 29/10: CRIAR atividade é só de
  // quem planeja. Então o campo "Projetos" dá o módulo e nada mais — e o
  // developer comum, que antes criava, também não cria mais. Quem muda isso é
  // o grant `planejamento`, que é outra permissão.
  {
    const corpo = {
      body: {
        titulo: 'Atividade', descricao: 'Detalhe',
        responsavel_id: 'u1', previsao_entrega: '2026-12-01',
      },
      params: { id: 'p1' },
    }
    const verUsuario = await statusDe(VER_ATIV, 'user+projetos')
    const escreverUsuario = await statusDe(ESCREVER_ATIV, 'user+projetos', undefined, corpo)
    const escreverDev = await statusDe(ESCREVER_ATIV, 'developer', undefined, corpo)
    const escreverPlanejador = await statusDe(ESCREVER_ATIV, 'developer+planejamento', undefined, corpo)
    ok('campo-projetos-ve-mas-nao-escreve', verUsuario === 200 && escreverUsuario === 403,
      { verUsuario, escreverUsuario })
    ok('developer-comum-tambem-nao-cria-mais', escreverDev === 403, escreverDev)
    ok('quem-planeja-cria', escreverPlanejador === 201, escreverPlanejador)
  }

  // ── 4b. Quem planeja CRIA e LISTA ────────────────────────────────────────
  //
  // Fecha o ponto que a entrega do servidor deixou aberto: o grant
  // `planejamento` abria o POST e o PATCH de atividade e não abria a listagem,
  // porque a 507 passa só por `_podeVer`. A pessoa criava atividade e não
  // conseguia ver nenhuma.
  {
    const corpo = {
      body: {
        titulo: 'Atividade', descricao: 'Detalhe',
        responsavel_id: 'u1', previsao_entrega: '2026-12-01',
      },
      params: { id: 'p1' },
    }
    for (const porta of [undefined, false]) {
      const quando = porta === false ? 'no-dia-da-troca' : 'hoje'
      const cria = await statusDe(ESCREVER_ATIV, 'support+planejamento', porta, corpo)
      const lista = await statusDe(VER_ATIV, 'support+planejamento', porta)
      const projeto = await statusDe(VER, 'support+planejamento', porta)
      ok('quem-planeja-cria-e-lista:' + quando,
        cria === 201 && lista === 200 && projeto === 200, { quando, cria, lista, projeto })
    }
    // E quem NÃO planeja nem tem o campo continua de fora, nos dois estados.
    for (const porta of [undefined, false]) {
      const quando = porta === false ? 'no-dia-da-troca' : 'hoje'
      ok('support-sem-grant-continua-fora:' + quando,
        (await statusDe(VER_ATIV, 'support', porta)) === 403, quando)
    }
    // O grant de QA não ganhou passe no dia da troca por causa disto.
    ok('qa-continua-sem-passe-no-dia-da-troca',
      (await statusDe(VER_ATIV, 'support+qa', false)) === 403, null)
  }

  // ── 5. Os 21 handlers do módulo têm a MESMA porta ─────────────────────────
  {
    const texto = fs.readFileSync(ARQ, 'utf8')
    const entradas = []
    const re = /\n  \/\/ (\d+ [^\n]*)\n([\s\S]*?)(?=\n  \/\/ \d+ |\n\]\n|$)/g
    let m
    while ((m = re.exec(texto))) entradas.push({ marca: m[1], corpo: m[2] })

    const doModulo = entradas.filter((e) => e.marca.includes(' projetos '))
    ok('achou-os-21-handlers-do-modulo', doModulo.length === 21, doModulo.length)

    const ANTIGA = 'return eu.servico || eu.nivel >= _RANK.developer || eu.grants.indexOf(\\"qa\\") >= 0;'
    const comAntiga = doModulo.filter((e) => e.corpo.includes(ANTIGA)).map((e) => e.marca)
    ok('nenhum-handler-do-modulo-ficou-com-a-porta-antiga', comAntiga.length === 0, comAntiga)

    const PEDACOS = [
      'var _PORTA_ANTIGA_DE_PROJETOS = true;',
      'if (eu.nivel >= _RANK.admin) return true;',
      'if (eu.grants.indexOf(\\"projetos\\") >= 0) return true;',
      'if (!_PORTA_ANTIGA_DE_PROJETOS) return false;',
      'if (eu.grants.indexOf(\\"planejamento\\") >= 0) return true;',
    ]
    for (const p of PEDACOS) {
      const faltam = doModulo.filter((e) => !e.corpo.includes(p)).map((e) => e.marca)
      ok('porta-nova-em-todos:' + p.slice(0, 40), faltam.length === 0, faltam)
    }

    // E a porta nova NÃO vazou para outro módulo: `_podeVer` de outros módulos
    // é outra regra, e trocá-la aqui mudaria permissão que ninguém pediu.
    const foraDoModulo = entradas
      .filter((e) => !e.marca.includes(' projetos ') && e.corpo.includes('_PORTA_ANTIGA_DE_PROJETOS'))
      .map((e) => e.marca)
    ok('porta-nova-nao-vazou-para-outro-modulo', foraDoModulo.length === 0, foraDoModulo)
  }

  fim()
})()
