// Backup técnico — Entrega de 13/10/2026.
//
// Definição do Leonardo: "o backup não é avisado quando o primeiro não
// responde, ele é avisado quando tem a necessidade de uma intervenção
// técnica". Ou seja: NUNCA automático. O plantonista chama.
//
// NADA sai para a Avisa: `ctx.fetch` é interceptado.
// Roda com: node backup-tecnico.test.js
const { carregarHandler, reply, ok, fim } = require('./_carregar.js')

const criar = carregarHandler('317 schedules POST /schedules')
const onCall = carregarHandler('316 schedules GET /schedules/on-call')
const lista = carregarHandler('311 schedules GET /schedules')
const chamar = carregarHandler('490l whatsapp POST /whatsapp/:id/backup')

const PERFIS = [
  { id: 'ana', full_name: 'Ana', phone: '19999990001', role: 'support' },
  { id: 'bruno', full_name: 'Bruno', phone: null, role: 'support' },       // sem telefone
  { id: 'carlos', full_name: 'Carlos', phone: '5519999990003', role: 'developer' },
  { id: 'chefe', full_name: 'Chefe', phone: '5519999990009', role: 'admin' },
]
const HORARIO = {
  fuso: 'America/Sao_Paulo',
  plantao: {
    1: [['18:00', '22:00']], 2: [['18:00', '22:00']], 3: [['18:00', '22:00']],
    4: [['18:00', '22:00']], 5: [['18:00', '22:00']],
    6: [['08:00', '22:00']], 0: [['08:00', '22:00']],
  },
}

function modelos({ escalas = [], conv = null, perfis = PERFIS, horario = HORARIO } = {}) {
  const guardado = { escalas: escalas.map((e) => ({ ...e })), conv: conv && { ...conv }, eventos: [], enviadas: [] }
  return {
    guardado,
    models: {
      SupportSchedule: {
        findMany: async () => guardado.escalas,
        findById: async (id) => guardado.escalas.find((e) => e.id === id) || null,
        create: async (r) => { const n = { id: 'novo', ...r }; guardado.escalas.push(n); return n },
        update: async (id, p) => { const r = guardado.escalas.find((x) => x.id === id); Object.assign(r, p); return r },
        delete: async () => {},
      },
      WhatsAppConversation: {
        findById: async () => guardado.conv,
        update: async (id, p) => Object.assign(guardado.conv, p),
        findMany: async () => (guardado.conv ? [guardado.conv] : []),
      },
      WaConversationEvents: { create: async (e) => { guardado.eventos.push(e); return e }, findMany: async () => guardado.eventos },
      Profile: { findMany: async () => perfis, findById: async (id) => perfis.find((p) => p.id === id) || null },
      SystemSettings: { findMany: async () => [{ waHorario: JSON.stringify(horario) }] },
      Sessao: { findById: async () => null },
    },
    fetch: async (url, o) => { guardado.enviadas.push(JSON.parse(o.body)); return { status: 200, body: '{}' } },
  }
}

const ctxBase = (m, extra = {}) => Object.assign({
  params: {}, query: {}, body: {}, headers: {},
  user: { id: 'ana' },
  models: m.models,
  secrets: { get: async () => 'token-de-teste' },
  fetch: m.fetch,
  reply: reply(),
}, extra)

// relógio fixo: segunda 20h em São Paulo = dentro da janela (18–22)
const DENTRO = new Date('2026-10-12T23:00:00Z').getTime()
const FORA = new Date('2026-10-12T18:00:00Z').getTime()   // segunda 15h
function comRelogio(t, fn) {
  const real = Date.now
  Date.now = () => t
  return Promise.resolve(fn()).finally(() => { Date.now = real })
}

;(async () => {
  // ══ salvar o dia com as duas listas ═══════════════════════════════════
  let m = modelos()
  let c = ctxBase(m, { body: { date: '2026-10-12', agent_ids: ['ana'], backup_ids: ['carlos'] } })
  let r = await criar(c)
  ok('salva plantão e backup no mesmo dia', r.status === 201, r.body)
  const gravado = m.guardado.escalas[0]
  ok('  as duas listas ficam gravadas',
    JSON.stringify(gravado.agent_ids) === '["ana"]' && JSON.stringify(gravado.backup_ids) === '["carlos"]',
    gravado)

  // A mesma pessoa nos dois papéis não faz sentido: ela pediria ajuda a si
  // mesma.
  m = modelos()
  r = await criar(ctxBase(m, { body: { date: '2026-10-12', agent_ids: ['ana'], backup_ids: ['ana'] } }))
  ok('mesma pessoa de plantão e backup é recusada',
    r.status === 400 && String(r.body.error).includes('não pode ser plantonista e backup'), r.body)

  m = modelos()
  r = await criar(ctxBase(m, { body: { date: '2026-10-12', agent_ids: ['ana'], backup_ids: ['carlos', 'carlos'] } }))
  ok('backup repetido na própria lista é recusado', r.status === 400, r.body)

  m = modelos()
  r = await criar(ctxBase(m, { body: { date: '2026-10-12', agent_ids: ['ana'], backup_ids: ['naoexiste'] } }))
  ok('backup que não existe é recusado', r.status === 400, r.body)

  m = modelos()
  r = await criar(ctxBase(m, { body: { date: '2026-10-12', agent_ids: ['ana'] } }))
  ok('dia sem backup continua válido', r.status === 201, r.body)

  // ══ as leituras devolvem o backup ═════════════════════════════════════
  const ESCALA = [{ id: 'p1', kind: 'plantao', date: '2026-10-12', agent_ids: ['ana'], backup_ids: ['carlos', 'bruno'] }]
  m = modelos({ escalas: ESCALA })
  r = await lista(ctxBase(m, { query: { from: '2026-10-12', to: '2026-10-12' } }))
  const dia = (r.body.data || [])[0]
  ok('a grade devolve o backup do dia', dia && dia.backup && dia.backup.length === 2, dia)
  ok('  com o telefone conferido',
    dia && dia.backup[0].telefone_ok === true && dia.backup[1].telefone_ok === false, dia && dia.backup)

  m = modelos({ escalas: ESCALA })
  r = await onCall(ctxBase(m, { query: { em: '2026-10-12T23:00:00Z' } }))
  let d = r.body.data
  ok('on-call devolve o backup com telefone', d.backup_do_dia.length === 1 && d.backup_do_dia[0].nome === 'Carlos', d.backup_do_dia)
  ok('  e quem está sem telefone aparece à parte',
    d.backup_sem_telefone.length === 1 && d.backup_sem_telefone[0].nome === 'Bruno', d.backup_sem_telefone)

  // Fora da janela o backup do dia continua VISÍVEL — o que depende da janela
  // é poder chamar, não poder ver.
  m = modelos({ escalas: ESCALA })
  r = await onCall(ctxBase(m, { query: { em: '2026-10-12T18:00:00Z' } }))
  ok('fora da janela ainda mostra quem é o backup de hoje',
    r.body.data.backup_do_dia.length === 1, r.body.data)

  // ══ chamar o backup ═══════════════════════════════════════════════════
  const CONV = { id: 'c1', remote_jid: '5519988887777@s.whatsapp.net', status: 'open', assigned_to_id: 'ana', contact_name: 'Cliente Teste', company_name: 'Empresa X' }

  m = modelos({ escalas: ESCALA, conv: { ...CONV } })
  r = await comRelogio(DENTRO, () => chamar(ctxBase(m, { params: { id: 'c1' } })))
  ok('o atendente chama o backup', r.status !== 403 && r.status !== 409, { status: r.status, body: r.body })
  ok('  a mensagem diz quem pediu e para qual cliente',
    m.guardado.enviadas[0] && m.guardado.enviadas[0].message.includes('Ana pede intervenção técnica')
      && m.guardado.enviadas[0].message.includes('Cliente Teste'), m.guardado.enviadas[0])
  ok('  e leva a empresa e o link', m.guardado.enviadas[0].message.includes('Empresa X')
      && m.guardado.enviadas[0].message.includes('/inbox?c=c1'), m.guardado.enviadas[0])
  ok('  foi para o backup, não para o plantonista',
    m.guardado.enviadas[0].number.startsWith('5519999990003'), m.guardado.enviadas[0].number)
  ok('  o evento aviso_backup registra quem pediu',
    m.guardado.eventos.some((e) => e.kind === 'aviso_backup' && String(e.payload).includes('"pediu":"ana"')),
    m.guardado.eventos)

  // FORA da janela: a rota RECUSA — esconder o botão não protege nada.
  m = modelos({ escalas: ESCALA, conv: { ...CONV } })
  r = await comRelogio(FORA, () => chamar(ctxBase(m, { params: { id: 'c1' } })))
  ok('fora da janela a ROTA recusa, não só a tela esconde',
    r.status === 409 && String(r.body.error).includes('janela de plantão'), r.body)
  ok('  e nada é enviado', m.guardado.enviadas.length === 0, m.guardado.enviadas)

  // Conversa sem atendente: backup é retaguarda de quem atende.
  m = modelos({ escalas: ESCALA, conv: { ...CONV, assigned_to_id: null } })
  r = await comRelogio(DENTRO, () => chamar(ctxBase(m, { params: { id: 'c1' } })))
  ok('conversa sem atendente é recusada', r.status === 409 && String(r.body.error).includes('não tem atendente'), r.body)

  // Quem não atende a conversa e não é chefe não pode chamar.
  m = modelos({ escalas: ESCALA, conv: { ...CONV } })
  r = await comRelogio(DENTRO, () => chamar(ctxBase(m, { params: { id: 'c1' }, user: { id: 'carlos' } })))
  ok('quem não atende a conversa não chama o backup', r.status === 403, r.body)

  // Admin pode, mesmo sem ser o dono.
  m = modelos({ escalas: ESCALA, conv: { ...CONV } })
  r = await comRelogio(DENTRO, () => chamar(ctxBase(m, { params: { id: 'c1' }, user: { id: 'chefe' } })))
  ok('admin pode chamar sem ser o dono da conversa', r.status !== 403, { status: r.status, body: r.body })

  // Sem sessão: 401.
  m = modelos({ escalas: ESCALA, conv: { ...CONV } })
  r = await comRelogio(DENTRO, () => chamar(ctxBase(m, { params: { id: 'c1' }, user: {} })))
  ok('sem sessão: 401', r.status === 401, r.body)

  // Dia sem backup, e backup sem telefone.
  m = modelos({ escalas: [{ id: 'p1', kind: 'plantao', date: '2026-10-12', agent_ids: ['ana'], backup_ids: [] }], conv: { ...CONV } })
  r = await comRelogio(DENTRO, () => chamar(ctxBase(m, { params: { id: 'c1' } })))
  ok('dia sem backup: recusa dizendo isso', r.status === 409 && String(r.body.error).includes('Não há backup'), r.body)

  m = modelos({ escalas: [{ id: 'p1', kind: 'plantao', date: '2026-10-12', agent_ids: ['ana'], backup_ids: ['bruno'] }], conv: { ...CONV } })
  r = await comRelogio(DENTRO, () => chamar(ctxBase(m, { params: { id: 'c1' } })))
  ok('backup sem telefone: recusa dizendo isso', r.status === 409 && String(r.body.error).includes('não tem telefone'), r.body)

  // Ordem: pula quem não tem telefone e chama o próximo.
  m = modelos({ escalas: [{ id: 'p1', kind: 'plantao', date: '2026-10-12', agent_ids: ['ana'], backup_ids: ['bruno', 'carlos'] }], conv: { ...CONV } })
  r = await comRelogio(DENTRO, () => chamar(ctxBase(m, { params: { id: 'c1' } })))
  ok('pula o backup sem telefone e chama o próximo',
    m.guardado.enviadas[0] && m.guardado.enviadas[0].number.startsWith('5519999990003'), m.guardado.enviadas)

  // Trava de 10 min contra clique duplo.
  m = modelos({ escalas: ESCALA, conv: { ...CONV, aviso_backup_em: new Date(DENTRO - 5 * 60000).toISOString() } })
  r = await comRelogio(DENTRO, () => chamar(ctxBase(m, { params: { id: 'c1' } })))
  ok('avisado há 5 min: recusa', r.status === 409 && String(r.body.error).includes('menos de 10 minutos'), r.body)
  ok('  e nada é enviado de novo', m.guardado.enviadas.length === 0, m.guardado.enviadas)

  m = modelos({ escalas: ESCALA, conv: { ...CONV, aviso_backup_em: new Date(DENTRO - 20 * 60000).toISOString() } })
  r = await comRelogio(DENTRO, () => chamar(ctxBase(m, { params: { id: 'c1' } })))
  ok('passados 10 min, pode chamar de novo', r.status !== 409, { status: r.status, body: r.body })

  // Conversa que não existe.
  m = modelos({ escalas: ESCALA, conv: null })
  r = await comRelogio(DENTRO, () => chamar(ctxBase(m, { params: { id: 'nao-existe' } })))
  ok('conversa inexistente: 404', r.status === 404, r.body)

  fim()
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(1) })
