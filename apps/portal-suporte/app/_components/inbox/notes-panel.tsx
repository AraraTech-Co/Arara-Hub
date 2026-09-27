'use client'

import { useEffect, useState } from 'react'
import { Loader2, StickyNote } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { whatsappApi, type WANote } from '@/lib/api/whatsapp'
import { formatDateShort } from '@/lib/utils'

/** Horário relativo simples (pt-BR). */
function relativeTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const secs = Math.floor((Date.now() - d.getTime()) / 1000)
  if (secs < 60) return 'agora'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `há ${mins}min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `há ${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `há ${days}d`
  return formatDateShort(d, { day: '2-digit', month: '2-digit' })
}

export function NotesPanel({ conversationId }: { conversationId: string }) {
  const { toast } = useToast()
  const [notes, setNotes] = useState<WANote[]>([])
  const [loading, setLoading] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setDraft('')
    whatsappApi
      .listNotes(conversationId)
      .then((res) => {
        if (!cancelled) setNotes(res.data)
      })
      .catch(() => {
        if (!cancelled) setNotes([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [conversationId])

  async function handleAdd() {
    const body = draft.trim()
    if (!body || saving) return
    setSaving(true)
    try {
      const res = await whatsappApi.addNote(conversationId, body)
      setNotes((prev) => [...prev, res.data])
      setDraft('')
    } catch (err) {
      toast({
        title: 'Erro ao adicionar nota',
        description: err instanceof Error ? err.message : 'Tente novamente.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <StickyNote className="h-3.5 w-3.5" />
          Notas internas — visíveis apenas para a equipe, o cliente não as vê.
        </div>
        {loading && notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Carregando notas…</p>
        ) : notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma nota interna ainda.</p>
        ) : (
          notes.map((n) => (
            <div
              key={n.id}
              className="rounded-md border border-sem-warning-bd bg-sem-warning p-2.5 text-sem-warning-fg"
            >
              <div className="mb-1 flex items-center justify-between gap-2 text-[11px]">
                <span className="font-medium">{n.author?.fullName ?? 'Sistema'}</span>
                <span className="opacity-70">{relativeTime(n.createdAt)}</span>
              </div>
              <p className="whitespace-pre-wrap break-words text-sm">{n.body}</p>
            </div>
          ))
        )}
      </div>

      <div className="border-t border-border bg-card p-3">
        <div className="flex items-end gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void handleAdd()
              }
            }}
            placeholder="Escreva uma nota interna…  (não é enviada ao cliente)"
            rows={2}
            className="resize-none"
            disabled={saving}
          />
          <Button
            type="button"
            variant="secondary"
            onClick={() => void handleAdd()}
            disabled={saving || draft.trim().length === 0}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <StickyNote className="h-4 w-4" />
            )}
            <span className="ml-1.5">Adicionar nota</span>
          </Button>
        </div>
      </div>
    </>
  )
}
