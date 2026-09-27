import { cn } from '@/lib/utils'
import { getPriorityLabel, getPriorityColor } from '@/lib/ticket-priority'

interface PriorityBadgeProps {
  priority: string
  className?: string
  size?: 'sm' | 'md'
}

export function PriorityBadge({ priority, className, size = 'md' }: PriorityBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-0.5 text-xs',
        getPriorityColor(priority),
        className,
      )}
    >
      {getPriorityLabel(priority)}
    </span>
  )
}
