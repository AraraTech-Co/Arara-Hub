'use client'

// =============================================================================
// Busca dentro da conversa (Fase 1, A2).
//
// Substitui a busca do navegador DENTRO da inbox, que só encontra o que está
// renderizado — e a thread rola sob demanda.
//
// ESCOPO, dito na própria tela: procura só nas mensagens JÁ CARREGADAS. Não há
// busca no servidor, e esconder isso faria o atendente concluir que a mensagem
// não existe quando ela só não foi carregada ainda.
//
// A comparação é sobre o texto SEM marcação: quem procura "negrito" espera
// achar `*negrito*`.
// =============================================================================

import { useEffect, useMemo, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react'
import { formatarWhatsApp, textoPuro } from '@/lib/wa-formato'

export interface AlvoDaBusca {
  id: string
  texto: string | null
}

export function BuscaNaConversa({
  mensagens, aberta, onFechar, onIr, podeHaverMais,
}: {
  mensagens: AlvoDaBusca[]
  aberta: boolean
  onFechar: () => void
  /** Pede ao pai que role até a mensagem e a destaque. */
  onIr: (id: string | null) => void
  /** A conversa tem mensagens além das carregadas. */
  podeHaverMais: boolean
}) {
  const [termo, setTermo] = useState('')
  const [atual, setAtual] = useState(0)
  const campoRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (aberta) campoRef.current?.focus()
  }, [aberta])

  const achados = useMemo(() => {
    const alvo = termo.trim().toLowerCase()
    if (!alvo) return []
    return mensagens.filter((m) => {
      const puro = textoPuro(formatarWhatsApp(m.texto ?? '')).toLowerCase()
      return puro.includes(alvo)
    })
  }, [mensagens, termo])

  // Termo novo volta para a primeira ocorrência.
  useEffect(() => { setAtual(0) }, [termo])

  // Avisa o pai qual destacar, inclusive quando não há nenhuma.
  useEffect(() => {
    onIr(achados.length ? achados[Math.min(atual, achados.length - 1)].id : null)
    // `onIr` vem do pai e muda a cada render; depender dele reentraria sem fim.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [achados, atual])

  if (!aberta) return null

  const ir = (passo: number) => {
    if (!achados.length) return
    setAtual((i) => (i + passo + achados.length) % achados.length)
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/40 px-3 py-2">
      <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <Input
        ref={campoRef}
        value={termo}
        onChange={(e) => setTermo(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); ir(e.shiftKey ? -1 : 1) }
          if (e.key === 'Escape') { e.preventDefault(); onFechar() }
        }}
        placeholder="Procurar nesta conversa…"
        aria-label="Procurar nesta conversa"
        className="h-8 w-56"
      />
      <span className="text-xs tabular-nums text-muted-foreground">
        {termo.trim()
          ? (achados.length ? `${Math.min(atual, achados.length - 1) + 1} de ${achados.length}` : 'nenhuma')
          : ''}
      </span>
      <button
        type="button" aria-label="Ocorrência anterior" disabled={!achados.length}
        onClick={() => ir(-1)}
        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
      >
        <ChevronUp className="h-3.5 w-3.5" />
      </button>
      <button
        type="button" aria-label="Próxima ocorrência" disabled={!achados.length}
        onClick={() => ir(1)}
        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {podeHaverMais && (
        <span className="text-[11px] italic text-muted-foreground">
          buscando só nas mensagens carregadas
        </span>
      )}
      <button
        type="button" aria-label="Fechar busca"
        onClick={onFechar}
        className="ml-auto rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <span className="w-full text-[11px] text-muted-foreground">
        Enter vai para a próxima · Shift+Enter volta · Esc fecha
      </span>
    </div>
  )
}
