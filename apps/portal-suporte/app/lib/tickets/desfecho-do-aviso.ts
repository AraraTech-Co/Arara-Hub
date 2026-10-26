export type DesfechoDoAviso = {
  etapa?: unknown
  status?: unknown
  erro?: unknown
} | null | undefined

/**
 * O que o histórico do chamado diz sobre o aviso de acompanhamento enviado por WhatsApp.
 *
 * "Aceito" NÃO é "entregue": o 200 do provedor não prova que a pessoa recebeu. O texto só afirma o
 * que o registro sabe. `enviado` é a etapa antiga (gravada também quando o provedor recusou): o
 * status decide. Só uma etapa ausente ou desconhecida vira "Sem desfecho registrado".
 */
export function textoDoDesfecho(desfecho: DesfechoDoAviso, destino?: string | null): string {
  const d = desfecho ?? {}
  const etapa = String(d.etapa ?? '')
  const st = d.status == null || d.status === '' ? null : Number(d.status)
  const http = st == null || Number.isNaN(st) ? '?' : String(st)
  const fim = destino ? ` · ${destino}` : ''
  if (etapa === 'grupo') return `Não enviado: conversa de grupo${fim}`
  if (etapa === 'sem_numero') return `Não enviado: chamado sem número de WhatsApp${fim}`
  if (etapa === 'sem_token') return 'Não enviado: whatsapp_token não configurado no cofre do app'
  if (etapa === 'falhou') return `Falhou: ${String(d.erro ?? 'erro desconhecido')}${fim}`
  if (etapa === 'recusado') return `Recusado pelo provedor (HTTP ${http})${fim}`
  if (etapa === 'aceito_pelo_provedor') return `Aceito pelo provedor (HTTP ${http})${fim}`
  if (etapa === 'enviado') {
    // Etapa antiga: gravada mesmo quando o provedor recusou ou nem respondeu. Só o status numérico decide;
    // sem ele o registro não afirma aceitação nem recusa.
    if (st != null && st >= 200 && st < 300) return `Aceito pelo provedor (HTTP ${http})${fim}`
    if (st != null && st >= 300) return `Recusado pelo provedor (HTTP ${http})${fim}`
    // sem status, 0, 1xx, negativo ou não numérico: nem aceito nem recusado
    return `Registrado como enviado, sem resposta do provedor no registro${fim}`
  }
  return `Sem desfecho registrado${fim}`
}
