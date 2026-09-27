'use client'

"use client"

import Link from 'next/link'
import { useRotaDinamica } from '@/hooks/use-rota-dinamica'
import { ArrowLeft, FolderOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import FileExplorer from '@/components/devops/FileExplorer'

export default function ExplorerPage() {
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
        <FolderOpen className="w-5 h-5 text-amber-400" />
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>DevOps</span>
          <span>/</span>
          <span className="text-white font-semibold">Explorador de Arquivos</span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <FileExplorer serverId={serverId} />
      </div>
    </div>
  )
}
