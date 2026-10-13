'use client'

// =============================================================================
// Renderiza a formatação do WhatsApp (*negrito*, _itálico_, ~tachado~,
// ```mono```) a partir da ÁRVORE que `wa-formato.ts` devolve.
//
// Por que um componente, e não uma função que monta HTML: o texto vem do
// cliente. Aqui cada nó vira um elemento React, e React escapa texto por
// natureza — `<b>oi</b>` digitado pelo cliente aparece como `<b>oi</b>` na
// tela, não como negrito. Não existe `dangerouslySetInnerHTML` neste caminho,
// e é de propósito.
// =============================================================================

import { Fragment } from 'react'
import { formatarWhatsApp, type NoFormatado } from '@/lib/wa-formato'

function Nos({ nos }: { nos: NoFormatado[] }) {
  return (
    <>
      {nos.map((no, i) => {
        if (no.tipo === 'texto') return <Fragment key={i}>{no.texto}</Fragment>
        if (no.tipo === 'mono') {
          return (
            <code key={i} className="rounded bg-foreground/10 px-1 py-0.5 font-mono text-[0.95em]">
              {no.texto}
            </code>
          )
        }
        if (no.tipo === 'negrito') return <strong key={i}><Nos nos={no.filhos} /></strong>
        if (no.tipo === 'italico') return <em key={i}><Nos nos={no.filhos} /></em>
        return <s key={i}><Nos nos={no.filhos} /></s>
      })}
    </>
  )
}

/** O texto de uma mensagem, com a formatação do WhatsApp aplicada. */
export function TextoFormatado({ texto, className }: { texto: string; className?: string }) {
  return <p className={className}><Nos nos={formatarWhatsApp(texto)} /></p>
}

/** A mesma formatação sem o parágrafo — para prévia e trechos. */
export function TrechoFormatado({ texto }: { texto: string }) {
  return <Nos nos={formatarWhatsApp(texto)} />
}
