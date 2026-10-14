import type { ValidacaoDoGrafo, WAGraph } from './wa-flow-graph'

// ===========================================================================
// Criar fluxo a partir de um grafo pronto — modelo ou arquivo JSON.
//
// Fica fora dos componentes para o mesmo caminho servir à lista (modelo e
// "Importar fluxo") e para dar para testar com o node puro, sem React. Por
// isso nada aqui importa valor: a validação e a API entram por parâmetro.
// ===========================================================================

/**
 * Nome sugerido a partir do nome do arquivo. O "Exportar" do editor gera
 * `fluxo-<nome>-v<versão>.json`; tirar esse envelope devolve o nome original
 * na maioria dos casos. A pessoa pode trocar antes de criar.
 */
export function nomeDoArquivoDeFluxo(arquivo: string): string {
  // A ordem importa: a versão sai ANTES do prefixo, senão `fluxo-v2.json`
  // perde o "fluxo-" primeiro, sobra "v2" e o "-v2" já não casa no fim.
  const nome = arquivo
    .replace(/\.json$/i, '')
    .replace(/-v\d+$/i, '')
    .replace(/^fluxo-?/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
    .trim()
  return nome || 'Fluxo importado'
}

export type LeituraDoArquivo =
  | { ok: true; graph: WAGraph; avisos: string[] }
  /** `naoEJson`: o texto nem chegou a ser lido como JSON. */
  | { ok: false; naoEJson: boolean; erros: string[] }

/**
 * Lê e valida o texto do arquivo ANTES de qualquer chamada ao servidor:
 * arquivo ruim não pode deixar nada criado para trás.
 */
export function lerArquivoDeFluxo(
  texto: string,
  validar: (g: unknown) => ValidacaoDoGrafo,
): LeituraDoArquivo {
  let lido: unknown
  try {
    lido = JSON.parse(texto)
  } catch {
    return { ok: false, naoEJson: true, erros: ['Não é um JSON.'] }
  }
  const v = validar(lido)
  if (!v.ok) return { ok: false, naoEJson: false, erros: v.erros }
  return { ok: true, graph: lido as WAGraph, avisos: v.avisos }
}

/** O pedaço da `waFlowApi` que a criação usa — recebido por parâmetro para o teste. */
export interface ApiDeCriacao {
  create: (name: string) => Promise<{ data: { id: string } }>
  saveDraft: (id: string, graph: WAGraph) => Promise<unknown>
  remove: (id: string) => Promise<unknown>
}

export type ResultadoDaCriacao =
  | { status: 'criado'; id: string }
  /** O fluxo foi criado, mas o servidor não aceitou o conteúdo. */
  | { status: 'conteudo-recusado'; id: string; erro: unknown; apagado: boolean }

/**
 * Cria o fluxo e, quando há grafo, grava como RASCUNHO: o que está no ar não
 * muda até alguém publicar. São duas chamadas (POST do nome + PATCH do grafo)
 * e nenhuma rota nova.
 *
 * `apagarSeRecusado`: o servidor valida o grafo de novo no PATCH. Se recusar,
 * sobraria um fluxo vazio — no import isso é arquivo ruim, e o fluxo é
 * apagado. Erro no `create` sobe para quem chamou: aí nada foi criado.
 */
export async function criarFluxo(
  api: ApiDeCriacao,
  nome: string,
  graph?: WAGraph,
  { apagarSeRecusado = false }: { apagarSeRecusado?: boolean } = {},
): Promise<ResultadoDaCriacao> {
  const res = await api.create(nome)
  const id = res.data.id
  if (!graph) return { status: 'criado', id }
  try {
    await api.saveDraft(id, graph)
    return { status: 'criado', id }
  } catch (erro) {
    if (!apagarSeRecusado) return { status: 'conteudo-recusado', id, erro, apagado: false }
    try {
      await api.remove(id)
      return { status: 'conteudo-recusado', id, erro, apagado: true }
    } catch {
      return { status: 'conteudo-recusado', id, erro, apagado: false }
    }
  }
}

/** O que a tela diz quando o servidor recusou o conteúdo de um arquivo importado. */
export function mensagemDeArquivoRecusado(
  r: Extract<ResultadoDaCriacao, { status: 'conteudo-recusado' }>,
): { titulo: string; descricao: string } {
  if (!r.apagado) {
    return { titulo: 'O fluxo foi criado vazio e não consegui apagá-lo', descricao: 'Use Apagar na lista.' }
  }
  const motivo = (r.erro instanceof Error && r.erro.message.trim()) || 'sem detalhe'
  return {
    titulo: 'O servidor recusou o arquivo',
    descricao: `${motivo.replace(/[.\s]+$/, '')}. Nenhum fluxo ficou criado.`,
  }
}
