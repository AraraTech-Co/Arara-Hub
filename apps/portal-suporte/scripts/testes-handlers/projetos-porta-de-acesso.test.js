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

async function statusDe(marca, quem, extra) {
  // Nome fora do mapa daria `perfil: undefined`, um 403 e a impressão de que a
  // regra recusou. Melhor parar dizendo o nome errado.
  if (!QUEM[quem]) throw new Error('perfil desconhecido no teste: ' + quem)
  const { handler } = carregarHandlerEContexto(marca)
  const r = await handler(montar(QUEM[quem], extra))
  return r.status
}

;(async () => {
  // ── 1. A porta do módulo: o campo "Projetos", e mais nada ─────────────────
  //
  // Decisão do Leonardo (30/10): "libera projetos para todos os membros, mas
  // quem vai ter acesso aos projetos é na área de membros que eu decido,
  // selecionando as caixas e dando permissão". A porta antiga — developer+ por
  // cargo, ou o grant `qa` como passe — saiu junto com a constante de
  // transição, e por isso `developer` e `support+qa` agora recusam.
  {
    const esperado = {
      'master': 200, 'admin': 200,
      'user+projetos': 200, 'developer+projetos': 200,
      'developer': 403, 'support+qa': 403,
      // Quem planeja continua vendo sem o campo: o grant abre o POST e o PATCH
      // de atividade, e sem isto a pessoa criaria atividade sem ver nenhuma.
      'support+planejamento': 200,
      'support': 403, 'user': 403,
    }
    for (const marca of [VER, VER_ATIV]) {
      const vistos = {}
      for (const quem of Object.keys(esperado)) vistos[quem] = await statusDe(marca, quem)
      for (const quem of Object.keys(esperado)) {
        ok(`porta:${quem}:${marca.split(' ')[0]}=${esperado[quem]}`,
          vistos[quem] === esperado[quem], vistos)
      }
    }
    // O campo é a causa: os MESMOS cargos, o mesmo handler, e a diferença é só
    // a caixa marcada. Sem este contraste, "developer recusa" passaria também
    // num handler que recusasse todo mundo.
    const semCampo = await statusDe(VER, 'developer')
    const comCampo = await statusDe(VER, 'developer+projetos')
    ok('o-campo-e-a-causa-da-diferenca', semCampo === 403 && comCampo === 200,
      { semCampo, comCampo })
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
    const escreverUsuario = await statusDe(ESCREVER_ATIV, 'user+projetos', corpo)
    const escreverDev = await statusDe(ESCREVER_ATIV, 'developer', corpo)
    const escreverPlanejador = await statusDe(ESCREVER_ATIV, 'developer+planejamento', corpo)
    ok('campo-projetos-ve-mas-nao-escreve', verUsuario === 200 && escreverUsuario === 403,
      { verUsuario, escreverUsuario })
    ok('developer-comum-tambem-nao-cria-mais', escreverDev === 403, escreverDev)
    ok('quem-planeja-cria', escreverPlanejador === 201, escreverPlanejador)
  }

  // ── 4b. Quem planeja CRIA e LISTA ────────────────────────────────────────
  //
  // O grant `planejamento` abria o POST e o PATCH de atividade e não abria a
  // listagem, porque a 507 passa só por `_podeVer`. A pessoa criava atividade e
  // não conseguia ver nenhuma. Continua valendo com a porta antiga fora.
  {
    const corpo = {
      body: {
        titulo: 'Atividade', descricao: 'Detalhe',
        responsavel_id: 'u1', previsao_entrega: '2026-12-01',
      },
      params: { id: 'p1' },
    }
    const cria = await statusDe(ESCREVER_ATIV, 'support+planejamento', corpo)
    const lista = await statusDe(VER_ATIV, 'support+planejamento')
    const projeto = await statusDe(VER, 'support+planejamento')
    ok('quem-planeja-cria-e-lista',
      cria === 201 && lista === 200 && projeto === 200, { cria, lista, projeto })

    // E quem não planeja nem tem o campo continua de fora.
    ok('support-sem-grant-continua-fora',
      (await statusDe(VER_ATIV, 'support')) === 403, null)
    // O grant de QA não é mais passe para o módulo.
    ok('qa-nao-e-mais-passe', (await statusDe(VER_ATIV, 'support+qa')) === 403, null)
    // Nem o cargo de developer sozinho.
    ok('cargo-de-developer-nao-e-mais-passe',
      (await statusDe(VER_ATIV, 'developer')) === 403, null)
  }

  // ── 5. Os 21 handlers do módulo têm a MESMA porta ─────────────────────────
  {
    const texto = fs.readFileSync(ARQ, 'utf8')
    const entradas = []
    const re = /\n  \/\/ (\d+ [^\n]*)\n([\s\S]*?)(?=\n  \/\/ \d+ |\n\]\n|$)/g
    let m
    while ((m = re.exec(texto))) entradas.push({ marca: m[1], corpo: m[2] })

    const doModulo = entradas.filter((e) => e.marca.includes(' projetos '))
    // 25 = os 21 de antes mais as quatro rotas de Materiais de Apoio, que são
    // do mesmo módulo e carregam a mesma porta.
    ok('achou-os-25-handlers-do-modulo', doModulo.length === 25, doModulo.length)

    // O que SAIU. Uma rota que ficasse para trás teria a porta antiga de volta,
    // e o módulo passaria a ter duas réguas ao mesmo tempo.
    const SAIU = [
      'var _PORTA_ANTIGA_DE_PROJETOS = true;',
      'if (!_PORTA_ANTIGA_DE_PROJETOS) return false;',
      'return eu.nivel >= _RANK.developer || eu.grants.indexOf(\\"qa\\") >= 0;',
    ]
    for (const p of SAIU) {
      const sobrou = doModulo.filter((e) => e.corpo.includes(p)).map((e) => e.marca)
      ok('porta-antiga-fora-de-todos:' + p.slice(0, 40), sobrou.length === 0, sobrou)
    }

    // O que FICOU, em todos.
    const FICOU = [
      'if (eu.nivel >= _RANK.admin) return true;',
      'if (eu.grants.indexOf(\\"projetos\\") >= 0) return true;',
      'return eu.grants.indexOf(\\"planejamento\\") >= 0;',
    ]
    for (const p of FICOU) {
      const faltam = doModulo.filter((e) => !e.corpo.includes(p)).map((e) => e.marca)
      ok('porta-nova-em-todos:' + p.slice(0, 40), faltam.length === 0, faltam)
    }

    // E a constante da transição não ficou em módulo nenhum do arquivo.
    const sobras = entradas
      .filter((e) => e.corpo.includes('_PORTA_ANTIGA_DE_PROJETOS'))
      .map((e) => e.marca)
    ok('a-constante-da-transicao-nao-existe-mais', sobras.length === 0, sobras)
  }

  fim()
})()
