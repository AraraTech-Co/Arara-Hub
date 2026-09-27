'use client'

import { useTheme } from 'next-themes'
import { Sun, Moon } from 'lucide-react'
import { useEffect, useState } from 'react'

export function ThemeToggle({
  className,
  iconOnly = false,
  colorClassName = 'text-muted-foreground hover:bg-muted hover:text-foreground',
}: { className?: string; iconOnly?: boolean; colorClassName?: string }) {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  if (!mounted) return null

  const isDark = theme === 'dark'
  const label = isDark ? 'Modo claro' : 'Modo escuro'

  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      title={label}
      aria-label={label}
      className={
        iconOnly
          ? `flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${colorClassName} ${className ?? ''}`
          : `flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${colorClassName} ${className ?? ''}`
      }
    >
      {isDark
        ? <Sun  className="h-4 w-4 shrink-0" />
        : <Moon className="h-4 w-4 shrink-0" />
      }
      {!iconOnly && label}
    </button>
  )
}
