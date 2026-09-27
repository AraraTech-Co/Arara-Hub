'use client'

"use client"

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRotaDinamica } from '@/hooks/use-rota-dinamica'
import { ArrowLeft, Terminal } from 'lucide-react'
import { Button } from '@/components/ui/button'

const TerminalPane = dynamic(() => import('@/components/devops/TerminalPane'), { ssr: false })

export default function TerminalPage() {
  const serverId = useRotaDinamica('serverId', 'devops')

  return (
    <div className="devops-theme min-h-screen bg-devops-surface text-white flex flex-col">
      {/* Header */}
      <div className="border-b border-devops-border px-6 py-4 flex items-center gap-3 flex-shrink-0">
        <Link href="/admin/devops">
          <Button size="icon" variant="ghost" className="text-muted-foreground/70 hover:text-white h-8 w-8">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <Terminal className="w-5 h-5 text-emerald-400" />
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>DevOps</span>
          <span>/</span>
          <span className="text-white font-semibold">Terminal SSH</span>
        </div>
      </div>

      {/* Terminal */}
      <div className="flex-1 p-6">
        <div className="h-[60vh] flex flex-col overflow-hidden rounded-xl border border-devops-border">
          <TerminalPane serverId={serverId} />
        </div>
      </div>
    </div>
  )
}
