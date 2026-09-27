'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="pt-BR">
      <body className="flex min-h-screen items-center justify-center bg-muted/50">
        <div className="text-center space-y-4 px-4">
          <div className="text-4xl">⚠️</div>
          <h2 className="text-xl font-semibold text-foreground/80">Algo deu errado</h2>
          {/* Não prometemos aviso automático: o `scripts/export-and-deploy.sh`
              retira os `sentry.*.config.ts` antes do build estático, então o
              SDK nunca inicializa e o `captureException` acima não sai daqui.
              Dizer "nossa equipe foi notificada" era falso — e pior que falso,
              fazia a pessoa não avisar ninguém. Se o Sentry voltar a ser
              inicializado, esta frase pode voltar. */}
          <p className="text-sm text-muted-foreground">
            Se o erro continuar, mande esta mensagem para o suporte.
          </p>

          {/* A mensagem do erro, na tela.
              Sem isto, toda falha do portal virava a mesma parede: "Algo deu
              errado", sem dizer o quê. Três telas quebradas em 31/08 levaram
              horas para distinguir porque a causa nunca aparecia — e como não
              existe `error.tsx` em lugar nenhum, QUALQUER erro de QUALQUER
              tela cai aqui e some. Quem lê é a equipe; o custo de mostrar é
              menor que o de adivinhar. */}
          {error?.message && (
            <pre className="mx-auto max-w-xl overflow-x-auto whitespace-pre-wrap rounded-md bg-muted px-3 py-2 text-left font-mono text-xs text-foreground/70">
              {error.message}
              {error.digest ? `\n\ndigest: ${error.digest}` : ''}
            </pre>
          )}

          <button
            onClick={reset}
            className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 transition-colors"
          >
            Tentar novamente
          </button>
        </div>
      </body>
    </html>
  )
}
