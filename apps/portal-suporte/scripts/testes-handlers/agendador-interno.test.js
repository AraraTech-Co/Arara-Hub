// Relógio interno da API — packages/api/src/apps/portal-suporte/agendador.ts
//
// O que este teste prova, e por quê:
//
// 1. A trava de reentrada. Dois ticks ao mesmo tempo avisariam o plantonista
//    duas vezes; o segundo tem de pular sem chamar o handler.
// 2. A trava LIBERA quando o tick quebra. Um `rodando = true` sem `finally`
//    congelaria o agendador para sempre depois do primeiro erro — e ninguém
//    perceberia, porque o sintoma é silêncio.
// 3. O tick manda o token do processo, que o caminho HTTP não tem.
//
// O relógio é falso em dois sentidos: o cron nunca agenda nada (o stub guarda
// o callback e o teste o dispara), e o fim do trabalho é decidido pelo teste
// (o handler devolve uma promessa que o teste resolve na hora que quiser).
// Assim a janela "tick 1 ainda rodando" existe de verdade, sem esperar.
//
// Roda com: node agendador-interno.test.js
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { registerHooks } = require('node:module')
const { ok, fim } = require('./_carregar.js')

// AGENDADOR_ALVO existe para apontar o teste a uma cópia mutada e conferir que
// ele REPROVA o agendador quebrado. Um teste que só sabe passar não prova nada.
const AGENDADOR = process.env.AGENDADOR_ALVO || path.resolve(
  __dirname, '../../../../packages/api/src/apps/portal-suporte/agendador.ts',
)

// ── Espião: estado compartilhado entre os stubs e o teste ───────────────────
const espiao = {
  cron: null,       // como o CronJob foi construído
  tick: null,       // o callback que o cron chamaria a cada minuto
  paradas: 0,       // quantas vezes job.stop() foi chamado
  hooks: {},        // hooks que o agendador registrou no Fastify
  rotas: [],
  logs: { info: [], warn: [], error: [] },
  chamadas: [],     // um registro por chamada ao handler da varredura
}
globalThis.__espiaoAgendador = espiao

// ── Stubs dos imports, servidos sem tocar no disco ──────────────────────────
// O agendador é importado DE VERDADE; só as dependências são substituídas.
// Reescrever o fonte por regex já me custou caro antes.
const STUBS = {
  cron: `
    export class CronJob {
      constructor(expressao, callback, onComplete, iniciar, fuso) {
        const e = globalThis.__espiaoAgendador
        e.cron = { expressao, fuso, iniciar, temOnComplete: onComplete !== null && onComplete !== undefined }
        e.tick = callback
      }
      stop() { globalThis.__espiaoAgendador.paradas++ }
    }`,
  '../../lib/static-registry.js': `
    export function getAppRoutes() { return globalThis.__espiaoAgendador.rotas }`,
  '../../lib/models.js': `
    export async function buildModelsApi() { return { marcador: 'models' } }`,
  '../../lib/app-slugs.js': `
    export function resolveStorageSlug(slug) { return slug }`,
  '../../lib/build-handler-ctx.js': `
    // O de verdade preenche headers, params, query, body e models — e nada que
    // se pareça com \`agendadorInterno\`. Este stub tem a mesma superfície.
    export async function buildHandlerCtx(entrada) { return { ...entrada } }`,
}

registerHooks({
  resolve(especificador, contexto, proximo) {
    if (Object.prototype.hasOwnProperty.call(STUBS, especificador)) {
      return { url: 'stub-agendador:' + especificador, shortCircuit: true }
    }
    return proximo(especificador, contexto)
  },
  load(url, contexto, proximo) {
    if (url.startsWith('stub-agendador:')) {
      return {
        format: 'module',
        source: STUBS[url.slice('stub-agendador:'.length)],
        shortCircuit: true,
      }
    }
    return proximo(url, contexto)
  },
})

function appFalso({ status = 'active' } = {}) {
  return {
    log: {
      info: (...a) => espiao.logs.info.push(a),
      warn: (...a) => espiao.logs.warn.push(a),
      error: (...a) => espiao.logs.error.push(a),
    },
    prisma: {
      app: {
        findUnique: async () => ({ id: 'app-1', slug: 'portal-suporte', name: 'Portal', status }),
      },
    },
    addHook: (nome, fn) => { espiao.hooks[nome] = fn },
  }
}

/**
 * Handler da varredura sob controle do teste: devolve uma promessa pendente e
 * entrega o `resolver`/`rejeitar` da chamada mais recente.
 */
function rotaControlada() {
  espiao.rotas = [{
    method: 'POST',
    path: '/whatsapp/plantao/varrer',
    handler: (ctx) => new Promise((resolver, rejeitar) => {
      espiao.chamadas.push({ ctx, resolver, rejeitar })
    }),
  }]
}

/** Deixa o microtask queue drenar — o tick é assíncrono. */
const respira = () => new Promise((r) => setImmediate(r))

async function rodar() {
  const { iniciarAgendadorPortalSuporte } = await import(pathToFileURL(AGENDADOR).href)

  // ── Como o relógio é montado ─────────────────────────────────────────────
  rotaControlada()
  const app = appFalso()
  iniciarAgendadorPortalSuporte(app)

  ok('o cron é de minuto em minuto', espiao.cron?.expressao === '* * * * *', espiao.cron)
  ok('  no fuso de São Paulo', espiao.cron?.fuso === 'America/Sao_Paulo', espiao.cron)
  ok('  e já começa ligado', espiao.cron?.iniciar === true, espiao.cron)
  ok('  nada rodou só por ligar', espiao.chamadas.length === 0, espiao.chamadas.length)
  ok('  o job é parado no onClose', typeof espiao.hooks.onClose === 'function', Object.keys(espiao.hooks))

  // ── A trava de reentrada ─────────────────────────────────────────────────
  const tick1 = espiao.tick()
  await respira()
  ok('o primeiro tick chama a varredura', espiao.chamadas.length === 1, espiao.chamadas.length)

  const tick2 = espiao.tick()   // enquanto o tick 1 NÃO terminou
  await respira()
  ok('o tick de cima não entra enquanto o anterior roda',
    espiao.chamadas.length === 1, espiao.chamadas.length)
  const avisou = espiao.logs.warn.some((a) => JSON.stringify(a).includes('pulando'))
  ok('  e deixa dito no log por que pulou', avisou, espiao.logs.warn)
  await tick2

  // ── O token, que o caminho HTTP não tem ──────────────────────────────────
  const ctx = espiao.chamadas[0].ctx
  ok('o tick manda o token do processo',
    typeof ctx.agendadorInterno === 'string'
      && ctx.agendadorInterno === globalThis.__araraAgendadorToken,
    typeof ctx.agendadorInterno)
  ok('  com 32 bytes em hexadecimal', /^[0-9a-f]{64}$/.test(ctx.agendadorInterno || ''),
    (ctx.agendadorInterno || '').length)
  ok('  e nada no corpo, query ou headers que explique a origem',
    JSON.stringify({ b: ctx.body, q: ctx.query, h: ctx.headers, p: ctx.params }) === '{"b":{},"q":{},"h":{},"p":{}}',
    { b: ctx.body, q: ctx.query, h: ctx.headers, p: ctx.params })

  // ── A trava libera quando o trabalho acaba ───────────────────────────────
  espiao.chamadas[0].resolver({ body: { data: { avisou: false, conversas: 0 } } })
  await tick1
  ok('tick vazio não escreve no log', espiao.logs.info.filter((a) => JSON.stringify(a).includes('varredura')).length === 0,
    espiao.logs.info)

  const tick3 = espiao.tick()
  await respira()
  ok('terminado o anterior, o tick seguinte entra', espiao.chamadas.length === 2, espiao.chamadas.length)
  espiao.chamadas[1].resolver({ body: { data: { avisou: true, conversas: 3 } } })
  await tick3
  ok('  e quando avisa, registra quantas conversas',
    espiao.logs.info.some((a) => JSON.stringify(a).includes('"conversas":3')), espiao.logs.info)

  // ── A trava libera MESMO quando o tick quebra ────────────────────────────
  // Sem o `finally`, o agendador morreria calado aqui.
  const tick4 = espiao.tick()
  await respira()
  ok('o tick que quebra é um tick de verdade', espiao.chamadas.length === 3, espiao.chamadas.length)
  espiao.chamadas[2].rejeitar(new Error('banco fora'))
  await tick4
  ok('o erro é registrado, não propagado',
    espiao.logs.error.some((a) => JSON.stringify(a).includes('falhou')), espiao.logs.error)

  const tick5 = espiao.tick()
  await respira()
  ok('depois do erro o relógio continua andando', espiao.chamadas.length === 4, espiao.chamadas.length)
  espiao.chamadas[3].resolver({ body: { data: { avisou: false } } })
  await tick5

  // ── App desligado: não varre, e a trava não fica presa ───────────────────
  const antes = espiao.chamadas.length
  const appParado = appFalso({ status: 'inactive' })
  espiao.tick = null
  iniciarAgendadorPortalSuporte(appParado)
  await espiao.tick()
  ok('app inativo não é varrido', espiao.chamadas.length === antes, espiao.chamadas.length)

  // Mesmo tick, agora com o app ativo de novo: se o `return` de cima tivesse
  // deixado `rodando` em true, este tick pularia.
  espiao.tick = null
  iniciarAgendadorPortalSuporte(appFalso())
  const tick6 = espiao.tick()
  await respira()
  ok('  e a trava não ficou presa pelo caminho do return',
    espiao.chamadas.length === antes + 1, espiao.chamadas.length)
  espiao.chamadas[espiao.chamadas.length - 1].resolver({ body: { data: {} } })
  await tick6

  // ── Rota ausente: fala, em vez de ficar quieto ───────────────────────────
  espiao.rotas = []
  espiao.tick = null
  iniciarAgendadorPortalSuporte(appFalso())
  await espiao.tick()
  ok('rota de varredura ausente vira erro no log',
    espiao.logs.error.some((a) => JSON.stringify(a).includes('registry')), espiao.logs.error)

  // ── onClose para o relógio ───────────────────────────────────────────────
  await espiao.hooks.onClose()
  ok('fechar a API para o relógio', espiao.paradas > 0, espiao.paradas)

  fim()
}

rodar().catch((err) => { console.error(err); process.exit(1) })
