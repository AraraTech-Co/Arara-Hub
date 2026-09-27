import type { NextRequest } from "next/server"
import { BaseController } from "./base.controller"
import { dealRepository } from "../repositories/deal.repository"
import { ownerScope, canAccessOwned } from "@/lib/auth/scope"
import { AuthorizationError, NotFoundError, ValidationError } from "@/lib/errors"
import { createDealSchema, updateDealSchema, moveDealSchema } from "@/lib/validation/domain.schema"

class DealController extends BaseController {
  list() {
    return this.handleRequest(async () => {
      const actor = await this.requireAuth()
      return dealRepository.findOpen(ownerScope(actor))
    })
  }

  create(req: NextRequest) {
    return this.handleRequest(async () => {
      const actor = await this.requireAuth()
      const data = await this.parseBody(req, createDealSchema)
      return this.created(await dealRepository.create(data, actor.id))
    })
  }

  get(id: string) {
    return this.handleRequest(async () => {
      const actor = await this.requireAuth()
      const deal = await dealRepository.findDetail(id)
      if (!deal) throw new NotFoundError("Negociação não encontrada")
      if (!canAccessOwned(actor, { ownerId: deal.ownerId, ownerTeamId: deal.owner.teamId })) {
        throw new AuthorizationError()
      }
      return deal
    })
  }

  /** Muda a etapa (drag & drop). Vendedor dono, ou gerente/admin. */
  move(req: NextRequest, id: string) {
    return this.handleRequest(async () => {
      const actor = await this.requireAuth()
      const deal = await dealRepository.findOwnership(id)
      if (!deal) throw new NotFoundError("Negociação não encontrada")

      const allowed = actor.role === "admin" || actor.role === "gerente" || deal.ownerId === actor.id
      if (!allowed) throw new AuthorizationError()

      const { stageId } = await this.parseBody(req, moveDealSchema)
      if (!(await dealRepository.stageExists(stageId))) throw new ValidationError("Etapa inválida")

      const history = Array.isArray(deal.stageHistory) ? deal.stageHistory : []
      history.push({ stageId, movedAt: new Date().toISOString() })
      return dealRepository.moveStage(id, stageId, history)
    })
  }

  /** Atualiza status (ganho/perdido). Dono ou admin. Ao ganhar, vira cliente. */
  update(req: NextRequest, id: string) {
    return this.handleRequest(async () => {
      const actor = await this.requireAuth()
      const deal = await dealRepository.findOwnership(id)
      if (!deal) throw new NotFoundError("Negociação não encontrada")
      if (deal.ownerId !== actor.id && actor.role !== "admin") throw new AuthorizationError()

      const data = await this.parseBody(req, updateDealSchema)
      const updated = await dealRepository.updateStatus(id, data)
      // Ao ganhar, promove o cliente — reusa o clientId já lido em findOwnership.
      if (data.status === "won") await dealRepository.markClientAsCliente(deal.clientId)
      return updated
    })
  }
}

export const dealController = new DealController()
