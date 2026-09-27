// =============================================================================
// Cliente do módulo de Projetos — rotas publicadas por scripts/projetos-regras.py.
// Fetch cru é dívida conhecida do portal; aqui é camada desde o primeiro dia.
// =============================================================================

import { araraFetch } from '@/lib/arara/client'

export type Projeto = {
  id: string
  codigo: string
  nome: string
  descricao?: string
  tipo: 'interno' | 'cliente'
  company_id?: string
  status: string
  inicio_planejado?: string
  fim_planejado?: string
  responsavel_id?: string
  created_at?: string
  updated_at?: string
  arquivado_em?: string
  /** Calculados pelo servidor — a tela não recalcula regra de negócio. */
  total_cards?: number
  cards_atrasados?: number
  progresso?: number
}

export type ProjetoFase = {
  id: string
  projeto_id: string
  nome: string
  ordem: number
  cor?: string
  inicio_planejado?: string
  fim_planejado?: string
  datas_manuais?: boolean
  updated_at?: string
  total_cards?: number
  progresso?: number
  inicio_efetivo?: string
  fim_efetivo?: string
}

export type ProjetoMembro = {
  id: string
  projeto_id: string
  user_id: string
  papel: 'responsavel' | 'participante' | 'observador'
}

export type ProjetoMarco = {
  id: string
  projeto_id: string
  nome: string
  data?: string
  atingido_em?: string
  updated_at?: string
}

export type CardDoProjeto = {
  id: string
  ticket_number?: string
  title?: string
  status?: string
  quadro?: string
  severity?: string
  priority?: string
  assigned_to?: string
  company_name?: string
  version?: string
  projeto_id?: string
  fase_id?: string
  inicio_planejado?: string
  previsao_entrega?: string
  estimativa_min?: number
  progresso?: number | null
  progresso_efetivo?: number
  atrasado?: boolean
  updated_at?: string
}

export type CardDependencia = {
  id: string
  projeto_id: string
  origem_ticket_id: string
  destino_ticket_id: string
  tipo?: string
}

export type ProjetoDetalhe = Projeto & {
  fases: ProjetoFase[]
  membros: ProjetoMembro[]
  marcos: ProjetoMarco[]
  dependencias: CardDependencia[]
  cards: CardDoProjeto[]
}

type Ok<T> = { success?: boolean; data: T }

export type FiltroProjetos = {
  tipo?: string
  status?: string
  company_id?: string
  responsavel_id?: string
  meus?: boolean
  arquivados?: boolean
}

function query(f: FiltroProjetos = {}): string {
  const p = new URLSearchParams()
  if (f.tipo) p.set('tipo', f.tipo)
  if (f.status) p.set('status', f.status)
  if (f.company_id) p.set('company_id', f.company_id)
  if (f.responsavel_id) p.set('responsavel_id', f.responsavel_id)
  if (f.meus) p.set('meus', '1')
  if (f.arquivados) p.set('arquivados', '1')
  const s = p.toString()
  return s ? `?${s}` : ''
}

export type SaudeProjeto = {
  estado: 'ok' | 'atencao' | 'critico'
  /** Os motivos escritos. Selo sem motivo não muda o comportamento de ninguém. */
  motivos: string[]
  atrasados: number
  marcos_vencidos: number
  marcos_proximos: number
}

export type LinhaPortfolio = {
  id: string
  codigo: string
  nome: string
  tipo: 'interno' | 'cliente'
  status: string
  company_id?: string
  responsavel_id?: string
  /** Janela desenhada: o plano quando existe, senão o que os cards ocupam. */
  inicio: string
  fim: string
  inicio_planejado?: string
  fim_planejado?: string
  progresso: number
  total_cards: number
  saude: SaudeProjeto
  marcos: { id: string; nome: string; data: string; atingido_em: string }[]
}

export const projetosApi = {
  listar: (f?: FiltroProjetos) => araraFetch.get<Ok<Projeto[]>>(`/api/projetos${query(f)}`),

  /** Todos os projetos numa régua só, com saúde já calculada no servidor. */
  portfolio: (f?: FiltroProjetos) =>
    araraFetch.get<Ok<LinhaPortfolio[]> & { hoje: string }>(`/api/projetos/portfolio${query(f)}`),

  detalhe: (id: string) => araraFetch.get<Ok<ProjetoDetalhe>>(`/api/projetos/${id}`),

  criar: (body: {
    nome: string
    tipo: 'interno' | 'cliente'
    company_id?: string
    descricao?: string
    status?: string
    inicio_planejado?: string
    fim_planejado?: string
    responsavel_id?: string
    fases?: { nome: string; ordem?: number; cor?: string }[]
    fase_modelo_id?: string
  }) => araraFetch.post<Ok<Projeto>>('/api/projetos', body),

  /**
   * `updated_at` é o carimbo lido pela tela — o servidor devolve 409 se alguém
   * alterou no meio. É o cenário garantido de um Gantt: duas pessoas mexendo
   * na mesma reunião.
   */
  editar: (id: string, body: Partial<Projeto> & { arquivar?: boolean; updated_at?: string }) =>
    araraFetch.patch<Ok<Projeto>>(`/api/projetos/${id}`, body),

  fases: {
    criar: (projetoId: string, body: { nome: string; ordem?: number; cor?: string }) =>
      araraFetch.post<Ok<ProjetoFase>>(`/api/projetos/${projetoId}/fases`, body),
    editar: (projetoId: string, faseId: string, body: Partial<ProjetoFase>) =>
      araraFetch.patch<Ok<ProjetoFase>>(`/api/projetos/${projetoId}/fases/${faseId}`, body),
    /** Não apaga card: os cards da fase voltam para "sem fase". */
    remover: (projetoId: string, faseId: string) =>
      araraFetch.delete<Ok<{ cards_soltos: number }>>(`/api/projetos/${projetoId}/fases/${faseId}`),
  },

  membros: {
    adicionar: (projetoId: string, user_id: string, papel: ProjetoMembro['papel'] = 'participante') =>
      araraFetch.post<Ok<ProjetoMembro>>(`/api/projetos/${projetoId}/membros`, { user_id, papel }),
    remover: (projetoId: string, userId: string) =>
      araraFetch.delete<Ok<{ removidos: number }>>(`/api/projetos/${projetoId}/membros/${userId}`),
  },

  cards: {
    vincular: (projetoId: string, ticketIds: string[], faseId?: string) =>
      araraFetch.post<Ok<{ vinculados: number; ids: string[] }>>(
        `/api/projetos/${projetoId}/cards`,
        { ticket_ids: ticketIds, fase_id: faseId || '' },
      ),
    /** `previsao_entrega` É o fim planejado — não existe outro campo de fim. */
    planejar: (
      projetoId: string,
      ticketId: string,
      body: {
        inicio_planejado?: string
        previsao_entrega?: string
        estimativa_min?: number
        progresso?: number | null
        fase_id?: string
        updated_at?: string
      },
    ) => araraFetch.patch<Ok<CardDoProjeto>>(`/api/projetos/${projetoId}/cards/${ticketId}`, body),
    soltar: (projetoId: string, ticketId: string) =>
      araraFetch.delete<Ok<{ dependencias_apagadas: number }>>(
        `/api/projetos/${projetoId}/cards/${ticketId}`,
      ),
  },

  /**
   * "O card destino só começa depois que o origem for aplicado no cliente."
   * Ciclo é recusado pelo SERVIDOR (409) — a tela impede o caso óbvio, mas
   * quem garante é ele.
   */
  dependencias: {
    criar: (projetoId: string, origem_ticket_id: string, destino_ticket_id: string) =>
      araraFetch.post<Ok<CardDependencia>>(`/api/projetos/${projetoId}/dependencias`, {
        origem_ticket_id,
        destino_ticket_id,
      }),
    remover: (projetoId: string, depId: string) =>
      araraFetch.delete<Ok<{ removida: boolean }>>(`/api/projetos/${projetoId}/dependencias/${depId}`),
  },

  marcos: {
    criar: (projetoId: string, body: { nome: string; data: string }) =>
      araraFetch.post<Ok<ProjetoMarco>>(`/api/projetos/${projetoId}/marcos`, body),
    editar: (projetoId: string, marcoId: string, body: { nome?: string; data?: string; atingido?: boolean; updated_at?: string }) =>
      araraFetch.patch<Ok<ProjetoMarco>>(`/api/projetos/${projetoId}/marcos/${marcoId}`, body),
    remover: (projetoId: string, marcoId: string) =>
      araraFetch.delete<Ok<{ removido: boolean }>>(`/api/projetos/${projetoId}/marcos/${marcoId}`),
  },
}
