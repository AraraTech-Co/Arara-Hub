/**
 * UserController — gestão de usuários (admin). Espelha admin-user.controller do
 * portal-suporte: requireAdmin, Zod, guard de escalonamento, e-mail único.
 */
import type { NextRequest } from "next/server"
import { BaseController } from "./base.controller"
import { userRepository } from "../repositories/user.repository"
import { prisma } from "@/lib/db"
import { rankOf } from "@/lib/auth/access-control"
import { AuthorizationError, ConflictError, NotFoundError, ValidationError } from "@/lib/errors"
import { createUserSchema, updateUserSchema, setPasswordSchema } from "@/lib/validation/user.schema"

class UserController extends BaseController {
  list() {
    return this.handleRequest(async () => {
      await this.requireAdmin()
      return userRepository.findMany()
    })
  }

  create(req: NextRequest) {
    return this.handleRequest(async () => {
      const actor = await this.requireAdmin()
      const data = await this.parseBody(req, createUserSchema)

      const targetRole = data.role ?? "vendedor"
      // ninguém cria alguém de nível igual/superior ao seu (defesa em profundidade)
      if (rankOf(targetRole) > rankOf(actor.role)) {
        throw new AuthorizationError("Não é possível criar usuário com nível superior ao seu")
      }

      if (await userRepository.findByEmail(data.email)) {
        throw new ConflictError("Este e-mail já está cadastrado")
      }
      return this.created(await userRepository.create(data))
    })
  }

  update(req: NextRequest, id: string) {
    return this.handleRequest(async () => {
      const actor = await this.requireAdmin()
      const data = await this.parseBody(req, updateUserSchema)

      const target = await userRepository.findById(id)
      if (!target) throw new NotFoundError("Usuário não encontrado")

      if (data.role && rankOf(data.role) > rankOf(actor.role)) {
        throw new AuthorizationError("Não é possível promover a um nível superior ao seu")
      }
      // e-mail único ao trocar
      if (data.email && data.email !== target.email) {
        if (await userRepository.findByEmail(data.email)) {
          throw new ConflictError("Este e-mail já está cadastrado")
        }
      }
      return userRepository.update(id, data)
    })
  }

  setPassword(req: NextRequest, id: string) {
    return this.handleRequest(async () => {
      await this.requireAdmin()
      const target = await userRepository.findById(id)
      if (!target) throw new NotFoundError("Usuário não encontrado")
      const { password } = await this.parseBody(req, setPasswordSchema)
      await userRepository.updatePassword(id, password)
      return this.ok({ success: true })
    })
  }

  remove(id: string) {
    return this.handleRequest(async () => {
      const actor = await this.requireAdmin()
      if (id === actor.id) throw new ValidationError("Você não pode excluir a própria conta")

      const target = await userRepository.findById(id)
      if (!target) throw new NotFoundError("Usuário não encontrado")

      // Bloqueia exclusão se houver registros de domínio; sugere desativar.
      const [clients, deals, activities, goals] = await Promise.all([
        prisma.client.count({ where: { ownerId: id } }),
        prisma.deal.count({ where: { ownerId: id } }),
        prisma.activity.count({ where: { ownerId: id } }),
        prisma.goal.count({ where: { userId: id } }),
      ])
      if (clients + deals + activities + goals > 0) {
        throw new ConflictError(
          "Usuário possui registros vinculados. Desative a conta em vez de excluir."
        )
      }
      await userRepository.delete(id)
      return this.noContent()
    })
  }
}

export const userController = new UserController()
