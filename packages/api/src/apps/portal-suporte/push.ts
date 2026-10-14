// =============================================================================
// Web Push — o ENVIO (Fase 4).
//
// Por que aqui e não num handler: assinar VAPID (ECDSA P-256) e cifrar o
// payload (ECDH + HKDF + AES-GCM) vive na biblioteca `web-push`, que é
// `import`. Handlers são strings compiladas com `new Function` e NÃO têm
// require — foi o que quebrou o `require("crypto")` na rota de varredura. Então
// o handler ENFILEIRA (model PushNaFila) e este módulo, chamado pelo tick do
// relógio, ENVIA. Até 1 minuto de atraso, que é o que o critério da fase pede.
//
// A fila é limpa no mesmo tick: enviada ou descartada, a linha sai. Fila que só
// cresce seria a próxima tabela a bater no teto de 500 da plataforma.
// =============================================================================

import webpush from 'web-push'
import type { FastifyInstance } from 'fastify'

/** Mais velho que isto não é mais aviso, é ruído. */
const VALIDADE_MS = 24 * 60 * 60 * 1000

/** Por tick. A fila é lida por FILTRO (`status: "pendente"`), nunca varrida. */
const POR_TICK = 200

interface LinhaDaFila {
  id: string
  user_id?: string | null
  titulo?: string | null
  corpo?: string | null
  url?: string | null
  tipo?: string | null
  created_at?: string | null
}

interface Inscricao {
  id: string
  user_id?: string | null
  endpoint?: string | null
  p256dh?: string | null
  auth?: string | null
}

interface Modelos {
  PushNaFila?: {
    findMany: (f: Record<string, unknown>) => Promise<LinhaDaFila[]>
    delete?: (id: string) => Promise<unknown>
    update?: (id: string, p: Record<string, unknown>) => Promise<unknown>
  }
  PushInscricao?: {
    findMany: (f: Record<string, unknown>) => Promise<Inscricao[]>
    delete?: (id: string) => Promise<unknown>
  }
}

/**
 * Esvazia a fila de push. Devolve o que fez, para o tick registrar no log.
 *
 * `enviar` é injetável para o teste poder interceptar — nada sai de verdade nos
 * testes, nem para o push service nem para a Avisa.
 */
export async function enviarPushPendente(
  app: Pick<FastifyInstance, 'log'>,
  models: Modelos,
  segredos: { publica: string | null; privada: string | null },
  agoraMs: number = Date.now(),
  enviar: typeof webpush.sendNotification = webpush.sendNotification,
): Promise<{ enviadas: number; descartadas: number; inscricoesApagadas: number }> {
  const resultado = { enviadas: 0, descartadas: 0, inscricoesApagadas: 0 }
  const Fila = models.PushNaFila
  const Inscricoes = models.PushInscricao
  // Sem os models (schema não aplicado) ou sem chaves, o push está desligado e
  // o portal segue com o sino — que é o estado de hoje.
  if (!Fila || !Inscricoes) return resultado
  if (!segredos.publica || !segredos.privada) return resultado

  let pendentes: LinhaDaFila[] = []
  try {
    pendentes = (await Fila.findMany({ status: 'pendente' })) || []
  } catch {
    return resultado
  }
  if (!pendentes.length) return resultado

  webpush.setVapidDetails(
    // `mailto:` é exigido pela especificação como contato do remetente.
    'mailto:suporte@arara-tech.com',
    segredos.publica,
    segredos.privada,
  )

  /** Apaga a linha; se a plataforma não tiver delete, marca como enviada. */
  const sair = async (id: string) => {
    try {
      if (Fila.delete) { await Fila.delete(id); return }
      if (Fila.update) await Fila.update(id, { status: 'enviada' })
    } catch { /* a próxima passada tenta de novo */ }
  }

  // Uma consulta de inscrições por PESSOA, não uma por linha da fila: duas
  // mensagens para a mesma pessoa no mesmo tick é o caso comum.
  const porPessoa = new Map<string, Inscricao[]>()
  const inscricoesDe = async (userId: string) => {
    if (porPessoa.has(userId)) return porPessoa.get(userId) as Inscricao[]
    let lista: Inscricao[] = []
    try { lista = (await Inscricoes.findMany({ user_id: userId })) || [] } catch { lista = [] }
    porPessoa.set(userId, lista)
    return lista
  }

  for (const linha of pendentes.slice(0, POR_TICK)) {
    const quando = new Date(String(linha.created_at || '')).getTime()
    if (!linha.user_id || (Number.isFinite(quando) && agoraMs - quando > VALIDADE_MS)) {
      resultado.descartadas++
      await sair(linha.id)
      continue
    }

    const assinaturas = await inscricoesDe(String(linha.user_id))
    if (!assinaturas.length) {
      // Ninguém inscrito: não é erro, é gente que não ligou o aviso.
      resultado.descartadas++
      await sair(linha.id)
      continue
    }

    const carga = JSON.stringify({
      title: linha.titulo || 'Portal de Suporte',
      body: linha.corpo || '',
      url: linha.url || '/inbox',
      tipo: linha.tipo || null,
    })

    for (const a of assinaturas) {
      if (!a.endpoint || !a.p256dh || !a.auth) continue
      try {
        await enviar(
          { endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } },
          carga,
        )
        resultado.enviadas++
      } catch (err) {
        const status = Number((err as { statusCode?: number })?.statusCode || 0)
        // 410 Gone / 404: a inscrição morreu (navegador desinstalado, permissão
        // revogada). Apagar é o que impede a fila de bater sempre no mesmo
        // endpoint morto — a especificação do Web Push manda fazer isso.
        if (status === 410 || status === 404) {
          try {
            if (Inscricoes.delete) {
              await Inscricoes.delete(a.id)
              resultado.inscricoesApagadas++
              porPessoa.delete(String(linha.user_id))
            }
          } catch { /* tenta na próxima */ }
        } else {
          app.log.warn({ status }, '[push] envio recusado pelo push service')
        }
      }
    }
    await sair(linha.id)
  }

  return resultado
}
