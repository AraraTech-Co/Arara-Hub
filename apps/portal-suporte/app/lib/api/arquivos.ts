// =============================================================================
// Repositório de arquivos de apoio (Fase 5) — o cliente.
//
// Acervo SEPARADO dos anexos de chamado: script, manual, material de
// homologação. Misturar faria material interno aparecer na timeline de um
// chamado.
//
// ⚠️ TETO DE 10 MB por arquivo, herdado da plataforma: o conteúdo é guardado
// como data URI dentro do registro, porque a rota de upload da plataforma é um
// stub 501 (ver app/lib/anexos.ts). Está dito na tela ao lado do botão, não só
// na mensagem de recusa.
// =============================================================================

import { api } from './client'
import { ANEXO_MAX_MB } from '../anexos'

/** O mesmo teto dos anexos de chamado — uma fonte, não duas. */
export const ARQUIVO_MAX_MB = ANEXO_MAX_MB

/**
 * A Base de Conhecimento é uma VISÃO deste acervo, presa a esta pasta (a tela `/admin/kb`). Não há
 * rota própria: envio, lista, download e exclusão são os de `/api/arquivos`, com as mesmas regras de
 * acesso. A pasta é fixa de propósito: configurável, "qual é a base" passaria a ser uma escolha de
 * quem usa a tela.
 */
export const PASTA_BASE_DE_CONHECIMENTO = 'base-de-conhecimento'

export interface ArquivoDeApoio {
  id: string
  nome: string
  pasta: string
  tipo: string | null
  tamanho: number
  dono_id: string | null
  acl_nivel: string | null
  acl_grant: string | null
  criado_em: string | null
}

export const arquivosApi = {
  /**
   * GET /api/arquivos — SÓ metadados, paginado.
   *
   * `truncado` diz que a janela de 500 da plataforma pode ter cortado: a tela
   * mostra "N de muitos" em vez de parecer completa.
   */
  listar: (pasta?: string | null, cursor?: string | null) => {
    const q = new URLSearchParams()
    if (pasta) q.set('pasta', pasta)
    if (cursor) q.set('cursor', cursor)
    const s = q.toString()
    return api.get<{
      data: { arquivos: ArquivoDeApoio[]; cursor: string | null; pasta: string; truncado: boolean }
    }>(`/api/arquivos${s ? `?${s}` : ''}`)
  },

  enviar: (body: { nome: string; pasta?: string; conteudo: string; acl_nivel?: string; acl_grant?: string }) =>
    api.post<{ data: { id: string; nome: string; pasta: string; tamanho: number; tipo: string } }>(
      '/api/arquivos', body,
    ),

  /** GET /api/arquivos/[id] — aqui, e só aqui, o conteúdo sai. */
  baixar: (id: string) =>
    api.get<{ data: { id: string; nome: string; tipo: string; tamanho: number; conteudo: string } }>(
      `/api/arquivos/${encodeURIComponent(id)}`,
    ),

  /** Exclusão LÓGICA: o metadado fica para a auditoria, o conteúdo sai. */
  apagar: (id: string) =>
    api.delete<{ data: { id: string; apagado_em: string } }>(`/api/arquivos/${encodeURIComponent(id)}`),
}

/**
 * As opções de "Quem pode ver", na ordem em que aparecem na tela.
 *
 * Os valores são o que o servidor valida: `acl_nivel` tem de estar na régua de
 * níveis, `acl_grant` no catálogo de grants (ou no padrão `wa_conta_<id>`).
 * Mandar qualquer outra coisa é 400 — e é por isso que a tela oferece lista em
 * vez de campo livre.
 *
 * `support` NÃO entra como opção de nível: é a régua de entrada do portal, e
 * "nível mínimo support" é o mesmo que "toda a equipe", que já é o padrão.
 */
export const NIVEIS_DE_ACESSO = [
  { valor: 'developer', rotulo: 'Nível mínimo: developer' },
  { valor: 'admin', rotulo: 'Nível mínimo: admin' },
] as const

/** "1,2 MB" / "840 kB" — tamanho legível, sem biblioteca. */
export function tamanhoLegivel(bytes: number): string {
  const n = Number(bytes || 0)
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 102.4) / 10} kB`
  return `${Math.round(n / 104857.6) / 10} MB`
}
