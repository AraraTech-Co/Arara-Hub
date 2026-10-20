// RITMO DO AVISO AO PLANTÃO: o 1º aviso sai quando o prazo vence, depois até 3 lembretes, um a cada
// 5 minutos, no máximo 4 mensagens por conversa por janela de plantão.
//
// O TESTE CENTRAL: uma varredura com várias conversas em estágios diferentes de lembrete produz UMA
// mensagem, e o contador de cada conversa que entrou avança UMA vez. Sem isso o agrupamento se perde
// na primeira refatoração e ninguém percebe até a conta chegar (5 conversas x 4 mensagens = 20).
//
// O QUE SE GARANTE, na varredura (rota 490m) e na entrada (motor do 485) sobre o mesmo estado:
//   - a sequência no tempo: aviso aos 0 min, nada aos 3, lembretes aos 5, 10 e 15, nada depois (4 no total);
//   - a mistura (uma já na 3ª, uma nova, uma avisada há 2 min, uma no teto): uma mensagem, só com
//     as da vez, contadores certos e as que ficaram de fora intocadas;
//   - para de avisar quando um humano respondeu (`robo_pausado_ate` no futuro), e quando o dono já
//     respondeu; assumir SEM responder não para; grupo não entra;
//   - a janela que reabre zera o contador (no dia seguinte e no sábado de manhã).
// MUTAÇÕES: aplicadas uma vez cada, reprovadas por asserção.
//
// Nada sai para a Avisa: `ctx.fetch` é interceptado. Roda com: node ritmo-do-aviso.test.js
const { carregarHandlerEContexto, carregarContexto, reply, ok, fim } = require('./_carregar.js')

const HORARIO = {
  fuso: 'America/Sao_Paulo',
  plantao: { 1: [['18:00', '22:00']], 2: [['18:00', '22:00']], 3: [['18:00', '22:00']], 4: [['18:00', '22:00']], 5: [['18:00', '22:00']], 6: [['08:00', '22:00']], 0: [['08:00', '22:00']] },
}
const TOKEN = 'a'.repeat(64)
const PERFIS = [{ id: 'ana', full_name: 'Ana', phone: '5519999990001', role: 'support' }]
const MIN = 60000
const relogio = { t: 0 }
class DataFalsa extends Date {
  constructor(...a) { if (a.length) super(...a); else super(relogio.t) }
  static now() { return relogio.t }
}
const SEG_20H = new Date('2026-10-12T23:00:00Z').getTime()         // segunda 20:00 em São Paulo
const JANELA_SEG = String(new Date('2026-10-12T21:00:00Z').getTime())   // abertura às 18:00
const escalaDe = (data, dia) => [{ id: 'p-' + data, kind: 'plantao', date: data, agent_ids: ['ana'], backup_ids: [] }]

const { handler: varrer, contexto: ctxVarrer } = carregarHandlerEContexto('490m whatsapp POST /whatsapp/plantao/varrer')
Object.defineProperty(ctxVarrer, '__araraAgendadorToken', { value: TOKEN, enumerable: false, writable: false, configurable: true })
const ctxEntrada = carregarContexto('485 whatsapp POST /whatsapp/inbound')
ctxVarrer.Date = DataFalsa; ctxEntrada.Date = DataFalsa
const _triagem = ctxEntrada._triagem

function mundo(conversas, datas = ['2026-10-12', '2026-10-13', '2026-10-17']) {
  const estado = { conversas: conversas.map((c) => ({ ...c })), enviadas: [], eventos: [] }
  return {
    estado,
    models: {
      WhatsAppConversation: {
        findById: async (id) => estado.conversas.find((c) => c.id === id) || null,
        findMany: async (a) => { const ch = Object.keys(a || {}); return estado.conversas.filter((c) => ch.every((k) => String(c[k] ?? '') === String(a[k]))) },
        update: async (id, p) => { const c = estado.conversas.find((x) => x.id === id); if (c) Object.assign(c, p) },
      },
      WhatsAppMessage: { findMany: async () => [], create: async () => ({}) },
      SystemSettings: { findMany: async () => [{ id: 's1', waMenuEnabled: true, waHorario: JSON.stringify(HORARIO) }] },
      SupportSchedule: { findMany: async () => datas.map((d) => escalaDe(d)[0]) },
      Profile: { findMany: async () => PERFIS, findById: async (id) => PERFIS.find((p) => p.id === id) || null },
      WaConversationEvents: { findMany: async () => estado.eventos, create: async (e) => { estado.eventos.push(e); return e } },
      WaFlows: { findMany: async () => [{ id: 'f1', enabled: true, priority: 0, published: { root: 'at', nodes: [{ id: 'at', type: 'handoff', data: { text: 'Já avisamos a equipe.' } }], edges: [] } }] },
      Sessao: { findById: async () => null },
    },
    fetch: async (url, o) => { estado.enviadas.push(JSON.parse(o.body)); return { status: 200, body: '{}' } },
  }
}
const paraAna = (m) => m.estado.enviadas.filter((e) => String(e.number).startsWith('55199999900')).map((e) => e.message)
const espera = (id, extra = {}) => Object.assign({ id, remote_jid: '5519' + id + '@s.whatsapp.net', status: 'open', phase: 'novo', contact_name: 'Cliente ' + id, aguardando_desde: '2026-10-12T21:10:00Z' }, extra)
const ctxVarr = (m) => ({ params: {}, query: {}, body: {}, headers: {}, user: { type: 'agendador' }, agendadorInterno: TOKEN, models: m.models, secrets: { get: async () => 'tok' }, fetch: m.fetch, reply: reply() })
async function varrerEm(m, t) { relogio.t = t; return varrer(ctxVarr(m)) }
async function entrarEm(m, t, id) { relogio.t = t; await _triagem({ models: m.models, secrets: { get: async () => 'tok' }, fetch: m.fetch, body: {} }, m.estado.conversas.find((c) => c.id === id), 'oi') }
const ag = (m, id) => m.estado.conversas.find((c) => c.id === id)

async function bateria() {
  const falhas = []
  const t = (nome, cond, det) => { if (!cond) falhas.push(nome + (det !== undefined ? ' ' + JSON.stringify(det).slice(0, 260) : '')) }

  // ── a sequência no tempo ──
  { const m = mundo([espera('c1')]); const marcas = []
    for (const min of [0, 3, 5, 8, 10, 15, 20, 25]) { await varrerEm(m, SEG_20H + min * MIN); marcas.push([min, paraAna(m).length, ag(m, 'c1').aviso_plantao_n || 0]) }
    t('sequência: avisos aos 0, 5, 10 e 15 min e depois nada (4 no total)', JSON.stringify(marcas) === JSON.stringify([[0, 1, 1], [3, 1, 1], [5, 2, 2], [8, 2, 2], [10, 3, 3], [15, 4, 4], [20, 4, 4], [25, 4, 4]]), marcas) }

  // ── o teste central: estágios diferentes, UMA mensagem, cada contador avança uma vez ──
  const mistura = () => [
    espera('A', { aviso_plantao_n: 2, aviso_plantao_janela: JANELA_SEG, aviso_plantao_em: new Date(SEG_20H - 6 * MIN).toISOString(), aguardando_desde: '2026-10-12T21:05:00Z' }),
    espera('B', { aguardando_desde: '2026-10-12T21:20:00Z' }),
    espera('C', { aviso_plantao_n: 1, aviso_plantao_janela: JANELA_SEG, aviso_plantao_em: new Date(SEG_20H - 2 * MIN).toISOString() }),
    espera('D', { aviso_plantao_n: 4, aviso_plantao_janela: JANELA_SEG, aviso_plantao_em: new Date(SEG_20H - 40 * MIN).toISOString() }),
  ]
  async function checaMistura(nome, m) {
    const msgs = paraAna(m)
    t(`${nome}: UMA mensagem para o plantonista`, msgs.length === 1, msgs.length)
    t(`${nome}: lista só as da vez (A e B), não C nem D`, msgs.length === 1 && /2 conversas aguardam/.test(msgs[0]) && msgs[0].includes('Cliente A') && msgs[0].includes('Cliente B') && !msgs[0].includes('Cliente C') && !msgs[0].includes('Cliente D'), msgs[0])
    t(`${nome}: contadores: A 3, B 1 (uma vez cada)`, ag(m, 'A').aviso_plantao_n === 3 && ag(m, 'B').aviso_plantao_n === 1, [ag(m, 'A').aviso_plantao_n, ag(m, 'B').aviso_plantao_n])
    t(`${nome}: C e D ficam intocadas`, ag(m, 'C').aviso_plantao_n === 1 && ag(m, 'D').aviso_plantao_n === 4 && ag(m, 'D').aviso_plantao_em === new Date(SEG_20H - 40 * MIN).toISOString(), [ag(m, 'C').aviso_plantao_n, ag(m, 'D').aviso_plantao_n])
    t(`${nome}: as avisadas guardam a janela`, ag(m, 'A').aviso_plantao_janela === JANELA_SEG && ag(m, 'B').aviso_plantao_janela === JANELA_SEG, [ag(m, 'A').aviso_plantao_janela, ag(m, 'B').aviso_plantao_janela])
  }
  { const m = mundo(mistura()); await varrerEm(m, SEG_20H); await checaMistura('varredura', m) }
  { const m = mundo(mistura()); await entrarEm(m, SEG_20H, 'A'); await checaMistura('entrada', m) }
  { const m = mundo(mistura()); await varrerEm(m, SEG_20H); const r2 = await varrerEm(m, SEG_20H + 1 * MIN)
    t('duas varreduras no mesmo minuto não repetem (a segunda não envia)', paraAna(m).length === 1 && r2.body.data.avisou === false, paraAna(m).length) }

  // ── a entrada (motor do 485) respeita o ritmo e a pausa também para a conversa que disparou ──
  { const m = mundo([espera('D', { aviso_plantao_n: 4, aviso_plantao_janela: JANELA_SEG, aviso_plantao_em: new Date(SEG_20H - 40 * MIN).toISOString() })]); await entrarEm(m, SEG_20H, 'D')
    t('entrada: a conversa que disparou, no teto, não avisa', paraAna(m).length === 0, paraAna(m)) }
  { const m = mundo([espera('P', { robo_pausado_ate: new Date(SEG_20H + 30 * MIN).toISOString() })]); await entrarEm(m, SEG_20H, 'P')
    t('entrada: a conversa que disparou, com humano respondendo, não avisa', paraAna(m).length === 0, paraAna(m)) }
  { const m = mundo([espera('A'), espera('P', { robo_pausado_ate: new Date(SEG_20H + 30 * MIN).toISOString() })]); await entrarEm(m, SEG_20H, 'A')
    t('entrada: outra conversa com humano respondendo não entra na lista', paraAna(m).length === 1 && !paraAna(m)[0].includes('Cliente P') && paraAna(m)[0].includes('Cliente A'), paraAna(m)) }

  // ── quem já está sendo cuidada ──
  const futuro = new Date(SEG_20H + 30 * MIN).toISOString(), passado = new Date(SEG_20H - 30 * MIN).toISOString()
  { const m = mundo([espera('P', { robo_pausado_ate: futuro })]); await varrerEm(m, SEG_20H); t('humano respondeu (robo_pausado_ate no futuro): não avisa', paraAna(m).length === 0, paraAna(m)) }
  { const m = mundo([espera('P', { robo_pausado_ate: futuro, aviso_plantao_n: 1, aviso_plantao_janela: JANELA_SEG, aviso_plantao_em: new Date(SEG_20H - 10 * MIN).toISOString() })]); await varrerEm(m, SEG_20H); t('  nem o lembrete', paraAna(m).length === 0, paraAna(m)) }
  { const m = mundo([espera('P', { robo_pausado_ate: passado })]); await varrerEm(m, SEG_20H); t('pausa que já expirou não protege', paraAna(m).length === 1, paraAna(m)) }
  { const m = mundo([espera('O', { assigned_to_id: 'sup', first_response_at: passado })]); await varrerEm(m, SEG_20H); t('dono que já respondeu: não avisa', paraAna(m).length === 0, paraAna(m)) }
  { const m = mundo([espera('O', { assigned_to_id: 'sup' })]); await varrerEm(m, SEG_20H); t('assumir SEM responder não para: avisa', paraAna(m).length === 1, paraAna(m)) }
  { const m = mundo([espera('G', { is_group: true, remote_jid: '120363@g.us' })]); await varrerEm(m, SEG_20H); t('grupo não entra', paraAna(m).length === 0, paraAna(m)) }
  { const m = mundo([espera('L', { last_outbound_at: passado })]); await varrerEm(m, SEG_20H); t('last_outbound_at não é sinal de "cuidada" (inclui o robô)', paraAna(m).length === 1, paraAna(m)) }

  // ── a janela que reabre zera o contador ──
  { const m = mundo([espera('R', { aviso_plantao_n: 4, aviso_plantao_janela: JANELA_SEG, aviso_plantao_em: new Date(SEG_20H + 20 * MIN).toISOString() })])
    await varrerEm(m, SEG_20H + 60 * MIN); t('mesma janela, no teto: não avisa nem uma hora depois', paraAna(m).length === 0, paraAna(m))
    const TER_20H = SEG_20H + 24 * 60 * MIN
    await varrerEm(m, TER_20H); t('na janela do dia seguinte avisa de novo (contador recomeça em 1)', paraAna(m).length === 1 && ag(m, 'R').aviso_plantao_n === 1, [paraAna(m).length, ag(m, 'R').aviso_plantao_n]) }
  { const SAB_8H = new Date('2026-10-17T11:00:00Z').getTime()   // sábado 08:00 em São Paulo
    const m = mundo([espera('S', { aguardando_desde: '2026-10-16T22:00:00Z', aviso_plantao_n: 4, aviso_plantao_janela: String(new Date('2026-10-16T21:00:00Z').getTime()), aviso_plantao_em: '2026-10-16T23:00:00Z' })])
    await varrerEm(m, SAB_8H + 1 * MIN); t('sábado de manhã: quem esperou a noite é avisado na abertura', paraAna(m).length === 1 && ag(m, 'S').aviso_plantao_n === 1, [paraAna(m).length, ag(m, 'S').aviso_plantao_n]) }
  return falhas
}

;(async () => {
  const f = await bateria()
  ok('a bateria passa limpa', f.length === 0, f)
  fim()
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(1) })
