// =============================================================================
// Relógio do portal de suporte — dentro do processo da API.
//
// Por que existe: a fila de plantão precisa ser varrida quando a janela abre,
// e não quando alguém escreve. Até aqui a varredura só acontecia no primeiro
// inbound do turno — se ninguém escrevesse entre 18h e 19h, o plantonista só
// era avisado às 19h.
//
// Por que DENTRO do processo, e não cron na VPS (sugestão do Hefler): sem
// agendador externo, sem porta nova, sem segredo em arquivo e sem uma segunda
// coisa para alguém lembrar de manter no ar. O preço está dito no fim deste
// comentário.
//
// Como chama o handler: o mesmo caminho que a rota HTTP monta — resolve o app,
// monta os models, pega a rota no registry — mas chama `route.handler(ctx)`
// direto. Não passa pela rede, então não há porta, não há autenticação de
// borda para contornar, e nada disso aparece de fora.
//
// ⚠️ UM CONTAINER SÓ. Hoje a API roda num container único (deploy/api.compose.yml),
// e por isso uma trava em memória basta. Se um dia houver mais de uma réplica,
// cada uma vai disparar o seu tick e o plantonista pode receber avisos
// repetidos: aí isto precisa de trava compartilhada (uma linha no banco com
// "quem está rodando e desde quando"). O anti-spam de 30 min por conversa
// reduz o estrago, mas não substitui a trava.
// =============================================================================

import crypto from 'node:crypto'
import { CronJob } from 'cron'
import type { FastifyInstance } from 'fastify'
import { buildHandlerCtx } from '../../lib/build-handler-ctx.js'
import { buildModelsApi } from '../../lib/models.js'
import { getAppRoutes } from '../../lib/static-registry.js'
import { resolveStorageSlug } from '../../lib/app-slugs.js'

const SLUG = 'portal-suporte'
const ROTA_VARRER = '/whatsapp/plantao/varrer'

/**
 * Token que prova que a chamada veio daqui de dentro.
 *
 * Fica em `globalThis` como propriedade não enumerável e não gravável: os
 * handlers são compilados com `new Function` e rodam nos globais do Node, então
 * enxergam este valor — e nada mais precisa carregá-lo.
 *
 * Não vai para variável de ambiente (que vaza para processo filho e aparece em
 * dump) nem para arquivo. Vive e morre com o processo.
 */
function tokenDoProcesso(): string {
  const g = globalThis as Record<string, unknown>
  if (typeof g.__araraAgendadorToken === 'string') return g.__araraAgendadorToken
  const token = crypto.randomBytes(32).toString('hex')
  Object.defineProperty(globalThis, '__araraAgendadorToken', {
    value: token,
    enumerable: false,
    writable: false,
    configurable: false,
  })
  return token
}

/** Um tick de cada vez. Ver a nota sobre réplicas no topo. */
let rodando = false

export function iniciarAgendadorPortalSuporte(app: FastifyInstance): void {
  const token = tokenDoProcesso()

  const job = new CronJob(
    '* * * * *',
    async () => {
      // Tick anterior ainda rodando: pula. Varredura lenta não pode empilhar —
      // duas varreduras ao mesmo tempo avisariam o plantonista duas vezes.
      if (rodando) {
        app.log.warn('[agendador] tick anterior ainda rodando; pulando')
        return
      }
      rodando = true
      try {
        const storageSlug = resolveStorageSlug(SLUG)
        const found = await app.prisma.app.findUnique({ where: { slug: storageSlug } })
        if (!found || found.status !== 'active') return

        const rota = getAppRoutes(SLUG).find(
          (r) => r.method.toUpperCase() === 'POST' && r.path === ROTA_VARRER,
        )
        if (!rota) {
          app.log.error('[agendador] rota de varredura não encontrada no registry')
          return
        }

        const models = await buildModelsApi(app.prisma, found.id, storageSlug)
        const ctx = await buildHandlerCtx({
          method: 'POST',
          params: {},
          query: {},
          body: {},
          rawBody: null,
          headers: {},
          user: { type: 'agendador', appSlug: SLUG },
          app: { id: found.id, slug: SLUG, name: found.name },
          models,
          prisma: app.prisma,
        })

        // O campo que prova a origem. O caminho HTTP NUNCA o monta:
        // `buildHandlerCtx` preenche headers, params, query e body, e nada
        // mais. Um atacante pode mandar o header que quiser; não há como
        // preencher isto de fora.
        ;(ctx as Record<string, unknown>).agendadorInterno = token

        const resultado = await rota.handler(ctx)
        const corpo = (resultado as { body?: { data?: { avisou?: boolean; conversas?: number } } })?.body
        const dados = corpo?.data
        // Silêncio no tick vazio: um log por minuto, 1440 por dia, esconderia
        // justamente a linha que importa.
        if (dados?.avisou) {
          app.log.info(
            { conversas: dados.conversas ?? 0 },
            '[agendador] plantonista avisado pela varredura da fila',
          )
        }
      } catch (err) {
        app.log.error({ err }, '[agendador] falhou')
      } finally {
        rodando = false
      }
    },
    null,
    true,
    'America/Sao_Paulo',
  )

  app.addHook('onClose', async () => { job.stop() })
  app.log.info('[agendador] relógio do portal de suporte ligado (a cada minuto)')
}
