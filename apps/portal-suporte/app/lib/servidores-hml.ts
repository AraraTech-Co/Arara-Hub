// =============================================================================
// Servidores HML (homologação) usados no Kanban Dev.
//
// Espelho dos standalones do SGC-THEME
// (`.github/actions/deploy-set-environment/action.yml`), incluindo `americana`
// (excluída só do bulk de deploy; no quadro Dev ela entra na fila de teste).
//
// O card grava o slug em `Ticket.environment`. Um servidor fica ocupado enquanto
// algum card Dev estiver em `pronto_para_teste` ou `em_testes` com esse valor.
// =============================================================================

export const SERVIDORES_HML = [
  'americana',
  'acesso-nutrition',
  'bem-barato',
  'brand-lar',
  'casa-lar',
  'shopping-lar',
  'casa-park',
  'casa-rosa',
  'ki-barato',
  'mini-shopping',
  'mogi-mirim',
  'shopping-ap',
  'taquaral',
  'shopping-100',
  'shopping-campinas',
  'shopping-itatiba',
  'shopping-sc',
  'ttmb-utilidades',
] as const

export type ServidorHml = (typeof SERVIDORES_HML)[number]

/**
 * "Sem servidor HML" — o card foi para teste sem ocupar servidor nenhum.
 *
 * POR QUE UM VALOR EM `environment`, E NÃO UM CAMPO NOVO:
 *
 *   - mapeei todo leitor do campo. Um escritor (a rota de mover) e seis
 *     leitores: a validação e a ocupação na própria rota, a projeção do
 *     `GET /tickets/kanban`, o painel de servidores, a etiqueta do card e o
 *     detalhe. Nenhum dá outro sentido ao campo;
 *   - um campo à parte poderia CONTRADIZER o slug — `sem_servidor: true` com
 *     `environment: "americana"` é um estado que nenhum código pode confiar, e
 *     esta camada não tem gravação condicional nem transação para impedir que
 *     ele exista. Um campo só não se contradiz.
 *
 * NÃO entra em `SERVIDORES_HML`: não é servidor, e quem lista servidores livres
 * não deve oferecê-lo como se fosse. O hífen segue a forma dos outros slugs,
 * mas o valor é reservado — nenhum servidor pode se chamar assim.
 */
export const SEM_SERVIDOR_HML = 'sem-servidor-hml'

/** O valor é aceito no campo, mas não é um servidor. */
export function ehEscolhaDeHml(id: string | null | undefined): boolean {
  return ehServidorHml(id) || String(id || '') === SEM_SERVIDOR_HML
}

/** Status em que o HML do card continua reservado. */
export const STATUS_TRAVAM_HML = ['pronto_para_teste', 'em_testes'] as const

export function ehServidorHml(id: string | null | undefined): id is ServidorHml {
  return Boolean(id) && (SERVIDORES_HML as readonly string[]).includes(String(id))
}

/** Label legível (slug → Title Case com espaços). */
export function labelServidorHml(id: string): string {
  // O valor reservado tem nome próprio: o Title Case devolveria
  // "Sem Servidor Hml", que não é o que a decisão chama.
  if (String(id) === SEM_SERVIDOR_HML) return 'Sem servidor HML'
  return String(id)
    .split('-')
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ')
}

export function travaHml(status: string | null | undefined): boolean {
  return (STATUS_TRAVAM_HML as readonly string[]).includes(String(status || ''))
}
