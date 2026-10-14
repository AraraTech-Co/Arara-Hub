// Fase 4 — o TICK que esvazia a fila de push.
//
// O envio é interceptado: nada sai para push service nenhum. O que se prova:
//  - envia para cada inscrição da pessoa;
//  - apaga a linha enviada (fila que só cresce vira a próxima tabela a bater
//    no teto de 500);
//  - 410/404 do push service APAGA a inscrição morta;
//  - linha com mais de 24 h é descartada sem enviar;
//  - sem chaves VAPID ou sem os models, não faz nada (o estado de hoje);
//  - lê a fila por FILTRO, nunca varrendo.
//
// Importa o push.ts de verdade — as dependências dele (`web-push`) são
// substituídas por hooks de resolução, não por reescrita do fonte.
// Roda com: node push-envio.test.js
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { registerHooks } = require('node:module')
const { ok, fim } = require('./_carregar.js')

const MODULO = path.resolve(
  __dirname, '../../../../packages/api/src/apps/portal-suporte/push.ts',
)

const espiao = { enviados: [], vapid: null }
globalThis.__espiaoPush = espiao

registerHooks({
  resolve(spec, ctx, next) {
    if (spec === 'web-push') return { url: 'stub-push:web-push', shortCircuit: true }
    if (spec === 'fastify') return { url: 'stub-push:fastify', shortCircuit: true }
    return next(spec, ctx)
  },
  load(url, ctx, next) {
    if (url === 'stub-push:web-push') {
      return {
        format: 'module',
        shortCircuit: true,
        source: `
          const webpush = {
            setVapidDetails(contato, pub, priv) {
              globalThis.__espiaoPush.vapid = { contato, pub, priv }
            },
            async sendNotification(assinatura, carga) {
              globalThis.__espiaoPush.enviados.push({ assinatura, carga })
              const erro = globalThis.__espiaoPush.erroPara?.(assinatura)
              if (erro) throw erro
              return { statusCode: 201 }
            },
          }
          export default webpush
        `,
      }
    }
    if (url === 'stub-push:fastify') {
      return { format: 'module', shortCircuit: true, source: 'export default {}' }
    }
    return next(url, ctx)
  },
})

const AGORA = new Date('2026-10-14T12:00:00Z').getTime()
const hAtras = (h) => new Date(AGORA - h * 3600000).toISOString()

function cenario({ fila = [], inscricoes = [], chaves = { publica: 'BPub', privada: 'priv' } } = {}) {
  const estado = {
    fila: [...fila],
    inscricoes: [...inscricoes],
    consultas: [],
    apagadasDaFila: [],
    inscricoesApagadas: [],
  }
  const models = {
    PushNaFila: {
      findMany: async (f) => {
        estado.consultas.push(f || {})
        const ch = Object.keys(f || {})
        if (!ch.length) return estado.fila
        return estado.fila.filter((x) => ch.every((k) => String(x[k] ?? '') === String(f[k])))
      },
      delete: async (id) => {
        estado.apagadasDaFila.push(id)
        estado.fila = estado.fila.filter((x) => x.id !== id)
      },
    },
    PushInscricao: {
      findMany: async (f) => {
        const ch = Object.keys(f || {})
        if (!ch.length) return estado.inscricoes
        return estado.inscricoes.filter((x) => ch.every((k) => String(x[k] ?? '') === String(f[k])))
      },
      delete: async (id) => {
        estado.inscricoesApagadas.push(id)
        estado.inscricoes = estado.inscricoes.filter((x) => x.id !== id)
      },
    },
  }
  return { estado, models, chaves }
}

const LOG = { log: { info: () => {}, warn: () => {}, error: () => {} } }

;(async () => {
  const { enviarPushPendente } = await import(pathToFileURL(MODULO).href)

  // ══ caminho normal ═════════════════════════════════════════════════════
  espiao.enviados.length = 0
  espiao.erroPara = null
  let c = cenario({
    fila: [{ id: 'f1', user_id: 'u1', titulo: 'Oi', corpo: 'texto', url: '/inbox?c=1', tipo: 'minha_conversa', status: 'pendente', created_at: hAtras(0.1) }],
    inscricoes: [
      { id: 'i1', user_id: 'u1', endpoint: 'https://push/1', p256dh: 'p1', auth: 'a1' },
      { id: 'i2', user_id: 'u1', endpoint: 'https://push/2', p256dh: 'p2', auth: 'a2' },
    ],
  })
  let r = await enviarPushPendente(LOG, c.models, c.chaves, AGORA)
  ok('envia para as DUAS inscrições da pessoa', r.enviadas === 2, r)
  ok('  com o VAPID configurado', espiao.vapid?.pub === 'BPub', espiao.vapid)
  ok('  e a carga leva título, corpo e url',
    JSON.parse(espiao.enviados[0].carga).url === '/inbox?c=1', espiao.enviados[0]?.carga)
  ok('apaga a linha enviada da fila', c.estado.apagadasDaFila.join(',') === 'f1'
    && c.estado.fila.length === 0, { apagadas: c.estado.apagadasDaFila, resta: c.estado.fila.length })
  ok('lê a fila por FILTRO (status pendente), nunca varrendo',
    c.estado.consultas.every((f) => Object.keys(f).length > 0), c.estado.consultas)

  // ══ 410: a inscrição morreu ════════════════════════════════════════════
  espiao.enviados.length = 0
  espiao.erroPara = (a) => (a.endpoint === 'https://push/morto'
    ? Object.assign(new Error('Gone'), { statusCode: 410 })
    : null)
  c = cenario({
    fila: [{ id: 'f1', user_id: 'u1', titulo: 'x', status: 'pendente', created_at: hAtras(0.1) }],
    inscricoes: [
      { id: 'morta', user_id: 'u1', endpoint: 'https://push/morto', p256dh: 'p', auth: 'a' },
      { id: 'viva', user_id: 'u1', endpoint: 'https://push/viva', p256dh: 'p', auth: 'a' },
    ],
  })
  r = await enviarPushPendente(LOG, c.models, c.chaves, AGORA)
  ok('410 do push service apaga a inscrição morta',
    c.estado.inscricoesApagadas.join(',') === 'morta', c.estado.inscricoesApagadas)
  ok('  e a viva continua recebendo', r.enviadas === 1, r)
  ok('  e a linha sai da fila de todo jeito', c.estado.fila.length === 0, c.estado.fila.length)

  // 404 também (alguns push services usam 404 para endpoint sumido)
  espiao.erroPara = () => Object.assign(new Error('Not Found'), { statusCode: 404 })
  c = cenario({
    fila: [{ id: 'f1', user_id: 'u1', titulo: 'x', status: 'pendente', created_at: hAtras(0.1) }],
    inscricoes: [{ id: 'i1', user_id: 'u1', endpoint: 'https://push/1', p256dh: 'p', auth: 'a' }],
  })
  await enviarPushPendente(LOG, c.models, c.chaves, AGORA)
  ok('404 também apaga', c.estado.inscricoesApagadas.join(',') === 'i1', c.estado.inscricoesApagadas)

  // Erro que NÃO é 410/404 não apaga: pode ser queda momentânea do serviço.
  espiao.erroPara = () => Object.assign(new Error('Service Unavailable'), { statusCode: 503 })
  c = cenario({
    fila: [{ id: 'f1', user_id: 'u1', titulo: 'x', status: 'pendente', created_at: hAtras(0.1) }],
    inscricoes: [{ id: 'i1', user_id: 'u1', endpoint: 'https://push/1', p256dh: 'p', auth: 'a' }],
  })
  await enviarPushPendente(LOG, c.models, c.chaves, AGORA)
  ok('503 NÃO apaga a inscrição (pode ser queda momentânea)',
    c.estado.inscricoesApagadas.length === 0, c.estado.inscricoesApagadas)

  // ══ velha demais ═══════════════════════════════════════════════════════
  espiao.enviados.length = 0
  espiao.erroPara = null
  c = cenario({
    fila: [
      { id: 'velha', user_id: 'u1', titulo: 'de ontem', status: 'pendente', created_at: hAtras(25) },
      { id: 'nova', user_id: 'u1', titulo: 'de agora', status: 'pendente', created_at: hAtras(0.5) },
    ],
    inscricoes: [{ id: 'i1', user_id: 'u1', endpoint: 'https://push/1', p256dh: 'p', auth: 'a' }],
  })
  r = await enviarPushPendente(LOG, c.models, c.chaves, AGORA)
  ok('linha com mais de 24 h é DESCARTADA sem enviar',
    r.enviadas === 1 && r.descartadas === 1, r)
  ok('  e a descartada sai da fila também', c.estado.fila.length === 0, c.estado.fila.length)
  ok('  tendo enviado só a nova',
    JSON.parse(espiao.enviados[0].carga).title === 'de agora', espiao.enviados[0]?.carga)

  // ══ sem inscrição: descarta, não acumula ═══════════════════════════════
  c = cenario({
    fila: [{ id: 'f1', user_id: 'u-sem-aparelho', titulo: 'x', status: 'pendente', created_at: hAtras(0.1) }],
    inscricoes: [],
  })
  r = await enviarPushPendente(LOG, c.models, c.chaves, AGORA)
  ok('sem inscrição da pessoa: descarta em vez de acumular',
    r.enviadas === 0 && r.descartadas === 1 && c.estado.fila.length === 0, r)

  // ══ desligado: o estado de HOJE ════════════════════════════════════════
  espiao.enviados.length = 0
  c = cenario({
    fila: [{ id: 'f1', user_id: 'u1', titulo: 'x', status: 'pendente', created_at: hAtras(0.1) }],
    inscricoes: [{ id: 'i1', user_id: 'u1', endpoint: 'https://push/1', p256dh: 'p', auth: 'a' }],
    chaves: { publica: null, privada: null },
  })
  r = await enviarPushPendente(LOG, c.models, c.chaves, AGORA)
  ok('sem chaves VAPID: não envia e não toca na fila',
    r.enviadas === 0 && espiao.enviados.length === 0 && c.estado.fila.length === 1, r)

  r = await enviarPushPendente(LOG, {}, { publica: 'B', privada: 'p' }, AGORA)
  ok('sem os models (schema não aplicado): não faz nada', r.enviadas === 0, r)

  fim()
})()
