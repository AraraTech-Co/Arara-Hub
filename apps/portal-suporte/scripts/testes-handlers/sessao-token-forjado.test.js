// O cabeçalho `x-portal-sessao` não aceita token forjado.
//
// A identidade do portal vem do JWT (`ctx.user`) ou deste cabeçalho, no
// formato `<id>.<verificador>`. Nenhum teste exercitava o segundo caminho: a
// varredura do perímetro chama sem cabeçalho nenhum, então a COMPARAÇÃO do
// verificador — e as recusas por sessão revogada e vencida — nunca rodavam.
//
// Quem sabe um id de sessão (ele viaja em log, em tela de diagnóstico, no
// próprio aparelho) não pode entrar adivinhando o verificador.
//
// O QUE SE GARANTE, numa rota guardada:
//   1. cabeçalho ausente ou malformado: 401, e a tabela de sessões nem é lida;
//   2. id que existe + verificador ERRADO: 401, e a linha FOI lida (o caminho
//      chegou até a comparação, não parou antes);
//   3. sessão revogada e sessão vencida: 401, mesmo com o verificador certo;
//   4. verificador certo, sessão válida: 200 — é o contraste que prova que o
//      laboratório sabe produzir um "passa";
//   5. o nível continua valendo: sessão boa de quem não alcança o piso dá 403;
//   6. a busca usa o prefixo `ses_`, e o verificador nunca volta no corpo.
//
// Roda com: node sessao-token-forjado.test.js
const { carregarHandler, reply, ok, fim } = require('./_carregar.js')

// Rota guardada qualquer: o que se mede é o invólucro, não o corpo dela.
const ROTA = '129 admin_teams GET /admin/teams'

const VERIFICADOR = 'vrf-certo-8a21'
const ID_CRU = 'abc123'
const DAQUI_A_UM_MES = new Date(Date.now() + 30 * 86400000).toISOString()
const ONTEM = new Date(Date.now() - 86400000).toISOString()

function montar(o) {
  const op = o || {}
  const lido = []
  const linha = op.linha === undefined
    ? { id: 'ses_' + ID_CRU, user_id: 'u9', verificador: VERIFICADOR,
        expira_em: DAQUI_A_UM_MES, revogada: false }
    : op.linha
  return {
    lido,
    ctx: {
      headers: op.headers || {},
      // Sem JWT: a identidade tem de vir do cabeçalho, ou de lugar nenhum.
      user: {},
      query: {}, body: {}, params: {}, reply: reply(),
      models: {
        Sessao: {
          findById: async (id) => { lido.push(String(id)); return linha },
        },
        Profile: {
          findById: async () => ({ id: 'u9', role: op.papel || 'admin' }),
        },
        Team: { findMany: async () => [{ id: 't1', nome: 'Time' }] },
      },
    },
  }
}

const h = carregarHandler(ROTA)

async function tentar(o) {
  const m = montar(o)
  const r = await h(m.ctx)
  return { status: r.status, body: r.body, lido: m.lido }
}

;(async () => {
  // 1. Nada, ou lixo: recusa sem nem consultar a tabela.
  const semNada = [
    ['ausente', {}],
    ['vazio', { 'x-portal-sessao': '' }],
    ['sem-ponto', { 'x-portal-sessao': ID_CRU }],
    ['so-ponto', { 'x-portal-sessao': '.' }],
    ['sem-verificador', { 'x-portal-sessao': ID_CRU + '.' }],
    ['sem-id', { 'x-portal-sessao': '.' + VERIFICADOR }],
    ['pontos-demais', { 'x-portal-sessao': ID_CRU + '.' + VERIFICADOR + '.x' }],
  ]
  for (const [nome, headers] of semNada) {
    const r = await tentar({ headers })
    ok('malformado-recusa:' + nome, r.status === 401, { nome, status: r.status })
    ok('malformado-nem-consulta-a-tabela:' + nome, r.lido.length === 0, r.lido)
  }

  // 2. O ataque de verdade: o id está certo, o verificador é chute.
  {
    const r = await tentar({ headers: { 'x-portal-sessao': ID_CRU + '.vrf-chute' } })
    ok('verificador-errado-recusa', r.status === 401, r.status)
    // Prova que o caminho ACONTECEU: a linha foi buscada, e a recusa veio da
    // comparação, não de um atalho antes dela.
    ok('verificador-errado-chegou-a-comparar', r.lido.length === 1, r.lido)
    ok('a-busca-usa-o-prefixo-ses_', r.lido[0] === 'ses_' + ID_CRU, r.lido)

    // Pedaço do verificador certo também é chute: a comparação tem de ser do
    // valor INTEIRO. Com uma comparação por começo, mandar uma letra só
    // passaria.
    for (const pedaco of [VERIFICADOR.slice(0, 1), VERIFICADOR.slice(0, 8),
      VERIFICADOR.slice(0, VERIFICADOR.length - 1)]) {
      const p = await tentar({ headers: { 'x-portal-sessao': ID_CRU + '.' + pedaco } })
      ok('pedaco-do-verificador-tambem-recusa:' + pedaco.length,
        p.status === 401, { pedaco, status: p.status })
    }
    // E o sufixo, para o caso de a comparação virar "termina com".
    const sufixo = await tentar({
      headers: { 'x-portal-sessao': ID_CRU + '.' + VERIFICADOR.slice(1) } })
    ok('sufixo-do-verificador-tambem-recusa', sufixo.status === 401, sufixo.status)
  }

  // 3. Verificador certo, mas a sessão não vale mais.
  {
    const bom = { 'x-portal-sessao': ID_CRU + '.' + VERIFICADOR }
    const revogada = await tentar({
      headers: bom,
      linha: { id: 'ses_' + ID_CRU, user_id: 'u9', verificador: VERIFICADOR,
               expira_em: DAQUI_A_UM_MES, revogada: true },
    })
    ok('sessao-revogada-recusa', revogada.status === 401, revogada.status)
    const vencida = await tentar({
      headers: bom,
      linha: { id: 'ses_' + ID_CRU, user_id: 'u9', verificador: VERIFICADOR,
               expira_em: ONTEM, revogada: false },
    })
    ok('sessao-vencida-recusa', vencida.status === 401, vencida.status)
    const sumiu = await tentar({ headers: bom, linha: null })
    ok('sessao-inexistente-recusa', sumiu.status === 401, sumiu.status)
  }

  // 4. O CONTRASTE: com o verificador certo e a sessão boa, entra.
  //
  // Sem este caso, todos os 401 acima passariam num invólucro que recusasse
  // qualquer cabeçalho — inclusive o legítimo.
  {
    const r = await tentar({ headers: { 'x-portal-sessao': ID_CRU + '.' + VERIFICADOR } })
    ok('sessao-boa-entra', r.status === 200 || r.status === undefined, r.status)
    ok('sessao-boa-recebe-o-corpo-da-rota',
      !!r.body && Array.isArray(r.body.data) && r.body.data.length === 1, r.body)
  }

  // 5. Sessão boa não dispensa o nível.
  {
    const r = await tentar({
      headers: { 'x-portal-sessao': ID_CRU + '.' + VERIFICADOR }, papel: 'user',
    })
    ok('sessao-boa-de-quem-nao-alcanca-o-piso-da-403', r.status === 403, r.status)
  }

  // 6. O verificador não volta no corpo, em caso nenhum.
  {
    const r = await tentar({ headers: { 'x-portal-sessao': ID_CRU + '.' + VERIFICADOR } })
    const erro = await tentar({ headers: { 'x-portal-sessao': ID_CRU + '.vrf-chute' } })
    const texto = JSON.stringify(r.body || {}) + JSON.stringify(erro.body || {})
    ok('o-verificador-nunca-volta-no-corpo', !texto.includes(VERIFICADOR), texto.slice(0, 200))
  }

  fim()
})()
