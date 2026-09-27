import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

interface LoadingBlockProps {
  label?: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const PADDING: Record<NonNullable<LoadingBlockProps['size']>, string> = {
  sm: 'py-10',
  md: 'py-16',
  lg: 'py-20',
}

const SPINNER_SIZE: Record<NonNullable<LoadingBlockProps['size']>, string> = {
  sm: 'size-4',
  md: 'size-5',
  lg: 'size-6',
}

/** Bloco de loading centralizado — substitui o padrão repetido de
 * `<div className="flex items-center justify-center py-N"><Loader2 className="animate-spin" /></div>`. */
export function LoadingBlock({ label, size = 'md', className }: LoadingBlockProps) {
  return (
    <div className={cn('flex items-center justify-center gap-2 text-muted-foreground', PADDING[size], className)}>
      <Spinner className={SPINNER_SIZE[size]} />
      {label && <span className="text-sm">{label}</span>}
    </div>
  )
}
