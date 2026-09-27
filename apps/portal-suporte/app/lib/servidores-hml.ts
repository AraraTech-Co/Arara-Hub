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

/** Status em que o HML do card continua reservado. */
export const STATUS_TRAVAM_HML = ['pronto_para_teste', 'em_testes'] as const

export function ehServidorHml(id: string | null | undefined): id is ServidorHml {
  return Boolean(id) && (SERVIDORES_HML as readonly string[]).includes(String(id))
}

/** Label legível (slug → Title Case com espaços). */
export function labelServidorHml(id: string): string {
  return String(id)
    .split('-')
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ')
}

export function travaHml(status: string | null | undefined): boolean {
  return (STATUS_TRAVAM_HML as readonly string[]).includes(String(status || ''))
}
