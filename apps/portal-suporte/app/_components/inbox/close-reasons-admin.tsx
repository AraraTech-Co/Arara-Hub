'use client'

import { useCallback, useEffect, useState } from 'react'
import { Check, Loader2, Plus, Power, PowerOff, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'
import { closeReasonsApi, type WACloseReason } from '@/lib/api/close-reasons'

/**
 * Tela de Configurações dos motivos de encerramento.
 *
 * A ação destrutiva é deliberadamente a mais escondida: apagar só funciona em
 * motivo nunca usado (o servidor recusa o resto), e o caminho normal para
 * aposentar um motivo é desativar.
 */
export function CloseReasonsAdmin({ canEdit }: { canEdit: boolean }) {
  const { toast } = useToast()
  const [reasons, setReasons] = useState<WACloseReason[] | null>(null)
  const [novo, setNovo] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [editando, setEditando] = useState<string | null>(null)
  const [nomeEdit, setNomeEdit] = useState('')

  const carregar = useCallback(async () => {
    try {
      setReasons((await closeReasonsApi.listAll()).data)
    } catch {
      setReasons([])
    }
  }, [])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const erro = (err: unknown, title: string) =>
    toast({
      title,
      description: err instanceof Error ? err.message : 'Tente novamente.',
      variant: 'destructive',
    })

  async function criar() {
    const name = novo.trim()
    if (!name) return
    setCreating(true)
    try {
      await closeReasonsApi.create(name, (reasons?.length ?? 0) + 1)
      setNovo('')
      await carregar()
    } catch (err) {
      erro(err, 'Não foi possível criar o motivo')
    } finally {
      setCreating(false)
    }
  }

  async function acao(id: string, fn: () => Promise<unknown>, title: string) {
    setBusyId(id)
    try {
      await fn()
      await carregar()
    } catch (err) {
      erro(err, title)
    } finally {
      setBusyId(null)
    }
  }

  if (!reasons) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border border-border">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={novo}
            onChange={(e) => setNovo(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void criar()}
            placeholder="Novo motivo (ex.: Resolvido por telefone)"
            className="h-9 w-80"
            maxLength={60}
          />
          <Button size="sm" onClick={() => void criar()} disabled={!novo.trim() || creating}>
            {creating ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="mr-1.5 h-3.5 w-3.5" />
            )}
            Adicionar
          </Button>
        </div>
      )}

      {!reasons.length && (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Nenhum motivo cadastrado. Sem ao menos um, a equipe não consegue concluir conversas.
        </p>
      )}

      <ul className="space-y-2">
        {reasons.map((r) => (
          <li
            key={r.id}
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
          >
            <div className="min-w-0 flex-1">
              {editando === r.id ? (
                <div className="flex items-center gap-1.5">
                  <Input
                    autoFocus
                    value={nomeEdit}
                    onChange={(e) => setNomeEdit(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setEditando(null)
                      if (e.key === 'Enter') {
                        void acao(r.id, () => closeReasonsApi.update(r.id, { name: nomeEdit.trim() }), 'Não foi possível renomear')
                        setEditando(null)
                      }
                    }}
                    className="h-8 max-w-sm"
                    maxLength={60}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => {
                      void acao(r.id, () => closeReasonsApi.update(r.id, { name: nomeEdit.trim() }), 'Não foi possível renomear')
                      setEditando(null)
                    }}
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditando(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <button
                  disabled={!canEdit}
                  onClick={() => {
                    setNomeEdit(r.name)
                    setEditando(r.id)
                  }}
                  className="block max-w-full truncate text-left text-sm font-medium text-foreground enabled:hover:underline"
                >
                  {r.name}
                </button>
              )}
              {!r.active && (
                <span className="mt-0.5 inline-block rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                  Desativado — não aparece mais na hora de concluir
                </span>
              )}
            </div>

            {canEdit && (
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  title={r.active ? 'Desativar' : 'Reativar'}
                  disabled={busyId === r.id}
                  onClick={() => void acao(r.id, () => closeReasonsApi.update(r.id, { active: !r.active }), 'Não foi possível alterar')}
                >
                  {r.active ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  title="Apagar (só se nunca foi usado)"
                  disabled={busyId === r.id}
                  onClick={() => {
                    if (!confirm(`Apagar o motivo "${r.name}"?`)) return
                    void acao(r.id, () => closeReasonsApi.remove(r.id), 'Não foi possível apagar')
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
