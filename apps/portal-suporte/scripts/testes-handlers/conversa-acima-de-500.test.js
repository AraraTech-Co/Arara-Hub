// A conversa inteira, acima de 500 mensagens — Fase 1, A4.
//
// O critério de aceite fala em 600 mensagens gerando 600 linhas. Com uma
// consulta só isso era impossível: a consulta filtrada também tem teto de 500.
// Roda com: node conversa-acima-de-500.test.js
const { carregarHandler, reply, ok, fim } = require('./_carregar.js')
const { camadaFindMany } = require('./_camada.js')

const handler = carregarHandler('434 whatsapp GET /whatsapp/:id/messages')
const TETO = 500

/** Conversa com `n` mensagens, alternando quem mandou. */
function conversaCom(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: 'm' + i,
    conversation_id: 'c1',
    from_me: i % 2 === 0,
    body: 'mensagem ' + i,
    timestamp: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
  }))
}

function ctxCom(todas, { ignoraOffset = false } = {}) {
  const conversa = { id: 'c1', remote_jid: '5519999990000@s.whatsapp.net', created_at: '2026-01-01T00:00:00Z' }
  return {
    params: { id: 'c1' }, query: {}, body: {}, headers: {},
    user: { id: 'u1' },
    models: {
      WhatsAppMessage: {
        // A camada de verdade, emulada em _camada.js (mais recentes primeiro,
        // filtro antes do teto, `offset`/`limit`). `ignoraOffset` simula uma
        // plataforma que não honrasse o `offset`: a rota não pode inventar
        // mensagens nem dizer que está completa.
        findMany: async (arg) => camadaFindMany(todas, ignoraOffset ? { ...arg, offset: 0 } : arg),
      },
      WhatsAppConversation: { findById: async () => conversa, findMany: async () => [conversa] },
      Profile: { findMany: async () => [], findById: async () => ({ id: 'u1', role: 'admin' }) },
      Sessao: { findById: async () => null },
      WaConversationEvents: { findMany: async () => [], create: async () => ({}) },
    },
    reply: reply(),
  }
}

const corpo = (r) => (r.body && r.body.data) || r.body
const quantas = (r) => {
  const d = corpo(r)
  if (Array.isArray(d)) return d.length
  if (d && Array.isArray(d.messages)) return d.messages.length
  return 0
}
const hist = (r) => {
  const d = corpo(r)
  return (d && (d.historico || d.hist)) || (r.body && r.body.historico) || null
}

;(async () => {
  // ── conversa pequena: uma consulta basta ─────────────────────────────────
  let r = await handler(ctxCom(conversaCom(12)))
  ok('conversa de 12 mensagens vem inteira', quantas(r) === 12, quantas(r))
  ok('  e o histórico não acusa truncamento', hist(r) && hist(r).truncado === false, hist(r))

  // ── exatamente no teto ──────────────────────────────────────────────────
  r = await handler(ctxCom(conversaCom(500)))
  ok('conversa de 500 vem inteira', quantas(r) === 500, quantas(r))

  // ── o caso do critério de aceite: 600 mensagens ─────────────────────────
  r = await handler(ctxCom(conversaCom(600)))
  ok('conversa de 600 mensagens vem INTEIRA (era 500)', quantas(r) === 600, quantas(r))
  ok('  e a via diz que precisou de mais de uma página', hist(r) && hist(r).via === 'filtro+paginas', hist(r))
  ok('  sem acusar truncamento, porque coube', hist(r) && hist(r).truncado === false, hist(r))

  // ── 900: ainda cabe nas duas metades ────────────────────────────────────
  r = await handler(ctxCom(conversaCom(900)))
  ok('conversa de 900 vem inteira', quantas(r) === 900, quantas(r))

  // ── acima de ~1000: vem o que dá, e DIZ que faltou ──────────────────────
  r = await handler(ctxCom(conversaCom(1400)))
  ok('conversa de 1400 traz as 1000 que cabem', quantas(r) === 1000, quantas(r))
  ok('  e ACUSA que truncou', hist(r) && hist(r).truncado === true, hist(r))

  // ── exatamente 1000: cabe, mas não dá para saber se há mais ─────────────
  r = await handler(ctxCom(conversaCom(1000)))
  ok('conversa de exatamente 1000 vem inteira', quantas(r) === 1000, quantas(r))
  ok('  e ACUSA que pode faltar (a última página veio cheia)', hist(r) && hist(r).truncado === true, hist(r))

  // ── a plataforma ignorar o offset não pode piorar nada nem mentir ───────
  r = await handler(ctxCom(conversaCom(600), { ignoraOffset: true }))
  ok('sem honrar o offset, volta a 500 (sem inventar nem duplicar)', quantas(r) === 500, quantas(r))
  ok('  e ACUSA que pode faltar, em vez de dizer que está completa', hist(r) && hist(r).truncado === true, hist(r))

  // ── sem duplicar: a união é por id ──────────────────────────────────────
  const r600 = await handler(ctxCom(conversaCom(600)))
  const d = corpo(r600)
  const lista = Array.isArray(d) ? d : d.messages
  const ids = lista.map((m) => m.id)
  ok('nenhuma mensagem duplicada ao unir as partes', ids.length === new Set(ids).size,
    ids.length - new Set(ids).size)

  // ── e continua em ordem cronológica ─────────────────────────────────────
  const tempos = lista.map((m) => String(m.timestamp || m.created_at || ''))
  const ordenado = tempos.every((t, i) => i === 0 || tempos[i - 1] <= t)
  ok('a conversa sai em ordem cronológica', ordenado, tempos.slice(0, 3))

  fim()
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(1) })
