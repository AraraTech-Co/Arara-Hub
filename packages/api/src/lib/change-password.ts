import type { PrismaClient } from '@prisma/client'
import { hashPassword, hashRefreshToken, verifyPassword } from './crypto.js'

/**
 * Troca da senha de UM usuário, por ele mesmo.
 *
 * É uma operação inteira, e não uma função de "conferir senha" solta: um handler
 * que pudesse perguntar "esta senha confere?" para qualquer usuário viraria um
 * oráculo de senha. Aqui conferir, limitar tentativas, gravar e encerrar o resto
 * andam juntos, e a única resposta de "errou" é a que conta como tentativa.
 *
 * QUEM CHAMA passa o `userId` do PRÓPRIO usuário autenticado (JWT ou sessão do
 * portal), nunca um valor vindo do corpo da requisição.
 *
 * LIMITE DE TENTATIVAS: 5 senhas atuais erradas em 15 minutos, por usuário. O
 * contador vive na memória do processo (não há tabela para ele); reiniciar o
 * processo o zera. Com o limite atingido, nem a senha certa é aceita até a
 * janela esvaziar.
 *
 * O QUE ENCERRA: os tokens de renovação do usuário, menos o que o chamador
 * disse ser o dele (`manterRefreshToken`). Tokens de acesso (JWT) já emitidos
 * seguem valendo até expirar: são sem estado e não há como revogá-los daqui.
 */
export const SENHA_MIN = 8
/** O bcrypt só usa os primeiros 72 bytes; acima disso a senha seria truncada em silêncio. */
export const SENHA_MAX_BYTES = 72
export const LIMITE_ERROS = 5
export const JANELA_MS = 15 * 60 * 1000

export type ResultadoTroca =
  | { ok: true; refreshTokensEncerrados: number }
  | {
      ok: false
      codigo: 'invalida' | 'igual' | 'limite' | 'senha_atual' | 'nao_encontrado'
      esperaSegundos?: number
    }

const erros = new Map<string, number[]>()

function errosRecentes(userId: string, agora: number): number[] {
  const lista = (erros.get(userId) ?? []).filter((t) => agora - t < JANELA_MS)
  if (lista.length) erros.set(userId, lista)
  else erros.delete(userId)
  return lista
}

/** Para os testes. */
export function limparErrosDeTroca(): void {
  erros.clear()
}

export async function changeOwnPassword(
  prisma: PrismaClient,
  input: { userId: string; current: string; next: string; manterRefreshToken?: string },
  agora: () => number = Date.now,
): Promise<ResultadoTroca> {
  const { userId, current, next } = input
  if (typeof userId !== 'string' || !userId.trim()) return { ok: false, codigo: 'nao_encontrado' }
  if (
    typeof next !== 'string' ||
    next.length < SENHA_MIN ||
    Buffer.byteLength(next, 'utf8') > SENHA_MAX_BYTES
  ) {
    return { ok: false, codigo: 'invalida' }
  }
  if (typeof current !== 'string' || !current) return { ok: false, codigo: 'senha_atual' }
  if (next === current) return { ok: false, codigo: 'igual' }

  const t = agora()
  const recentes = errosRecentes(userId, t)
  if (recentes.length >= LIMITE_ERROS) {
    const esperaSegundos = Math.max(1, Math.ceil((recentes[0] + JANELA_MS - t) / 1000))
    return { ok: false, codigo: 'limite', esperaSegundos }
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, passwordHash: true },
  })
  if (!user) return { ok: false, codigo: 'nao_encontrado' }

  if (!(await verifyPassword(current, user.passwordHash))) {
    erros.set(userId, [...recentes, t])
    return { ok: false, codigo: 'senha_atual' }
  }
  erros.delete(userId)

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(next) },
  })

  const manter = input.manterRefreshToken ? hashRefreshToken(input.manterRefreshToken) : null
  const encerrados = await prisma.refreshToken.updateMany({
    where: {
      userId,
      revokedAt: null,
      ...(manter ? { tokenHash: { not: manter } } : {}),
    },
    data: { revokedAt: new Date(t) },
  })
  return { ok: true, refreshTokensEncerrados: encerrados.count }
}
