// Desativar e reativar membro — o que sai junto com a pessoa (18/09/2026).
// Roda com: node membro-ativacao.test.js
const { carregarHandler, reply, ok, fim } = require('./_carregar.js')
const handler = carregarHandler('490j profiles POST /admin/membros/:id/ativacao')

function mundo() {
  return {
    perfis: {
      eu: { id: 'eu', role: 'master', full_name: 'Leo' },
      sup: { id: 'sup', role: 'support', full_name: 'Rodrigo', active: true },
      outro: { id: 'outro', role: 'support', active: true },
    },
    tickets: [
      { id: 't1', assigned_to: 'sup' }, { id: 't2', assigned_to: 'outro' },
      { id: 't3', assignedTo: 'sup' }, { id: 't4', assigned_to: null },
    ],
    co: [{ id: 'co1', ticket_id: 't2', user_id: 'sup' }, { id: 'co2', ticket_id: 't2', user_id: 'outro' }],
    times: [{ id: 'tm1', profile_id: 'sup' }, { id: 'tm2', profile_id: 'outro' }],
    sessoes: [{ id: 'ses_1', user_id: 'sup', revogada: false }, { id: 'ses_2', user_id: 'outro', revogada: false }],
    log: { ticketsAtualizados: [], apagados: [] },
  }
}
function ctxDe(w, { alvo, body, quemSou = 'eu', semSessao = false }) {
  return {
    params: { id: alvo }, query: {}, body, headers: {}, user: semSessao ? {} : { id: quemSou },
    models: {
      Sessao: {
        findById: async () => null,
        findMany: async () => w.sessoes,
        update: async (id, p) => { Object.assign(w.sessoes.find((x) => x.id === id), p) },
      },
      Profile: {
        findById: async (id) => w.perfis[id] || null,
        update: async (id, p) => { Object.assign(w.perfis[id], p); return w.perfis[id] },
      },
      Ticket: {
        findMany: async () => w.tickets,
        update: async (id, p) => { w.log.ticketsAtualizados.push([id, p]) },
      },
      TicketCoAssignee: { findMany: async () => w.co, delete: async (id) => w.log.apagados.push('co:' + id) },
      TeamMember: { findMany: async () => w.times, delete: async (id) => w.log.apagados.push('tm:' + id) },
    },
    reply: reply(),
  }
}

;(async () => {
  let w = mundo()
  let r = await handler(ctxDe(w, { alvo: 'sup', body: { active: false } }))
  const d = r.body && r.body.data
  ok('desativa: perfil fica inativo', r.status === 200 && w.perfis.sup.active === false, r)
  ok('desativa: solta os 2 chamados dele e não toca nos outros',
    d.chamados_liberados === 2 && w.log.ticketsAtualizados.every(([, p]) => p.assigned_to === null)
    && !w.log.ticketsAtualizados.some(([id]) => id === 't2' || id === 't4'), w.log.ticketsAtualizados)
  ok('desativa: tira só o co-responsável dele', d.co_responsavel_removido === 1 && w.log.apagados.includes('co:co1'), w.log.apagados)
  ok('desativa: tira só o time dele', d.times_removidos === 1 && w.log.apagados.includes('tm:tm1'), w.log.apagados)
  ok('desativa: revoga só a sessão dele', w.sessoes[0].revogada === true && w.sessoes[1].revogada === false, w.sessoes)

  w = mundo()
  r = await handler(ctxDe(w, { alvo: 'sup', body: { active: true } }))
  ok('reativa: religa o cadastro sem mexer em chamado nem time',
    r.status === 200 && w.perfis.sup.active === true && w.log.ticketsAtualizados.length === 0 && w.log.apagados.length === 0, w.log)

  w = mundo()
  r = await handler(ctxDe(w, { alvo: 'eu', body: { active: false } }))
  ok('não deixa desativar a si mesmo', r.status === 400, r)

  w = mundo()
  r = await handler(ctxDe(w, { alvo: 'sup', body: { active: false }, quemSou: 'sup' }))
  ok('support não desativa ninguém: 403', r.status === 403, r)

  w = mundo()
  r = await handler(ctxDe(w, { alvo: 'sup', body: { active: false }, semSessao: true }))
  ok('sem sessão: 401', r.status === 401, r)

  w = mundo()
  r = await handler(ctxDe(w, { alvo: 'fantasma', body: { active: false } }))
  ok('membro inexistente: 404', r.status === 404, r)

  fim()
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(1) })
