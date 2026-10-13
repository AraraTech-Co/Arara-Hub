'use client'

// =============================================================================
// Quem está de plantão num dia — e em que ORDEM.
//
// A ordem é o conteúdo, não enfeite: `quemAvisar(agora)` chama o primeiro da
// lista que tenha telefone. Por isso cada pessoa escolhida mostra a sua posição
// e pode subir ou descer.
//
// Substitui o diálogo de 6 campos da escala semanal e o de turnos da diária.
// =============================================================================

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ArrowDown, ArrowUp, Check, Loader2, Phone, PhoneOff, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface AgenteEscolhivel {
  id: string
  nome: string | null
  email: string | null
  telefone_ok: boolean
}

export function DiaDoPlantaoDialog({
  data, escolhidos, backupEscolhido, agentes, salvando, onFechar, onSalvar, onLimpar,
}: {
  data: string
  escolhidos: string[]
  backupEscolhido: string[]
  agentes: AgenteEscolhivel[]
  salvando?: boolean
  onFechar: () => void
  onSalvar: (ids: string[], backupIds: string[]) => void
  onLimpar: () => void
}) {
  const [ordem, setOrdem] = useState<string[]>(escolhidos)
  const [backup, setBackup] = useState<string[]>(backupEscolhido)
  const [busca, setBusca] = useState('')

  useEffect(() => { setOrdem(escolhidos) }, [escolhidos])
  useEffect(() => { setBackup(backupEscolhido) }, [backupEscolhido])

  // Fechar com Esc é o mínimo que um diálogo deve fazer.
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [onFechar])

  const porId = new Map(agentes.map((a) => [a.id, a]))
  const alvo = busca.trim().toLowerCase()
  // Fora das DUAS listas: a mesma pessoa não pode ser plantonista e backup —
  // ela pediria retaguarda a si mesma, e o servidor recusa.
  const disponiveis = agentes.filter((a) => {
    if (ordem.includes(a.id) || backup.includes(a.id)) return false
    if (!alvo) return true
    return `${a.nome ?? ''} ${a.email ?? ''}`.toLowerCase().includes(alvo)
  })

  const mover = (lista: string[], setLista: (v: string[]) => void, i: number, passo: number) => {
    const j = i + passo
    if (j < 0 || j >= lista.length) return
    const copia = lista.slice()
    ;[copia[i], copia[j]] = [copia[j], copia[i]]
    setLista(copia)
  }

  /** As duas listas têm a mesma mecânica; só mudam o título e o destino. */
  function Secao({ titulo, ajuda, lista, setLista }: {
    titulo: string
    ajuda: string
    lista: string[]
    setLista: (v: string[]) => void
  }) {
    return (
      <div className="space-y-1.5">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {titulo} ({lista.length})
          </p>
          <p className="text-[11px] italic text-muted-foreground">{ajuda}</p>
        </div>
        {lista.map((id, i) => {
          const a = porId.get(id)
          return (
            <div key={id} className="flex items-center gap-2 rounded-md border border-border/60 px-2 py-1.5">
              <span className="w-5 shrink-0 text-center text-xs font-semibold tabular-nums text-muted-foreground">
                {i + 1}
              </span>
              <span className="truncate text-sm">{a?.nome ?? id}</span>
              {a && (a.telefone_ok
                ? <Phone className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-label="telefone cadastrado" />
                : <PhoneOff className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-label="sem telefone — não recebe aviso" />)}
              <div className="ml-auto flex items-center gap-0.5">
                <button
                  type="button" aria-label={`Subir ${a?.nome ?? id}`} disabled={i === 0}
                  onClick={() => mover(lista, setLista, i, -1)}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button" aria-label={`Descer ${a?.nome ?? id}`} disabled={i === lista.length - 1}
                  onClick={() => mover(lista, setLista, i, 1)}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button" aria-label={`Tirar ${a?.nome ?? id}`}
                  onClick={() => setLista(lista.filter((x) => x !== id))}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Plantão de ${data}`}
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-background shadow-xl"
      >
        <header className="flex items-center gap-2 border-b border-border px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Plantão de {data}</h2>
            <p className="text-[11px] text-muted-foreground">
              A ordem é a ordem de chamada: avisamos o primeiro que tiver telefone.
            </p>
          </div>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            className="ml-auto rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-3">
          <Secao
            titulo="De plantão"
            ajuda="Quem o sistema avisa sozinho quando um cliente fica esperando. A ordem é a ordem de chamada."
            lista={ordem}
            setLista={setOrdem}
          />
          {ordem.length === 0 && (
            <p className="text-xs italic text-muted-foreground">
              Ninguém de plantão neste dia. Salvar assim registra plantão vago — que é uma
              informação, não um erro.
            </p>
          )}

          <Secao
            titulo="Backup técnico"
            ajuda="Retaguarda: quem o PLANTONISTA chama quando o problema exige intervenção técnica. O sistema nunca chama sozinho."
            lista={backup}
            setLista={setBackup}
          />

          <div className="space-y-1.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Equipe
            </p>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Procurar por nome ou e-mail"
                aria-label="Procurar na equipe"
                className="h-8 pl-7"
              />
            </div>
            {disponiveis.length === 0 && (
              <p className="text-xs italic text-muted-foreground">
                {alvo ? 'Ninguém com esse nome.' : 'Todo mundo já está neste dia.'}
              </p>
            )}
            {/* Dois botões por pessoa: com uma lista só, clicar num nome seria
                ambíguo agora que existem dois papéis no mesmo dia. */}
            {disponiveis.map((a) => (
              <div key={a.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60">
                <span className="truncate">{a.nome ?? a.email ?? a.id}</span>
                {a.telefone_ok
                  ? <Phone className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-label="telefone cadastrado" />
                  : <PhoneOff className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-label="sem telefone — não recebe aviso" />}
                <span className="ml-auto flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setOrdem([...ordem, a.id])}
                    className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    de plantão
                  </button>
                  <button
                    type="button"
                    onClick={() => setBackup([...backup, a.id])}
                    className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    backup
                  </button>
                </span>
              </div>
            ))}
          </div>
        </div>

        <footer className="flex items-center gap-2 border-t border-border px-4 py-3">
          {(escolhidos.length > 0 || backupEscolhido.length > 0) && (
            <Button type="button" variant="ghost" size="sm" onClick={onLimpar} disabled={salvando}>
              Tirar o plantão do dia
            </Button>
          )}
          <Button
            type="button" size="sm" className="ml-auto gap-1.5"
            disabled={salvando}
            onClick={() => onSalvar(ordem, backup)}
          >
            {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Salvar o dia
          </Button>
        </footer>
      </div>
    </div>
  )
}
