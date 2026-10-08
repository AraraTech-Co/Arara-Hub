import { api } from './client'

// ─── Types ────────────────────────────────────────────────────────────────────

export type UserRole = 'user' | 'developer' | 'admin' | 'master'

/** Função/especialidade do membro da equipe — só rótulo, não afeta permissão (UserRole). */
export type StaffPosition = 'agente_suporte' | 'desenvolvedor' | 'administrador'

export interface UserProfile {
  id: string
  email: string
  full_name: string | null
  role: UserRole
  position?: StaffPosition | null
  created_at: string
  company_id?: string | null
  unit_id?: string | null
  expires_at?: string | null
  company?: { id: string; name: string } | null
  /** Permissões extras por pessoa (ex.: 'wa_flow_editor'). */
  feature_grants?: string[]
  /**
   * Membro desativado: sai dos quadros e das listas de agente, mas o
   * histórico dele continua. `undefined` de cadastro antigo conta como ativo.
   */
  active?: boolean
  /**
   * WhatsApp com DDD, só dígitos. É por ele que a recuperação de senha
   * acontece: o código vai para o número JÁ CADASTRADO, nunca para o que a
   * pessoa digita na hora — senão qualquer um recuperaria a conta alheia.
   */
  phone?: string | null
}

export interface InviteCode {
  id: string
  code: string
  role: 'developer' | 'admin'
  label?: string | null
  expiresAt?: string | null
  usedAt?: string | null
}

export interface RecoveryCode {
  code: string
}

export interface CreateUserPayload {
  email: string
  password: string
  full_name?: string | null
  role: UserRole
  position?: StaffPosition | null
  company_id?: string | null
  unit_id?: string | null
  expires_at?: string | null
}

export interface UpdateUserPayload {
  full_name?: string | null
  role?: UserRole
  position?: StaffPosition | null
  company_id?: string | null
  unit_id?: string | null
  expires_at?: string | null
  feature_grants?: string[]
  /** Telefone para a recuperação de senha por WhatsApp. */
  phone?: string | null
}

export interface CreateInvitePayload {
  role: 'developer' | 'admin'
  label?: string
  expiresInDays?: number
}

// ─── API client ───────────────────────────────────────────────────────────────

export const usersApi = {
  /** GET /api/profiles — lista todos os usuários */
  list: () =>
    api.get<{ data: UserProfile[] }>('/api/profiles'),

  /** POST /api/admin/users — cria novo usuário */
  create: (data: CreateUserPayload) =>
    api.post<{ data: UserProfile }>('/api/admin/users', data),

  /** PUT /api/profiles/[id] — atualiza dados do usuário */
  update: (id: string, data: UpdateUserPayload) =>
    api.put<{ data: UserProfile }>(`/api/profiles/${id}`, data),

  /**
   * POST /api/admin/membros/[id]/ativacao — desativa ou reativa o membro.
   *
   * Substitui o antigo DELETE: apagar deixaria chamado apontando para quem não
   * existe mais, e a rota nunca funcionou (o id ia na query e o servidor lia do
   * caminho, então todo clique devolvia "Missing id"). Desativar tira a pessoa
   * dos quadros e devolve o que era dela para a fila, sem responsável.
   */
  setActive: (id: string, active: boolean) =>
    api.post<{ data: { chamados_liberados?: number; times_removidos?: number } }>(
      `/api/admin/membros/${id}/ativacao`,
      { active },
    ),

  /** GET /api/admin/invite-codes — lista códigos de convite */
  listInviteCodes: () =>
    api.get<{ data: InviteCode[] }>('/api/admin/invite-codes'),

  /** POST /api/admin/invite-codes — gera novo código de convite */
  createInviteCode: (data: CreateInvitePayload) =>
    api.post<{ data: InviteCode }>('/api/admin/invite-codes', data),

  /** DELETE /api/admin/invite-codes/[id] — revoga código de convite.
      Era `?id=`, que a rota nunca leu: o id vai no caminho. Por isso o botão
      da lixeira não fazia nada. */
  deleteInviteCode: (id: string) =>
    api.delete<{ success: boolean }>(`/api/admin/invite-codes/${id}`),

  /** POST /api/admin/recovery-codes — gera código de recuperação de senha */
  createRecoveryCode: (userId: string) =>
    api.post<{ data: RecoveryCode }>('/api/admin/recovery-codes', { userId }),

  /** POST /api/admin/users/[id]/set-password — redefine senha de qualquer usuário (admin) */
  setPassword: (id: string, password: string) =>
    api.post<{ success: boolean }>(`/api/admin/users/${id}/set-password`, { password }),
}
