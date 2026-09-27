import {
  Clock3,
  Flame,
  PhoneCall,
  ShieldCheck,
  Siren,
  Tag,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  getHourTypeTranslationKey,
  getHourTypeUi,
} from '../../config/hourTypes.js';

const ICONS = {
  Clock3,
  Flame,
  PhoneCall,
  ShieldCheck,
  Siren,
  Tag,
};

export function HourTypeBadge({ type, compact = false, className = '' }) {
  const { t } = useTranslation();
  const ui = getHourTypeUi(type);
  const Icon = ICONS[ui.icon] || Tag;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${ui.badgeClass} ${className}`}
    >
      <Icon size={compact ? 12 : 14} />
      <span>{t(getHourTypeTranslationKey(type), { defaultValue: type })}</span>
    </span>
  );
}

export function HourTypeLegendItem({ type }) {
  const { t } = useTranslation();
  const ui = getHourTypeUi(type);
  const Icon = ICONS[ui.icon] || Tag;

  return (
    <span className="inline-flex items-center gap-2 text-xs text-ink-muted">
      <span className={`h-2.5 w-2.5 rounded-full ${ui.dotClass}`} />
      <Icon size={12} />
      <span>{t(getHourTypeTranslationKey(type), { defaultValue: type })}</span>
    </span>
  );
}
