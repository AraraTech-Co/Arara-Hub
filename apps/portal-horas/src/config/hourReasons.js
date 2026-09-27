import { HOUR_TYPES } from './hourTypes.js';

/** Stable ids for EXTRA / BIP reason multi-select (metrics later). */
export const SUPPORT_REASON_IDS = Object.freeze([
  'alto_volume_suporte',
  'atendimento_fora_horario',
  'incidente_critico',
  'cobertura_plantao',
  'escalonamento_cliente',
  'migracao_implantacao',
  'falha_terceiros',
  'backlog_sla',
]);

export const DEVELOPER_REASON_IDS = Object.freeze([
  'alta_demanda',
  'war_room',
  'demanda_urgente',
  'hotfix_producao',
  'release_deploy',
  'on_call_dev',
  'integracao_parceiro',
  'divida_tecnica_critica',
]);

export function isReasonHourType(hourType) {
  if (!hourType) return false;
  if (hourType === HOUR_TYPES.EXTRA) return true;
  return String(hourType).startsWith('BIP_');
}

/** Flat list of reason ids available to the user (for metrics / filters). */
export function reasonsForUser(user) {
  return reasonGroupsForUser(user).flatMap((g) => g.ids);
}

/**
 * Groups of reason options for the current user role.
 * admin → both groups; developer → dev; support/user → support.
 */
export function reasonGroupsForUser(user) {
  const role = String(user?.role || 'user').toLowerCase();
  if (role === 'admin') {
    return [
      { key: 'support', ids: SUPPORT_REASON_IDS },
      { key: 'developer', ids: DEVELOPER_REASON_IDS },
    ];
  }
  if (role === 'developer') {
    return [{ key: 'developer', ids: DEVELOPER_REASON_IDS }];
  }
  return [{ key: 'support', ids: SUPPORT_REASON_IDS }];
}

export function reasonLabelKey(id) {
  return `dashboard.reasons.options.${id}`;
}
