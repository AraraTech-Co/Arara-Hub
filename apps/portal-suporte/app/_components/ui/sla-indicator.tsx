import { cn } from '@/lib/utils'

interface SlaIndicatorProps {
  minutesRemaining: number | null | undefined
  paused?: boolean
  breached?: boolean
  size?: 'sm' | 'md'
  showLabel?: boolean
}

function formatMinutes(mins: number): string {
  if (mins <= 0) return 'Vencido'
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h < 24) return m > 0 ? `${h}h ${m}m` : `${h}h`
  const d = Math.floor(h / 24)
  const rh = h % 24
  return rh > 0 ? `${d}d ${rh}h` : `${d}d`
}

function getSlaColor(mins: number | null | undefined, breached?: boolean, paused?: boolean): string {
  if (paused) return 'bg-sem-info text-sem-info-fg border-sem-info-bd'
  if (breached || (mins !== null && mins !== undefined && mins <= 0)) return 'bg-sem-error text-sem-error-fg border-sem-error-bd'
  if (mins === null || mins === undefined) return 'bg-muted text-muted-foreground border-border'
  if (mins <= 60) return 'bg-sem-error text-sem-error-fg border-sem-error-bd'
  if (mins <= 240) return 'bg-sem-warning text-sem-warning-fg border-sem-warning-bd'
  return 'bg-sem-success text-sem-success-fg border-sem-success-bd'
}

export function SlaIndicator({ minutesRemaining, paused, breached, size = 'sm', showLabel = false }: SlaIndicatorProps) {
  const colorClass = getSlaColor(minutesRemaining, breached, paused)
  const label = paused
    ? '⏸ Pausado'
    : breached || (minutesRemaining !== null && minutesRemaining !== undefined && minutesRemaining <= 0)
    ? '🔴 Vencido'
    : minutesRemaining !== null && minutesRemaining !== undefined
    ? `⏱ ${formatMinutes(minutesRemaining)}`
    : '— Sem SLA'

  return (
    <span className={cn(
      'inline-flex items-center rounded border font-medium',
      size === 'sm' ? 'px-1.5 py-0 text-[10px]' : 'px-2 py-0.5 text-xs',
      colorClass
    )}>
      {label}
    </span>
  )
}
