// Etiquetas e atraso real — Entrega 6 do Fluxo v2.
// Roda com: node etiqueta-e-atraso.test.js
const { carregarContexto, ok, fim } = require('./_carregar.js')

const ctxMotor = carregarContexto('485 whatsapp POST /whatsapp/inbound')
const _triagem = ctxMotor._triagem

function cenario({ grafo, tags = [], ligacoes = [], conv = {} }) {
  const enviadas = []
  const conversa = Object.assign(
    { id: 'c1', remote_jid: '5519999990000@s.whatsapp.net', status: 'open', phase: 'novo', contact_name: 'Ana' },
    conv,
  )
  const estado = { tags: tags.map((t) => ({ ...t })), ligacoes: ligacoes.map((l) => ({ ...l })), apagadas: [] }
  const ctx = {
    models: {
      WhatsAppConversation: {
        findById: async () => conversa,
        update: async (id, p) => Object.assign(conversa, p),
        findMany: async () => [conversa],
      },
      WhatsAppMessage: { findMany: async () => [], create: async () => ({}) },
      SystemSettings: { findMany: async () => [{ waMenuEnabled: true }] },
      WaFlows: { findMany: async () => [{ id: 'f1', enabled: true, priority: 0, published: grafo }] },
      WaConversationEvents: { findMany: async () => [], create: async () => ({}) },
      SupportSchedule: { findMany: async () => [] },
      Profile: { findMany: async () => [], findById: async () => null },
      WaTag: {
        findMany: async () => estado.tags,
        create: async (t) => { estado.tags.push(t); return t },
      },
      WaConversationTag: {
        findMany: async (arg) => {
          const chaves = Object.keys(arg || {})
          if (!chaves.length) return estado.ligacoes
          return estado.ligacoes.filter((l) => chaves.every((k) => String(l[k] ?? '') === String(arg[k])))
        },
        create: async (l) => { estado.ligacoes.push(l); return l },
        delete: async (id) => {
          estado.apagadas.push(id)
          estado.ligacoes = estado.ligacoes.filter((l) => l.id !== id)
        },
      },
    },
    secrets: { get: async () => 'token-de-teste' },
    fetch: async (url, o) => { enviadas.push(JSON.parse(o.body).message); return { status: 200, body: '{}' } },
  }
  return { ctx, conversa, enviadas, estado }
}

const grafoEtiqueta = (dados) => ({
  root: 'etq',
  nodes: [
    { id: 'etq', type: 'tag', data: dados },
    { id: 'fim', type: 'content', data: { text: 'pronto' } },
  ],
  edges: [{ source: 'etq', target: 'fim', sourceHandle: 'next' }],
})

const nomesDasTags = (e) => e.ligacoes.map((l) => (e.tags.find((t) => t.id === l.tag_id) || {}).name)

;(async () => {
  // ── aplicar etiqueta ─────────────────────────────────────────────────────
  let c = cenario({
    grafo: grafoEtiqueta({ tagsAplicar: ['urgente'] }),
    tags: [{ id: 't1', name: 'urgente' }],
  })
  await _triagem(c.ctx, c.conversa, 'oi')
  ok('aplica etiqueta existente', nomesDasTags(c.estado).includes('urgente'), c.estado.ligacoes)
  ok('  e segue o fluxo', c.enviadas.join(' ').includes('pronto'), c.enviadas)

  // Etiqueta que não existe no catálogo é CRIADA — exigir cadastrar antes faria
  // o card falhar em silêncio, que é o defeito que a entrega 6 ataca.
  c = cenario({ grafo: grafoEtiqueta({ tagsAplicar: ['fora-do-horario'] }), tags: [] })
  await _triagem(c.ctx, c.conversa, 'oi')
  ok('etiqueta nova é criada no catálogo',
    c.estado.tags.some((t) => t.name === 'fora-do-horario'), c.estado.tags)
  ok('  e marcada na conversa', nomesDasTags(c.estado).includes('fora-do-horario'), c.estado.ligacoes)

  // Nome com caixa diferente não duplica.
  c = cenario({ grafo: grafoEtiqueta({ tagsAplicar: ['URGENTE'] }), tags: [{ id: 't1', name: 'urgente' }] })
  await _triagem(c.ctx, c.conversa, 'oi')
  ok('nome em outra caixa não cria etiqueta duplicada', c.estado.tags.length === 1, c.estado.tags)

  // Marcar de novo não duplica a ligação.
  c = cenario({
    grafo: grafoEtiqueta({ tagsAplicar: ['urgente'] }),
    tags: [{ id: 't1', name: 'urgente' }],
    ligacoes: [{ id: 'l1', conversation_id: 'c1', tag_id: 't1' }],
  })
  await _triagem(c.ctx, c.conversa, 'oi')
  ok('marcar etiqueta que já está não duplica', c.estado.ligacoes.length === 1, c.estado.ligacoes)

  // ── remover etiqueta ─────────────────────────────────────────────────────
  c = cenario({
    grafo: grafoEtiqueta({ tagsRemover: ['urgente'] }),
    tags: [{ id: 't1', name: 'urgente' }],
    ligacoes: [{ id: 'l1', conversation_id: 'c1', tag_id: 't1' }],
  })
  await _triagem(c.ctx, c.conversa, 'oi')
  ok('remove etiqueta da conversa', c.estado.ligacoes.length === 0, c.estado.ligacoes)
  ok('  apagando a ligação, não a etiqueta', c.estado.tags.length === 1, c.estado.tags)

  // Remover o que não está marcado não faz nada e não estoura.
  c = cenario({ grafo: grafoEtiqueta({ tagsRemover: ['inexistente'] }), tags: [] })
  await _triagem(c.ctx, c.conversa, 'oi')
  ok('remover etiqueta que não existe não quebra o fluxo',
    c.enviadas.join(' ').includes('pronto'), c.enviadas)

  // Marcar e desmarcar no mesmo card.
  c = cenario({
    grafo: grafoEtiqueta({ tagsAplicar: ['atendido'], tagsRemover: ['aguardando'] }),
    tags: [{ id: 't1', name: 'aguardando' }],
    ligacoes: [{ id: 'l1', conversation_id: 'c1', tag_id: 't1' }],
  })
  await _triagem(c.ctx, c.conversa, 'oi')
  ok('marca e desmarca no mesmo card',
    nomesDasTags(c.estado).includes('atendido') && !nomesDasTags(c.estado).includes('aguardando'),
    nomesDasTags(c.estado))

  // Card de etiqueta não manda mensagem nenhuma por si.
  c = cenario({
    grafo: { root: 'etq', nodes: [{ id: 'etq', type: 'tag', data: { tagsAplicar: ['x'] } }], edges: [] },
    tags: [],
  })
  await _triagem(c.ctx, c.conversa, 'oi')
  ok('card de etiqueta não fala com o cliente', c.enviadas.length === 0, c.enviadas)

  // ── atraso real, com teto ────────────────────────────────────────────────
  const grafoAtraso = (segs) => ({
    root: 'd1',
    nodes: [
      { id: 'd1', type: 'delay', data: { seconds: segs } },
      { id: 'm', type: 'content', data: { text: 'depois do atraso' } },
    ],
    edges: [{ source: 'd1', target: 'm', sourceHandle: 'next' }],
  })

  let t0 = Date.now()
  c = cenario({ grafo: grafoAtraso(2) })
  await _triagem(c.ctx, c.conversa, 'oi')
  let gasto = Date.now() - t0
  ok('espera de verdade (2s pedidos)', gasto >= 1900 && gasto < 3500, gasto + 'ms')
  ok('  e continua o fluxo depois', c.enviadas.join(' ').includes('depois do atraso'), c.enviadas)

  // Teto por card: 3s. Pedir 600s não segura o webhook da Avisa por 10 min.
  t0 = Date.now()
  c = cenario({ grafo: grafoAtraso(600) })
  await _triagem(c.ctx, c.conversa, 'oi')
  gasto = Date.now() - t0
  ok('teto por card corta em 3s', gasto < 4500, gasto + 'ms')
  ok('  e o fluxo continua', c.enviadas.join(' ').includes('depois do atraso'), c.enviadas)

  // Teto somado: três cards de 3s não somam 9s.
  const tresAtrasos = {
    root: 'a',
    nodes: [
      { id: 'a', type: 'delay', data: { seconds: 3 } },
      { id: 'b', type: 'delay', data: { seconds: 3 } },
      { id: 'c', type: 'delay', data: { seconds: 3 } },
      { id: 'fim', type: 'content', data: { text: 'fim' } },
    ],
    edges: [
      { source: 'a', target: 'b', sourceHandle: 'next' },
      { source: 'b', target: 'c', sourceHandle: 'next' },
      { source: 'c', target: 'fim', sourceHandle: 'next' },
    ],
  }
  t0 = Date.now()
  c = cenario({ grafo: tresAtrasos })
  await _triagem(c.ctx, c.conversa, 'oi')
  gasto = Date.now() - t0
  ok('teto somado por mensagem corta em 6s', gasto < 7500, gasto + 'ms')
  ok('  e chega ao fim do fluxo', c.enviadas.join(' ').includes('fim'), c.enviadas)

  // Atraso zero ou negativo não espera.
  t0 = Date.now()
  c = cenario({ grafo: grafoAtraso(0) })
  await _triagem(c.ctx, c.conversa, 'oi')
  ok('atraso zero não espera', Date.now() - t0 < 800, Date.now() - t0 + 'ms')

  fim()
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(1) })
