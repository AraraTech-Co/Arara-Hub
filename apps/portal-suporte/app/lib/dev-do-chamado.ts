// =============================================================================
// Dev responsável e prazo do chamado, vistos pelo SUPORTE.
//
// O servidor junta, para cada chamado, o card do Kanban Dev aberto que nasceu dele (escalada) e que
// já tem responsável: `GET /tickets/kanban` (campo `dev` de cada chamado) e `GET /tickets/:id`. Só
// o suporte recebe a chave; o cliente nunca vê o nome do dev nem este prazo (a página de
// acompanhamento tem a própria regra).
//
// O prazo é o do DEV (`previsao_entrega` do card Dev), interno. Data sem hora vale até o meio-dia.
// =============================================================================

export type DevDoChamado = {
  /** id do card no Kanban Dev */
  ticket_id: string
  /** número do card (DEV…) */
  numero: string | null
  /** coluna do card no Kanban Dev */
  status: string | null
  responsavel: { id: string; nome: string | null }
  /** AAAA-MM-DD, ou AAAA-MM-DDTHH:MM:SS; nulo quando o esforço não tem data (indeterminado) */
  previsao_entrega: string | null
}

/** "30/10" para data só; "30/10 09:30" quando a previsão traz hora (e não é meio-dia de sprint). */
export function prazoDoDev(previsao: string | null | undefined): string | null {
  const m = String(previsao || '').match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/)
  if (!m) return null
  const data = `${m[3]}/${m[2]}`
  if (m[4] === undefined || (m[4] === '12' && m[5] === '00')) return data
  return `${data} ${m[4]}:${m[5]}`
}
