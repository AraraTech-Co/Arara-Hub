// `GET /auth/sessao/estado` passa a exigir pessoa de nível admin.
//
// A rota é a telemetria das sessões do portal. Não devolve token, mas devolve,
// das cinco sessões mais recentes, QUEM usou (`user_id`), quando criou, quando
// usou por último, quando expira e o agente do aparelho — mais a contagem de
// ativas, expiradas e revogadas. Isso é quadro de uso da equipe, não dado
// público.
//
// O QUE SE GARANTE:
//   1. credencial de aplicativo, sem pessoa: 401 — e sem NENHUMA leitura da
//      tabela de sessões, porque recusar depois de ler já é ter lido;
//   2. pessoa de nível developer: 403, também sem leitura;
//   3. pessoa de nível admin: 200 com a telemetria.
//
// Roda com: node auth-sessao-estado-admin.test.js
const { carregarHandler, reply, ok, fim } = require('./_carregar.js')

const ROTA = '158 auth GET /auth/sessao/estado'

function montar(quem) {
  const lido = []
  const sessoes = [
    { id: 'ses_1', user_id: 'u1', criada_em: '2026-10-29T10:00:00.000Z',
      ultimo_uso: '2026-10-30T09:00:00.000Z', expira_em: '2026-11-29T10:00:00.000Z',
      agente: 'Mozilla/5.0 (Macintosh)' },
    { id: 'ses_2', user_id: 'u2', criada_em: '2026-10-28T10:00:00.000Z',
      ultimo_uso: '2026-10-28T11:00:00.000Z', expira_em: '2026-10-29T10:00:00.000Z',
      agente: 'Mozilla/5.0 (iPhone)' },
  ]
  return {
    lido,
    ctx: {
      headers: {}, query: {}, body: {}, params: {}, reply: reply(),
      user: quem.user || { type: 'apiKey' },
      models: {
        Sessao: {
          findMany: async () => { lido.push('findMany'); return sessoes.slice() },
          findById: async (id) => { lido.push('findById:' + id); return null },
        },
        Profile: { findById: async () => (quem.perfil || null) },
      },
    },
  }
}

;(async () => {
  const h = carregarHandler(ROTA)

  // 1. A credencial do aplicativo não carrega pessoa.
  {
    const m = montar({ user: { type: 'apiKey' } })
    const r = await h(m.ctx)
    ok('sem-pessoa:recusa-com-401', r.status === 401, r)
    ok('sem-pessoa:nao-leu-a-tabela-de-sessoes', m.lido.length === 0, m.lido)
    ok('sem-pessoa:nao-devolve-telemetria',
      !r.body || !r.body.data, r.body)
  }

  // 2. Pessoa existe, mas o nível não alcança.
  for (const papel of ['user', 'support', 'developer']) {
    const m = montar({ user: { id: 'u9' }, perfil: { id: 'u9', role: papel } })
    const r = await h(m.ctx)
    ok('nivel-abaixo-de-admin-recusa:' + papel, r.status === 403, { papel, r })
    ok('nivel-abaixo-de-admin-nao-le-a-tabela:' + papel, m.lido.length === 0,
      { papel, lido: m.lido })
  }

  // 3. Admin passa — e o `master`, que é apelido de admin, também.
  for (const papel of ['admin', 'master']) {
    const m = montar({ user: { id: 'u9' }, perfil: { id: 'u9', role: papel } })
    const r = await h(m.ctx)
    ok('admin-recebe-a-telemetria:' + papel,
      r.status === 200 || r.status === undefined, { papel, status: r.status })
    const d = r.body && r.body.data
    ok('admin-ve-a-contagem:' + papel, !!d && d.total === 2, d)
    // O contraste que prova que o caminho ACONTECEU: sem a leitura, "200" podia
    // ser um corpo vazio que ninguém conferiu.
    ok('admin-ve-as-ultimas-sessoes:' + papel,
      !!d && Array.isArray(d.ultimas) && d.ultimas.length === 2
      && d.ultimas.every((x) => !!x.user_id), d && d.ultimas)
    ok('a-leitura-aconteceu:' + papel, m.lido.includes('findMany'), m.lido)
  }

  // A telemetria nunca devolve o token nem o verificador, em nenhum nível.
  {
    const m = montar({ user: { id: 'u9' }, perfil: { id: 'u9', role: 'admin' } })
    const r = await h(m.ctx)
    const texto = JSON.stringify(r.body || {})
    ok('nem-para-o-admin-sai-token-ou-verificador',
      !texto.includes('verificador') && !texto.includes('token'), texto.slice(0, 200))
  }

  fim()
})()
