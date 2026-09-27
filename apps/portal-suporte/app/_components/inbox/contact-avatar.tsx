'use client'

import { cn, getInitials } from '@/lib/utils'

// O BotConversa mostra a foto do WhatsApp; a API deles não expõe isso, então
// usamos iniciais com o mesmo peso visual. A cor deriva do nome (determinística)
// para o atendente reconhecer a conversa de relance na lista — sem isso, uma
// coluna de círculos idênticos não ajuda em nada.
const TONES = [
  'bg-sem-info text-sem-info-fg',
  'bg-sem-success text-sem-success-fg',
  'bg-sem-warning text-sem-warning-fg',
  'bg-status-triage text-status-triage-fg',
  'bg-primary/15 text-primary',
] as const

function toneFor(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0
  return TONES[Math.abs(hash) % TONES.length]!
}

const SIZES = {
  sm: 'h-8 w-8 text-[11px]',
  md: 'h-10 w-10 text-xs',
  lg: 'h-11 w-11 text-sm',
} as const

interface ContactAvatarProps {
  name: string | null | undefined
  /** Usado como semente da cor quando não há nome (ex.: telefone). */
  seed?: string
  size?: keyof typeof SIZES
  className?: string
}

export function ContactAvatar({ name, seed, size = 'md', className }: ContactAvatarProps) {
  const label = (name?.trim() || seed || '?').toString()
  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-semibold',
        SIZES[size],
        toneFor(label),
        className,
      )}
    >
      {getInitials(name, seed)}
    </span>
  )
}
