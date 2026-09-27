'use client'

// =============================================================================
// Porta de entrada do suporte da Arara Tech.
//
// A estrutura desta página foi mantida por decisão do cliente; o que mudou foi
// tudo que a auditoria mediu como quebrado, mais a identidade e a linguagem.
//
// Cor de destaque: `sem-info-fg` para TEXTO, `primary` para PREENCHIMENTO. A
// separação não é capricho — as duas coisas têm exigências de contraste
// diferentes. `indigo-600`, que estava fixo em 16 lugares e não muda de tema,
// media 2,60:1 nos números e 2,85:1 no bordão do herói contra o fundo escuro;
// clarear `--primary` resolveria o texto e quebraria os botões, onde o branco
// já passa em 6,44:1 sobre ele. `sem-info-fg` existe justamente para texto e
// tem variante por tema (0.421 no claro, 0.77 no escuro).
//
// Os números (`< 4h`, `98%`, `99%`, `24/5`) saíram inteiros: eram literais no
// código, contradiziam os do login, e "menos de 4 horas" era o maior algarismo
// da página para quem está com o PDV parado e fila no caixa.
// =============================================================================

import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/arara/AuthProvider'
import { AlertTriangle, ArrowRight, BarChart3, Clock, Shield, Ticket } from 'lucide-react'
import { Button } from '@/components/ui/button'

const RECURSOS = [
  { icon: Ticket, title: 'Abertura de chamados', desc: 'Descreva o que aconteceu e a equipe assume o atendimento.' },
  { icon: Clock, title: 'Acompanhamento', desc: 'Veja em que etapa o seu chamado está, do registro à solução.' },
  { icon: Shield, title: 'Histórico da sua loja', desc: 'Tudo que já foi atendido fica registrado e consultável.' },
  { icon: BarChart3, title: 'Suporte de quem fez', desc: 'Quem atende é o time que desenvolve o SGC.' },
]

export default function HomePage() {
  // Quem já está logado não precisa "Entrar" — o botão vira a porta do painel.
  // Sem isto, a pessoa reabria o navegador, via "Entrar", clicava e ganhava um
  // formulário de senha MESMO estando autenticada — e concluía, com razão, que
  // o "manter conectado" não funcionava.
  const { ready, user, isStaff } = useAuth()
  const router = useRouter()
  // Barra final obrigatória: o portal é exportado com `trailingSlash: true`, e
  // `/admin` sem ela não existe como arquivo — o servidor cai no index da raiz
  // e a pessoa volta para esta mesma página.
  const painel = isStaff ? '/admin/' : '/dashboard/'

  // Quem é da EQUIPE e já está logado não precisa desta página: ela existe para
  // o cliente abrir e acompanhar chamado. Vai direto ao painel.
  //
  // O cliente e quem não está logado continuam vendo tudo como antes — esta
  // página é a única porta de quem não tem conta, e tirá-la deixaria essa gente
  // sem caminho.
  //
  // `?publica=1` pula o desvio: é como alguém da equipe confere a experiência
  // do cliente sem precisar sair da própria conta.
  //
  // Lido do endereço DURANTE a renderização, e não por `useSearchParams` nem
  // dentro de um efeito:
  //   - `useSearchParams` exige limite de Suspense em export estático, e
  //     envolver a página inteira nisso sairia caro por um parâmetro pequeno;
  //   - num efeito, chegaria TARDE: o desvio é decidido no mesmo ciclo, e o
  //     `?publica=1` nunca seria respeitado.
  // Na pré-renderização não existe `window`, e aí vale `false` — que é o certo,
  // porque ali ainda não se sabe quem está logado.
  const verComoPublica = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('publica') === '1'

  const desviar = ready && !!user && isStaff && !verComoPublica

  useEffect(() => {
    if (desviar) router.replace('/admin/')
  }, [desviar, router])

  if (desviar) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Levando você ao painel…
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <nav className="fixed inset-x-0 top-0 z-50 flex h-16 items-center justify-between border-b border-border/50 bg-background/80 px-4 backdrop-blur sm:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary">
            <span className="text-sm font-bold text-primary-foreground">A</span>
          </div>
          {/* `whitespace-nowrap`: sem isto o nome quebrava em duas linhas dentro
              da barra de 64px no celular e empurrava os botões. */}
          <span className="whitespace-nowrap font-semibold text-foreground">Arara Tech</span>
          <span className="hidden whitespace-nowrap text-sm text-muted-foreground sm:inline">· Suporte SGC</span>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link href={ready && user ? painel : '/auth/login'}>
            {/* h-11 = 44px, o mínimo de alvo de toque. Estava 32px. */}
            <Button variant="outline" size="sm" className="h-11 border-border px-3 sm:px-4">
              {ready && user ? 'Ir para o painel' : 'Entrar'}
            </Button>
          </Link>
          <Link href="/criar-ticket">
            <Button size="sm" className="h-11 px-3 sm:px-4">Abrir chamado</Button>
          </Link>
        </div>
      </nav>

      <main>
        <section className="relative overflow-hidden px-6 pb-16 pt-28 text-center sm:pt-32">
          <div aria-hidden className="pointer-events-none absolute inset-0">
            {/* Era `bg-indigo-50` a 60% — uma cor clara fixa que, no tema
                escuro, virava uma névoa cinza sobre o herói e derrubava o
                subtítulo de 5,06:1 para 1,28:1. Com token e opacidade baixa,
                acompanha o tema. */}
            <div className="absolute left-1/2 top-0 h-[600px] w-[800px] max-w-[140vw] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
          </div>

          <div className="relative mx-auto max-w-3xl">
            <h1 className="mb-5 text-balance text-4xl font-bold leading-tight tracking-tight text-foreground sm:text-5xl">
              Suporte que<br />
              <span className="text-sem-info-fg">resolve de verdade</span>
            </h1>
            <p className="mx-auto mb-8 max-w-xl text-lg leading-relaxed text-muted-foreground">
              Abra e acompanhe chamados do SGC, do PDV e do servidor da sua loja direto com a
              equipe que desenvolve o sistema.
            </p>

            <div className="flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
              <Link href="/criar-ticket" className="sm:w-auto">
                <Button size="lg" className="h-12 w-full px-6 sm:w-auto">
                  Abrir chamado <ArrowRight aria-hidden className="ml-1.5 h-4 w-4" />
                </Button>
              </Link>
              <Link href="/acompanhar" className="sm:w-auto">
                <Button size="lg" variant="outline" className="h-12 w-full border-border px-6 text-foreground/80 sm:w-auto">
                  Acompanhar chamado
                </Button>
              </Link>
            </div>

            {/* Caminho de urgência, separado dos outros dois de propósito: um
                PDV parado não pode disputar atenção com pedido de relatório. Usa
                os tokens `priority-urgent`, que já descrevem urgência no resto
                do portal. Sem telefone — a urgência é atendida por chamado
                marcado, não por canal direto. */}
            <Link
              href="/criar-ticket?urgente=1"
              className="mt-8 flex items-center justify-center gap-2.5 rounded-xl border border-priority-urgent-bd bg-priority-urgent px-4 py-3 text-sm font-medium text-priority-urgent-fg transition-colors hover:opacity-90"
            >
              <AlertTriangle aria-hidden className="h-4 w-4 shrink-0" />
              <span>Sistema parado? Abrir chamado urgente</span>
              <ArrowRight aria-hidden className="h-4 w-4 shrink-0" />
            </Link>
          </div>
        </section>

        <section className="px-6 py-16">
          <div className="mx-auto max-w-5xl">
            <div className="mb-12 text-center">
              <h2 className="mb-3 text-3xl font-bold text-foreground">Como funciona o atendimento</h2>
              <p className="text-muted-foreground">Do registro do problema até a correção no sistema.</p>
            </div>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              {RECURSOS.map((f) => (
                <div
                  key={f.title}
                  className="rounded-2xl border border-border/50 p-6 transition-all duration-200 hover:border-border hover:shadow-md"
                >
                  {/* Antes, dois blocos usavam token e dois usavam Tailwind cru:
                      no tema escuro a fileira ficava dois escuros e dois brancos.
                      E `sem-warning`/`sem-success` carregam significado de estado
                      — gastá-los como enfeite tira o sentido deles no resto do
                      portal. */}
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-sem-info-fg">
                    <f.icon aria-hidden className="h-5 w-5" />
                  </div>
                  <h3 className="mb-2 text-base font-semibold text-foreground">{f.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-6 py-16">
          {/* `bg-sidebar` no lugar de um oklch fixo: contra o fundo escuro do
              tema dark a diferença era de 0,03 de luminosidade e o card sumia.
              O painel é escuro nos dois temas, então o texto vem dos tokens
              `sidebar-*`, que também são. */}
          <div className="relative mx-auto max-w-2xl overflow-hidden rounded-3xl bg-sidebar p-8 text-center sm:p-10">
            <div aria-hidden className="pointer-events-none absolute inset-0">
              <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/20 blur-3xl" />
            </div>
            <div className="relative">
              <h2 className="mb-3 text-2xl font-bold text-sidebar-foreground">Precisa de ajuda agora?</h2>
              <p className="mb-6 text-sm text-sidebar-foreground/80">
                Registre o chamado e a equipe assume o atendimento.
              </p>
              <Link href="/criar-ticket">
                <Button size="lg" className="h-12">
                  Abrir chamado <ArrowRight aria-hidden className="ml-1.5 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/50 px-6 py-8 text-center">
        <p className="text-sm text-muted-foreground">
          Arara Tech · Suporte do SGC
        </p>
      </footer>
    </div>
  )
}
