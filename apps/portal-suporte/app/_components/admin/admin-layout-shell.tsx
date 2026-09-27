'use client'

import { useState, useEffect } from 'react'
import { AdminSidebar } from './admin-sidebar'
import { RecentPagesTracker } from './recent-pages-tracker'
import { cn } from '@/lib/utils'
import { useVersaoPortal } from '@/hooks/use-versao-portal'

const STORAGE_KEY = 'portal-sidebar-collapsed'

export function AdminLayoutShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'true') setCollapsed(true)
    setMounted(true)
  }, [])

  const toggle = () => {
    setCollapsed(prev => {
      const next = !prev
      localStorage.setItem(STORAGE_KEY, String(next))
      return next
    })
  }

  const isCollapsed = mounted && collapsed
  const { novaVersao, recarregar } = useVersaoPortal()

  return (
    <div className="flex min-h-screen bg-muted/50">
      {/* A equipe deixa a aba aberta por dias; sem isto, cada deploy só chega
          a quem der F5 — e vira chamado de "a função não aparece". */}
      {novaVersao && (
        <button
          onClick={recarregar}
          className="fixed inset-x-0 top-0 z-[100] flex items-center justify-center gap-2 bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-md hover:opacity-95"
        >
          Nova versão do portal disponível — clique para atualizar
        </button>
      )}
      <RecentPagesTracker />
      <AdminSidebar collapsed={isCollapsed} onToggle={toggle} />
      {/* pt-14 = mobile top bar; lg: switches to sidebar left-padding */}
      {/* min-w-0: item flex nasce com min-width:auto, então conteúdo largo
          (tabela, board) estica a área e a PÁGINA inteira passa a rolar na
          horizontal em vez de rolar dentro do próprio container. */}
      <div className={cn(
        'min-w-0 flex-1 pt-14 lg:pt-0 transition-[padding] duration-300',
        isCollapsed ? 'lg:pl-16' : 'lg:pl-64',
      )}>
        {children}
      </div>
    </div>
  )
}
