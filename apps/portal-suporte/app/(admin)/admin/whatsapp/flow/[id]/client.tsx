'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useRotaDinamica } from '@/hooks/use-rota-dinamica'
import { ChevronLeft } from 'lucide-react'
import { FlowEditor } from '@/components/wa-flow/flow-editor'

export default function WhatsAppFlowEditorClient() {
  const id = useRotaDinamica('id', 'flow')

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <Link
          href="/admin/whatsapp/flow"
          className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="mr-1 h-3.5 w-3.5" /> Todos os fluxos
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-foreground">Fluxo de WhatsApp</h1>
        <p className="text-sm text-muted-foreground">
          Clique num card para editar a mensagem e as opções. Salvar guarda um rascunho — as
          conversas em andamento só mudam quando você publicar.
        </p>
      </div>
      <FlowEditor flowId={id} canEdit={true} />
    </div>
  )
}
