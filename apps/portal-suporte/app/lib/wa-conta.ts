// =============================================================================
// Contas de WhatsApp por setor — o que é a conta de uma conversa (Fase 3a).
//
// Um lugar só, porque a regra é pequena e aparece em muitos: conversa sem
// `conta_id` é da conta DEFAULT. É isso que faz a Fase 3 não precisar de
// migração de dados — nenhuma das conversas que já existem é reescrita, e o
// portal segue igual enquanto ninguém cadastrar uma segunda conta.
//
// Sem import nenhum, de propósito: o teste carrega este arquivo direto (o
// `wa-contato.ts` precisaria de três stubs por causa do `clsx`, e teste que
// precisa de stub para alcançar a função testa menos do que parece).
// =============================================================================

/**
 * A conta que existe hoje, e o destino de toda conversa sem `conta_id`.
 *
 * O valor entra no nome do segredo (`whatsapp_token_default`) e no grant
 * (`wa_conta_default`) — mas, para a default, nenhum dos dois precisa existir:
 * o segredo cai no `whatsapp_token` único e a permissão é o nível de sempre.
 * É isso que cumpre "a conta default continua funcionando sem configuração
 * nova".
 */
export const CONTA_DEFAULT = 'default'

/** De que conta é esta conversa. Ausente, vazio ou nulo = a default. */
export function contaDaConversa(
  conversa: { conta_id?: string | null; contaId?: string | null } | null | undefined,
): string {
  const cru = conversa?.conta_id ?? conversa?.contaId ?? ''
  const t = String(cru).trim()
  return t || CONTA_DEFAULT
}

/** A conversa é da conta default? */
export function ehContaDefault(conversa: Parameters<typeof contaDaConversa>[0]): boolean {
  return contaDaConversa(conversa) === CONTA_DEFAULT
}

/**
 * Nome do segredo com o token desta conta.
 *
 * O servidor tenta este nome e, se não houver segredo, cai no `whatsapp_token`
 * de hoje. A gêmea desta regra vive no handler (`_tokenDaConta`), e há teste
 * comparando as duas — é a mesma disciplina da normalização de telefone.
 */
export function nomeDoSegredoDaConta(contaId: string | null | undefined): string {
  const id = String(contaId ?? '').trim() || CONTA_DEFAULT
  return `whatsapp_token_${id}`
}

/**
 * Grant que dá acesso a uma conta.
 *
 * A conta default não exige grant: quem tem nível de atendimento vê o que
 * sempre viu. Exigir grant nela tiraria a inbox de todo mundo no instante em
 * que a Fase 3 subisse.
 */
export function grantDaConta(contaId: string | null | undefined): string | null {
  const id = String(contaId ?? '').trim() || CONTA_DEFAULT
  return id === CONTA_DEFAULT ? null : `wa_conta_${id}`
}
