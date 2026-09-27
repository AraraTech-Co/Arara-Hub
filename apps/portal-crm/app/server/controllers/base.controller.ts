/**
 * BaseController — infra comum das rotas em camadas (padrão portal-suporte).
 * Fluxo: route.ts fino → controller.method(req) → repository → Prisma.
 * Responsável por: autorização (requireX), validação Zod (parseBody),
 * tradução de erros de domínio em HTTP (handleRequest) e helpers de resposta.
 */
import { NextResponse, type NextRequest } from "next/server"
import type { z } from "zod"
import { auth } from "@/auth"
import { verify, type Actor } from "@/lib/auth/verify"
import {
  AppError,
  AuthenticationError,
  AuthorizationError,
  ValidationError,
} from "@/lib/errors"

export abstract class BaseController {
  /** Envolve o handler: erros de domínio viram JSON+status; inesperados viram 500 logado. */
  protected async handleRequest<T>(fn: () => Promise<T>): Promise<NextResponse> {
    try {
      const result = await fn()
      if (result instanceof NextResponse) return result
      return NextResponse.json(result)
    } catch (err) {
      if (err instanceof AppError) {
        return NextResponse.json({ error: err.message }, { status: err.status })
      }
      console.error("[controller] erro inesperado:", err)
      return NextResponse.json({ error: "Erro interno" }, { status: 500 })
    }
  }

  /** Ator autenticado ou 401. */
  protected async requireAuth(): Promise<NonNullable<Actor>> {
    const session = await auth()
    if (!session?.user) throw new AuthenticationError()
    return { id: session.user.id, role: session.user.role, teamId: session.user.teamId }
  }

  /** Ator com nível mínimo (hierarquia inclusiva) ou 403. */
  protected async requireRole(minLevel: string): Promise<NonNullable<Actor>> {
    const actor = await this.requireAuth()
    if (!verify(minLevel, actor)) throw new AuthorizationError()
    return actor
  }

  protected requireAdmin() {
    return this.requireRole("admin")
  }

  /** Valida o corpo com um schema Zod; concatena mensagens em ValidationError (400). */
  protected async parseBody<S extends z.ZodType>(req: NextRequest, schema: S): Promise<z.infer<S>> {
    let raw: unknown
    try {
      raw = await req.json()
    } catch {
      throw new ValidationError("Corpo da requisição inválido (JSON esperado)")
    }
    const parsed = schema.safeParse(raw)
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join("; ")
      throw new ValidationError(msg || "Dados inválidos")
    }
    return parsed.data
  }

  // ── Helpers de resposta ──
  protected ok<T>(data: T) {
    return NextResponse.json(data)
  }
  protected created<T>(data: T) {
    return NextResponse.json(data, { status: 201 })
  }
  protected noContent() {
    return new NextResponse(null, { status: 204 })
  }
}
