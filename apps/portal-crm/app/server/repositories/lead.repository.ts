import { prisma } from "@/lib/db"
import type { Prisma } from "@prisma/client"

/** Repositório do pool de prospecção — leads sem dono (ownerId null). */
export const leadRepository = {
  findPool(where: Prisma.ClientWhereInput) {
    return prisma.client.findMany({
      where: { ...where, ownerId: null },
      orderBy: { createdAt: "desc" },
      take: 500,
      select: {
        id: true, name: true, company: true, email: true, phone: true,
        type: true, tags: true, source: true, createdAt: true,
      },
    })
  },

  countPool() {
    return prisma.client.count({ where: { ownerId: null } })
  },

  /**
   * Pega o lead para o usuário — atômico: só atribui se ainda estiver sem dono.
   * Retorna false se outro vendedor já pegou (race).
   */
  async claim(id: string, userId: string): Promise<boolean> {
    const res = await prisma.client.updateMany({
      where: { id, ownerId: null },
      data: { ownerId: userId },
    })
    return res.count > 0
  },
}
