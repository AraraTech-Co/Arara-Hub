// =============================================================================
// Como o contato de uma conversa aparece na tela — regra única (15/09/2026).
//
// Estava copiada em quatro lugares (lista, cabeçalho da conversa, painel e o
// diálogo de chamado), todos com `contato ?? contact_name ?? remote_jid`. Dois
// defeitos saíam daí:
//
//   1. conversa batizada com o nome do PRÓPRIO suporte ("Araratech Suporte"):
//      a Avisa manda o PushName da conta da Arara em mensagem nossa, e a
//      entrada gravava como nome do cliente. O servidor já não grava mais;
//      aqui a tela ignora o que ficou gravado antes;
//   2. sem nome, aparecia o jid cru — e, em conversa sem telefone, os dígitos
//      do LID, que parecem número e não são.
// =============================================================================

import { mascaraTelefone } from '@/lib/utils'

/** Mesmo critério do servidor (`_ehNomeProprio`, POST /whatsapp/inbound). */
export function ehNomeProprio(nome: string | null | undefined): boolean {
  const t = String(nome ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
  return /^arara ?tech( suporte| support)?$/.test(t) || t === 'suporte arara tech' || t === 'suporte araratech'
}

/** Conversa de GRUPO: o jid termina em @g.us (17/09/2026). */
export function ehGrupo(jid: string | null | undefined): boolean {
  return /@g\.us$/i.test(String(jid ?? ''))
}

export function digitosDoJid(jid: string | null | undefined): string {
  return String(jid ?? '').replace(/@.*$/, '').replace(/\D/g, '')
}

/**
 * Conversa sem telefone: o WhatsApp mandou o LID (identificador de privacidade).
 * O servidor grava como `<lid>@lid` desde 15/09; antes, como dígitos soltos —
 * e telefone tem no máximo 13 dígitos (55 + DDD + 9), LID costuma ter 14–15.
 */
export function ehSemTelefone(jid: string | null | undefined): boolean {
  if (ehGrupo(jid)) return false
  return /@lid$/i.test(String(jid ?? '')) || digitosDoJid(jid).length > 13
}

/** Telefone formatado da conversa, ou `null` quando ela não tem telefone. */
export function telefoneDaConversa(jid: string | null | undefined): string | null {
  if (ehGrupo(jid) || ehSemTelefone(jid)) return null
  return telefoneFormatado(digitosDoJid(jid))
}

export function telefoneFormatado(valor: string | null | undefined): string | null {
  const d = String(valor ?? '').replace(/\D/g, '')
  if (d.length === 12 || d.length === 13) {
    return d.startsWith('55') ? mascaraTelefone(`+${d}`) : `+${d}`
  }
  if (d.length === 10 || d.length === 11) return mascaraTelefone(d)
  return null
}

/**
 * Nome a exibir: cadastro, depois o nome do WhatsApp — nenhum dos dois se for o
 * do próprio suporte —, depois o telefone; sem telefone, diz que não há.
 */
export function rotuloDoContato(
  nomeCadastro: string | null | undefined,
  nomeWhatsapp: string | null | undefined,
  jid: string | null | undefined,
): string {
  for (const n of [nomeCadastro, nomeWhatsapp]) {
    const t = String(n ?? '').trim()
    if (t && !ehNomeProprio(t)) return ehGrupo(jid) ? `Grupo · ${t}` : t
  }
  // Grupo sem nome: o webhook não traz o assunto do grupo; os últimos dígitos
  // do id distinguem um do outro até alguém nomear.
  if (ehGrupo(jid)) return `Grupo · ${digitosDoJid(jid).slice(-6)}`
  return telefoneDaConversa(jid) ?? 'Contato sem número'
}
