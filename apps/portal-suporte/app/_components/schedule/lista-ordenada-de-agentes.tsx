'use client'

// =============================================================================
// Uma fila de pessoas em que a ORDEM é o conteúdo.
//
// Serve dois lugares com a mesma mecânica: o plantão de um dia (onde a ordem é
// a ordem de chamada) e a sequência do mês (onde a ordem é o giro). Antes isto
// vivia dentro do diálogo do dia, como componente criado durante o render —
// agora é um componente só, e as duas telas ficam idênticas aos olhos de quem
// usa.
//
// O aviso de "sem telefone" aparece em cada pessoa porque é informação dura:
// quem não tem telefone cadastrado não recebe o aviso do plantão.
// =============================================================================

import { ArrowDown, ArrowUp, Phone, PhoneOff, X } from 'lucide-react'

export interface AgenteEscolhivel {
  id: string
  nome: string | null
  email: string | null
  telefone_ok: boolean
}

export function ListaOrdenadaDeAgentes({
  titulo, ajuda, lista, agentes, onChange, vazio, travada = false,
}: {
  titulo: string
  ajuda?: string
  lista: string[]
  agentes: AgenteEscolhivel[]
  onChange: (lista: string[]) => void
  /** Texto para quando a fila está vazia. */
  vazio?: string
  /**
   * Fila em uso agora (uma gravação em curso, por exemplo): não se mexe.
   * Mexer no meio de um lote fazia a barra de progresso desaparecer enquanto a
   * gravação seguia com a fila antiga.
   */
  travada?: boolean
}) {
  const porId = new Map(agentes.map((a) => [a.id, a]))

  const mover = (i: number, passo: number) => {
    const j = i + passo
    if (j < 0 || j >= lista.length) return
    const copia = lista.slice()
    ;[copia[i], copia[j]] = [copia[j], copia[i]]
    onChange(copia)
  }

  return (
    <div className="space-y-1.5">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {titulo} ({lista.length})
        </p>
        {ajuda && <p className="text-[11px] italic text-muted-foreground">{ajuda}</p>}
      </div>
      {lista.length === 0 && vazio && (
        <p className="text-xs italic text-muted-foreground">{vazio}</p>
      )}
      {lista.map((id, i) => {
        const a = porId.get(id)
        return (
          // Chave e remoção pela POSIÇÃO: id repetido colidia a chave do React
          // e fazia "tirar um" tirar os dois. Hoje nenhuma tela produz fila
          // repetida, mas o componente não depende mais disso.
          <div key={`${id}-${i}`} className="flex items-center gap-2 rounded-md border border-border/60 px-2 py-1.5">
            <span className="w-5 shrink-0 text-center text-xs font-semibold tabular-nums text-muted-foreground">
              {i + 1}
            </span>
            <span className="truncate text-sm">{a?.nome ?? id}</span>
            {a && (a.telefone_ok
              ? <Phone className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-label="telefone cadastrado" />
              : <PhoneOff className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-label="sem telefone — não recebe aviso" />)}
            <div className="ml-auto flex items-center gap-0.5">
              <button
                type="button" aria-label={`Subir ${a?.nome ?? id}`} disabled={travada || i === 0}
                onClick={() => mover(i, -1)}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button" aria-label={`Descer ${a?.nome ?? id}`} disabled={travada || i === lista.length - 1}
                onClick={() => mover(i, 1)}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
              <button
                type="button" aria-label={`Tirar ${a?.nome ?? id}`} disabled={travada}
                onClick={() => onChange(lista.filter((_, j) => j !== i))}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
