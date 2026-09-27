'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { UploadZone } from '@/components/validador-sped/upload-zone'
import { ResultadoSuporteView } from '@/components/validador-sped/resultado-suporte'
import { ResultadoClienteView } from '@/components/validador-sped/resultado-cliente'
import { History } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ValidationResult } from '@/lib/sped/validator'
import { AdminHeader } from '@/components/admin/admin-header'
import { useAuth } from '@/lib/arara/AuthProvider'

type Tab = 'upload' | 'suporte' | 'cliente'

export default function ValidadorSpedPage() {
  const { user } = useAuth()
  const [result, setResult] = useState<ValidationResult | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('upload')
  const router = useRouter()

  const handleResult = (r: ValidationResult) => {
    setResult(r)
    setActiveTab('suporte')
  }

  const tabs: Array<{ id: Tab; label: string; hidden?: boolean }> = [
    { id: 'upload', label: 'Upload' },
    { id: 'suporte', label: 'Resultado — Suporte', hidden: !result },
    { id: 'cliente', label: 'Resultado — Cliente', hidden: !result },
  ]

  return (
    <div className="flex flex-col">
      <AdminHeader user={{ email: user?.email, fullName: user?.name || user?.email }} />
      <div className="space-y-4 p-4 lg:p-6">
        <div>
          <h1 className="text-2xl font-bold">Validador SPED</h1>
          <p className="text-sm text-muted-foreground">
            Validação client-side + histórico em Arara (`SpedValidation`)
          </p>
        </div>
        <div className="overflow-hidden rounded-xl border border-border bg-background shadow-sm">
          <div className="flex border-b border-border bg-muted/50">
            {tabs
              .filter((t) => !t.hidden)
              .map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'border-b-2 px-5 py-3 text-sm font-medium transition-colors',
                    activeTab === tab.id
                      ? 'border-indigo-500 bg-background text-indigo-700'
                      : 'border-transparent text-muted-foreground hover:text-foreground/80',
                  )}
                >
                  {tab.label}
                </button>
              ))}
            <div className="ml-auto flex items-center pr-4">
              <button
                type="button"
                onClick={() => router.push('/admin/validador-sped/historico')}
                className="flex items-center gap-1.5 text-xs text-muted-foreground/70 transition-colors hover:text-foreground/60"
              >
                <History className="h-3.5 w-3.5" />
                Histórico
              </button>
            </div>
          </div>
          <div className="p-6">
            {activeTab === 'upload' && <UploadZone onResult={handleResult} />}
            {activeTab === 'suporte' && result && <ResultadoSuporteView result={result} />}
            {activeTab === 'cliente' && result && (
              <ResultadoClienteView
                result={result}
                onAbrirChamado={(validacaoId) =>
                  router.push(`/admin/kanban?new=true&sped_validacao=${validacaoId}`)
                }
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
