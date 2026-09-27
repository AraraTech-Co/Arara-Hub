// =============================================================================
// Estado e regra dos filtros da inbox.
//
// Separado do componente de propósito: `matchesFilters` é a única definição do
// que cada filtro significa, e dá para testá-la sem montar React nem banco.
//
// Os filtros rodam no NAVEGADOR, sobre as conversas que o SSE já entregou. Isso
// vale enquanto a lista couber na memória do cliente (é o modelo de hoje: a
// carga inicial traz todas). Se o volume crescer, o caminho é levar este mesmo
// contrato para o servidor — por isso ele é um objeto simples e serializável.
// =============================================================================

import type { WAInboxConversation } from '@/lib/api/whatsapp'
import { isInQueue } from './conversation-meta'
import { ehGrupo } from '@/lib/wa-contato'

/** Abas de sempre: fila (sem dono), minhas, todas. */
// Abas pedidas pela equipe (Thiago, 17/09/2026): "Todas" misturava o que
// está sendo atendido com o que já acabou — quem puxava da fila não sabia
// mais se aquela conversa estava finalizada. Agora cada conversa aberta está
// em exatamente uma de Fila / Em atendimento, e o que acabou vai para
// Finalizadas. "Minhas" é o recorte do próprio atendente dentro de Em atendimento.
// "Grupos" (17/09/2026): grupo é outra coisa — várias pessoas, sem SLA por
// cliente, sem fila. Fica na própria aba e NUNCA aparece nas demais, para
// não se misturar com o atendimento de pessoas.
export type InboxTab = 'fila' | 'minhas' | 'atendimento' | 'finalizadas' | 'grupos'

/** "Ambos / Abertos / Concluídos" do print do BotConversa. */
export type StatusFilter = 'ambos' | 'abertos' | 'concluidos'

/** Balde do legado: conversa concluída antes de existir motivo de encerramento. */
export const SEM_MOTIVO = '__sem_motivo__'

export interface InboxFilters {
  status: StatusFilter
  /** Ids de motivo; `SEM_MOTIVO` cobre as concluídas sem motivo registrado. */
  closeReasonIds: string[]
  /** Id do atendente, ou `'__none__'` para não atribuídas. */
  agentId: string | null
  departmentId: string | null
  companyId: string | null
  tagId: string | null
}

export const SEM_ATENDENTE = '__none__'

export const FILTROS_VAZIOS: InboxFilters = {
  status: 'ambos',
  closeReasonIds: [],
  agentId: null,
  departmentId: null,
  companyId: null,
  tagId: null,
}

export function isConcluida(c: WAInboxConversation): boolean {
  return c.status === 'closed' || c.phase === 'resolvido'
}

/** Quantos filtros estão ativos (badge no botão de funil). */
export function countActive(f: InboxFilters): number {
  let n = 0
  if (f.status !== 'ambos') n += 1
  if (f.closeReasonIds.length) n += 1
  if (f.agentId) n += 1
  if (f.departmentId) n += 1
  if (f.companyId) n += 1
  if (f.tagId) n += 1
  return n
}

export function matchesTab(
  c: WAInboxConversation,
  tab: InboxTab,
  meId: string | null,
): boolean {
  const grupo = c.is_group === true || ehGrupo(c.remote_jid)
  if (tab === 'grupos') return grupo
  if (grupo) return false
  if (tab === 'fila') return isInQueue(c)
  // "Minhas" é trabalho em aberto: conversa concluída sai daqui (continua em
  // "Todas"). Sem isto, tudo que a pessoa já atendeu ficava preso na aba para
  // sempre — "não consigo tirar de Minhas mesmo concluindo" (16/09/2026).
  if (tab === 'minhas') return meId != null && c.assigned_to?.id === meId && !isConcluida(c)
  if (tab === 'atendimento') return c.assigned_to != null && !isConcluida(c)
  if (tab === 'finalizadas') return isConcluida(c)
  return true
}

/** Aplica os filtros do funil. Filtro não preenchido não restringe nada. */
export function matchesFilters(c: WAInboxConversation, f: InboxFilters): boolean {
  const concluida = isConcluida(c)
  if (f.status === 'abertos' && concluida) return false
  if (f.status === 'concluidos' && !concluida) return false

  // Motivo só faz sentido sobre conversa concluída — filtrar por motivo implica
  // "concluídas", mesmo que o status esteja em "ambos".
  if (f.closeReasonIds.length) {
    if (!concluida) return false
    const id = c.close_reason?.id ?? SEM_MOTIVO
    if (!f.closeReasonIds.includes(id)) return false
  }

  if (f.agentId) {
    if (f.agentId === SEM_ATENDENTE) {
      if (c.assigned_to != null) return false
    } else if (c.assigned_to?.id !== f.agentId) {
      return false
    }
  }

  if (f.departmentId && c.department?.id !== f.departmentId) return false
  if (f.companyId && c.company?.id !== f.companyId) return false
  if (f.tagId && !(c.tags ?? []).some((t) => t.id === f.tagId)) return false

  return true
}

/** Busca livre: nome do contato, empresa e telefone. */
export function matchesQuery(c: WAInboxConversation, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const nome = (c.contact?.name ?? c.contact_name ?? '').toLowerCase()
  const empresa = c.company?.name?.toLowerCase() ?? ''
  return nome.includes(q) || empresa.includes(q) || c.remote_jid.toLowerCase().includes(q)
}
