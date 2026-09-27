import { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon?: string | ReactNode
  title: string
  description?: string
  action?: ReactNode
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

export function EmptyState({ icon = '📭', title, description, action, className, size = 'md' }: EmptyStateProps) {
  return (
    <div className={cn(
      'flex flex-col items-center justify-center text-center',
      size === 'sm' && 'py-6 gap-2',
      size === 'md' && 'py-12 gap-3',
      size === 'lg' && 'py-20 gap-4',
      className
    )}>
      {typeof icon === 'string' ? (
        <span className={cn(size === 'sm' ? 'text-2xl' : size === 'md' ? 'text-4xl' : 'text-5xl')}>{icon}</span>
      ) : icon}
      <div className="space-y-1">
        <p className={cn('font-semibold text-foreground/80', size === 'sm' ? 'text-sm' : 'text-base')}>{title}</p>
        {description && <p className={cn('text-muted-foreground/70', size === 'sm' ? 'text-xs' : 'text-sm')}>{description}</p>}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}
