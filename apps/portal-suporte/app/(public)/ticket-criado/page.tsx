'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { CheckCircle2, ArrowLeft, Search, UserPlus } from 'lucide-react'
import Link from 'next/link'
import { CopyTicketId } from '@/components/public/copy-ticket-id'

function TicketCreatedBody() {
  const searchParams = useSearchParams()
  const id = searchParams.get('id') ?? undefined

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <span className="text-lg font-bold">SP</span>
            </div>
            <span className="text-xl font-bold text-foreground">Portal de Suporte</span>
          </Link>
          <Button asChild variant="ghost" size="sm">
            <Link href="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar ao Início
            </Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-16 sm:px-6 lg:px-8 space-y-6">
        <Card className="border-border bg-background shadow-xl text-center">
          <CardHeader className="pb-4 pt-10">
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-green-500/10">
              <CheckCircle2 className="h-12 w-12 text-sem-success-fg" />
            </div>
            <CardTitle className="text-3xl font-bold text-foreground">Ticket Criado!</CardTitle>
            <CardDescription className="mt-2 text-base text-foreground/60">
              Sua solicitação foi recebida. Nossa equipe analisará em breve.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pb-10">
            {id && (
              <div className="rounded-xl bg-muted/50 border border-border p-5">
                <p className="text-sm text-muted-foreground mb-2">Número do Ticket — guarde este código</p>
                <div className="flex items-center justify-center gap-3">
                  <p className="font-mono text-2xl font-bold text-foreground tracking-wider">
                    #{id.slice(0, 8).toUpperCase()}
                  </p>
                  <CopyTicketId ticketId={id} />
                </div>
                <p className="mt-3 text-xs text-muted-foreground/70">
                  Use este número para acompanhar o status do seu ticket
                </p>
              </div>
            )}

            <div className="space-y-2.5 text-sm text-foreground/60 text-left rounded-lg bg-sem-info border border-sem-info-bd p-4">
              <p className="font-medium text-sem-info-fg mb-2">Próximos passos:</p>
              <p className="flex items-start gap-2">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-200 text-xs font-bold text-sem-info-fg">
                  1
                </span>
                Você receberá confirmação no e-mail informado
              </p>
              <p className="flex items-start gap-2">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-200 text-xs font-bold text-sem-info-fg">
                  2
                </span>
                Nossa equipe analisará e iniciará o atendimento
              </p>
              <p className="flex items-start gap-2">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-200 text-xs font-bold text-sem-info-fg">
                  3
                </span>
                Acompanhe o status pelo número acima ou crie sua conta
              </p>
            </div>

            <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:justify-center">
              {id && (
                <Button asChild>
                  <Link href={`/acompanhar`}>
                    <Search className="mr-2 h-4 w-4" />
                    Acompanhar Ticket
                  </Link>
                </Button>
              )}
              <Button asChild variant="outline">
                <Link href="/criar-ticket">Abrir Novo Ticket</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10 shadow-lg">
          <CardContent className="pt-6 pb-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold text-foreground">Acompanhe tudo sem precisar do número</p>
                <p className="mt-1 text-sm text-foreground/60">
                  Com uma conta gratuita você vê todos os seus tickets, recebe notificações e responde
                  diretamente pela plataforma.
                </p>
              </div>
              <Button asChild className="shrink-0">
                <Link href="/auth/sign-up">
                  <UserPlus className="mr-2 h-4 w-4" />
                  Criar Conta Grátis
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}

export default function TicketCreatedPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
          Carregando…
        </div>
      }
    >
      <TicketCreatedBody />
    </Suspense>
  )
}
