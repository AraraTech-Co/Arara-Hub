// =============================================================================
// Permissões extras por pessoa (feature grants) — ALÉM do nível (role).
//
// O acesso ao portal é por NÍVEL (master > admin > developer > user). Algumas
// funções, porém, são normalmente de admin mas podem ser liberadas a uma pessoa
// específica sem promover o nível dela. É o caso do editor de fluxo do WhatsApp:
// por padrão só admin/master, mas um developer pode ser liberado individualmente.
//
// Este módulo é a ÚNICA fonte da verdade: o catálogo de grants (para a tela de
// membros montar os toggles) e as regras de "quem pode". Página, API e menu
// consultam daqui — não reescrevem a regra.
// =============================================================================

import { hasMinLevel } from './access-control'
import type { AccessLevel } from './types'

/** Chaves de grant conhecidas. Adicionar uma nova função liberável = uma linha. */
export type FeatureGrant =
  | 'wa_flow_editor'
  | 'qa'
  | 'code_review'
  | 'projetos'
  | 'planejamento'
  | 'cadastro_empresa'
  /**
   * Acesso a uma conta de WhatsApp (Fase 3c): `wa_conta_<id>`.
   *
   * É o único grant com forma variável, porque as contas são CADASTRO, não
   * código: uma conta nova não pode exigir deploy para alguém poder vê-la. Por
   * isso o tipo é um template, e não uma linha por conta nesta união.
   *
   * A conta default NÃO tem grant — quem tem nível de atendimento vê o que
   * sempre viu. Exigir grant nela tiraria a inbox de todo mundo no deploy.
   */
  | `wa_conta_${string}`

/** Catálogo para a UI (tela de membros). A ordem é a de exibição. */
export const FEATURE_GRANTS: {
  key: FeatureGrant
  label: string
  description: string
}[] = [
  {
    key: 'qa',
    label: 'Validação de testes (QA)',
    description:
      'Permite aprovar ou reprovar a etapa de teste no quadro do Dev. É a única '
      + 'permissão que separa quem faz de quem valida — por isso é grant, e não nível.',
  },
  {
    key: 'code_review',
    label: 'Revisão de código',
    description:
      'Permite aprovar ou devolver a etapa de revisão de código no quadro do Dev. '
      + 'É o dev que revisa todos os códigos antes do teste.',
  },
  {
    key: 'projetos',
    label: 'Projetos',
    description:
      'Dá acesso ao módulo de Projetos — ver os projetos, o cronograma e as atividades. '
      + 'É só o acesso: planejar (criar projeto, mexer em data) continua sendo '
      + '"Planejamento de projetos", que é outra permissão.',
  },
  {
    key: 'planejamento',
    label: 'Planejamento de projetos',
    description:
      'Permite criar projetos, definir fases e mover as barras do Gantt. Existe para '
      + 'liberar quem planeja sem precisar promover a pessoa a administradora do portal.',
  },
  {
    key: 'cadastro_empresa',
    label: 'Cadastro de empresas',
    description:
      'Permite cadastrar uma empresa nova em Clientes › Empresas. Editar e desativar '
      + 'continuam sendo de administrador — cadastrar é o começo do atendimento, e quem '
      + 'recebe o cliente novo não precisa administrar o portal para registrá-lo.',
  },
  {
    key: 'wa_flow_editor',
    label: 'Editor de fluxo de WhatsApp',
    description:
      'Permite criar e editar os fluxos de atendimento do WhatsApp, mesmo sem ser administrador.',
  },
]

const KNOWN = new Set<string>(FEATURE_GRANTS.map((g) => g.key))

/** Descarta chaves desconhecidas (defesa: a lista vem de um formulário). */
/**
 * Grant de conta tem forma, não lista: `wa_conta_<id>` com id de cadastro.
 *
 * O id é restrito a letras, números, `-` e `_` porque entra em nome de segredo
 * e em comparação de string; aceitar qualquer coisa aqui deixaria um grant
 * `wa_conta_` vazio (que casaria com a conta default por acidente) passar.
 */
const FORMA_DO_GRANT_DE_CONTA = /^wa_conta_[A-Za-z0-9_-]+$/

export function ehGrantDeConta(g: unknown): g is `wa_conta_${string}` {
  return typeof g === 'string' && FORMA_DO_GRANT_DE_CONTA.test(g)
}

export function sanitizeGrants(grants: unknown): FeatureGrant[] {
  if (!Array.isArray(grants)) return []
  return grants.filter((g): g is FeatureGrant =>
    typeof g === 'string' && (KNOWN.has(g) || ehGrantDeConta(g)))
}

interface GrantActor {
  role: AccessLevel
  featureGrants?: string[] | null
}

/** Tem o grant explícito? (não considera o nível — use as regras abaixo) */
export function hasGrant(actor: GrantActor, grant: FeatureGrant): boolean {
  return (actor.featureGrants ?? []).includes(grant)
}

/**
 * Pode usar o editor de fluxo do WhatsApp?
 * admin/master por nível, OU qualquer pessoa com o grant `wa_flow_editor`.
 */
export function canEditWaFlow(actor: GrantActor): boolean {
  return hasMinLevel(actor.role, 'admin') || hasGrant(actor, 'wa_flow_editor')
}

/**
 * Pode validar a etapa de teste no quadro do Dev?
 *
 * O documento do Kanban Dev pede que a validação não seja feita por quem
 * desenvolveu. Isso é uma permissão POR PESSOA, não um degrau na régua: um
 * developer pode ter QA, um admin pode não ter interesse nenhum em validar.
 * Por isso grant, e não papel novo.
 */
export function canValidarQa(actor: GrantActor): boolean {
  return hasMinLevel(actor.role, 'admin') || hasGrant(actor, 'qa')
}

/**
 * Pode planejar projetos — criar, definir fases, mexer nas datas do Gantt?
 *
 * admin/master por nível, OU quem tem o grant `planejamento`. Quem planeja o
 * cronograma raramente é a mesma pessoa que administra o portal; separar as
 * duas coisas evita promover alguém só para deixá-la arrastar uma barra.
 */
export function canPlanejar(actor: GrantActor): boolean {
  return hasMinLevel(actor.role, 'admin') || hasGrant(actor, 'planejamento')
}

/**
 * Pode concluir a revisão de código — aprovar para teste ou devolver ao dev?
 *
 * Espelha a regra que o servidor aplica em POST /dev/tickets/:id/mover ao sair
 * de `em_revisao`: admin/master por nível, OU quem tem o grant `code_review`.
 * Existe para a TELA não oferecer um movimento que o servidor vai recusar com
 * 403 — quem arrastava via o diálogo da declaração e só descobria a falta da
 * permissão depois de confirmar. O servidor continua sendo a verdade.
 */
/**
 * Dia da troca da porta de Projetos.
 *
 * A decisão de 28/10 é que o acesso ao módulo passa a ser o campo "Projetos" em
 * Editar membro, SEM concessão automática por cargo e sem o grant de QA valendo
 * como passe. Virar a porta de uma vez tiraria o módulo de todo developer e de
 * todo QA no instante do deploy — antes de existir a lista de quem recebe o
 * campo, e essa lista não é minha para escrever.
 *
 * Enquanto esta constante for `true`, a porta ANTIGA (developer+ ou grant `qa`)
 * continua valendo ao lado da nova: ninguém perde acesso no deploy, e quem já
 * recebeu o campo entra por ele. No dia da troca, com a lista pronta, ela vira
 * `false` e passam a valer só admin/master por nível e o grant `projetos`.
 *
 * O servidor tem a MESMA constante, com o mesmo nome, em cada handler do módulo
 * `projetos`. As duas viram juntas — a daqui só decide o que a TELA mostra.
 */
export const PORTA_ANTIGA_DE_PROJETOS = true

/**
 * Pode ver o módulo de Projetos?
 *
 * admin/master por nível, OU o grant `projetos`. Durante a transição, também
 * quem entrava pela porta antiga (ver `PORTA_ANTIGA_DE_PROJETOS`).
 *
 * Espelha `_podeVer` dos handlers do módulo. Só VER: planejar é `canPlanejar`.
 */
export function canVerProjetos(actor: GrantActor): boolean {
  if (hasMinLevel(actor.role, 'admin')) return true
  if (hasGrant(actor, 'projetos')) return true
  // Quem PLANEJA vê. Espelha `_podeVer` do servidor, e vem ANTES da conferência
  // da transição de propósito: vale com a porta antiga ligada e depois de ela
  // ser desligada. Sem isto, quem tem o grant `planejamento` sem nível de
  // developer criava atividade e não via nenhuma.
  if (hasGrant(actor, 'planejamento')) return true
  if (!PORTA_ANTIGA_DE_PROJETOS) return false
  return hasMinLevel(actor.role, 'developer') || hasGrant(actor, 'qa')
}

export function canRevisarCodigo(actor: GrantActor): boolean {
  return hasMinLevel(actor.role, 'admin') || hasGrant(actor, 'code_review')
}

/**
 * Pode cadastrar uma empresa nova?
 *
 * admin/master por nível, OU quem tem o grant `cadastro_empresa`. Espelha a
 * regra que o servidor aplica em POST /admin/companies. Existe para a TELA não
 * oferecer um botão que o servidor vai recusar — e, do outro lado, para não
 * esconder de quem foi liberado.
 *
 * Só CADASTRAR. Editar e desativar empresa seguem exigindo admin.
 */
export function canCadastrarEmpresa(actor: GrantActor): boolean {
  return hasMinLevel(actor.role, 'admin') || hasGrant(actor, 'cadastro_empresa')
}

/**
 * Pode ver as conversas desta conta de WhatsApp?
 *
 * Conta default: por NÍVEL, como sempre foi — é a inbox que todo o atendimento
 * usa hoje, e exigir grant nela seria tirar o trabalho de todos no deploy.
 *
 * Conta nomeada: admin/master por nível, OU o grant `wa_conta_<id>`. Mesma
 * régua dos outros grants — um setor pode ser liberado a uma pessoa sem
 * promovê-la, e o admin não precisa de um grant por conta para administrar.
 *
 * O SERVIDOR é a verdade: isto existe para a tela não oferecer uma aba que a
 * API vai recusar, e para não esconder de quem foi liberado.
 */
export function podeVerConta(actor: GrantActor, contaId: string | null | undefined): boolean {
  const id = String(contaId ?? '').trim() || 'default'
  if (id === 'default') return hasMinLevel(actor.role, 'support')
  if (hasMinLevel(actor.role, 'admin')) return true
  return (actor.featureGrants ?? []).includes(`wa_conta_${id}`)
}
