'use client'

// =============================================================================
// Entrada vinda do Arara Hub.
//
// O Hub sorteia um código de uso único, guarda o token por 30 segundos e manda
// a pessoa para cá com `?c=<id>.<verificador>`. Aqui o código é trocado pelo
// token numa rota pública do Hub — e o registro morre na leitura.
//
// MORA EM `(public)` DE PROPÓSITO: `RequireAuth` embrulha só `(admin)`,
// `(client)` e `(inbox)`. Se esta rota ficasse sob guarda, a página que TRAZ a
// sessão exigiria sessão para abrir.
// =============================================================================

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ARARA_URL, ARARA_SLUG, arara } from '@/lib/arara/client'
import { setJwt } from '@/lib/arara/auth-storage'

const HUB = 'https://hub.arara-tech.com'
// Habilita a rota pública de troca no app do Hub. NÃO é segredo — viaja neste
// pacote. Quem autentica a troca é o código de uso único.
const TOKEN_ROTA = 'arara-hub-troca-publica'

/**
 * Só caminho relativo. Um `?destino=https://sitedeoutro/` transformaria o
 * portal em trampolim: o link sai de um domínio confiável e leva para qualquer
 * lugar — que é justamente o que faz a vítima clicar.
 *
 * A BARRA FINAL É OBRIGATÓRIA. O portal é exportado com `trailingSlash: true`,
 * então `/admin` não existe como arquivo: o servidor estático cai no
 * `index.html` da raiz e a pessoa aterrissa na página pública, achando que o
 * login falhou. Foi o que aconteceu no primeiro teste, em 28/08.
 */
function destinoSeguro(cru: string | null): string {
  const d = String(cru || '')
  if (!d.startsWith('/') || d.startsWith('//')) return '/admin/'

  const corte = d.search(/[?#]/)
  const caminho = corte === -1 ? d : d.slice(0, corte)
  const resto = corte === -1 ? '' : d.slice(corte)
  // Arquivo com extensão não leva barra; rota leva.
  const precisaBarra = !caminho.endsWith('/') && !/\.[a-z0-9]+$/i.test(caminho)
  return (precisaBarra ? caminho + '/' : caminho) + resto
}

export default function SsoClient() {
  const params = useSearchParams()
  const router = useRouter()
  const [erro, setErro] = useState('')
  // React em modo estrito monta duas vezes em desenvolvimento. Sem esta trava,
  // a segunda montagem tentaria trocar um código JÁ CONSUMIDO e a entrada
  // falharia — justamente depois de ter dado certo.
  const jaTentou = useRef(false)

  useEffect(() => {
    if (jaTentou.current) return
    jaTentou.current = true

    const codigo = params?.get('c') || ''
    const destino = destinoSeguro(params?.get('destino') ?? null)
    if (!codigo) {
      setErro('Link de entrada incompleto.')
      return
    }

    void (async () => {
      let token: string
      try {
        const resposta = await fetch(
          `${ARARA_URL}/v1/r/arara-hub/sso/trocar?token=${TOKEN_ROTA}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ codigo }),
          },
        )
        const corpo = await resposta.json().catch(() => ({}))
        if (!resposta.ok || !corpo?.token) {
          setErro((corpo as { error?: string })?.error
            || 'Este link de entrada não vale mais. Volte ao Hub e clique de novo.')
          return
        }
        token = corpo.token as string
      } catch {
        setErro('Não consegui falar com o Hub. Tente de novo.')
        return
      }

      setJwt(token)

      // O login normal cunha a chave de app logo depois do token (ver
      // AuthProvider e a tela de login). Sem ela, telas que falam direto com a
      // plataforma — redefinir senha em Membros, por exemplo — respondem
      // "sessão sem chave do app". Entrar por aqui precisa deixar a sessão no
      // MESMO estado que entrar pela senha.
      try {
        const criada = await arara.createAppKey(ARARA_SLUG, 'ui-sso')
        arara.bindAppKey(ARARA_SLUG, criada.apiKey.key)
      } catch {
        // Não impede a entrada: a chave é cunhada de novo sob demanda quando
        // alguma tela precisar dela.
      }

      // `replace` e não `push`: o endereço com o código não deve ficar no
      // histórico nem voltar com o botão do navegador.
      router.replace(destino)
    })()
  }, [params, router])

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl bg-card p-6 text-center shadow-[var(--shadow-media)]">
        {erro ? (
          <>
            <p className="text-sm text-foreground">{erro}</p>
            <a
              href={HUB}
              className="mt-4 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white"
            >
              Voltar ao Hub
            </a>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Entrando…</p>
        )}
      </div>
    </div>
  )
}
