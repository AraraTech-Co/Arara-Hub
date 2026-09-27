'use client'

import { useEffect, useState } from 'react'
import { Loader2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { whatsappApi, type WATag } from '@/lib/api/whatsapp'
import { useToast } from '@/hooks/use-toast'

interface TagPickerProps {
  /** Ids das etiquetas já vinculadas (ficam de fora do catálogo escolhível). */
  attachedTagIds: string[]
  /** Vincula uma etiqueta existente do catálogo. */
  onAttach: (tagId: string) => void | Promise<void>
}

const DEFAULT_COLOR = '#6366f1'

/**
 * Popover para escolher uma etiqueta do catálogo ou criar uma nova
 * (nome + cor). Ao vincular/criar, delega ao pai que faz o refetch.
 */
export function TagPicker({ attachedTagIds, onAttach }: TagPickerProps) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [catalog, setCatalog] = useState<WATag[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(DEFAULT_COLOR)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    whatsappApi
      .listTags()
      .then((res) => {
        if (!cancelled) setCatalog(res.data)
      })
      .catch(() => {
        if (!cancelled) setCatalog([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open])

  async function handleCreate() {
    const name = newName.trim()
    if (!name || busy) return
    setBusy(true)
    try {
      const res = await whatsappApi.createTag({ name, color: newColor })
      setCatalog((prev) => [...prev, res.data])
      setNewName('')
      await onAttach(res.data.id)
      setOpen(false)
    } catch (err) {
      toast({
        title: 'Erro ao criar etiqueta',
        description: err instanceof Error ? err.message : 'Tente novamente.',
        variant: 'destructive',
      })
    } finally {
      setBusy(false)
    }
  }

  async function handlePick(tagId: string) {
    if (busy) return
    setBusy(true)
    try {
      await onAttach(tagId)
      setOpen(false)
    } finally {
      setBusy(false)
    }
  }

  const available = catalog.filter((t) => !attachedTagIds.includes(t.id))

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-6 gap-1 px-2 text-xs"
          aria-label="Adicionar etiqueta"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-3">
        <div className="space-y-3">
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Etiquetas
            </p>
            {loading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Carregando…
              </div>
            ) : available.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Nenhuma etiqueta disponível.
              </p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {available.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handlePick(t.id)}
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-foreground hover:bg-background disabled:opacity-50"
                    >
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: t.color }}
                        aria-hidden
                      />
                      {t.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t border-border pt-3">
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Nova etiqueta
            </p>
            <div className="flex items-center gap-2">
              <label htmlFor="wa-tag-color" className="sr-only">
                Cor da etiqueta
              </label>
              <input
                id="wa-tag-color"
                type="color"
                value={newColor}
                onChange={(e) => setNewColor(e.target.value)}
                className="h-8 w-8 shrink-0 cursor-pointer rounded border border-border bg-background p-0.5"
              />
              <label htmlFor="wa-tag-name" className="sr-only">
                Nome da etiqueta
              </label>
              <input
                id="wa-tag-name"
                type="text"
                value={newName}
                placeholder="Nome…"
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void handleCreate()
                  }
                }}
                className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs text-foreground"
              />
              <Button
                type="button"
                size="sm"
                className="h-8 shrink-0 px-2 text-xs"
                disabled={busy || !newName.trim()}
                onClick={() => void handleCreate()}
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Criar'}
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
