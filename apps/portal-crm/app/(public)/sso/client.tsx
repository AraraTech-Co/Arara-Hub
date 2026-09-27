'use client'

// =============================================================================
// Entrada vinda do Arara Hub (contrato padrão: /sso/?c=<id.verificador>).
//
// O Hub sorteia um código de uso único, guarda o token por 30s e manda a
// pessoa para cá. Aqui o código é trocado pelo token na rota pública do Hub
// (que exige um token de webhook na query — não é segredo, viaja no bundle;
// quem autentica é o código de uso único) e o registro morre na leitura.
//
// MORA EM (public) DE PROPÓSITO: a página que TRAZ a sessão não pode exigir
// sessão para abrir.
// =============================================================================

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ARARA_URL, ARARA_SLUG, arara } from '@/lib/arara/client'
import { setJwt, setStoredUser, setMemberships } from '@/lib/arara/auth-storage'

const HUB = 'https://hub.arara-tech.com'

export default function SsoClient() {
  const params = useSearchParams()
  const router = useRouter()
  const [erro, setErro] = useState('')
  // React estrito monta duas vezes em dev; sem a trava a 2ª montagem tentaria
  // trocar um código JÁ consumido e a entrada falharia depois de dar certo.
  const jaTentou = useRef(false)

  useEffect(() => {
    if (jaTentou.current) return
    jaTentou.current = true

    const codigo = params?.get('c') || params?.get('codigo') || ''
    if (!codigo) {
      setErro('Link de entrada incompleto.')
      return
    }

    void (async () => {
      let token: string
      try {
        const resposta = await fetch(
          `${ARARA_URL}/v1/r/arara-hub/sso/trocar?token=arara-hub-troca-publica`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ codigo }),
          },
        )
        const corpo = await resposta.json().catch(() => ({}))
        if (!resposta.ok || !corpo?.token) {
          setErro(
            (corpo as { error?: string })?.error ||
              'Este link de entrada não vale mais. Volte ao Hub e clique de novo.',
          )
          return
        }
        token = corpo.token as string
      } catch {
        setErro('Não consegui falar com o Hub. Tente de novo.')
        return
      }

      // Deixa a sessão no MESMO estado do login normal: JWT, usuário,
      // memberships e a app key cunhada (telas de runtime usam x-api-key).
      setJwt(token)
      try {
        const me = await arara.me()
        setStoredUser(me.user)
        if (me.memberships) setMemberships(me.memberships)
      } catch {
        /* segue: o AuthProvider re-hidrata pelo JWT no destino */
      }
      try {
        const criada = await arara.createAppKey(ARARA_SLUG, 'crm-ui-sso')
        arara.bindAppKey(ARARA_SLUG, criada.apiKey.key)
      } catch {
        /* app key é cunhada sob demanda quando alguma tela precisar */
      }

      // replace (não push): o endereço com o código não fica no histórico.
      router.replace('/dashboard')
    })()
  }, [params, router])

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl bg-card p-6 text-center shadow">
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
