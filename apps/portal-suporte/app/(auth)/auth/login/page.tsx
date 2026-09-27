'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Eye, EyeOff, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/lib/arara/AuthProvider'
import { destinoDaEntrada } from '@/lib/entrada-pelo-hub'

// Map of URL error params to human-readable messages
const LINK_ERRORS: Record<string, string> = {
  invalid_link:  'Link de acesso inválido. Solicite um novo.',
  link_used:     'Este link já foi utilizado. Solicite um novo.',
  link_expired:  'Link expirado. Solicite um novo link de acesso.',
}

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  // "Confiar neste dispositivo": marcado (padrão) cria a sessão do portal de
  // 30 dias — o login sobrevive ao JWT da plataforma. Desmarcado, nada é
  // gravado além do JWT: bom para máquina emprestada.
  const [confiar, setConfiar] = useState(true)
  // Já autenticado? Então esta tela não tem o que pedir: segue para o painel.
  // Era o buraco que fazia o "manter conectado" parecer mentira — a sessão
  // estava viva, mas quem clicava em Entrar ganhava o formulário vazio.
  const { ready: authReady, user: authUser, isStaff: authStaff } = useAuth()

  // Porta única: com a chave ligada, quem NÃO está autenticado vai para o Hub,
  // que é onde moram o login e a recuperação de senha. Quem já está entra
  // direto — a regra abaixo cuida disso e roda primeiro.
  //
  // Vem desligado. Ver app/lib/entrada-pelo-hub.ts para o porquê e para o
  // escape (`?direto=1`), que existe justamente para o dia em que o Hub cair.
  useEffect(() => {
    if (!authReady || authUser) return
    const next = new URLSearchParams(window.location.search).get('next')
    const destino = destinoDaEntrada(window.location.search, next)
    if (destino) window.location.replace(destino)
  }, [authReady, authUser])

  useEffect(() => {
    if (authReady && authUser) {
      // Respeita o ?next= que o RequireAuth anexa ao mandar alguém para cá.
      const next = new URLSearchParams(window.location.search).get('next')
      window.location.href = next && next.startsWith('/') ? next : (authStaff ? '/admin' : '/dashboard')
    }
  }, [authReady, authUser, authStaff])
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Erro vindo da URL (ex.: sessão expirada em outra aba)
  const urlError = typeof window !== 'undefined'
    ? LINK_ERRORS[new URLSearchParams(window.location.search).get('error') ?? ''] ?? ''
    : ''

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const { arara } = await import('@/lib/arara/client')
      const { setAppRole, isStaff } = await import('@/lib/arara/auth-storage')
      const data = await arara.login(email, password)
      // Quem manda é o nível do portal (`Profile.role`), não o papel de
      // plataforma: o analista é `developer` aqui e continuava caindo no
      // painel de cliente porque só se olhava o papel da plataforma.
      setAppRole(await arara.appRole(data.user).catch(() => null))
      const staff = isStaff(data.user)
      // Mint app-scoped API key for this shared user (portal-suporte domain)
      if (staff) {
        try {
          const { ARARA_SLUG } = await import('@/lib/arara/client')
          const created = await arara.createAppKey(ARARA_SLUG, `ui-${data.user.email}`)
          arara.bindAppKey(ARARA_SLUG, created.apiKey.key)
        } catch {
          /* JWT still works for owner/admin */
        }
      }
      // A sessão do portal nasce AQUI — esta tela não passa pelo
      // AuthProvider.login, então criar lá não teria efeito nenhum.
      if (confiar) {
        const { criarSessao } = await import('@/lib/arara/sessao')
        await criarSessao()
      }
      window.location.href = staff ? '/admin' : '/dashboard'
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Credenciais inválidas')
    } finally {
      setLoading(false)
    }
  }


  return (
    <div className="min-h-screen flex">
      {/* Painel esquerdo — identidade.
          Ele é escuro nos DOIS temas, então o texto também precisa ser fixo. Com
          `text-muted-foreground`, que segue o tema, no tema claro o cinza médio
          caía sobre o fundo quase preto: a auditoria mediu 2,05:1 nos rótulos e
          2,17:1 na frase de apoio, contra os 4,5:1 exigidos. Metade da tela de
          login não era lida por ninguém em aparelho no tema claro.
          `sidebar-foreground` existe exatamente para superfície escura fixa.
          As quatro métricas saíram: eram inventadas e contradiziam a home. */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-12 lg:flex lg:w-1/2">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-primary/20 blur-3xl" />
          <div className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
        </div>

        <Link href="/" className="relative flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
            <span className="text-base font-bold text-primary-foreground">A</span>
          </div>
          <span className="text-lg font-semibold text-sidebar-foreground">Arara Tech</span>
        </Link>

        <div className="relative">
          <h1 className="mb-4 text-4xl font-bold leading-tight text-sidebar-foreground">
            Suporte do SGC
          </h1>
          <p className="text-lg leading-relaxed text-sidebar-foreground/80">
            Abra e acompanhe seus chamados com a equipe que desenvolve o sistema.
          </p>
        </div>

        <p className="relative text-sm text-sidebar-foreground/70">Arara Tech · Suporte do SGC</p>
      </div>

      {/* Painel direito — formulário */}
      <main className="flex flex-1 items-center justify-center bg-muted/50 p-6">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary">
              <span className="text-sm font-bold text-primary-foreground">A</span>
            </div>
            <span className="text-lg font-semibold text-foreground">Arara Tech</span>
          </div>

          <h2 className="mb-1 text-2xl font-bold text-foreground">Entrar na sua conta</h2>
          <p className="mb-6 text-sm text-muted-foreground">Insira suas credenciais para continuar</p>

          {/* `role="alert"`: o erro aparecia só visualmente. Quem usa leitor de
              tela submetia a senha errada e não recebia nada — a página parecia
              não ter feito coisa alguma. */}
          {urlError && (
            <div role="alert" className="mb-5 rounded-lg border border-sem-error-bd bg-sem-error p-3 text-sm text-sem-error-fg">
              {urlError}
            </div>
          )}

          {/* Havia aqui duas abas: "Com senha" e "Link por e-mail". A segunda
              saiu em 04/09/2026 porque estava quebrada em dois níveis e falhava
              CALADA: chamava `/api/auth/magic-link` em caminho relativo, que num
              host estático não chega à plataforma, e a rota do servidor é um stub
              devolvendo 501. Ninguém nunca entrou por ali.
              Com uma forma só, a aba virou enfeite — quem entra vê o formulário
              direto. Para trazer de volta é preciso ANTES implementar a rota no
              servidor e dar a ela o mesmo tratamento de `/auth/senha/solicitar`
              (`webhook_secret` + token), já que quem pede link de acesso é
              justamente quem ainda não tem credencial. */}

          {/* Password login */}
          <form onSubmit={handlePasswordLogin} className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-foreground/80 font-medium">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="h-11 bg-background border-border focus:border-ring focus:ring-ring/20"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-foreground/80 font-medium">Senha</Label>
                  <Link href="/auth/forgot-password" className="-m-1 p-1 text-xs font-medium text-sem-info-fg hover:underline">
                    Esqueceu a senha?
                  </Link>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPw ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="h-11 pr-10 bg-background border-border focus:border-ring focus:ring-ring/20"
                  />
                  {/* Era 16x16px, sem `aria-label` e sem anel de foco: o
                      leitor de tela anunciava só "button", e o alvo tinha um
                      terço do mínimo de 44px. O padding cresce a área de
                      toque sem mexer no desenho. */}
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    aria-label={showPw ? 'Ocultar senha' : 'Mostrar senha'}
                    aria-pressed={showPw}
                    className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground/70 hover:text-foreground/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    {showPw ? <EyeOff aria-hidden className="h-4 w-4" /> : <Eye aria-hidden className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground/80">
                <input
                  type="checkbox"
                  checked={confiar}
                  onChange={(e) => setConfiar(e.target.checked)}
                  className="h-4 w-4 accent-[var(--primary)]"
                />
                Confiar neste dispositivo — manter conectado por 30 dias
              </label>

              {error && (
                <div role="alert" className="rounded-lg border border-sem-error-bd bg-sem-error p-3 text-sm text-sem-error-fg">
                  {error}
                </div>
              )}

              <Button type="submit" className="h-11 w-full font-medium" disabled={loading}>
                {/* Só o ícone girando não diz o que está acontecendo. */}
                {loading
                  ? <><Loader2 aria-hidden className="mr-1.5 h-4 w-4 animate-spin" /> Entrando…</>
                  : <><span>Entrar</span> <ArrowRight aria-hidden className="ml-1.5 h-4 w-4" /></>}
              </Button>
          </form>

          {/* O login não tinha rota de volta. Quem não lembra a senha ficava
              preso, sem alcançar "acompanhar chamado", que não exige conta. */}
          <div className="mt-6 flex flex-col items-center gap-2 border-t border-border pt-5 text-sm">
            <Link href="/acompanhar" className="font-medium text-sem-info-fg hover:underline">
              Acompanhar um chamado sem entrar
            </Link>
            <Link href="/" className="text-muted-foreground hover:text-foreground">
              Voltar ao portal
            </Link>
          </div>

          <p className="mt-5 text-center text-sm text-muted-foreground">
            Não tem conta?{' '}
            <Link href="/auth/sign-up" className="font-medium text-sem-info-fg hover:underline">
              Criar conta
            </Link>
          </p>
        </div>
      </main>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
