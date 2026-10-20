/**
 * A mensagem que uma citação aponta, dentre as que a tela já carregou.
 *
 * A citação guarda o `message_id` da mensagem citada. Vale para mensagem nossa com
 * id provisório (`local_…`) também, porque o id gravado na citação é o da própria
 * linha. Devolve `null` quando a citada é mais antiga que o histórico carregado.
 */
export function acharMensagemCitada<T extends { id: string; message_id?: string | null }>(
  mensagens: T[],
  idCitado: string | null | undefined,
): T | null {
  if (!idCitado) return null
  return mensagens.find((m) => m.message_id === idCitado) ?? null
}
