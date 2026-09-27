'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { AlertCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

function ErrorBody() {
  const searchParams = useSearchParams()
  const error = searchParams.get('error')

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background p-6">
      <div className="w-full max-w-md">
        <Card className="shadow-xl">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-sem-error">
              <AlertCircle className="h-10 w-10 text-sem-error-fg" />
            </div>
            <CardTitle className="text-2xl">Ops, algo deu errado</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            {error ? (
              <p className="mb-6 text-sm text-muted-foreground">Erro: {error}</p>
            ) : (
              <p className="mb-6 text-sm text-muted-foreground">
                Ocorreu um erro inesperado. Por favor, tente novamente.
              </p>
            )}
            <Button asChild className="w-full">
              <Link href="/auth/login">Voltar ao login</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default function ErrorPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
          Carregando…
        </div>
      }
    >
      <ErrorBody />
    </Suspense>
  )
}
