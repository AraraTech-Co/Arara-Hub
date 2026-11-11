'use client'

// =============================================================================
// Ver atividade — a leitura, para qualquer pessoa que vê o quadro.
//
// O cartão mostra só título, responsável e prazo. O resto (descrição, fase,
// início) só aparecia no editor, e o editor só abre para quem pode mexer:
// quem só acompanha o projeto não tinha como ler a atividade. Aqui é leitura;
// editar continua sendo o `EditarAtividade`, aberto pelo botão quando pode.
//
// O que mostrar mora em `detalhesDaAtividade()`, função pura e testada.
// =============================================================================

import { useEffect } from 'react'
import { X } from 'lucide-react'
import { detalhesDaAtividade, type Atividade } from '@/lib/projetos-atividades'
import { dataBR } from '@/lib/projetos'

export function VerAtividade({
  atividade, fases, pessoas, podeEditar, onFechar, onEditar,
}: {
  atividade: Atividade
  fases: { id: string; nome: string }[]
  pessoas: { id: string; nome: string }[]
  podeEditar: boolean
  onFechar: () => void
  onEditar: () => void
}) {
  // Fechar com Esc é o mínimo de um diálogo.
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [onFechar])

  const linhas = detalhesDaAtividade(atividade, { pessoas, fases, formatarData: dataBR })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onFechar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={atividade.titulo}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-background shadow-xl"
      >
        <header className="flex items-start gap-2 border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground break-words">{atividade.titulo}</h2>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            className="ml-auto rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <dl className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm">
          {linhas.map((l) => (
            <div key={l.rotulo}>
              <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{l.rotulo}</dt>
              {/* A descrição guarda quebras de linha: lista e passo a passo
                  viram um parágrafo só sem o pre-wrap. */}
              <dd className="mt-0.5 whitespace-pre-wrap break-words text-foreground">{l.valor}</dd>
            </div>
          ))}
        </dl>

        <footer className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
          {podeEditar && (
            <button
              type="button"
              onClick={onEditar}
              className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted"
            >
              Editar
            </button>
          )}
          <button
            type="button"
            onClick={onFechar}
            className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:opacity-90"
          >
            Fechar
          </button>
        </footer>
      </div>
    </div>
  )
}
