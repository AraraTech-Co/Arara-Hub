// =============================================================================
// Atividades do projeto — vocabulário, colunas e as contas da tela.
//
// ESTE É O LUGAR ÚNICO de duas coisas que ainda não são regra aprovada:
// as COLUNAS do quadro (D2) e os CAMPOS OBRIGATÓRIOS do cadastro (D5). Trocar
// qualquer uma das duas é editar este arquivo e nada mais — o quadro, o
// formulário e os testes leem daqui. Foi pedido assim porque as duas decisões
// estão com o Leonardo neste momento.
//
// A VERDADE mora no servidor (rotas 507–509 do módulo `projetos`). O que está
// aqui existe para a tela não ter de ir ao servidor a cada render, e para o
// quadro não oferecer um movimento que a API vai recusar. Cortesia, não trava.
//
// As funções são PURAS de propósito: é nelas que mora a regra do quadro, e
// regra dentro de componente só se testa com renderizador, que este projeto
// não tem.
// =============================================================================

export type AtividadeStatus =
  | 'backlog'
  | 'em_desenvolvimento'
  | 'finalizado_dev'
  | 'pronto_para_teste'
  | 'teste_aprovado'
  | 'teste_reprovado'
  | 'deploy_feito'
  | 'cancelada'

export type Atividade = {
  id: string
  projeto_id: string
  fase_id?: string
  titulo: string
  descricao?: string
  status: AtividadeStatus
  ordem?: number
  responsavel_id?: string
  inicio_planejado?: string
  previsao_entrega?: string
  estimativa_min?: number
  concluida_em?: string
  cancelada_em?: string
  criado_por?: string
  created_at?: string
  updated_at?: string
}

/**
 * As colunas do quadro: as 7 etapas decididas pelo Leonardo em 29/10/2026, na
 * ordem dele. Espelha `_ST_FLUXO` do servidor — mover para a etapa seguinte é
 * andar um passo nesta lista.
 *
 * `cancelada` não é coluna: fica fora do fluxo e do denominador do progresso, e
 * continua visível numa faixa própria.
 */
export const COLUNAS: { status: AtividadeStatus; titulo: string }[] = [
  { status: 'backlog', titulo: 'Backlog' },
  { status: 'em_desenvolvimento', titulo: 'Em desenvolvimento' },
  { status: 'finalizado_dev', titulo: 'Finalizado dev' },
  { status: 'pronto_para_teste', titulo: 'Pronto p/ teste' },
  { status: 'teste_aprovado', titulo: 'Teste aprovado' },
  { status: 'teste_reprovado', titulo: 'Teste reprovado' },
  { status: 'deploy_feito', titulo: 'Deploy feito' },
]

/** A única etapa que conta como concluída (D4). Espelha `_ST_PRONTO`. */
export const ST_PRONTO: AtividadeStatus = 'deploy_feito'
/** Onde a atividade nasce. Espelha `_ST_INICIAL`. */
export const ST_INICIAL: AtividadeStatus = 'backlog'

/** Os status que o quadro conhece, colunas mais os que vivem fora delas. */
export const STATUS_CONHECIDOS: AtividadeStatus[] =
  [...COLUNAS.map((c) => c.status), 'cancelada']

export const STATUS_LABELS: Record<AtividadeStatus, string> = Object.assign(
  { cancelada: 'Cancelada' } as Record<AtividadeStatus, string>,
  ...COLUNAS.map((c) => ({ [c.status]: c.titulo })),
)

/**
 * Campos exigidos, decididos em 29/10: título, descrição, responsável e prazo.
 * Valem na criação e também na edição, que não pode esvaziar nenhum deles —
 * é a mesma lista que o servidor confere em `_OBRIG_ATIV`.
 */
export const CAMPOS_OBRIGATORIOS: (keyof Atividade)[] =
  ['titulo', 'descricao', 'responsavel_id', 'previsao_entrega']

/** O rótulo de cada obrigatório, para a tela dizer o que falta. */
export const ROTULOS: Record<string, string> = {
  titulo: 'título',
  descricao: 'descrição',
  responsavel_id: 'responsável',
  previsao_entrega: 'prazo',
}

export const RASCUNHO_VAZIO = {
  titulo: '',
  descricao: '',
  fase_id: '',
  responsavel_id: '',
  inicio_planejado: '',
  previsao_entrega: '',
}
export type Rascunho = typeof RASCUNHO_VAZIO

/** Quais campos obrigatórios estão em branco. Vazio = pode gravar. */
export function faltando(r: Partial<Rascunho>): string[] {
  return CAMPOS_OBRIGATORIOS
    .map(String)
    .filter((c) => String((r as Record<string, unknown>)[c] ?? '').trim() === '')
}

/**
 * As atividades de cada coluna, na ordem em que o servidor as devolve.
 *
 * A ordenação é a do servidor (`ordem`, depois `created_at`, depois `id`) e é
 * repetida aqui porque mover um cartão reordena na tela ANTES da resposta
 * chegar: sem a mesma régua, o cartão salta de lugar quando a resposta chega.
 * Status desconhecido não é descartado — vai para `foraDasColunas`, senão um
 * status novo do servidor desapareceria da tela sem aviso.
 */
export function agrupar(atividades: Atividade[]): {
  colunas: { status: AtividadeStatus; titulo: string; itens: Atividade[] }[]
  canceladas: Atividade[]
  foraDasColunas: Atividade[]
} {
  const ordenar = (a: Atividade, b: Atividade) => {
    const oa = typeof a.ordem === 'number' ? a.ordem : 0
    const ob = typeof b.ordem === 'number' ? b.ordem : 0
    if (oa !== ob) return oa - ob
    const ca = String(a.created_at || '')
    const cb = String(b.created_at || '')
    if (ca !== cb) return ca < cb ? -1 : 1
    return String(a.id) < String(b.id) ? -1 : 1
  }
  const colunas = COLUNAS.map((c) => ({
    ...c,
    itens: atividades.filter((a) => a.status === c.status).sort(ordenar),
  }))
  return {
    colunas,
    canceladas: atividades.filter((a) => a.status === 'cancelada').sort(ordenar),
    foraDasColunas: atividades
      .filter((a) => !STATUS_CONHECIDOS.includes(a.status))
      .sort(ordenar),
  }
}

/**
 * O progresso — PROTÓTIPO (D4): concluídas sobre o total, pesos iguais, e
 * cancelada FORA do denominador. Espelha `_resumoAtiv` do servidor.
 */
export function resumo(atividades: Atividade[]): {
  total: number
  concluidas: number
  canceladas: number
  progresso: number
} {
  const valem = atividades.filter((a) => a.status !== 'cancelada')
  // Conta como concluída SÓ a etapa final (D4): o que está aprovado no teste
  // ainda não está no ar, e tratá-lo como pronto faria o projeto parecer
  // entregue antes de existir entrega.
  const concluidas = valem.filter((a) => a.status === ST_PRONTO).length
  return {
    total: valem.length,
    concluidas,
    canceladas: atividades.length - valem.length,
    // `progresso`, e não `percentual`: é o nome que o servidor usa em
    // `_resumoAtiv`. Campo com dois nomes é a divergência começando — e o
    // teste compara chave por chave justamente para isso não passar.
    progresso: valem.length === 0 ? 0 : Math.round((concluidas * 100) / valem.length),
  }
}

/**
 * Para onde o teclado (ou o botão de toque) move um cartão.
 *
 * Existe para que mover não dependa de arrastar: arraste não funciona com
 * leitor de tela, e no celular disputa com o rolar da página. Nas pontas
 * devolve `null` — o cartão fica onde está em vez de dar a volta, que faria
 * "Concluída" virar "A fazer" num toque a mais.
 */
export function destinoDoTeclado(
  atual: AtividadeStatus,
  direcao: 'anterior' | 'proxima',
): AtividadeStatus | null {
  const i = COLUNAS.findIndex((c) => c.status === atual)
  if (i < 0) return null
  const j = direcao === 'proxima' ? i + 1 : i - 1
  if (j < 0 || j >= COLUNAS.length) return null
  return COLUNAS[j].status
}

/**
 * O recado de erro que a pessoa lê.
 *
 * Enquanto os models das atividades não existirem na plataforma, as três rotas
 * respondem erro — e o texto que vem de lá é "Model ProjetoAtividade missing",
 * que não diz nada a quem está usando o portal. Mensagem de erro é parte da
 * entrega: stack e nome de model na tela são defeito, não informação.
 *
 * Só a PRIMEIRA linha é usada, e pilha é descartada: mensagem de erro de rede
 * costuma vir com várias linhas e com `at …`.
 */
export function mensagemDeErro(e: unknown, acao: 'ler' | 'gravar' = 'ler'): string {
  const cru = String(
    (e && typeof e === 'object' && 'message' in e ? (e as { message?: unknown }).message : e) ?? '',
  )
  const primeira = cru.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('at '))[0] || ''

  // O caso que vai acontecer em produção até a publicação dos models.
  if (/model\s+\w+\s+missing/i.test(primeira) || /ProjetoAtividade/.test(primeira)) {
    return 'As atividades ainda não estão disponíveis neste ambiente. '
      + 'Avise o time técnico — o módulo precisa ser publicado.'
  }
  if (!primeira) {
    return acao === 'ler'
      ? 'Não deu para ler as atividades agora. Tente de novo em instantes.'
      : 'Não deu para salvar agora. Tente de novo em instantes.'
  }
  // Nada de nome de model, caminho de arquivo ou classe de erro na tela.
  if (/\b(Model|undefined|null|TypeError|ReferenceError)\b/.test(primeira) || primeira.includes('/')) {
    return acao === 'ler'
      ? 'Não deu para ler as atividades agora. Tente de novo em instantes.'
      : 'Não deu para salvar agora. Tente de novo em instantes.'
  }
  return primeira.slice(0, 200)
}

/**
 * Pode mover ESTA atividade? (D6c, 29/10)
 *
 * Quem planeja move qualquer uma; o responsável move a dele. Espelha a porta do
 * PATCH, e existe para o quadro não oferecer um arraste que a rota vai recusar.
 *
 * Exige o responsável PREENCHIDO: comparar dois vazios daria `true` e abriria
 * a atividade sem responsável para qualquer pessoa que enxergue o quadro. É a
 * mesma conferência que o servidor faz.
 */
export function podeMover(
  a: Pick<Atividade, 'responsavel_id'>,
  quem: { podePlanejar: boolean; meuId?: string },
): boolean {
  if (quem.podePlanejar) return true
  const dono = String(a.responsavel_id || '')
  const eu = String(quem.meuId || '')
  return dono !== '' && eu !== '' && dono === eu
}

/**
 * Só o que MUDOU, para o PATCH não mandar o que não mexeu.
 *
 * Mandar o objeto inteiro faria o servidor registrar no histórico campos que
 * ninguém tocou, e faria o responsável bater na trava de troca de responsável
 * ao salvar uma descrição. Campo ausente no original conta como vazio.
 */
export function soOqueMudou(
  original: Partial<Record<string, unknown>>,
  rascunho: Partial<Record<string, unknown>>,
): Record<string, string> {
  const fora: Record<string, string> = {}
  for (const campo of Object.keys(rascunho)) {
    const antes = String(original[campo] ?? '')
    const agora = String(rascunho[campo] ?? '')
    if (antes !== agora) fora[campo] = agora
  }
  return fora
}

/** Atrasada: tem previsão, a previsão já passou e não terminou. */
export function atrasada(a: Atividade, hoje: string): boolean {
  const p = String(a.previsao_entrega || '').slice(0, 10)
  if (!p) return false
  // Terminal é o que não tem mais prazo a cumprir: no ar, ou cancelada.
  if (a.status === ST_PRONTO || a.status === 'cancelada') return false
  return p < hoje.slice(0, 10)
}
