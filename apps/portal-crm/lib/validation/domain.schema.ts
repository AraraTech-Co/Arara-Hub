import { z } from "zod"

// ── Client ──
export const createClientSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório").max(200),
  company: z.string().max(200).nullable().optional(),
  email: z.string().email("E-mail inválido").nullable().optional().or(z.literal("")),
  phone: z.string().max(40).nullable().optional(),
  type: z.enum(["lead", "cliente"]).optional(),
  notes: z.string().max(5000).nullable().optional(),
  tags: z.array(z.string()).optional(),
})
export const updateClientSchema = createClientSchema.partial()
export type CreateClientInput = z.infer<typeof createClientSchema>
export type UpdateClientInput = z.infer<typeof updateClientSchema>

// ── Deal ──
export const createDealSchema = z.object({
  title: z.string().min(1, "Título é obrigatório").max(200),
  clientId: z.string().min(1, "Cliente é obrigatório"),
  stageId: z.string().min(1, "Etapa é obrigatória"),
  value: z.union([z.number(), z.string()]).nullable().optional(),
  expectedClose: z.string().nullable().optional(),
})
export const updateDealSchema = z.object({
  status: z.enum(["open", "won", "lost"]).optional(),
  closedAt: z.string().nullable().optional(),
})
export const moveDealSchema = z.object({
  stageId: z.string().min(1, "Etapa é obrigatória"),
})
export type CreateDealInput = z.infer<typeof createDealSchema>
export type UpdateDealInput = z.infer<typeof updateDealSchema>

// ── Activity ──
export const createActivitySchema = z.object({
  type: z.enum(["call", "visit", "email", "meeting", "follow_up"]),
  clientId: z.string().nullable().optional(),
  dealId: z.string().nullable().optional(),
  scheduledAt: z.string().min(1, "Data é obrigatória"),
  notes: z.string().max(5000).nullable().optional(),
})
export const completeActivitySchema = z.object({
  notes: z.string().max(5000).nullable().optional(),
})
export type CreateActivityInput = z.infer<typeof createActivitySchema>

// ── Stage ──
export const createStageSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório").max(80),
  color: z.string().max(20).optional(),
  order: z.number().int().optional(),
})
export type CreateStageInput = z.infer<typeof createStageSchema>
