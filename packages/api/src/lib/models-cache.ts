import type { PrismaClient } from '@prisma/client'
import { buildModelsApi, type ModelApi } from './models.js'

/**
 * Os modelos de um app, guardados entre requisições.
 *
 * `buildModelsApi` lê todos os `ModelDef` do app e monta, para cada um, o
 * validador (`zodFromJsonSchema`) e a API de leitura e escrita. Nada disso
 * depende da requisição: só do app e do esquema dos modelos. Refazer a cada
 * requisição era custo fixo.
 *
 * O QUE É COMPARTILHADO: os objetos `ModelApi`, que não têm estado próprio (só
 * fecham sobre `prisma`, o app e o validador). O que NÃO é compartilhado: cada
 * requisição recebe uma CÓPIA RASA do mapa, para que um handler que atribua em
 * `ctx.models` não altere o das outras. A IDENTIDADE continua com vida de uma
 * requisição: `buildHandlerCtx` embrulha `Profile.findById` por requisição
 * (`comMemoDeIdentidade`) sobre este mapa; o cache guarda o modelo CRU, nunca o
 * embrulhado, então um perfil lido numa requisição não existe na seguinte.
 *
 * QUANDO O CACHE SOME, duas redes:
 *   1. INVALIDAÇÃO explícita (`invalidarModelsDoApp`) nos pontos que escrevem
 *      `ModelDef` neste processo (`modules/models/routes.ts`);
 *   2. TTL curto, para o que escreve de fora (scripts, outro processo) ou para
 *      quem esquecer de chamar a invalidação. `MODELS_CACHE_TTL_MS=0` desliga o
 *      cache (volta a montar a cada requisição).
 *
 * UMA CARGA EM VOO é compartilhada por quem chegar durante ela (sem avalanche).
 * Uma invalidação durante a carga a descarta: o resultado volta a quem pediu,
 * mas não é guardado, e quem chegar depois começa uma carga nova.
 *
 * Falha na carga não é guardada: a rejeição chega a quem pediu, como antes.
 */
const TTL_PADRAO_MS = 30_000

function ttlMs(): number {
  const bruto = process.env.MODELS_CACHE_TTL_MS
  if (bruto === undefined || bruto === '') return TTL_PADRAO_MS
  const n = Number(bruto)
  return Number.isFinite(n) && n >= 0 ? n : TTL_PADRAO_MS
}

type Entrada = { apis: Record<string, ModelApi>; ate: number }

const entradas = new Map<string, Entrada>()
const carregando = new Map<string, Promise<Record<string, ModelApi>>>()
const geracao = new Map<string, number>()

const chaveDe = (appId: string, appSlug: string) => `${appId}\u0000${appSlug}`

export async function modelsDoApp(
  prisma: PrismaClient,
  appId: string,
  appSlug: string,
  agora: () => number = Date.now,
): Promise<Record<string, ModelApi>> {
  const ttl = ttlMs()
  if (ttl === 0) return buildModelsApi(prisma, appId, appSlug)

  const chave = chaveDe(appId, appSlug)
  const guardada = entradas.get(chave)
  if (guardada && guardada.ate > agora()) return { ...guardada.apis }

  const emVoo = carregando.get(chave)
  if (emVoo) return { ...(await emVoo) }

  const geracaoDaCarga = geracao.get(appId) ?? 0
  const carga: Promise<Record<string, ModelApi>> = buildModelsApi(prisma, appId, appSlug)
    .then((apis) => {
      if ((geracao.get(appId) ?? 0) === geracaoDaCarga) {
        entradas.set(chave, { apis, ate: agora() + ttl })
      }
      return apis
    })
    .finally(() => {
      if (carregando.get(chave) === carga) carregando.delete(chave)
    })
  carregando.set(chave, carga)
  return { ...(await carga) }
}

/** Descarta o que há guardado do app e a carga em voo. Chamar DEPOIS da escrita concluir. */
export function invalidarModelsDoApp(appId: string): void {
  geracao.set(appId, (geracao.get(appId) ?? 0) + 1)
  const prefixo = `${appId}\u0000`
  for (const chave of [...entradas.keys()]) if (chave.startsWith(prefixo)) entradas.delete(chave)
  for (const chave of [...carregando.keys()]) if (chave.startsWith(prefixo)) carregando.delete(chave)
}

/** Para os testes. */
export function limparCacheDeModels(): void {
  entradas.clear()
  carregando.clear()
  geracao.clear()
}
