import { prisma } from "@/lib/db"
import type { Prisma } from "@prisma/client"
import type { CreateDealInput } from "@/lib/validation/domain.schema"

export const dealRepository = {
  findOpen(where: Prisma.DealWhereInput) {
    return prisma.deal.findMany({
      where: { ...where, status: "open" },
      orderBy: { createdAt: "desc" },
      take: 300,
      include: { client: { select: { name: true } }, stage: true, owner: { select: { name: true } } },
    })
  },

  findOwnership(id: string) {
    return prisma.deal.findUnique({
      where: { id },
      select: { ownerId: true, owner: { select: { teamId: true } }, stageHistory: true, clientId: true },
    })
  },

  findDetail(id: string) {
    return prisma.deal.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, name: true, company: true } },
        stage: true,
        owner: { select: { name: true, teamId: true } },
        activities: {
          orderBy: { scheduledAt: "desc" },
          take: 20,
          select: { id: true, type: true, scheduledAt: true, doneAt: true, notes: true },
        },
      },
    })
  },

  create(data: CreateDealInput, ownerId: string) {
    return prisma.deal.create({
      data: {
        title: data.title,
        clientId: data.clientId,
        stageId: data.stageId,
        ownerId,
        value: data.value != null && data.value !== "" ? Number(data.value) : null,
        expectedClose: data.expectedClose ? new Date(data.expectedClose) : null,
      },
    })
  },

  stageExists(stageId: string) {
    return prisma.stage.findUnique({ where: { id: stageId }, select: { id: true } })
  },

  moveStage(id: string, stageId: string, history: unknown[]) {
    return prisma.deal.update({ where: { id }, data: { stageId, stageHistory: history as Prisma.InputJsonValue } })
  },

  updateStatus(id: string, data: { status?: string; closedAt?: string | null }) {
    return prisma.deal.update({
      where: { id },
      data: {
        ...(data.status ? { status: data.status as "open" | "won" | "lost" } : {}),
        ...(data.closedAt ? { closedAt: new Date(data.closedAt) } : {}),
      },
    })
  },

  /** Promove o cliente a "cliente" ao ganhar o deal (clientId já conhecido). */
  markClientAsCliente(clientId: string) {
    return prisma.client.update({ where: { id: clientId }, data: { type: "cliente" } })
  },
}
