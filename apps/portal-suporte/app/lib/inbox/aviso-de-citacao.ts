// =============================================================================
// Aviso de "enviada, mas sem a citação".
//
// `POST /whatsapp` devolve `citacao_nao_enviada: true` quando a mensagem sai SEM a citação (hoje: a
// mensagem citada ainda tem identificador provisório `local_…`, que o WhatsApp não conhece). Sem a tela
// dizer, o atendente vê a citação na própria bolha e conclui que o cliente a recebeu.
//
// Só avisa quando a mensagem FOI entregue: se a entrega falhou, o aviso de erro já domina e a citação é
// o menor dos problemas.
//
// A bandeira só existe na resposta do envio: a mensagem gravada não guarda que a citação não foi, então o
// aviso não sobrevive a recarregar a conversa.
// =============================================================================

export const AVISO_CITACAO_NAO_ENVIADA =
  'Enviada, mas sem a citação: o cliente não vai ver a qual mensagem você respondeu.'

export type DadosDoEnvio = {
  entregue?: boolean
  citacao_nao_enviada?: boolean
} | null | undefined

export function avisoDeCitacao(dados: DadosDoEnvio): string | null {
  if (!dados) return null
  if (dados.citacao_nao_enviada !== true) return null
  if (dados.entregue === false) return null
  return AVISO_CITACAO_NAO_ENVIADA
}
