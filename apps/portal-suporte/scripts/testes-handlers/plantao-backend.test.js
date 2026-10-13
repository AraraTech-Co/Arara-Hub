// Plantão: o backend passa a responder "quem eu aviso agora?".
// Entrega 3 do Fluxo v2, parte 1. Roda com: node plantao-backend.test.js
const { carregarHandler, reply, ok, fim } = require('./_carregar.js')

const lista = carregarHandler('311 schedules GET /schedules')
const onCall = carregarHandler('316 schedules GET /schedules/on-call')
const criar = carregarHandler('317 schedules POST /schedules')
const apagar = carregarHandler('309 schedules DELETE /schedules/:id')

// Os três formatos que convivem no model sem schema.
const NOVO = { id: 'p1', kind: 'plantao', date: '2026-10-13', agent_ids: ['u1', 'u2'], notes: 'ajustado à mão' }
const DIARIO = { id: 'd1', date: '2026-10-14', type: 'night', agent_ids: ['u2'], notes: null }
const WARROOM = { id: 'w1', date: '2026-10-15', type: 'warroom', agent_ids: ['u1', 'u2', 'u3'] }
// Semana de 12 a 18/10: n1 -> n2 -> n3 -> backup já é a ordem de chamada.
const SEMANAL = {
  id: 's1', week_start: '2026-10-12', week_end: '2026-10-18',
  n1_assigned: 'u3', n2_assigned: 'u1', n3_assigned: null, backup_assigned: 'u2',
}

// `role` é necessário: a guarda das rotas exige nível >= support, e perfil
// sem papel cai em 0 e leva 403 — que foi exatamente o que o teste pegou na
// primeira tentativa.
const PERFIS = [
  { id: 'u1', full_name: 'Ana', email: 'ana@arara-tech.com', phone: '(19) 99999-0001', role: 'admin' },
  { id: 'u2', full_name: 'Bruno', email: 'bruno@arara-tech.com', phone: null, role: 'support' },   // sem telefone
  { id: 'u3', full_name: 'Carla', email: 'carla@arara-tech.com', phone: '5519999990003', role: 'support' },
]

const HORARIO = {
  fuso: 'America/Sao_Paulo',
  plantao: {
    1: [['18:00', '22:00']], 2: [['18:00', '22:00']], 3: [['18:00', '22:00']],
    4: [['18:00', '22:00']], 5: [['18:00', '22:00']],
    6: [['08:00', '22:00']], 0: [['08:00', '22:00']],
  },
}

function ctxDe({ rows = [], query = {}, params = {}, body = {}, perfis = PERFIS, horario = HORARIO } = {}) {
  const guardado = { rows: rows.map((r) => ({ ...r })), apagados: [] }
  return {
    params, query, body, headers: {},
    user: { id: 'u1' },
    models: {
      SupportSchedule: {
        findMany: async () => guardado.rows,
        findById: async (id) => guardado.rows.find((r) => r.id === id) || null,
        create: async (r) => { const n = { id: 'novo1', ...r }; guardado.rows.push(n); return n },
        update: async (id, p) => { const r = guardado.rows.find((x) => x.id === id); Object.assign(r, p); return r },
        delete: async (id) => { guardado.apagados.push(id) },
      },
      Profile: {
        findMany: async () => perfis,
        findById: async (id) => perfis.find((p) => p.id === id) || null,
      },
      SystemSettings: { findMany: async () => [{ waHorario: JSON.stringify(horario) }] },
      Sessao: { findById: async () => null },
    },
    reply: reply(),
    guardado,
  }
}

const corpo = (r) => (r.body && r.body.data !== undefined ? r.body.data : r.body)

;(async () => {
  // ── listagem: o intervalo é recorte, não filtro de campo ─────────────────
  // Era isto que fazia as abas mostrarem "Sem escala" com dados gravados: a
  // tela mandava start/end e o backend repassava como coluna do registro.
  let r = await lista(ctxDe({ rows: [NOVO, DIARIO, SEMANAL], query: { start: '2026-10-13', end: '2026-10-14' } }))
  let dias = corpo(r)
  ok('listagem por intervalo devolve os dias do intervalo', dias.length === 2, dias.map((d) => d.date))
  ok('  e nada fora dele', dias.every((d) => d.date >= '2026-10-13' && d.date <= '2026-10-14'), dias.map((d) => d.date))

  // Sem intervalo, devolve tudo (a semana virou 7 dias).
  r = await lista(ctxDe({ rows: [SEMANAL] }))
  ok('semana vira sete dias de plantão', corpo(r).length === 7, corpo(r).length)
  ok('  com a ordem de chamada n1 -> n2 -> backup',
    JSON.stringify(corpo(r)[0].agent_ids) === JSON.stringify(['u3', 'u1', 'u2']), corpo(r)[0].agent_ids)

  // Precedência: o dia ajustado à mão ganha da semana que o gerou.
  r = await lista(ctxDe({ rows: [SEMANAL, NOVO], query: { from: '2026-10-13', to: '2026-10-13' } }))
  ok('dia ajustado à mão ganha da escala semanal',
    corpo(r)[0].origem === 'plantao' && JSON.stringify(corpo(r)[0].agent_ids) === JSON.stringify(['u1', 'u2']),
    corpo(r)[0])

  // War room sai da escala (é estado de incidente, não turno).
  r = await lista(ctxDe({ rows: [WARROOM] }))
  ok('war room não é plantão', corpo(r).length === 0, corpo(r))

  // Telefone conferido vem junto, para a tela marcar ✅/⚠.
  r = await lista(ctxDe({ rows: [NOVO], query: {} }))
  const ag = corpo(r)[0].agentes
  ok('telefone conferido por agente',
    ag[0].telefone_ok === true && ag[1].telefone_ok === false, ag)
  ok('  e o nome vem resolvido', ag[0].nome === 'Ana', ag)

  // ── on-call: dentro e fora da janela ─────────────────────────────────────
  // Segunda 20:00 em São Paulo = dentro (18–22).
  r = await onCall(ctxDe({ rows: [NOVO], query: { em: '2026-10-12T23:00:00Z' } }))
  let d = corpo(r)
  ok('dentro da janela, devolve quem avisar', d.agora.em_plantao === true, d.agora)

  // Segunda 15:00 = horário comercial, fora da janela de plantão: NINGUÉM.
  r = await onCall(ctxDe({ rows: [NOVO], query: { em: '2026-10-12T18:00:00Z' } }))
  d = corpo(r)
  ok('fora da janela não avisa ninguém', d.avisar.length === 0, d.avisar)
  ok('  e diz por quê', d.motivo === 'fora da janela de plantão', d.motivo)

  // Domingo 10:00 = dentro (8–22 no fim de semana).
  r = await onCall(ctxDe({
    rows: [{ id: 'p2', kind: 'plantao', date: '2026-10-18', agent_ids: ['u3'] }],
    query: { em: '2026-10-18T13:00:00Z' },
  }))
  d = corpo(r)
  ok('domingo de manhã está em plantão', d.agora.em_plantao === true, d.agora)
  ok('  e a fila tem a Carla', d.avisar.length === 1 && d.avisar[0].nome === 'Carla', d.avisar)

  // Quem não tem telefone é PULADO, não escondido: a escala tem um buraco e a
  // tela precisa poder mostrar isso.
  r = await onCall(ctxDe({
    rows: [{ id: 'p3', kind: 'plantao', date: '2026-10-13', agent_ids: ['u2', 'u1'] }],
    query: { em: '2026-10-13T23:00:00Z' },
  }))
  d = corpo(r)
  ok('sem telefone é pulado na fila', d.avisar.length === 1 && d.avisar[0].id === 'u1', d.avisar)
  ok('  mas aparece em sem_telefone', d.sem_telefone.length === 1 && d.sem_telefone[0].id === 'u2', d.sem_telefone)

  // Dentro da janela e sem plantão definido: ninguém, com motivo.
  r = await onCall(ctxDe({ rows: [], query: { em: '2026-10-13T23:00:00Z' } }))
  d = corpo(r)
  ok('sem plantão no dia: ninguém, com motivo',
    d.avisar.length === 0 && String(d.motivo).includes('sem plantão'), d.motivo)

  // Todos sem telefone: o motivo precisa dizer isso, não "está sem ninguém".
  r = await onCall(ctxDe({
    rows: [{ id: 'p4', kind: 'plantao', date: '2026-10-13', agent_ids: ['u2'] }],
    query: { em: '2026-10-13T23:00:00Z' },
  }))
  ok('motivo distingue "sem telefone" de "sem ninguém"',
    String(corpo(r).motivo).includes('telefone'), corpo(r).motivo)

  // ── upsert: salvar o mesmo dia atualiza, não duplica ────────────────────
  let cc = ctxDe({ rows: [NOVO], body: { date: '2026-10-13', agent_ids: ['u3'] } })
  r = await criar(cc)
  ok('salvar o mesmo dia ATUALIZA', r.body.criado === false, r.body)
  ok('  e não nasce um segundo registro',
    cc.guardado.rows.filter((x) => x.kind === 'plantao' && x.date === '2026-10-13').length === 1,
    cc.guardado.rows.length)

  cc = ctxDe({ rows: [], body: { date: '2026-10-20', agent_ids: ['u1'] } })
  r = await criar(cc)
  ok('dia novo é criado', r.status === 201 && r.body.criado === true, r.body)

  // Registro antigo NÃO é sobrescrito: o novo vence por precedência e o
  // histórico fica intacto.
  cc = ctxDe({ rows: [SEMANAL], body: { date: '2026-10-13', agent_ids: ['u1'] } })
  await criar(cc)
  ok('escala semanal antiga continua no banco',
    cc.guardado.rows.some((x) => x.id === 's1'), cc.guardado.rows.map((x) => x.id))

  // Validações
  for (const [nome, body, pedaco] of [
    ['sem data', { agent_ids: ['u1'] }, 'AAAA-MM-DD'],
    ['data sem sentido', { date: '13/10/2026', agent_ids: [] }, 'AAAA-MM-DD'],
    ['pessoa repetida na ordem', { date: '2026-10-13', agent_ids: ['u1', 'u1'] }, 'duas vezes'],
    ['agente que não existe', { date: '2026-10-13', agent_ids: ['naoexiste'] }, 'não existe membro'],
  ]) {
    r = await criar(ctxDe({ body }))
    ok(`${nome} é recusado`, r.status === 400 && String(r.body.error).includes(pedaco), r.body)
  }

  // Dia sem ninguém é estado legítimo: plantão vago se registra.
  r = await criar(ctxDe({ body: { date: '2026-10-21', agent_ids: [] } }))
  ok('plantão vago é aceito', r.status === 201, r.body)

  // ── delete: aceitar o que o cliente manda ───────────────────────────────
  // Nunca funcionou: backend lia o caminho, cliente manda na query.
  cc = ctxDe({ rows: [NOVO], query: { id: 'p1' }, params: {} })
  r = await apagar(cc)
  ok('excluir pela query funciona (era 400 sempre)', r.status !== 400, r)
  ok('  e apagou de verdade', cc.guardado.apagados[0] === 'p1', cc.guardado.apagados)

  cc = ctxDe({ rows: [NOVO], params: { id: 'p1' } })
  r = await apagar(cc)
  ok('excluir pelo caminho continua funcionando', cc.guardado.apagados[0] === 'p1', cc.guardado.apagados)

  cc = ctxDe({ rows: [NOVO], query: { date: '2026-10-13' } })
  r = await apagar(cc)
  ok('excluir por data funciona (a tela pensa em dias)', cc.guardado.apagados[0] === 'p1', cc.guardado.apagados)

  r = await apagar(ctxDe({ rows: [], query: { date: '2026-10-13' } }))
  ok('data sem plantão responde 404, não 400', r.status === 404, r)

  r = await apagar(ctxDe({ rows: [NOVO], query: {} }))
  ok('sem id e sem data, a recusa diz o que mandar',
    r.status === 400 && String(r.body.error).includes('date='), r.body)

  fim()
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(1) })
