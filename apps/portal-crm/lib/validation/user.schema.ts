import { z } from "zod"

export const ROLES = ["user", "support", "developer", "admin"] as const
export const POSITIONS = ["vendedor_externo", "vendedor_interno", "gerente_comercial", "diretor"] as const

/** Criação de usuário — admin define a senha (min 8), como no portal-suporte. */
export const createUserSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório").max(200),
  email: z.string().email("E-mail inválido"),
  password: z.string().min(8, "Senha deve ter ao menos 8 caracteres"),
  role: z.enum(ROLES).optional(),
  position: z.enum(POSITIONS).nullable().optional(),
  teamId: z.string().nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
})
export type CreateUserInput = z.infer<typeof createUserSchema>

/** Edição (sem senha) — todos os campos opcionais. */
export const updateUserSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  email: z.string().email("E-mail inválido").optional(),
  role: z.enum(ROLES).optional(),
  active: z.boolean().optional(),
  position: z.enum(POSITIONS).nullable().optional(),
  teamId: z.string().nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
})
export type UpdateUserInput = z.infer<typeof updateUserSchema>

export const setPasswordSchema = z.object({
  password: z.string().min(8, "Senha deve ter ao menos 8 caracteres"),
})
export type SetPasswordInput = z.infer<typeof setPasswordSchema>
