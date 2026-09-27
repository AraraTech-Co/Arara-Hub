import type { NextRequest } from "next/server"
import { BaseController } from "./base.controller"
import { stageRepository } from "../repositories/stage.repository"
import { createStageSchema } from "@/lib/validation/domain.schema"

class StageController extends BaseController {
  list() {
    return this.handleRequest(async () => {
      await this.requireAuth()
      return stageRepository.findActive()
    })
  }

  create(req: NextRequest) {
    return this.handleRequest(async () => {
      await this.requireAdmin()
      const data = await this.parseBody(req, createStageSchema)
      return this.created(await stageRepository.create(data))
    })
  }
}

export const stageController = new StageController()
