/** Cliente tipado dos endpoints de usuários (padrão portal-suporte lib/api). */
import type { CreateUserInput, UpdateUserInput } from "@/lib/validation/user.schema"

export type ManagedUser = {
  id: string
  name: string
  email: string
  role: "vendedor" | "gerente" | "admin"
  active: boolean
  createdAt: string
  team: { id: string; name: string } | null
  profile: { position: string | null; phone: string | null; avatarUrl: string | null } | null
}

async function handle(res: Response) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || "Erro na requisição")
  }
  if (res.status === 204) return null
  return res.json()
}

export const usersApi = {
  list: (): Promise<ManagedUser[]> => fetch("/api/admin/users").then(handle),

  create: (data: CreateUserInput): Promise<ManagedUser> =>
    fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then(handle),

  update: (id: string, data: UpdateUserInput): Promise<ManagedUser> =>
    fetch(`/api/admin/users/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then(handle),

  setPassword: (id: string, password: string): Promise<{ success: boolean }> =>
    fetch(`/api/admin/users/${id}/set-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    }).then(handle),

  remove: (id: string): Promise<null> =>
    fetch(`/api/admin/users/${id}`, { method: "DELETE" }).then(handle),
}
