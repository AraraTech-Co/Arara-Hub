'use client'

// =============================================================================
// Menu de uma mensagem (17/09/2026).
//
// Só entra aqui o que a Avisa realmente faz — responder citando, reagir,
// apagar (docs/avisa-api-referencia.md). Encaminhar, fixar e favoritar não
// existem na API dela, e botão que não funciona é pior que botão ausente.
//
// Apagar vale só para mensagem NOSSA: o WhatsApp não deixa apagar a de outra
// pessoa. Mensagem antiga, sem id do WhatsApp, não tem menu — o servidor
// recusaria, e a recusa depois do clique é pior que a ausência antes dele.
// =============================================================================

import { useEffect, useRef, useState } from 'react'
import { Copy, CornerUpLeft, MoreHorizontal, PencilLine, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Os mesmos do WhatsApp, na mesma ordem — é o que a mão já sabe. */
export const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏']

export function MessageActions({
  podeApagar,
  podeEditar,
  reagindo,
  onResponder,
  onReagir,
  onCopiar,
  onEditar,
  onApagar,
  alinharDireita,
}: {
  podeApagar: boolean
  /** Editar só vale nas nossas, sem arquivo e nos primeiros 15 min. */
  podeEditar: boolean
  reagindo: boolean
  onResponder: () => void
  onReagir: (emoji: string) => void
  onCopiar: () => void
  onEditar: () => void
  onApagar: () => void
  alinharDireita: boolean
}) {
  const [aberto, setAberto] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!aberto) return
    function fora(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setAberto(false)
    }
    function esc(e: KeyboardEvent) {
      if (e.key === 'Escape') setAberto(false)
    }
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', fora)
      document.removeEventListener('keydown', esc)
    }
  }, [aberto])

  const item =
    'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-foreground hover:bg-muted disabled:opacity-50'

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        aria-label="Ações da mensagem"
        className={cn(
          'flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-opacity',
          'hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          // Aparece no hover da bolha (ou quando aberto/focado): menu sempre
          // visível em toda mensagem vira ruído numa conversa longa.
          aberto ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
        )}
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden />
      </button>

      {aberto && (
        <div
          role="menu"
          className={cn(
            'absolute top-8 z-20 w-48 overflow-hidden rounded-lg bg-popover py-1 shadow-[var(--shadow-alta)]',
            alinharDireita ? 'right-0' : 'left-0',
          )}
        >
          <div className="flex items-center justify-between px-2 pb-1">
            {EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                disabled={reagindo}
                onClick={() => {
                  onReagir(e)
                  setAberto(false)
                }}
                className="rounded-full px-1 py-0.5 text-base leading-none transition-transform hover:scale-125 disabled:opacity-50"
                aria-label={`Reagir com ${e}`}
              >
                {e}
              </button>
            ))}
          </div>
          <div className="my-1 h-px bg-border" />
          <button type="button" role="menuitem" className={item} onClick={() => { onResponder(); setAberto(false) }}>
            <CornerUpLeft className="h-3.5 w-3.5 text-muted-foreground" aria-hidden /> Responder
          </button>
          <button type="button" role="menuitem" className={item} onClick={() => { onCopiar(); setAberto(false) }}>
            <Copy className="h-3.5 w-3.5 text-muted-foreground" aria-hidden /> Copiar texto
          </button>
          {podeEditar && (
            <button type="button" role="menuitem" className={item} onClick={() => { onEditar(); setAberto(false) }}>
              <PencilLine className="h-3.5 w-3.5 text-muted-foreground" aria-hidden /> Editar
            </button>
          )}
          {podeApagar && (
            <button
              type="button"
              role="menuitem"
              className={cn(item, 'text-sem-error-fg')}
              onClick={() => { onApagar(); setAberto(false) }}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden /> Apagar para todos
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/** Reações coladas embaixo da bolha, agrupadas por emoji como no WhatsApp. */
export function Reacoes({
  reacoes,
  onRemover,
  meId,
}: {
  reacoes: { emoji: string; por: string; nome: string | null }[]
  onRemover: () => void
  meId: string | null
}) {
  if (!reacoes.length) return null
  const porEmoji = new Map<string, { n: number; quem: string[]; minha: boolean }>()
  for (const r of reacoes) {
    const atual = porEmoji.get(r.emoji) ?? { n: 0, quem: [], minha: false }
    atual.n += 1
    if (r.nome) atual.quem.push(r.nome)
    if (meId && r.por === meId) atual.minha = true
    porEmoji.set(r.emoji, atual)
  }
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {[...porEmoji.entries()].map(([emoji, d]) => (
        <button
          key={emoji}
          type="button"
          onClick={d.minha ? onRemover : undefined}
          title={d.quem.join(', ') || undefined}
          className={cn(
            'flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] leading-4',
            d.minha
              ? 'border-primary/40 bg-primary/10 text-foreground'
              : 'border-border bg-muted text-foreground/80',
            d.minha && 'cursor-pointer',
          )}
          aria-label={d.minha ? `Remover sua reação ${emoji}` : `${d.n} reagiram com ${emoji}`}
        >
          <span>{emoji}</span>
          {d.n > 1 && <span className="tabular-nums">{d.n}</span>}
        </button>
      ))}
    </div>
  )
}

/** Trecho citado no topo da bolha (responder) e no composer. */
export function Citacao({
  autor,
  corpo,
  className,
}: {
  autor: string | null
  corpo: string
  className?: string
}) {
  return (
    // Filete de 1px: o sistema visual reserva borda colorida acima disso só
    // para o trilho de prioridade do Kanban.
    <div className={cn('rounded-md border-l border-primary/60 bg-primary/5 px-2 py-1', className)}>
      {autor && <p className="text-[11px] font-semibold text-foreground/80">{autor}</p>}
      <p className="line-clamp-2 text-[11px] text-foreground/70">{corpo}</p>
    </div>
  )
}
