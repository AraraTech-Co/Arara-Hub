import { prisma } from "@/lib/db"
import type { CreateStageInput } from "@/lib/validation/domain.schema"

export const stageRepository = {
  findActive() {
    return prisma.stage.findMany({ where: { active: true }, orderBy: { order: "asc" } })
  },

  create(data: CreateStageInput) {
    return prisma.stage.create({
      data: { name: data.name, color: data.color ?? "#6366f1", order: data.order ?? 99 },
    })
  },
}
