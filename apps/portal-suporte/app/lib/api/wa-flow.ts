import { api } from './client'
import type { WAGraph } from '@/lib/wa-flow-graph'

/** Fluxos de atendimento do WhatsApp (editor visual). */

export interface WAFlowSummary {
  id: string
  name: string
  enabled: boolean
  priority: number
  version: number
  updatedAt: string
  /** Já tem uma versão publicada (existe algo que o cliente pode receber). */
  published: boolean
  /** O rascunho difere do publicado — há mudanças a publicar. */
  hasUnpublished: boolean
}

export interface WAFlowDetail {
  id: string
  name: string
  version: number
  graph: WAGraph
  /** true quando o rascunho tem mudanças ainda não publicadas. */
  hasUnpublished: boolean
}

export const waFlowApi = {
  list: () => api.get<{ data: WAFlowSummary[] }>('/api/whatsapp/flows'),
  get: (id: string) => api.get<{ data: WAFlowDetail }>(`/api/whatsapp/flows/${id}`),
  create: (name: string) => api.post<{ data: { id: string } }>('/api/whatsapp/flows', { name }),
  updateSettings: (id: string, data: { name?: string; enabled?: boolean; priority?: number }) =>
    api.patch<{ data: { updated: boolean } }>(`/api/whatsapp/flows/${id}/settings`, data),
  remove: (id: string) => api.delete<{ data: { deleted: boolean } }>(`/api/whatsapp/flows/${id}`),
  saveDraft: (id: string, graph: WAGraph) =>
    api.patch<{ data: { saved: boolean } }>(`/api/whatsapp/flows/${id}`, { graph }),
  publish: (id: string) =>
    api.post<{ data: { published: boolean; version: number } }>(
      `/api/whatsapp/flows/${id}/publish`,
      {},
    ),

  /**
   * POST /api/whatsapp/flows/[id]/simular — percorre o fluxo sem enviar nada.
   *
   * Manda o grafo do EDITOR (o rascunho aberto, ainda não salvo), que é o caso
   * de uso: conferir antes de publicar. `agora` finge o relógio, para testar os
   * dois ramos da condição de horário sem esperar as 18h.
   */
  simular: (
    id: string,
    body: {
      graph: WAGraph
      mensagens: string[]
      agora?: string | null
      estado?: WASimulacaoEstado
    },
  ) => api.post<{ data: WASimulacao }>(`/api/whatsapp/flows/${id}/simular`, body),
}

export interface WASimulacaoEstado {
  menu_node?: string | null
  phase?: string
  aguardando?: boolean
  nome?: string
  tem_chamado?: boolean
  ausencia_avisada?: boolean
}

export interface WASimulacaoPasso {
  /** Quem "falou": o cliente, o robô, ou o próprio simulador explicando. */
  de: 'cliente' | 'robo' | 'sistema'
  texto: string
}

export interface WASimulacao {
  passos: WASimulacaoPasso[]
  desfecho: string | null
  estado: WASimulacaoEstado
  nada_foi_enviado: boolean
  nada_foi_gravado: boolean
}
