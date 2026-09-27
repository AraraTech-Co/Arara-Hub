import type { NextRequest } from "next/server"
import { BaseController } from "./base.controller"
import { activityRepository } from "../repositories/activity.repository"
import { AuthorizationError, NotFoundError } from "@/lib/errors"
import { createActivitySchema, completeActivitySchema } from "@/lib/validation/domain.schema"

class ActivityController extends BaseController {
  list(req: NextRequest) {
    return this.handleRequest(async () => {
      const actor = await this.requireAuth()
      const status = new URL(req.url).searchParams.get("status")
      return activityRepository.findByOwner(actor.id, status)
    })
  }

  create(req: NextRequest) {
    return this.handleRequest(async () => {
      const actor = await this.requireAuth()
      const data = await this.parseBody(req, createActivitySchema)
      return this.created(await activityRepository.create(data, actor.id))
    })
  }

  complete(req: NextRequest, id: string) {
    return this.handleRequest(async () => {
      const actor = await this.requireAuth()
      const activity = await activityRepository.findOwnership(id)
      if (!activity) throw new NotFoundError("Atividade não encontrada")
      if (activity.ownerId !== actor.id && actor.role !== "admin") throw new AuthorizationError()

      const { notes } = await this.parseBody(req, completeActivitySchema)
      return activityRepository.complete(id, notes)
    })
  }
}

export const activityController = new ActivityController()
