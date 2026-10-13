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
  const controlado = (path) => ({
    method: 'POST',
    path,
    handler: (ctx) => new Promise((resolver, rejeitar) => {
      espiao.chamadas.push({ path, ctx, resolver, rejeitar })
    }),
  })
  // O tick tem DUAS tarefas: a varredura do plantão e a de "sem resposta",
  // que entra pelo webhook porque o motor do fluxo vive lá.
  espiao.rotas = [controlado('/whatsapp/plantao/varrer'), controlado('/whatsapp/inbound')]
}

/** Resolve todas as chamadas pendentes, para o tick terminar. */
function resolverTudo(valor = { body: { data: {} } }) {
  for (const c of espiao.chamadas) if (!c.pronto) { c.pronto = true; c.resolver(valor) }
}

/** Quantas vezes CADA rota foi chamada — contar o total esconde qual tarefa rodou. */
const vezes = (path) => espiao.chamadas.filter((c) => c.path === path).length
const VARRER = '/whatsapp/plantao/varrer'
const INBOUND = '/whatsapp/inbound'

/** A chamada pendente mais recente (a que o tick está esperando). */
const pendente = () => espiao.chamadas.filter((c) => !c.pronto).pop()
function responder(valor = { body: { data: {} } }) {
  const c = pendente()
  if (!c) throw new Error('nada pendente para responder')
  c.pronto = true
  c.resolver(valor)
  return c
}
function quebrar(erro) {
  const c = pendente()
  if (!c) throw new Error('nada pendente para quebrar')
  c.pronto = true
  c.rejeitar(erro)
  return c
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
  ok('o primeiro tick chama a varredura do plantão', vezes(VARRER) === 1, espiao.chamadas.map((c) => c.path))
  ok('  e ainda não a tarefa do fluxo (uma espera a outra)', vezes(INBOUND) === 0, vezes(INBOUND))

  const tick2 = espiao.tick()   // enquanto o tick 1 NÃO terminou
  await respira()
  ok('o tick de cima não entra enquanto o anterior roda',
    espiao.chamadas.length === 1, espiao.chamadas.map((c) => c.path))
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

  // ── As DUAS tarefas do tick ──────────────────────────────────────────────
  responder({ body: { data: { avisou: false, conversas: 0 } } })   // plantão
  await respira()
  ok('terminada a do plantão, o tick chama a do fluxo', vezes(INBOUND) === 1, espiao.chamadas.map((c) => c.path))
  const ctxFluxo = espiao.chamadas.find((c) => c.path === INBOUND).ctx
  ok('  com a tarefa dita no corpo, e só ela',
    JSON.stringify(ctxFluxo.body) === '{"__tarefa":"sem-resposta"}', ctxFluxo.body)
  ok('  e com a mesma prova de origem',
    ctxFluxo.agendadorInterno === globalThis.__araraAgendadorToken, typeof ctxFluxo.agendadorInterno)
  responder({ body: { data: { seguidas: 0 } } })
  await tick1
  ok('tick vazio não escreve no log',
    espiao.logs.info.filter((a) => /varredura|sem resposta/.test(JSON.stringify(a))).length === 0,
    espiao.logs.info)

  // ── A trava libera quando o trabalho acaba ───────────────────────────────
  const tick3 = espiao.tick()
  await respira()
  ok('terminado o anterior, o tick seguinte entra', vezes(VARRER) === 2, vezes(VARRER))
  responder({ body: { data: { avisou: true, conversas: 3 } } })
  await respira()
  ok('  e quando avisa, registra quantas conversas',
    espiao.logs.info.some((a) => JSON.stringify(a).includes('"conversas":3')), espiao.logs.info)
  responder({ body: { data: { seguidas: 2 } } })
  await tick3
  ok('  mensagem a CLIENTE por tempo sempre deixa rastro no log',
    espiao.logs.info.some((a) => JSON.stringify(a).includes('"seguidas":2')), espiao.logs.info)

  // ── Uma tarefa falhar não cancela a outra ───────────────────────────────
  const tick4 = espiao.tick()
  await respira()
  ok('o tick que quebra é um tick de verdade', vezes(VARRER) === 3, vezes(VARRER))
  quebrar(new Error('banco fora'))                       // a do plantão quebra
  await respira()
  ok('a do plantão falhou e a do fluxo rodou mesmo assim', vezes(INBOUND) === 3, vezes(INBOUND))
  ok('  com o erro da primeira registrado',
    espiao.logs.error.some((a) => JSON.stringify(a).includes('varredura do plantão falhou')), espiao.logs.error)
  quebrar(new Error('motor fora'))                       // e a do fluxo também
  await tick4
  ok('  e o erro da segunda também',
    // O JSON escapa as aspas do nome da tarefa, então a busca é pelas duas
    // partes e não pela frase literal.
    espiao.logs.error.some((a) => /sem-resposta.*falhou/.test(JSON.stringify(a))), espiao.logs.error)

  // ── A trava libera MESMO quando o tick quebra ────────────────────────────
  // Sem o `finally`, o agendador morreria calado aqui.
  const tick5 = espiao.tick()
  await respira()
  ok('depois dos erros o relógio continua andando', vezes(VARRER) === 4, vezes(VARRER))
  responder({ body: { data: { avisou: false } } })
  await respira()
  responder({ body: { data: {} } })
  await tick5

  // ── App desligado: não varre, e a trava não fica presa ───────────────────
  const antes = vezes(VARRER)
  const appParado = appFalso({ status: 'inactive' })
  espiao.tick = null
  iniciarAgendadorPortalSuporte(appParado)
  await espiao.tick()
  ok('app inativo não é varrido', vezes(VARRER) === antes, vezes(VARRER))

  // Mesmo tick, agora com o app ativo de novo: se o `return` de cima tivesse
  // deixado `rodando` em true, este tick pularia.
  espiao.tick = null
  iniciarAgendadorPortalSuporte(appFalso())
  const tick6 = espiao.tick()
  await respira()
  ok('  e a trava não ficou presa pelo caminho do return',
    vezes(VARRER) === antes + 1, vezes(VARRER))
  responder()
  await respira()
  responder()
  await tick6

  // ── Rota ausente: fala, em vez de ficar quieto ───────────────────────────
  espiao.rotas = []
  espiao.tick = null
  iniciarAgendadorPortalSuporte(appFalso())
  await espiao.tick()
  ok('rota ausente no registry vira erro no log',
    espiao.logs.error.some((a) => JSON.stringify(a).includes('registry')), espiao.logs.error)

  // ── onClose para o relógio ───────────────────────────────────────────────
  await espiao.hooks.onClose()
  ok('fechar a API para o relógio', espiao.paradas > 0, espiao.paradas)

  fim()
}

rodar().catch((err) => { console.error(err); process.exit(1) })
