'use client'

// Área do CLIENTE: sem mensagem técnica. "HTTP 403 Sem permissão" não ajuda
// quem está de fora e ainda conta como o portal funciona por dentro.
import { ErroDeTela } from '@/components/erro-de-tela'

export default function ErroDashboard({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErroDeTela error={error} reset={reset} area="Painel" voltarPara="/dashboard/" voltarLabel="Voltar ao painel" />
}
