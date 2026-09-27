'use client'

import { FlowList } from '@/components/wa-flow/flow-list'
import { useAuth } from '@/lib/arara/AuthProvider'
import { canEditWaFlow } from '@/lib/auth/feature-grants'
import type { AccessLevel } from '@/lib/auth/types'

/**
 * Ante-tela dos fluxos (client-only / Arara).
 * Acesso: admin/master ou grant `wa_flow_editor` (API reforça).
 */
export default function WhatsAppFlowListPage() {
  const { user } = useAuth()
  const role = (user?.roles?.[0] || 'developer') as AccessLevel
  const canEdit = canEditWaFlow({ role, featureGrants: null })

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Fluxos de WhatsApp</h1>
        <p className="text-sm text-muted-foreground">
          Escolha um fluxo para editar a árvore de atendimento. Só o fluxo marcado como
          &quot;No ar&quot; é executado nas conversas.
        </p>
      </div>
      <FlowList canEdit={canEdit} />
    </div>
  )
}
