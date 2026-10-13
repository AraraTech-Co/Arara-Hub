import { api } from './client'

// ---------------------------------------------------------------------------
// Plantão — uma escala só (Fluxo v2, entrega 3).
//
// Decisão do Leonardo (09/10/2026): existe UM plantão, por data, com os
// agentes em ordem de chamada. A escala semanal, a diária e a mensal eram
// visões da mesma coisa e sumiram. N1/N2/N3 é severidade do chamado, não
// escala; war room é estado de incidente, não turno.
//
// Os registros antigos continuam no banco e o servidor os apresenta neste
// formato — a conversão é na leitura, não houve migração destrutiva.
// ---------------------------------------------------------------------------

export interface PlantaoAgente {
  id: string
  nome: string | null
  email: string | null
  /** Telefone utilizável pela Avisa (com DDI). Sem ele, não há como avisar. */
  telefone_ok: boolean
}

export interface PlantaoDia {
  date: string
  notes: string | null
  /** De onde o dia veio: registro novo, plantão diário antigo ou escala semanal. */
  origem: 'plantao' | 'diario' | 'semanal'
  id: string
  agent_ids: string[]
  agentes: PlantaoAgente[]
}

export interface QuemAvisarAgora {
  agora: {
    data: string
    fuso: string
    em_plantao: boolean
    faixa: [string, string] | null
  }
  /** A resposta: vazio significa "ninguém", e `motivo` diz por quê. */
  avisar: PlantaoAgente[]
  /** Escalados que ficaram de fora por não ter telefone — buraco visível. */
  sem_telefone: PlantaoAgente[]
  plantao_do_dia: { date: string; agent_ids: string[]; notes: string | null; origem: string } | null
  motivo: string | null
}

export const schedulesApi = {
  /** GET /api/schedules?from=&to= — dias de plantão no intervalo. */
  listar: (de: string, ate: string) =>
    api.get<{ data: PlantaoDia[]; count: number }>(
      `/api/schedules?from=${encodeURIComponent(de)}&to=${encodeURIComponent(ate)}`,
    ),

  /** GET /api/schedules/on-call — quem avisar agora. */
  quemAvisarAgora: () => api.get<{ data: QuemAvisarAgora }>('/api/schedules/on-call'),

  /** POST /api/schedules — salva o dia (a data é a chave: salvar atualiza). */
  salvarDia: (date: string, agentIds: string[], notes?: string | null) =>
    api.post<{ data: PlantaoDia; criado: boolean }>('/api/schedules', {
      date, agent_ids: agentIds, notes: notes ?? null,
    }),

  /** DELETE /api/schedules?date= — tira o plantão do dia. */
  limparDia: (date: string) =>
    api.delete<{ ok: boolean }>(`/api/schedules?date=${encodeURIComponent(date)}`),
}
