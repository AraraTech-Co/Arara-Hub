import { prisma } from "@/lib/db"
import type { Prisma } from "@prisma/client"
import type { CreateClientInput, UpdateClientInput } from "@/lib/validation/domain.schema"

const normalizeType = (t?: string) => (t === "cliente" ? "cliente" : "lead")

export const clientRepository = {
  findMany(where: Prisma.ClientWhereInput) {
    return prisma.client.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { id: true, name: true, company: true, email: true, phone: true, type: true, tags: true, createdAt: true },
    })
  },

  findOwnership(id: string) {
    return prisma.client.findUnique({
      where: { id },
      select: { ownerId: true, owner: { select: { teamId: true } } },
    })
  },

  findDetail(id: string) {
    return prisma.client.findUnique({
      where: { id },
      include: {
        deals: { include: { stage: true }, orderBy: { createdAt: "desc" } },
        activities: { orderBy: { scheduledAt: "desc" }, take: 10 },
      },
    })
  },

  create(data: CreateClientInput, ownerId: string) {
    return prisma.client.create({
      data: {
        name: data.name,
        company: data.company || null,
        email: data.email || null,
        phone: data.phone || null,
        type: normalizeType(data.type),
        notes: data.notes || null,
        tags: data.tags ?? [],
        ownerId,
      },
    })
  },

  update(id: string, data: UpdateClientInput) {
    return prisma.client.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.company !== undefined ? { company: data.company || null } : {}),
        ...(data.email !== undefined ? { email: data.email || null } : {}),
        ...(data.phone !== undefined ? { phone: data.phone || null } : {}),
        ...(data.type !== undefined ? { type: normalizeType(data.type) } : {}),
        ...(data.notes !== undefined ? { notes: data.notes || null } : {}),
        ...(data.tags !== undefined ? { tags: data.tags ?? [] } : {}),
      },
    })
  },
}
