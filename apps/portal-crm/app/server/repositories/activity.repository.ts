import { prisma } from "@/lib/db"
import type { CreateActivityInput } from "@/lib/validation/domain.schema"

export const activityRepository = {
  findByOwner(ownerId: string, status?: string | null) {
    return prisma.activity.findMany({
      where: {
        ownerId,
        ...(status === "pendente" ? { doneAt: null } : status === "concluida" ? { doneAt: { not: null } } : {}),
      },
      orderBy: { scheduledAt: "asc" },
      take: 300,
      include: { client: { select: { id: true, name: true } }, deal: { select: { id: true, title: true } } },
    })
  },

  findOwnership(id: string) {
    return prisma.activity.findUnique({ where: { id }, select: { ownerId: true } })
  },

  create(data: CreateActivityInput, ownerId: string) {
    return prisma.activity.create({
      data: {
        type: data.type,
        clientId: data.clientId || null,
        dealId: data.dealId || null,
        ownerId,
        scheduledAt: new Date(data.scheduledAt),
        notes: data.notes || null,
      },
    })
  },

  complete(id: string, notes?: string | null) {
    return prisma.activity.update({
      where: { id },
      data: { doneAt: new Date(), ...(notes != null ? { notes } : {}) },
    })
  },
}
