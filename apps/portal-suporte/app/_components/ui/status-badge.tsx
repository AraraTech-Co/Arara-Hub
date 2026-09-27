import { cn } from '@/lib/utils'
import { getStatusLabel, getStatusColor } from '@/lib/ticket-status'

interface StatusBadgeProps {
  status: string
  className?: string
  size?: 'sm' | 'md'
}

export function StatusBadge({ status, className, size = 'md' }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-0.5 text-xs',
        getStatusColor(status),
        className,
      )}
    >
      {getStatusLabel(status)}
    </span>
  )
}
