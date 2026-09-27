import type { NextRequest } from "next/server"
import type { Prisma } from "@prisma/client"
import { BaseController } from "./base.controller"
import { leadRepository } from "../repositories/lead.repository"
import { ConflictError } from "@/lib/errors"

class LeadController extends BaseController {
  /** Lista o pool (qualquer autenticado). */
  list(req: NextRequest) {
    return this.handleRequest(async () => {
      await this.requireAuth()
      const q = new URL(req.url).searchParams.get("q")
      const where: Prisma.ClientWhereInput = q
        ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { company: { contains: q, mode: "insensitive" } }] }
        : {}
      return leadRepository.findPool(where)
    })
  }

  /** Vendedor pega um lead do pool para si. */
  claim(id: string) {
    return this.handleRequest(async () => {
      const actor = await this.requireAuth()
      const ok = await leadRepository.claim(id, actor.id)
      if (!ok) throw new ConflictError("Este lead já foi pego por outro vendedor.")
      return this.ok({ success: true })
    })
  }
}

export const leadController = new LeadController()
