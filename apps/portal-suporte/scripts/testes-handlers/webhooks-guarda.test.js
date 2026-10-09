// Webhooks: quem não é admin não administra, e os stubs do model de conversa
// não respondem mais. Roda com: node webhooks-guarda.test.js
const { carregarHandler, reply, ok, fim } = require('./_carregar.js')

const ADMIN = [
  ['GET /webhooks', 'webhooks GET /webhooks (', {}],
  ['GET /webhooks/:id', 'webhooks GET /webhooks/:id (', { id: 'w1' }],
  ['GET /webhooks/:id/deliveries', 'webhooks GET /webhooks/:id/deliveries', { id: 'w1' }],
  ['POST /webhooks', 'webhooks POST /webhooks (', {}],
  ['PUT /webhooks/:id', 'webhooks PUT /webhooks/:id', { id: 'w1' }],
  ['DELETE /webhooks/:id', 'webhooks DELETE /webhooks/:id', { id: 'w1' }],
]

function ctxDe({ papel, params = {}, apagados = [] }) {
  const webhooks = [{ id: 'w1', url: 'https://exemplo.test/hook' }]
  return {
    params,
    query: {},
    body: { url: 'https://exemplo.test/novo' },
    headers: {},
    user: papel ? { id: 'u1' } : {},
    models: {
      Sessao: { findById: async () => null },
      Profile: { findById: async () => (papel ? { id: 'u1', role: papel } : null) },
      Webhook: {
        findById: async (id) => webhooks.find((w) => w.id === id) || null,
        findMany: async () => webhooks,
        create: async (r) => { webhooks.push(r); return r },
        update: async (id, p) => p,
        delete: async (id) => { apagados.push(id) },
      },
      WebhookDelivery: { findMany: async () => [] },
      WhatsAppConversation: {
        findMany: async () => [{ id: 'c1', contact_name: 'Cliente', remote_jid: '5519999998888@s.whatsapp.net' }],
        create: async (r) => r,
      },
    },
    reply: reply(),
  }
}

;(async () => {
  for (const [nome, marca, params] of ADMIN) {
    const handler = carregarHandler(marca)
    if (!handler) continue

    let r = await handler(ctxDe({ papel: null, params }))
    ok(`${nome}: sem sessão → 401`, r.status === 401, r)

    r = await handler(ctxDe({ papel: 'support', params }))
    ok(`${nome}: support → 403`, r.status === 403, r)

    r = await handler(ctxDe({ papel: 'developer', params }))
    ok(`${nome}: developer → 403`, r.status === 403, r)

    r = await handler(ctxDe({ papel: 'admin', params }))
    ok(`${nome}: admin passa`, r.status !== 401 && r.status !== 403, r)
  }

  // A recusa não pode escrever: DELETE de quem não é admin não apaga nada.
  const del = carregarHandler('webhooks DELETE /webhooks/:id')
  const apagados = []
  await del(ctxDe({ papel: 'support', params: { id: 'w1' }, apagados }))
  ok('DELETE recusado não apaga o webhook', apagados.length === 0, apagados)
  await del(ctxDe({ papel: 'admin', params: { id: 'w1' }, apagados }))
  ok('DELETE de admin apaga', apagados.length === 1, apagados)

  // Os dois stubs do model de conversa saíram do ar.
  for (const [nome, marca] of [
    ['GET /webhooks/whatsapp', 'webhooks GET /webhooks/whatsapp'],
    ['POST /webhooks/whatsapp', 'webhooks POST /webhooks/whatsapp'],
  ]) {
    const h = carregarHandler(marca)
    const r = await h(ctxDe({ papel: 'admin' }))
    ok(`${nome}: 410, desativada`, r.status === 410, r)
    ok(`  ${nome}: não devolve conversa nenhuma`,
      !JSON.stringify(r.body).includes('5519999998888'), r.body)
  }

  // Anexo de chamado: conteúdo de cliente, não se entrega por id a qualquer
  // credencial de app.
  const blob = carregarHandler('attachments GET /attachments/:id/blob')
  const ctxAnexo = (papel) => ({
    params: { id: 'a1' },
    query: {},
    headers: {},
    user: papel ? { id: 'u1' } : {},
    models: {
      Sessao: { findById: async () => null },
      Profile: { findById: async () => (papel ? { id: 'u1', role: papel } : null) },
      Attachment: {
        findById: async () => ({ id: 'a1', file_url: 'data:text/plain;base64,c2VncmVkbw==' }),
      },
    },
    reply: Object.assign(reply(), { header() { return this } }),
  })

  let r = await blob(ctxAnexo(null))
  ok('anexo: sem sessão → 401', r.status === 401, r)
  ok('  e nada do conteúdo vaza', !JSON.stringify(r.body || '').includes('c2VncmVkbw'), r.body)

  r = await blob(ctxAnexo('user'))
  ok('anexo: cliente (user) → 403', r.status === 403, r)

  r = await blob(ctxAnexo('support'))
  ok('anexo: quem atende passa', r.status !== 401 && r.status !== 403, r.status)

  fim()
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(1) })
