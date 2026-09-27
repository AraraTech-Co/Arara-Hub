import { api } from './client'

/** Motivos de encerramento de conversa (Configurações → WhatsApp). */

export interface WACloseReason {
  id: string
  name: string
  active: boolean
  position: number
}

export const closeReasonsApi = {
  /** Só os ativos — é o que a equipe pode escolher ao concluir. */
  listActive: () => api.get<{ data: WACloseReason[] }>('/api/whatsapp/close-reasons'),
  /** Inclui os desativados — só a tela de Configurações precisa deles. */
  listAll: () => api.get<{ data: WACloseReason[] }>('/api/whatsapp/close-reasons?all=true'),
  create: (name: string, position?: number) =>
    api.post<{ data: WACloseReason }>('/api/whatsapp/close-reasons', { name, position }),
  update: (id: string, data: { name?: string; active?: boolean; position?: number }) =>
    api.patch<{ data: WACloseReason }>(`/api/whatsapp/close-reasons/${id}`, data),
  remove: (id: string) =>
    api.delete<{ data: { deleted: boolean } }>(`/api/whatsapp/close-reasons/${id}`),
}
