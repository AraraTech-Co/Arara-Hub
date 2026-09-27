'use client'

// Entrada do portal: quem chega aqui pode nem ter conta. Nada de mensagem
// técnica, e o caminho de volta é o próprio login.
import { ErroDeTela } from '@/components/erro-de-tela'

export default function ErroAuth({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErroDeTela error={error} reset={reset} area="Acesso" voltarPara="/auth/login/" voltarLabel="Ir para o login" />
}
