/**
 * UserRepository — acesso a dados de usuários. Escrita DUPLA User+Profile em
 * transação (mesmo id), espelhando o portal-suporte. Senha com bcrypt cost 12.
 */
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/db"
import type { CreateUserInput, UpdateUserInput } from "@/lib/validation/user.schema"

const BCRYPT_COST = 12

const listSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
  createdAt: true,
  team: { select: { id: true, name: true } },
  profile: { select: { position: true, phone: true, avatarUrl: true } },
} as const

export const userRepository = {
  findMany() {
    return prisma.user.findMany({ orderBy: { name: "asc" }, select: listSelect })
  },

  findById(id: string) {
    return prisma.user.findUnique({ where: { id }, select: listSelect })
  },

  findByEmail(email: string) {
    return prisma.user.findUnique({ where: { email }, select: { id: true } })
  },

  /** Cria User + Profile na mesma transação. */
  async create(data: CreateUserInput) {
    const passwordHash = await bcrypt.hash(data.password, BCRYPT_COST)
    return prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: data.name,
          email: data.email,
          passwordHash,
          role: data.role ?? "vendedor",
          teamId: data.teamId ?? null,
        },
        select: listSelect,
      })
      await tx.profile.create({
        data: {
          id: user.id,
          fullName: data.name,
          position: data.position ?? null,
          phone: data.phone ?? null,
        },
      })
      return user
    })
  },

  /** Atualiza User e o Profile associado (upsert defensivo) na mesma transação. */
  async update(id: string, data: UpdateUserInput) {
    return prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.email !== undefined ? { email: data.email } : {}),
          ...(data.role !== undefined ? { role: data.role } : {}),
          ...(data.active !== undefined ? { active: data.active } : {}),
          ...(data.teamId !== undefined ? { teamId: data.teamId } : {}),
        },
        select: listSelect,
      })
      const profileData = {
        ...(data.name !== undefined ? { fullName: data.name } : {}),
        ...(data.position !== undefined ? { position: data.position } : {}),
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
      }
      await tx.profile.upsert({
        where: { id },
        create: { id, fullName: data.name ?? user.name, position: data.position ?? null, phone: data.phone ?? null },
        update: profileData,
      })
      return user
    })
  },

  async updatePassword(id: string, password: string) {
    const passwordHash = await bcrypt.hash(password, BCRYPT_COST)
    await prisma.user.update({ where: { id }, data: { passwordHash } })
  },

  async delete(id: string) {
    // Profile cai por cascade (onDelete: Cascade)
    await prisma.user.delete({ where: { id } })
  },
}
