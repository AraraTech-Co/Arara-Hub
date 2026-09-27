'use client'

// =============================================================================
// A tela de erro de uma área.
//
// Antes só existia o `global-error.tsx`, e não havia NENHUM `error.tsx` no
// projeto: qualquer falha de qualquer tela trocava o documento inteiro por uma
// parede que não dizia nada. Em 31/08 três telas quebradas levaram horas para
// serem distinguidas porque a causa nunca aparecia — e, do lado de quem usa, o
// portal simplesmente sumia, menu e tudo.
//
// Com um `error.tsx` por área, a falha fica contida: o menu continua de pé e só
// o conteúdo vira aviso.
//
// `tecnico` separa quem lê. Nas áreas internas a mensagem do servidor aparece,
// porque quem está ali consegue agir com ela. Nas áreas de cliente não: "HTTP
// 403 Sem permissão" não ajuda ninguém de fora e ainda expõe o funcionamento
// interno. Lá vale o caminho de volta.
// =============================================================================

import { useEffect } from 'react'

export function ErroDeTela({
  error,
  reset,
  area,
  tecnico = false,
  voltarPara,
  voltarLabel,
}: {
  error: Error & { digest?: string }
  reset: () => void
  area: string
  tecnico?: boolean
  voltarPara?: string
  voltarLabel?: string
}) {
  useEffect(() => {
    // O console é o único destino real hoje: os `sentry.*.config.ts` são
    // retirados antes do build estático, então o SDK nunca inicializa e
    // `captureException` não sai daqui. Por isso esta tela NÃO promete que
    // alguém foi avisado — ver o comentário no global-error.tsx.
    console.error(`[${area}]`, error)
  }, [error, area])

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-10">
      <div className="w-full max-w-xl space-y-4 rounded-2xl bg-card p-6 text-center shadow-[var(--shadow-media)]">
        <div className="text-3xl">⚠️</div>
        <h2 className="text-lg font-semibold text-foreground">
          {tecnico ? `Erro em ${area}` : 'Não conseguimos carregar esta página'}
        </h2>
        <p className="text-sm text-muted-foreground">
          {tecnico
            ? 'O resto do portal continua funcionando. Abaixo está o que o servidor respondeu.'
            : 'Tente novamente. Se continuar, fale com o suporte pelo chamado.'}
        </p>

        {tecnico && error?.message && (
          <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-muted px-3 py-2 text-left font-mono text-xs text-foreground/70">
            {error.message}
            {error.digest ? `\n\ndigest: ${error.digest}` : ''}
          </pre>
        )}

        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
          <button
            onClick={reset}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white transition-colors hover:bg-blue-700"
          >
            Tentar novamente
          </button>
          {voltarPara && (
            <a
              href={voltarPara}
              className="rounded-md border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted"
            >
              {voltarLabel ?? 'Voltar'}
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
