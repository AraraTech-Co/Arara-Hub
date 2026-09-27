// =============================================================================
// Filtros do Kanban Dev — regra pura (item 2.4 da documentação de melhorias).
//
// Separado da tela de propósito: é a única definição do que cada filtro
// significa, e dá para testar sem montar React. Os filtros se COMBINAM (E
// lógico) e vivem na URL, para recarregar ou mandar o link sem perder o recorte.
//
// Filtram os CARDS, não as colunas: o quadro continua inteiro e a contagem de
// cada coluna passa a refletir o recorte.
// =============================================================================

import { prazoDoCard, type CardComPrazo, type SituacaoPrazo } from '@/lib/dev-prazo'

export type OrigemFiltro = '' | 'interna' | 'escalado' | 'portal' | 'whatsapp' | 'email' | 'telefone'

export type FiltrosDev = {
  /** Número (só dígitos casam DEV-588 e TCK000588), título ou empresa. */
  busca: string
  /** Nomes de empresa; vazio = todas. */
  empresas: string[]
  /** Id da pessoa, `__sem__` para sem responsável, vazio = todos. */
  responsavel: string
  prioridade: string
  prazo: '' | SituacaoPrazo
  status: string
  origem: OrigemFiltro
}

export const FILTROS_VAZIOS: FiltrosDev = {
  busca: '',
  empresas: [],
  responsavel: '',
  prioridade: '',
  prazo: '',
  status: '',
  origem: '',
}

export const SEM_RESPONSAVEL = '__sem__'

export type CardFiltravel = CardComPrazo & {
  ticket_number?: string | null
  title?: string | null
  company_name?: string | null
  priority?: string | null
  status?: string | null
  assignee?: { id: string } | null
  origem?: (CardComPrazo['origem'] & { source?: string | null }) | null
}

export function contarAtivos(f: FiltrosDev): number {
  return [
    f.busca.trim() !== '',
    f.empresas.length > 0,
    f.responsavel !== '',
    f.prioridade !== '',
    f.prazo !== '',
    f.status !== '',
    f.origem !== '',
  ].filter(Boolean).length
}

export function aplicarFiltros<T extends CardFiltravel>(cards: T[], f: FiltrosDev, agora: number = Date.now()): T[] {
  const q = f.busca.trim().toLowerCase()
  const soNumeros = q.replace(/\D/g, '')
  const empresas = new Set(f.empresas.map((e) => e.trim().toLowerCase()))

  return cards.filter((c) => {
    if (f.responsavel === SEM_RESPONSAVEL ? !!c.assignee?.id : f.responsavel && c.assignee?.id !== f.responsavel) return false
    if (empresas.size && !empresas.has(String(c.company_name || '').trim().toLowerCase())) return false
    if (f.prioridade && String(c.priority || 'medium') !== f.prioridade) return false
    if (f.status && String(c.status || '') !== f.status) return false
    if (f.prazo && prazoDoCard(c, agora).situacao !== f.prazo) return false

    if (f.origem) {
      const escalado = !!c.origem_ticket_id
      if (f.origem === 'interna' && escalado) return false
      if (f.origem === 'escalado' && !escalado) return false
      if (f.origem !== 'interna' && f.origem !== 'escalado') {
        // Canal é o do chamado de origem; chamado antigo sem canal gravado
        // conta como Portal, como no Kanban do Suporte.
        if (!escalado) return false
        const canal = String(c.origem?.source || 'portal')
        if (canal !== f.origem) return false
      }
    }

    if (q) {
      const casaNumero = soNumeros ? String(c.ticket_number || '').replace(/\D/g, '').includes(soNumeros) : false
      const casaTexto =
        String(c.title || '').toLowerCase().includes(q) ||
        String(c.company_name || '').toLowerCase().includes(q)
      if (!casaNumero && !casaTexto) return false
    }
    return true
  })
}

// ── URL ──────────────────────────────────────────────────────────────────────
const CHAVES = {
  busca: 'q',
  empresas: 'empresa',
  responsavel: 'resp',
  prioridade: 'prio',
  prazo: 'prazo',
  status: 'status',
  origem: 'origem',
} as const

const PRAZOS: SituacaoPrazo[] = ['vencido', 'em_risco', 'no_prazo', 'sem_prazo']
const ORIGENS: OrigemFiltro[] = ['interna', 'escalado', 'portal', 'whatsapp', 'email', 'telefone']

/** Lê da query string; valor desconhecido é ignorado, não vira filtro fantasma. */
export function filtrosDaUrl(search: string): FiltrosDev {
  const p = new URLSearchParams(search)
  const prazo = p.get(CHAVES.prazo) || ''
  const origem = p.get(CHAVES.origem) || ''
  return {
    busca: p.get(CHAVES.busca) || '',
    empresas: p.getAll(CHAVES.empresas).filter(Boolean),
    responsavel: p.get(CHAVES.responsavel) || '',
    prioridade: p.get(CHAVES.prioridade) || '',
    prazo: (PRAZOS as string[]).includes(prazo) ? (prazo as SituacaoPrazo) : '',
    status: p.get(CHAVES.status) || '',
    origem: (ORIGENS as string[]).includes(origem) ? (origem as OrigemFiltro) : '',
  }
}

/** Escreve os filtros na query string, preservando os outros parâmetros. */
export function filtrosNaUrl(search: string, f: FiltrosDev): string {
  const p = new URLSearchParams(search)
  for (const chave of Object.values(CHAVES)) p.delete(chave)
  if (f.busca.trim()) p.set(CHAVES.busca, f.busca.trim())
  for (const e of f.empresas) p.append(CHAVES.empresas, e)
  if (f.responsavel) p.set(CHAVES.responsavel, f.responsavel)
  if (f.prioridade) p.set(CHAVES.prioridade, f.prioridade)
  if (f.prazo) p.set(CHAVES.prazo, f.prazo)
  if (f.status) p.set(CHAVES.status, f.status)
  if (f.origem) p.set(CHAVES.origem, f.origem)
  const s = p.toString()
  return s ? `?${s}` : ''
}
