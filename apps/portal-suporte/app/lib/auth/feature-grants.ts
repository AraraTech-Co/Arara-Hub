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
  | 'planejamento'
  | 'cadastro_empresa'

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
export function sanitizeGrants(grants: unknown): FeatureGrant[] {
  if (!Array.isArray(grants)) return []
  return grants.filter((g): g is FeatureGrant => typeof g === 'string' && KNOWN.has(g))
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
 * Espelha admin/master por nível, OU quem tem o grant `code_review`.
 * A coluna Em Revisão saiu do quadro (25/09/2026); o grant permanece disponível.
 * Existe para a TELA não oferecer um movimento que o servidor vai recusar com
 * 403. O servidor continua sendo a verdade.
 */
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
