'use client'

// Fica DENTRO de app/(admin)/admin/layout.tsx: o menu lateral continua de pé e
// só o conteúdo vira aviso. Área interna, então a mensagem do servidor aparece.
import { ErroDeTela } from '@/components/erro-de-tela'

export default function ErroAdmin({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErroDeTela error={error} reset={reset} area="Administração" tecnico
    voltarPara="/admin/kanban/" voltarLabel="Ir para o Kanban" />
}
