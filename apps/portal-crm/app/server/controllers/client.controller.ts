import type { NextRequest } from "next/server"
import type { Prisma } from "@prisma/client"
import { BaseController } from "./base.controller"
import { clientRepository } from "../repositories/client.repository"
import { ownerScope, canAccessOwned } from "@/lib/auth/scope"
import { AuthorizationError, NotFoundError } from "@/lib/errors"
import { createClientSchema, updateClientSchema } from "@/lib/validation/domain.schema"

class ClientController extends BaseController {
  list(req: NextRequest) {
    return this.handleRequest(async () => {
      const actor = await this.requireAuth()
      const { searchParams } = new URL(req.url)
      const q = searchParams.get("q")
      const tipo = searchParams.get("tipo")

      const where: Prisma.ClientWhereInput = {
        ...ownerScope(actor),
        ...(actor.role === "admin" ? { ownerId: { not: null } } : {}), // exclui o pool
        ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { company: { contains: q, mode: "insensitive" } }] } : {}),
        ...(tipo === "lead" || tipo === "cliente" ? { type: tipo } : {}),
      }
      return clientRepository.findMany(where)
    })
  }

  create(req: NextRequest) {
    return this.handleRequest(async () => {
      const actor = await this.requireAuth()
      const data = await this.parseBody(req, createClientSchema)
      return this.created(await clientRepository.create(data, actor.id))
    })
  }

  private async assertAccess(actor: NonNullable<Awaited<ReturnType<ClientController["requireAuth"]>>>, id: string) {
    const c = await clientRepository.findOwnership(id)
    if (!c) throw new NotFoundError("Cliente não encontrado")
    if (!canAccessOwned(actor, { ownerId: c.ownerId, ownerTeamId: c.owner?.teamId ?? null })) {
      throw new AuthorizationError()
    }
  }

  get(id: string) {
    return this.handleRequest(async () => {
      const actor = await this.requireAuth()
      await this.assertAccess(actor, id)
      const client = await clientRepository.findDetail(id)
      if (!client) throw new NotFoundError("Cliente não encontrado")
      return client
    })
  }

  update(req: NextRequest, id: string) {
    return this.handleRequest(async () => {
      const actor = await this.requireAuth()
      await this.assertAccess(actor, id)
      const data = await this.parseBody(req, updateClientSchema)
      return clientRepository.update(id, data)
    })
  }
}

export const clientController = new ClientController()
