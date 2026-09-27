// =============================================================================
// Cliente do Kanban Dev — as rotas publicadas por scripts/kanban-dev-regras.py.
// Fetch cru é dívida conhecida do projeto; aqui é camada desde o dia 1.
// =============================================================================

import { araraFetch } from '@/lib/arara/client'
import type { DevStatus } from '@/lib/kanban-dev'
import type { AttachmentItem } from '@/components/tickets/ticket-attachments'
import type { InternalComment } from '@/components/tickets/ticket-internal-comments'

/** O que o QA registra ao reprovar (item 2.6). Os três primeiros são obrigatórios. */
export type Reprovacao = {
  motivo: string
  encontrado: string
  esperado: string
  observacoes?: string
  orientacoes?: string
}

export type Versao = {
  id: string
  numero: string
  descricao?: string
  data?: string
  created_at?: string
}

type Ok<T> = { success?: boolean; data: T }

export const kanbanDevApi = {
  /** O quadro Dev — mesma rota rica do Suporte, filtrada por quadro. */
  listar: () =>
    araraFetch.get<{ tickets?: Record<string, unknown>[]; count?: number }>(
      '/api/tickets/kanban?quadro=dev',
    ),

  /** Ordem manual da coluna (onda 7): grava `position` na sequência dada. support+. */
  reordenar: (ticketIds: string[]) =>
    araraFetch.post<{ ok?: boolean; updated?: number }>('/api/tickets/reorder', { ticketIds }),

  /** Pessoa → time (TeamMember), para ordenar por "Time do responsável". */
  membrosDosTimes: () =>
    araraFetch.get<{ data: { profile_id: string; team_id: string; team_name: string }[]; times: number }>('/api/times/membros'),

  /** Escala um chamado do Suporte: cria o card Dev e move o chamado p/ Pendência DEV. */
  escalar: (ticketId: string, motivo: string) =>
    araraFetch.post<Ok<{ dev_ticket: Record<string, unknown> }>>(
      `/api/tickets/${ticketId}/escalar-dev`,
      { motivo },
    ),

  /** Demanda que nasce no Dev (developer+). Tipo é obrigatório — §5.1. */
  criar: (body: {
    title: string
    /** Um card pode ser mais de um: bug E melhoria, por exemplo. */
    tipos: ('desenvolvimento' | 'bug' | 'melhoria')[]
    description?: string
    priority?: string
    module?: string
    assigned_to?: string
    /** Empresa do cadastro; o servidor resolve nome e CNPJ pelo id. */
    company_id?: string
  }) => araraFetch.post<Ok<Record<string, unknown>>>('/api/dev/tickets', body),

  /**
   * A máquina de estados. Campos extras conforme a transição (DEV_EXIGE):
   * declaração, motivo, versão. Erro 400 do servidor diz exatamente o que falta.
   */
  mover: (
    id: string,
    status: DevStatus,
    extras?: {
      declaracao?: string
      motivo?: string
      version?: string
      assigned_to?: string
      pull_request_url?: string
      previsao_entrega?: string | null
      /**       ASAP | meio_sprint | um_sprint | dois_sprints | indeterminado */
      esforco_entrega?: string | null
      /** Slug do servidor HML (SGC standalone) ao entrar em Pronto p/ Teste. */
      environment?: string | null
      reprovacao?: Reprovacao
    },
  ) => araraFetch.post<Ok<Record<string, unknown>>>(`/api/dev/tickets/${id}/mover`, { status, ...extras }),

  /** Mensagens do PRÓPRIO card; o painel mostra só as internas. */
  mensagens: (id: string) =>
    araraFetch.get<Ok<(InternalComment & { is_internal?: boolean })[]>>(`/api/tickets/${id}/messages`),

  /** Anexos do PRÓPRIO card (evidência de teste, script, documento). */
  anexos: (id: string) =>
    araraFetch.get<Ok<AttachmentItem[]>>(`/api/tickets/${id}/attachments`),

  versoes: {
    listar: () => araraFetch.get<Ok<Versao[]>>('/api/dev/versoes'),
    /** Cadastro rápido de dentro do diálogo (decisão 14). Idempotente por número. */
    criar: (numero: string, descricao?: string) =>
      araraFetch.post<Ok<Versao> & { existente?: boolean }>('/api/dev/versoes', { numero, descricao }),
  },
}

export type Indicadores = {
  desde: string
  total: number
  por_status: Record<string, number>
  por_tipo: Record<string, number>
  origem: { de_chamado: number; internas: number }
  aplicados_por_versao: Record<string, number>
  tempo_por_etapa: Record<string, { media_horas: number; amostras: number }>
  retrabalho_voltas: number
}

/** Indicadores do §23 — derivados do ActivityLog no servidor. */
export async function araraFetchIndicadores(): Promise<Indicadores> {
  const r = await araraFetch.get<Ok<Indicadores>>('/api/dev/indicadores')
  return r.data
}

export type OrigemPacote = {
  ticket: Record<string, unknown> | null
  mensagens: { id: string; message?: string; is_internal?: boolean; created_at?: string; user_name?: string | null; sender_name?: string | null }[]
  anexos: { id: string; nome: string; url: string; tipo: string }[]
}

/**
 * O atendimento inteiro do chamado de origem, para o painel do card Dev —
 * o desenvolvedor lê as evidências ALI, sem trocar de página.
 */
export async function carregarOrigem(ticketId: string): Promise<OrigemPacote> {
  const [t, m, a] = await Promise.all([
    araraFetch.get<Record<string, unknown>>(`/api/tickets/${ticketId}`).catch(() => null),
    araraFetch.get<unknown>(`/api/tickets/${ticketId}/messages`).catch(() => []),
    araraFetch.get<unknown>(`/api/tickets/${ticketId}/attachments`).catch(() => []),
  ])
  const linhas = (x: unknown): Record<string, unknown>[] => {
    if (Array.isArray(x)) return x as Record<string, unknown>[]
    const d = (x as { data?: unknown })?.data
    return Array.isArray(d) ? (d as Record<string, unknown>[]) : []
  }
  const ticket = ((t as { data?: Record<string, unknown> })?.data ?? t) as Record<string, unknown> | null
  return {
    ticket,
    mensagens: linhas(m)
      .map((r) => ({
        id: String(r.id),
        message: String(r.message ?? r.content ?? ''),
        is_internal: Boolean(r.is_internal ?? r.isInternal),
        created_at: String(r.created_at ?? r.createdAt ?? ''),
        sender_name: (r.sender_name ?? r.user_name ?? r.author_name ?? null) as string | null,
      }))
      .sort((x, y) => (x.created_at < y.created_at ? -1 : 1)),
    anexos: linhas(a).map((r) => ({
      id: String(r.id),
      nome: String(r.file_name ?? r.fileName ?? r.name ?? 'arquivo'),
      url: String(r.file_url ?? r.fileUrl ?? r.url ?? ''),
      tipo: String(r.file_type ?? r.fileType ?? ''),
    })),
  }
}

/**
 * Descrição completa do card. O `GET /tickets/kanban` corta em 220 chars
 * (performance do quadro); o painel de detalhe precisa da rota própria.
 */
export async function carregarDescricaoCompleta(ticketId: string): Promise<string> {
  const r = await araraFetch.get<Record<string, unknown>>(`/api/tickets/${ticketId}`)
  const ticket = ((r as { data?: Record<string, unknown> })?.data ?? r) as Record<string, unknown>
  return String(ticket?.description ?? '')
}
