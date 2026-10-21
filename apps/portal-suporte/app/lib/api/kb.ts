import { api } from './client'

// ---------------------------------------------------------------------------
// Sugestões de artigo para o assistente de novo chamado.
//
// A tela da Base de Conhecimento (`/admin/kb`) deixou de listar, criar, editar e apagar artigos: ela é
// uma visão dos documentos da pasta `base-de-conhecimento` do acervo de arquivos (`lib/api/arquivos.ts`).
// As rotas genéricas `/kb` saíram do servidor; só `POST /api/kb/suggest` segue, e é a única chamada
// que este cliente ainda faz.
// ---------------------------------------------------------------------------

export interface KbSuggestResult {
  id: string
  title: string
  category: string | null
  score: number
  excerpt: string
}

export interface KbSuggestResponse { articles: KbSuggestResult[] }

export const kbApi = {
  /**
   * POST /api/kb/suggest
   * Busca por termos nos artigos gravados (`KbArticle`).
   */
  suggest: (query: string, topK = 5) =>
    api.post<KbSuggestResponse>('/api/kb/suggest', { query, topK }),
}
