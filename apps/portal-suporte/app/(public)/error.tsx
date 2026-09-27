'use client'

// Páginas públicas: quem abre um chamado ou acompanha o seu. Sem mensagem
// técnica, e a saída é a abertura de chamado, que é o que a pessoa veio fazer.
import { ErroDeTela } from '@/components/erro-de-tela'

export default function ErroPublico({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErroDeTela error={error} reset={reset} area="Portal" voltarPara="/criar-ticket/" voltarLabel="Abrir um chamado" />
}
