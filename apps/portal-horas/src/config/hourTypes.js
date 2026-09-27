export const HOUR_TYPES = Object.freeze({
  NORMAL: 'NORMAL',
  EXTRA: 'EXTRA',
  BIP_STANDBY: 'BIP_STANDBY',
  BIP_ATTENDANCE: 'BIP_ATTENDANCE',
  BIP_BACKUP: 'BIP_BACKUP',
});

export const HOUR_TYPE_ORDER = Object.freeze([
  HOUR_TYPES.NORMAL,
  HOUR_TYPES.EXTRA,
  HOUR_TYPES.BIP_STANDBY,
  HOUR_TYPES.BIP_ATTENDANCE,
  HOUR_TYPES.BIP_BACKUP,
]);

export const HOUR_TYPE_GROUPS = Object.freeze({
  project: [HOUR_TYPES.NORMAL, HOUR_TYPES.EXTRA],
  bip: [HOUR_TYPES.BIP_STANDBY, HOUR_TYPES.BIP_ATTENDANCE],
  backup: [HOUR_TYPES.BIP_BACKUP],
});

export const HOUR_TYPE_UI = Object.freeze({
  [HOUR_TYPES.NORMAL]: {
    icon: 'Clock3',
    badgeClass: 'bg-blue-50 text-blue-700 ring-blue-200',
    dotClass: 'bg-blue-500',
    cardClass: 'border-blue-200 bg-blue-50/60',
  },
  [HOUR_TYPES.EXTRA]: {
    icon: 'Flame',
    badgeClass: 'bg-orange-50 text-orange-700 ring-orange-200',
    dotClass: 'bg-orange-500',
    cardClass: 'border-orange-200 bg-orange-50/60',
  },
  [HOUR_TYPES.BIP_STANDBY]: {
    icon: 'PhoneCall',
    badgeClass: 'bg-violet-50 text-violet-700 ring-violet-200',
    dotClass: 'bg-violet-500',
    cardClass: 'border-violet-200 bg-violet-50/60',
  },
  [HOUR_TYPES.BIP_ATTENDANCE]: {
    icon: 'ShieldCheck',
    badgeClass: 'bg-cyan-50 text-cyan-700 ring-cyan-200',
    dotClass: 'bg-cyan-500',
    cardClass: 'border-cyan-200 bg-cyan-50/60',
  },
  [HOUR_TYPES.BIP_BACKUP]: {
    icon: 'Siren',
    badgeClass: 'bg-red-50 text-red-700 ring-red-200',
    dotClass: 'bg-red-500',
    cardClass: 'border-red-200 bg-red-50/60',
  },
});

export function getHourTypeTranslationKey(type) {
  return `dashboard.hourTypes.${type}`;
}

export function getHourTypeUi(type) {
  return (
    HOUR_TYPE_UI[type] || {
      icon: 'Tag',
      badgeClass: 'bg-slate-100 text-slate-700 ring-slate-200',
      dotClass: 'bg-slate-400',
      cardClass: 'border-slate-200 bg-white',
    }
  );
}

export function resolveAllowedHourTypesByUser(user) {
  if (!user) return HOUR_TYPE_ORDER;

  // Managers/admins can launch any type.
  if (user.role === 'admin' || user.managerRole) {
    return HOUR_TYPE_ORDER;
  }

  const canProject = user.canLogProject !== false;
  const canBip = !!user.canLogBip;
  const canBackup = !!user.canLogBackup;

  return HOUR_TYPE_ORDER.filter((type) => {
    if (HOUR_TYPE_GROUPS.project.includes(type)) return canProject;
    if (HOUR_TYPE_GROUPS.bip.includes(type)) return canBip;
    if (HOUR_TYPE_GROUPS.backup.includes(type)) return canBackup;
    return true;
  });
}

/** Statuses that count toward hour totals in dashboards (approved or adjusted by reviewer). */
export const HOUR_TOTAL_APPROVED_STATUSES = Object.freeze(['APPROVED', 'ADJUSTED']);

export function countsTowardApprovedHourTotals(status) {
  return HOUR_TOTAL_APPROVED_STATUSES.includes(status);
}
