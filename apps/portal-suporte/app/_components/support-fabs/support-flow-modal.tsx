'use client'

// =============================================================================
// Modal do "Assistente de suporte" — diagnóstico guiado.
//
// Máquina de estados sobre `support-flow.data.ts`: 29 passos escritos pela
// equipe de suporte, com scripts prontos para copiar e mandar ao cliente.
//
// O "Voltar" não tem histórico próprio de propósito: ele já está modelado nos
// dados, como opção com `next`. Empilhar histórico aqui criaria duas noções de
// volta, que divergiriam nos passos que voltam para um pai diferente.
// =============================================================================

import { useEffect, useState } from 'react'
import { Check, Copy, Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { supportFlow, FLOW_ENTRY_STEP, type FlowOption } from './support-flow.data'

/** Lista rotulada — só aparece quando o passo traz o campo. */
function Bloco({ titulo, itens, numerado = false }: { titulo: string; itens?: string[]; numerado?: boolean }) {
  if (!itens?.length) return null
  const Lista = numerado ? 'ol' : 'ul'
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {titulo}
      </p>
      <Lista
        className={`space-y-1 pl-5 text-sm text-foreground/90 ${
          numerado ? 'list-decimal' : 'list-disc'
        }`}
      >
        {itens.map((t, i) => (
          <li key={`${t}-${i}`}>{t}</li>
        ))}
      </Lista>
    </div>
  )
}

export function SupportFlowModal({
  aberto,
  onFechar,
}: {
  aberto: boolean
  onFechar: () => void
}) {
  const { toast } = useToast()
  const [stepId, setStepId] = useState<string>(FLOW_ENTRY_STEP)
  const [copiado, setCopiado] = useState<number | null>(null)

  // Reabrir sempre começa do início: retomar no meio de um diagnóstico antigo
  // confunde mais do que ajuda.
  useEffect(() => {
    if (!aberto) {
      setStepId(FLOW_ENTRY_STEP)
      setCopiado(null)
    }
  }, [aberto])

  const step = supportFlow[stepId] ?? supportFlow[FLOW_ENTRY_STEP]

  async function escolher(op: FlowOption, indice: number) {
    if ('next' in op) {
      setStepId(op.next)
      setCopiado(null)
      return
    }
    try {
      // Contexto inseguro (http, iframe sem permissão) rejeita a Promise —
      // sem tratar, o botão não faria nada e ninguém saberia por quê.
      await navigator.clipboard.writeText(op.message)
      setCopiado(indice)
      setTimeout(() => setCopiado(null), 2000)
    } catch {
      toast({
        title: 'Não foi possível copiar',
        description: 'Selecione o texto do script acima e copie manualmente.',
        variant: 'destructive',
      })
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{step.title}</DialogTitle>
          {step.description && <DialogDescription>{step.description}</DialogDescription>}
        </DialogHeader>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
          {step.message && (
            <p className="rounded-lg border border-sem-info-bd bg-sem-info px-3 py-2 text-sm text-sem-info-fg">
              {step.message}
            </p>
          )}

          {step.explanation && (
            <p className="text-sm leading-relaxed text-muted-foreground">{step.explanation}</p>
          )}

          <Bloco titulo="Perguntar ao cliente" itens={step.questions} />
          <Bloco titulo="Possíveis soluções" itens={step.solutions} />
          <Bloco titulo="Passo a passo" itens={step.steps} numerado />
          <Bloco titulo="Causas prováveis" itens={step.causes} />

          {step.script && (
            <div className="rounded-lg border border-border bg-muted/40 p-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Script
              </p>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                {step.script}
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t border-border pt-3">
          {step.options.map((op, i) => {
            const ehCopia = !('next' in op)
            return (
              <Button
                key={`${op.text}-${i}`}
                type="button"
                variant={ehCopia ? 'default' : 'outline'}
                className="justify-start"
                onClick={() => void escolher(op, i)}
              >
                {ehCopia &&
                  (copiado === i ? (
                    <Check className="mr-2 h-4 w-4" />
                  ) : (
                    <Copy className="mr-2 h-4 w-4" />
                  ))}
                {ehCopia && copiado === i ? 'Copiado!' : op.text}
              </Button>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}
