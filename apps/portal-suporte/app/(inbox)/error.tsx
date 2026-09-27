'use client'

// Área interna: a mensagem do servidor aparece.
import { ErroDeTela } from '@/components/erro-de-tela'

export default function ErroInbox({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErroDeTela error={error} reset={reset} area="Inbox" tecnico
    voltarPara="/admin/kanban/" voltarLabel="Ir para o Kanban" />
}
